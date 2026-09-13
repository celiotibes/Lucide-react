// Extração estruturada de dados de contrato a partir do Markdown gerado pelo
// conversor (Fase 2), usando o ai-gateway (Fase 3) para chamar Claude Sonnet
// com output_config.format. O resultado é SEMPRE gravado como proposta em
// extracoes_documento_ia com status 'pendente_revisao' — nunca escreve em
// `contratos`/`garantias`/`contrato_componentes_mensais` diretamente; isso é
// responsabilidade exclusiva da tela de revisão (app/contratos/[id]/
// documentos/[documentoId]/revisao/actions.ts).

import type { Pool } from 'pg';
import { selecionarProvedor } from '../ai-gateway/policy';
import { extrairDadosEstruturados } from '../ai-gateway/providers/claudeProvider';

export const TIPOS_CUSTO_OBRIGATORIO = [
  'comodato_moveis',
  'vaga_garagem',
  'iptu_repassado',
  'condominio_repassado',
  'taxa_lixo_repassada',
  'taxa_bombeiros_repassada',
  'outro',
] as const;

export interface CustoObrigatorioExtraido {
  tipo: (typeof TIPOS_CUSTO_OBRIGATORIO)[number];
  descricao: string | null;
  valor: number | null;
}

export interface DadosContratoExtraidos {
  valorAluguel: number | null;
  valorCaucao: number | null;
  indiceReajuste: 'IGPM' | 'IPCA' | 'INPC' | null;
  dataInicio: string | null;
  dataFim: string | null;
  diaVencimento: number | null;
  custosObrigatorios: CustoObrigatorioExtraido[];
  observacoes: string | null;
}

const SISTEMA_EXTRACAO = `Você lê contratos de locação residencial brasileiros (Lei 8.245/91) convertidos para Markdown e extrai APENAS os dados explicitamente presentes no texto.

Regras:
- Nunca invente ou estime um valor que não esteja escrito no documento. Se um campo não estiver claro, use null.
- Valores monetários em reais, sem símbolo, como número (ex.: 1500.00, nunca "R$ 1.500,00").
- Datas no formato YYYY-MM-DD.
- "custosObrigatorios" cobre encargos mensais previstos em contrato além do aluguel (condomínio, IPTU, taxa de lixo, taxa de bombeiros, vaga de garagem, comodato de móveis) — inclua um item por encargo encontrado, com o tipo mais específico da lista permitida ou "outro".
- "observacoes" deve registrar cláusulas relevantes que não caibam nos campos estruturados (ex.: multas específicas, condição de reajuste incomum, ambiguidade no texto) — isso ajuda o revisor humano, que sempre confere o resultado antes de qualquer valor ser aplicado ao contrato.`;

const SCHEMA_EXTRACAO_CONTRATO = {
  type: 'object',
  additionalProperties: false,
  properties: {
    valorAluguel: { type: ['number', 'null'] },
    valorCaucao: { type: ['number', 'null'] },
    indiceReajuste: { type: ['string', 'null'], enum: ['IGPM', 'IPCA', 'INPC', null] },
    dataInicio: { type: ['string', 'null'] },
    dataFim: { type: ['string', 'null'] },
    diaVencimento: { type: ['integer', 'null'] },
    custosObrigatorios: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tipo: { type: 'string', enum: [...TIPOS_CUSTO_OBRIGATORIO] },
          descricao: { type: ['string', 'null'] },
          valor: { type: ['number', 'null'] },
        },
        required: ['tipo', 'descricao', 'valor'],
      },
    },
    observacoes: { type: ['string', 'null'] },
  },
  required: [
    'valorAluguel',
    'valorCaucao',
    'indiceReajuste',
    'dataInicio',
    'dataFim',
    'diaVencimento',
    'custosObrigatorios',
    'observacoes',
  ],
} as const;

interface LinhaDocumento {
  id: string;
  contrato_id: string | null;
  texto_extraido_md: string | null;
}

export interface ResultadoSolicitarExtracao {
  sucesso: boolean;
  extracaoId?: string;
  erro?: string;
}

export async function solicitarExtracaoContrato(
  pool: Pool,
  documentoId: string,
): Promise<ResultadoSolicitarExtracao> {
  const { rows } = await pool.query<LinhaDocumento>(
    `select id, contrato_id, texto_extraido_md from documentos_anexados where id = $1`,
    [documentoId],
  );
  const documento = rows[0];
  if (!documento) {
    return { sucesso: false, erro: 'Documento não encontrado' };
  }
  if (!documento.texto_extraido_md) {
    return { sucesso: false, erro: 'Documento ainda não tem texto convertido (status_extracao diferente de concluida)' };
  }

  const decisao = selecionarProvedor({ task: 'extracao_dados_contrato', contemDadosPessoais: true });

  const resultado = await extrairDadosEstruturados<DadosContratoExtraidos>({
    modelo: decisao.primary.model,
    sistema: SISTEMA_EXTRACAO,
    texto: documento.texto_extraido_md,
    schema: SCHEMA_EXTRACAO_CONTRATO,
  });

  const { rows: inseridos } = await pool.query<{ id: string }>(
    `insert into extracoes_documento_ia
      (documento_id, contrato_id, modelo_ia, dados_extraidos, erro_ia, status)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [
      documento.id,
      documento.contrato_id,
      decisao.primary.model,
      resultado.sucesso ? JSON.stringify(resultado.dados) : null,
      resultado.sucesso ? null : resultado.erro,
      resultado.sucesso ? 'pendente_revisao' : 'falhou',
    ],
  );

  if (!resultado.sucesso) {
    return { sucesso: false, erro: resultado.erro, extracaoId: inseridos[0].id };
  }
  return { sucesso: true, extracaoId: inseridos[0].id };
}
