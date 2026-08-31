// Pergunta livre sobre um documento já convertido para Markdown (Fase 7).
// Ao contrário da extração estruturada (server/documentos/
// extrairDadosContrato.ts, que roda em lote via cron), esta função roda
// síncrona — o operador digita a pergunta na tela de revisão e espera a
// resposta na hora. Grava a pergunta e a resposta em
// perguntas_analise_documento para consulta futura (não perde o histórico).

import type { Pool } from 'pg';
import { selecionarProvedor } from '../ai-gateway/policy';
import { responderPergunta } from '../ai-gateway/providers/claudeProvider';

const SISTEMA_PERGUNTA_LIVRE = `Você responde perguntas sobre um contrato de locação residencial brasileiro (Lei 8.245/91) convertido para Markdown, fornecido abaixo.

Regras:
- Responda com base APENAS no texto fornecido. Nunca use conhecimento geral sobre contratos de locação para preencher lacunas.
- Se a resposta não estiver no texto, diga explicitamente que o documento não trata disso — não invente.
- Seja direto e cite o trecho relevante do contrato quando possível.`;

interface LinhaDocumento {
  texto_extraido_md: string | null;
}

export interface ResultadoPerguntarDocumento {
  sucesso: boolean;
  perguntaId?: string;
  resposta?: string;
  erro?: string;
}

export async function perguntarSobreDocumento(
  pool: Pool,
  documentoId: string,
  pergunta: string,
): Promise<ResultadoPerguntarDocumento> {
  const perguntaLimpa = pergunta.trim();
  if (!perguntaLimpa) {
    return { sucesso: false, erro: 'A pergunta não pode ser vazia' };
  }

  const { rows } = await pool.query<LinhaDocumento>(
    `select texto_extraido_md from documentos_anexados where id = $1`,
    [documentoId],
  );
  const documento = rows[0];
  if (!documento) {
    return { sucesso: false, erro: 'Documento não encontrado' };
  }
  if (!documento.texto_extraido_md) {
    return { sucesso: false, erro: 'Documento ainda não tem texto convertido (status_extracao diferente de concluida)' };
  }

  const decisao = selecionarProvedor({ task: 'pergunta_livre_documento', contemDadosPessoais: true });

  const resultado = await responderPergunta({
    modelo: decisao.primary.model,
    sistema: SISTEMA_PERGUNTA_LIVRE,
    texto: documento.texto_extraido_md,
    pergunta: perguntaLimpa,
  });

  const { rows: inseridos } = await pool.query<{ id: string }>(
    `insert into perguntas_analise_documento
      (documento_id, pergunta, resposta, modelo_ia, erro_ia, status, respondido_em)
     values ($1, $2, $3, $4, $5, $6, case when $6 = 'respondida' then now() else null end)
     returning id`,
    [
      documentoId,
      perguntaLimpa,
      resultado.sucesso ? resultado.resposta : null,
      decisao.primary.model,
      resultado.sucesso ? null : resultado.erro,
      resultado.sucesso ? 'respondida' : 'falhou',
    ],
  );

  if (!resultado.sucesso) {
    return { sucesso: false, erro: resultado.erro, perguntaId: inseridos[0].id };
  }
  return { sucesso: true, resposta: resultado.resposta, perguntaId: inseridos[0].id };
}
