// Mesma separação de app/imoveis/logicaCadastro.ts: lógica testável fora
// da Server Action, porque redirect() do Next.js não funciona fora do
// runtime de uma requisição real.
//
// Qualificação completa do locatário, responsável financeiro solidário e
// garantias múltiplas (docs/32): campos que já existiam no schema desde
// rodadas anteriores (pessoas.rg/profissao/estado_civil,
// contrato_partes.papel = 'responsavel_solidario', garantias.finalidade/
// forma_pagamento/parcelas) mas o formulário nunca coletava — confirmado
// como padrão real (não inventado) pelos 3 contratos reais de Curitiba
// enviados nesta rodada: o contrato do Apto 503/Central Station tem um
// "LOCATÁRIO/COMANDATÁRIO 2 (RESPONSÁVEL FINANCEIRO)" distinto do
// locatário/ocupante, e tanto esse quanto o do Life Space Estação 509-B
// têm duas garantias somadas (uma para a locação, outra para o aditivo
// de comodato de bens móveis) — exatamente a estrutura que
// `garantias.finalidade` já modelava sem nunca ter sido usada.
import type { Pool, PoolClient } from 'pg';

export interface DadosResponsavelSolidario {
  nome: string;
  cpf?: string | null;
  rg?: string | null;
  profissao?: string | null;
}

export interface DadosGarantia {
  tipo: string;
  valor: number;
  formaPagamento?: string | null;
  parcelas?: number | null;
  finalidade?: string | null;
}

export interface DadosNovoContrato {
  imovelId: string;
  tipo: string;
  nomeLocatario: string;
  cpfLocatario?: string | null;
  rgLocatario?: string | null;
  profissaoLocatario?: string | null;
  estadoCivilLocatario?: string | null;
  dataInicio: string; // 'YYYY-MM-DD'
  diaVencimento: number;
  valorAluguel: number;
  clausulasAdicionais?: string | null;
  responsavelSolidario?: DadosResponsavelSolidario | null;
  garantias?: DadosGarantia[];
}

export type ResultadoCadastroContrato = { sucesso: true; id: string } | { sucesso: false; erro: string };

const TIPOS_VALIDOS = new Set(['locacao_padrao', 'temporada']);
const ESTADOS_CIVIS_VALIDOS = new Set(['solteiro', 'casado', 'divorciado', 'viuvo', 'uniao_estavel']);
const TIPOS_GARANTIA_VALIDOS = new Set(['caucao', 'fiador', 'seguro_fianca', 'titulo_capitalizacao', 'seguro_incendio']);
const FORMAS_PAGAMENTO_VALIDAS = new Set(['pix', 'boleto', 'dinheiro', 'parcelado']);
const FINALIDADES_VALIDAS = new Set(['locacao', 'comodato', 'geral']);

export async function inserirContrato(pool: Pool, dados: DadosNovoContrato): Promise<ResultadoCadastroContrato> {
  const nomeLocatario = dados.nomeLocatario.trim();
  const cpf = dados.cpfLocatario?.trim() || null;

  if (!dados.imovelId) {
    return { sucesso: false, erro: 'Selecione o imóvel.' };
  }
  if (!TIPOS_VALIDOS.has(dados.tipo)) {
    return { sucesso: false, erro: 'Selecione um tipo de contrato válido.' };
  }
  if (!nomeLocatario) {
    return { sucesso: false, erro: 'Informe o nome do locatário.' };
  }
  if (!dados.dataInicio || Number.isNaN(Date.parse(dados.dataInicio))) {
    return { sucesso: false, erro: 'Informe uma data de início válida.' };
  }
  if (!Number.isInteger(dados.diaVencimento) || dados.diaVencimento < 1 || dados.diaVencimento > 31) {
    return { sucesso: false, erro: 'Dia de vencimento deve ser um número entre 1 e 31.' };
  }
  if (!(dados.valorAluguel > 0)) {
    return { sucesso: false, erro: 'Valor do aluguel deve ser positivo.' };
  }
  if (dados.estadoCivilLocatario && !ESTADOS_CIVIS_VALIDOS.has(dados.estadoCivilLocatario)) {
    return { sucesso: false, erro: 'Estado civil do locatário inválido.' };
  }
  if (dados.responsavelSolidario && !dados.responsavelSolidario.nome.trim()) {
    return { sucesso: false, erro: 'Informe o nome do responsável financeiro solidário.' };
  }
  for (const garantia of dados.garantias ?? []) {
    if (!TIPOS_GARANTIA_VALIDOS.has(garantia.tipo)) {
      return { sucesso: false, erro: `Tipo de garantia inválido: "${garantia.tipo}".` };
    }
    if (!(garantia.valor > 0)) {
      return { sucesso: false, erro: 'Valor da garantia deve ser positivo.' };
    }
    if (garantia.formaPagamento && !FORMAS_PAGAMENTO_VALIDAS.has(garantia.formaPagamento)) {
      return { sucesso: false, erro: `Forma de pagamento de garantia inválida: "${garantia.formaPagamento}".` };
    }
    if (garantia.finalidade && !FINALIDADES_VALIDAS.has(garantia.finalidade)) {
      return { sucesso: false, erro: `Finalidade de garantia inválida: "${garantia.finalidade}".` };
    }
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    const pessoaId = await buscarOuCriarPessoa(client, {
      nome: nomeLocatario,
      cpf,
      rg: dados.rgLocatario?.trim() || null,
      profissao: dados.profissaoLocatario?.trim() || null,
      estadoCivil: dados.estadoCivilLocatario || null,
    });

    const contrato = await client.query<{ id: string }>(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel, clausulas_adicionais)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [
        dados.imovelId,
        dados.tipo,
        dados.dataInicio,
        dados.diaVencimento,
        dados.valorAluguel,
        dados.clausulasAdicionais?.trim() || null,
      ],
    );
    const contratoId = contrato.rows[0].id;

    await client.query(
      `insert into contrato_partes (contrato_id, pessoa_id, papel) values ($1, $2, 'locatario_principal')`,
      [contratoId, pessoaId],
    );

    if (dados.responsavelSolidario) {
      const responsavelId = await buscarOuCriarPessoa(client, {
        nome: dados.responsavelSolidario.nome.trim(),
        cpf: dados.responsavelSolidario.cpf?.trim() || null,
        rg: dados.responsavelSolidario.rg?.trim() || null,
        profissao: dados.responsavelSolidario.profissao?.trim() || null,
        estadoCivil: null,
      });
      await client.query(
        `insert into contrato_partes (contrato_id, pessoa_id, papel) values ($1, $2, 'responsavel_solidario')`,
        [contratoId, responsavelId],
      );
    }

    for (const garantia of dados.garantias ?? []) {
      await client.query(
        `insert into garantias (contrato_id, tipo, valor, forma_pagamento, parcelas, finalidade)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          contratoId,
          garantia.tipo,
          garantia.valor,
          garantia.formaPagamento || null,
          garantia.parcelas || null,
          garantia.finalidade || null,
        ],
      );
    }

    await client.query('commit');
    return { sucesso: true, id: contratoId };
  } catch (e) {
    await client.query('rollback');
    return { sucesso: false, erro: `Não foi possível salvar: ${e instanceof Error ? e.message : 'erro desconhecido'}` };
  } finally {
    client.release();
  }
}

interface DadosPessoaParaCriar {
  nome: string;
  cpf: string | null;
  rg: string | null;
  profissao: string | null;
  estadoCivil: string | null;
}

// Reaproveita por CPF (mesmo comportamento original, agora extraído para
// servir também ao responsável solidário) — quando já existe, não
// sobrescreve os dados existentes com o que veio deste formulário.
async function buscarOuCriarPessoa(client: PoolClient, dados: DadosPessoaParaCriar): Promise<string> {
  if (dados.cpf) {
    const existente = await client.query<{ id: string }>(`select id from pessoas where cpf_cnpj = $1`, [dados.cpf]);
    if (existente.rows.length > 0) {
      return existente.rows[0].id;
    }
  }
  const nova = await client.query<{ id: string }>(
    `insert into pessoas (nome, cpf_cnpj, rg, profissao, estado_civil) values ($1, $2, $3, $4, $5) returning id`,
    [dados.nome, dados.cpf, dados.rg, dados.profissao, dados.estadoCivil],
  );
  return nova.rows[0].id;
}
