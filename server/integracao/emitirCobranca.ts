// Emite a cobrança Asaas (boleto/PIX) para faturas `status = 'aberta'`
// que ainda não têm nenhuma cobrança registrada, e persiste o resultado em
// `cobrancas_asaas`. Cria o cliente Asaas do locatário sob demanda (na
// primeira cobrança dele — busca por CPF/CNPJ antes de criar, para não
// duplicar cadastro), guardando o id devolvido em
// `pessoas.asaas_customer_id` para reaproveitar nas próximas.
//
// LIMITAÇÃO HONESTA (herdada de server/asaas/client.ts): nunca executado
// contra o sandbox real do Asaas — sem chave de API neste ambiente. Os
// testes de integração aqui provam a lógica de banco (idempotência, dado
// insuficiente pulado) com um `AsaasClient` cujo `fetchImpl` é mockado —
// não substituem validação contra a API real antes de produção.
//
// Falha ao emitir UMA cobrança (erro de rede, CPF rejeitado pelo Asaas
// etc.) não derruba o lote inteiro — cai em `puladas`, mesmo princípio já
// usado em `faturarEnergia.ts`/`gerarFaturaMensal.ts`.

import type { Pool } from 'pg';
import { AsaasApiError, type AsaasClient } from '../asaas/client';

export interface ResultadoEmissao {
  faturaId: string;
  cobrancaId: string;
  linkFatura: string;
}

export interface FaturaPulada {
  faturaId: string;
  motivo: 'sem_locatario_vinculado' | 'locatario_sem_cpf_cnpj' | 'erro_asaas';
  detalhe?: string;
}

export interface ResultadoEmissaoLote {
  emitidas: ResultadoEmissao[];
  puladas: FaturaPulada[];
}

interface LinhaFaturaPendente {
  id: string;
  valor_liquido: string;
  vencimento: Date;
  pessoa_id: string | null;
  nome: string | null;
  cpf_cnpj: string | null;
  email: string | null;
  asaas_customer_id: string | null;
}

export async function emitirCobrancasPendentes(
  pool: Pool,
  asaasClient: AsaasClient,
  tipo: 'BOLETO' | 'PIX' = 'BOLETO',
): Promise<ResultadoEmissaoLote> {
  const { rows: faturas } = await pool.query<LinhaFaturaPendente>(
    `select f.id, f.valor_liquido, f.vencimento,
            p.id as pessoa_id, p.nome, p.cpf_cnpj, p.email, p.asaas_customer_id
     from faturas f
     left join contrato_partes cp on cp.contrato_id = f.contrato_id and cp.papel = 'locatario_principal'
     left join pessoas p on p.id = cp.pessoa_id
     where f.status = 'aberta'
       and not exists (select 1 from cobrancas_asaas ca where ca.fatura_id = f.id)
     order by f.vencimento`,
  );

  const emitidas: ResultadoEmissao[] = [];
  const puladas: FaturaPulada[] = [];

  for (const fatura of faturas) {
    if (!fatura.pessoa_id) {
      puladas.push({ faturaId: fatura.id, motivo: 'sem_locatario_vinculado' });
      continue;
    }
    if (!fatura.cpf_cnpj) {
      puladas.push({ faturaId: fatura.id, motivo: 'locatario_sem_cpf_cnpj' });
      continue;
    }

    try {
      const customerId = await resolverClienteAsaas(pool, asaasClient, {
        pessoaId: fatura.pessoa_id,
        nome: fatura.nome!,
        cpfCnpj: fatura.cpf_cnpj,
        email: fatura.email,
        customerIdExistente: fatura.asaas_customer_id,
      });

      const cobranca = await asaasClient.criarCobranca({
        customerId,
        valor: Number(fatura.valor_liquido),
        vencimento: formatarDataISO(fatura.vencimento),
        tipo,
        referenciaExterna: fatura.id,
      });

      await pool.query(
        `insert into cobrancas_asaas (fatura_id, asaas_id, tipo, valor_cobrado, status)
         values ($1, $2, $3, $4, 'pendente')`,
        [fatura.id, cobranca.id, tipo.toLowerCase(), cobranca.valor],
      );

      emitidas.push({ faturaId: fatura.id, cobrancaId: cobranca.id, linkFatura: cobranca.linkFatura });
    } catch (erro) {
      puladas.push({
        faturaId: fatura.id,
        motivo: 'erro_asaas',
        detalhe: erro instanceof AsaasApiError ? erro.message : String(erro),
      });
    }
  }

  return { emitidas, puladas };
}

async function resolverClienteAsaas(
  pool: Pool,
  asaasClient: AsaasClient,
  input: { pessoaId: string; nome: string; cpfCnpj: string; email: string | null; customerIdExistente: string | null },
): Promise<string> {
  if (input.customerIdExistente) {
    return input.customerIdExistente;
  }

  const existente = await asaasClient.buscarClientePorCpfCnpj(input.cpfCnpj);
  const customerId = existente
    ? existente.id
    : (await asaasClient.criarCliente({ nome: input.nome, cpfCnpj: input.cpfCnpj, email: input.email ?? undefined })).id;

  await pool.query(`update pessoas set asaas_customer_id = $1 where id = $2`, [customerId, input.pessoaId]);
  return customerId;
}

function formatarDataISO(data: Date): string {
  return data.toISOString().slice(0, 10);
}
