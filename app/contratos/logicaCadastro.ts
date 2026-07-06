// Mesma separação de app/imoveis/logicaCadastro.ts: lógica testável fora
// da Server Action, porque redirect() do Next.js não funciona fora do
// runtime de uma requisição real.
import type { Pool } from 'pg';

export interface DadosNovoContrato {
  imovelId: string;
  tipo: string;
  nomeLocatario: string;
  cpfLocatario?: string | null;
  dataInicio: string; // 'YYYY-MM-DD'
  diaVencimento: number;
  valorAluguel: number;
}

export type ResultadoCadastroContrato = { sucesso: true; id: string } | { sucesso: false; erro: string };

const TIPOS_VALIDOS = new Set(['locacao_padrao', 'temporada']);

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

  const client = await pool.connect();
  try {
    await client.query('begin');

    let pessoaId: string;
    if (cpf) {
      const existente = await client.query<{ id: string }>(`select id from pessoas where cpf_cnpj = $1`, [cpf]);
      if (existente.rows.length > 0) {
        pessoaId = existente.rows[0].id;
      } else {
        const nova = await client.query<{ id: string }>(
          `insert into pessoas (nome, cpf_cnpj) values ($1, $2) returning id`,
          [nomeLocatario, cpf],
        );
        pessoaId = nova.rows[0].id;
      }
    } else {
      const nova = await client.query<{ id: string }>(`insert into pessoas (nome) values ($1) returning id`, [
        nomeLocatario,
      ]);
      pessoaId = nova.rows[0].id;
    }

    const contrato = await client.query<{ id: string }>(
      `insert into contratos (imovel_id, tipo, data_inicio, dia_vencimento, valor_aluguel)
       values ($1, $2, $3, $4, $5) returning id`,
      [dados.imovelId, dados.tipo, dados.dataInicio, dados.diaVencimento, dados.valorAluguel],
    );
    const contratoId = contrato.rows[0].id;

    await client.query(
      `insert into contrato_partes (contrato_id, pessoa_id, papel) values ($1, $2, 'locatario_principal')`,
      [contratoId, pessoaId],
    );

    await client.query('commit');
    return { sucesso: true, id: contratoId };
  } catch (e) {
    await client.query('rollback');
    return { sucesso: false, erro: `Não foi possível salvar: ${e instanceof Error ? e.message : 'erro desconhecido'}` };
  } finally {
    client.release();
  }
}
