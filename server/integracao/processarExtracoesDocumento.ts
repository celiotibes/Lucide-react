// Elo entre documentos_anexados (já convertidos para Markdown, Fase 2) e a
// extração estruturada por IA (Fase 4, server/documentos/extrairDadosContrato.ts).
// Mesmo padrão de processarDocumentosAnexados.ts: busca pendências, processa,
// devolve um resumo por item, nunca lança.

import type { Pool } from 'pg';
import { solicitarExtracaoContrato } from '../documentos/extrairDadosContrato';

export interface ResultadoProcessamentoExtracao {
  documentoId: string;
  sucesso: boolean;
  erro?: string;
}

interface LinhaDocumentoPendente {
  id: string;
}

export async function processarExtracoesDocumento(
  pool: Pool,
  limite = 20,
): Promise<ResultadoProcessamentoExtracao[]> {
  const { rows: pendentes } = await pool.query<LinhaDocumentoPendente>(
    `select da.id
     from documentos_anexados da
     where da.status_extracao = 'concluida'
       and not exists (
         select 1 from extracoes_documento_ia edi where edi.documento_id = da.id
       )
     order by da.criado_em asc
     limit $1`,
    [limite],
  );

  const resultados: ResultadoProcessamentoExtracao[] = [];

  for (const documento of pendentes) {
    const resultado = await solicitarExtracaoContrato(pool, documento.id);
    resultados.push({
      documentoId: documento.id,
      sucesso: resultado.sucesso,
      erro: resultado.erro,
    });
  }

  return resultados;
}
