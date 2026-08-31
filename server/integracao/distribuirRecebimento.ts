// Divide o valor líquido de uma fatura de aluguel paga entre os
// proprietários do imóvel (`imovel_propriedade`), deduz a taxa de
// administração de cada um, e grava o crédito em `investidor_ledger` com
// saldo corrido por pessoa — fecha o pipeline de recebimento
// (emitirCobranca -> webhook do Asaas -> aqui, docs/17).
//
// Escopo deliberado: só faturas `tipo = 'aluguel'`. Energia/multa_juros/
// honorários não são necessariamente receita a distribuir por percentual
// de propriedade da mesma forma (energia, por exemplo, é passthrough de
// custo do consumo — a taxa administrativa de 25% já é a margem do CRMT
// nesse caso, itemizada separadamente em `calcularFaturaEnergia.ts`) — não
// há confirmação de que a mesma regra de rateio societário se aplicaria.
//
// Proteção contra corrida real (mesma classe de bug já corrigida em
// `gerarFaturaMensal.ts`/`faturarEnergia.ts` — docs/12, encontrada pela
// própria suíte de teste rodando em paralelo): duas execuções concorrentes
// deste job poderiam ler o mesmo `saldo_apos` "anterior" antes de qualquer
// uma comitar, corrompendo o saldo corrido do investidor (lost update).
// Aqui isso é evitado com `pg_advisory_xact_lock` por pessoa (serializa a
// leitura+escrita do saldo corrido dela) mais o índice único parcial
// `uq_investidor_ledger_credito_repasse_por_fatura` (schema, pós-seção 22)
// como segunda linha de defesa.

import type { Pool } from 'pg';
import { calcularSplitPagamento, type ParticipacaoSplit } from '../financeiro/splitPagamento';

export interface DistribuicaoRealizada {
  faturaId: string;
  imovelId: string;
  distribuicoes: Array<{ pessoaId: string; valor: number }>;
}

export interface FaturaSemDistribuicao {
  faturaId: string;
  motivo: 'sem_proprietario_externo';
}

export interface ResultadoDistribuicao {
  distribuidas: DistribuicaoRealizada[];
  semDistribuicao: FaturaSemDistribuicao[];
}

/** Participante sintético representando a fração que fica com o CRMT (propriedade integral, explícita ou implícita) — nunca vira linha de `investidor_ledger`, só garante que a matemática de centavos de `calcularSplitPagamento` feche em 100% do valor da fatura. */
const ID_SINTETICO_CRMT = '__crmt__';

interface LinhaFaturaPaga {
  id: string;
  imovel_id: string;
  valor_liquido: string;
}

interface LinhaPropriedade {
  proprietario_pessoa_id: string | null;
  percentual: string;
  taxa_administracao_pct: string;
}

export async function distribuirRecebimentosPendentes(pool: Pool): Promise<ResultadoDistribuicao> {
  const { rows: faturas } = await pool.query<LinhaFaturaPaga>(
    `select f.id, f.imovel_id, f.valor_liquido
     from faturas f
     where f.tipo = 'aluguel' and f.status = 'paga'
       and not exists (select 1 from investidor_ledger il where il.referencia_fatura_id = f.id)
     order by f.atualizado_em`,
  );

  const distribuidas: DistribuicaoRealizada[] = [];
  const semDistribuicao: FaturaSemDistribuicao[] = [];

  for (const fatura of faturas) {
    const { rows: propriedades } = await pool.query<LinhaPropriedade>(
      `select proprietario_pessoa_id, percentual, taxa_administracao_pct
       from imovel_propriedade
       where imovel_id = $1 and data_fim is null`,
      [fatura.imovel_id],
    );

    const donos = propriedades
      .filter((p) => p.proprietario_pessoa_id !== null)
      .map((p) => ({
        pessoaId: p.proprietario_pessoa_id as string,
        percentual: Number(p.percentual),
        taxaAdministracaoPct: Number(p.taxa_administracao_pct),
      }));

    if (donos.length === 0) {
      // 100% CRMT (explícito ou implícito) — nada a distribuir para fora.
      semDistribuicao.push({ faturaId: fatura.id, motivo: 'sem_proprietario_externo' });
      continue;
    }

    const somaDonos = donos.reduce((acc, d) => acc + d.percentual, 0);
    const percentualCrmt = 1 - somaDonos;

    const participacoes: ParticipacaoSplit[] = donos.map((d) => ({ beneficiarioId: d.pessoaId, percentual: d.percentual }));
    if (percentualCrmt > 1e-9) {
      participacoes.push({ beneficiarioId: ID_SINTETICO_CRMT, percentual: percentualCrmt });
    }

    const splits = calcularSplitPagamento(Number(fatura.valor_liquido), participacoes);

    const distribuicoes: Array<{ pessoaId: string; valor: number }> = [];

    for (const dono of donos) {
      const bruto = splits.find((s) => s.beneficiarioId === dono.pessoaId)!.valor;
      const liquido = arredondar(bruto * (1 - dono.taxaAdministracaoPct));

      const creditado = await creditarInvestidor(pool, {
        pessoaId: dono.pessoaId,
        imovelId: fatura.imovel_id,
        faturaId: fatura.id,
        valor: liquido,
        valorBruto: bruto,
      });

      if (creditado) {
        distribuicoes.push({ pessoaId: dono.pessoaId, valor: liquido });
      }
    }

    if (distribuicoes.length > 0) {
      distribuidas.push({ faturaId: fatura.id, imovelId: fatura.imovel_id, distribuicoes });
    }
  }

  return { distribuidas, semDistribuicao };
}

async function creditarInvestidor(
  pool: Pool,
  input: { pessoaId: string; imovelId: string; faturaId: string; valor: number; valorBruto: number },
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [input.pessoaId]);

    const { rows: saldoRows } = await client.query<{ saldo_apos: string }>(
      `select saldo_apos from investidor_ledger where pessoa_id = $1 order by criado_em desc limit 1`,
      [input.pessoaId],
    );
    const saldoAnterior = saldoRows.length > 0 ? Number(saldoRows[0].saldo_apos) : 0;
    const novoSaldo = arredondar(saldoAnterior + input.valor);

    const { rows: inseridas } = await client.query<{ id: string }>(
      `insert into investidor_ledger (pessoa_id, imovel_id, tipo, valor, valor_bruto, saldo_apos, referencia_fatura_id)
       values ($1, $2, 'credito_repasse', $3, $4, $5, $6)
       on conflict (referencia_fatura_id, pessoa_id) where tipo = 'credito_repasse' do nothing
       returning id`,
      [input.pessoaId, input.imovelId, input.valor, input.valorBruto, novoSaldo, input.faturaId],
    );

    await client.query('COMMIT');
    return inseridas.length > 0;
  } catch (erro) {
    await client.query('ROLLBACK');
    throw erro;
  } finally {
    client.release();
  }
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}
