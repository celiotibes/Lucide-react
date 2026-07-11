// Mesma separação de app/imoveis/logicaCadastro.ts: lógica testável fora
// da Server Action. Um modelo novo entra sempre como `ativo = true` para
// a cidade escolhida — como `uq_modelos_contrato_ativo_por_cidade` (schema
// seção 27.4) permite no máximo um ativo por cidade, cadastrar um novo
// modelo precisa desativar o anterior na mesma transação, senão o insert
// colide com o índice único.
import type { Pool } from 'pg';

export interface DadosNovoModeloContrato {
  cidadeId: string;
  nome: string;
  corpoHtml: string;
}

export type ResultadoCadastroModeloContrato = { sucesso: true; id: string } | { sucesso: false; erro: string };

export async function inserirModeloContrato(
  pool: Pool,
  dados: DadosNovoModeloContrato,
): Promise<ResultadoCadastroModeloContrato> {
  const nome = dados.nome.trim();
  const corpoHtml = dados.corpoHtml.trim();

  if (!dados.cidadeId) {
    return { sucesso: false, erro: 'Selecione a cidade.' };
  }
  if (!nome) {
    return { sucesso: false, erro: 'Informe um nome para o modelo.' };
  }
  if (!corpoHtml) {
    return { sucesso: false, erro: 'O corpo HTML do modelo não pode ficar vazio.' };
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows: versaoAnterior } = await client.query<{ versao: number }>(
      `select versao from modelos_contrato where cidade_id = $1 order by versao desc limit 1`,
      [dados.cidadeId],
    );
    const proximaVersao = (versaoAnterior[0]?.versao ?? 0) + 1;

    await client.query(`update modelos_contrato set ativo = false where cidade_id = $1 and ativo`, [dados.cidadeId]);

    const inserido = await client.query<{ id: string }>(
      `insert into modelos_contrato (cidade_id, nome, versao, corpo_html, ativo)
       values ($1, $2, $3, $4, true) returning id`,
      [dados.cidadeId, nome, proximaVersao, corpoHtml],
    );

    await client.query('commit');
    return { sucesso: true, id: inserido.rows[0].id };
  } catch (e) {
    await client.query('rollback');
    return { sucesso: false, erro: `Não foi possível salvar: ${e instanceof Error ? e.message : 'erro desconhecido'}` };
  } finally {
    client.release();
  }
}
