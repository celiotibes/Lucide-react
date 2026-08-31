// Elo entre o schema (documentos_anexados) e o conversor puro
// (server/documentos/converterParaMarkdown.ts): busca documentos com
// status_extracao = 'pendente', baixa o arquivo do Storage, converte para
// Markdown e grava o resultado de volta. Mesmo padrão de
// server/integracao/reguaCobranca.ts — função que recebe o Pool já aberto,
// devolve um resumo por item, nunca lança.
//
// Marca 'processando' antes de converter para que, se o cron rodar duas
// vezes em paralelo (retry de infraestrutura), a segunda chamada não pegue
// o mesmo documento — não é um lock forte (sem select for update), mas
// suficiente para o cenário real: um único worker de cron por vez.

import type { Pool } from 'pg';
import { baixarDocumentoStorage } from '../../lib/supabase/storage';
import { converterParaMarkdown } from '../documentos/converterParaMarkdown';

export interface ResultadoProcessamentoDocumento {
  documentoId: string;
  sucesso: boolean;
  erro?: string;
}

interface LinhaDocumentoPendente {
  id: string;
  storage_path: string;
  mime_type: string;
}

export async function processarDocumentosAnexados(
  pool: Pool,
  limite = 20,
): Promise<ResultadoProcessamentoDocumento[]> {
  const { rows: pendentes } = await pool.query<LinhaDocumentoPendente>(
    `select id, storage_path, mime_type from documentos_anexados
     where status_extracao = 'pendente'
     order by criado_em asc
     limit $1`,
    [limite],
  );

  const resultados: ResultadoProcessamentoDocumento[] = [];

  for (const documento of pendentes) {
    const { rowCount } = await pool.query(
      `update documentos_anexados set status_extracao = 'processando'
       where id = $1 and status_extracao = 'pendente'`,
      [documento.id],
    );
    if (!rowCount) {
      continue;
    }

    try {
      const arquivo = await baixarDocumentoStorage(documento.storage_path);
      const conversao = await converterParaMarkdown(arquivo, documento.mime_type);

      if (conversao.sucesso) {
        await pool.query(
          `update documentos_anexados
           set status_extracao = 'concluida', texto_extraido_md = $1, erro_extracao = null
           where id = $2`,
          [conversao.markdown, documento.id],
        );
        resultados.push({ documentoId: documento.id, sucesso: true });
      } else {
        await pool.query(
          `update documentos_anexados set status_extracao = 'falhou', erro_extracao = $1 where id = $2`,
          [conversao.erro, documento.id],
        );
        resultados.push({ documentoId: documento.id, sucesso: false, erro: conversao.erro });
      }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro desconhecido ao processar documento';
      await pool.query(
        `update documentos_anexados set status_extracao = 'falhou', erro_extracao = $1 where id = $2`,
        [mensagem, documento.id],
      );
      resultados.push({ documentoId: documento.id, sucesso: false, erro: mensagem });
    }
  }

  return resultados;
}
