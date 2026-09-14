/**
 * Document Approvals - Workflow de 2 Níveis (5A.2)
 * Estados: pendente → aprovado_gerente → aprovado_contabilista → finalizado
 */

export type ApprovalStatus =
  | "pendente"
  | "aprovado_gerente"
  | "aprovado_contabilista"
  | "rejeitado"
  | "finalizado";

export type ApprovalLevel = "gerente" | "contabilista" | "proprietario";

export interface DocumentoAprovacao {
  id: string;
  tipo_documento: "folha" | "despesa" | "lancamento" | "relatorio";
  entidade_id: string;
  descricao: string;
  valor?: number;
  data_criacao: string;
  criado_por: string;
  status: ApprovalStatus;
  nivel_atual: ApprovalLevel | null;
  historico_aprovacoes: ApprovalHistory[];
}

export interface ApprovalHistory {
  id: string;
  documento_id: string;
  nivel: ApprovalLevel;
  usuario_id: string;
  usuario_nome: string;
  acao: "aprovado" | "rejeitado" | "comentado";
  timestamp: string;
  comentario?: string;
}

export interface AprovavelPayload {
  tipo_documento: "folha" | "despesa" | "lancamento" | "relatorio";
  entidade_id: string;
  descricao: string;
  valor?: number;
  criado_por: string;
}

/**
 * Define fluxo de aprovação por tipo de documento
 */
const FLUXO_APROVACAO: Record<string, ApprovalLevel[]> = {
  folha: ["gerente", "contabilista"],
  despesa: ["gerente", "contabilista"],
  lancamento: ["contabilista"],
  relatorio: ["proprietario"],
};

/**
 * Cria novo documento para aprovação
 */
export function criarDocumentoAprovacao(payload: AprovavelPayload): DocumentoAprovacao {
  return {
    id: `DOC-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    descricao: payload.descricao,
    tipo_documento: payload.tipo_documento,
    entidade_id: payload.entidade_id,
    valor: payload.valor,
    data_criacao: new Date().toISOString(),
    criado_por: payload.criado_por,
    status: "pendente",
    nivel_atual: FLUXO_APROVACAO[payload.tipo_documento]?.[0] || null,
    historico_aprovacoes: [],
  };
}

/**
 * Obtém o próximo nível de aprovação
 */
export function obterProximoNivel(
  tipo_documento: string,
  nivel_atual: ApprovalLevel | null
): ApprovalLevel | null {
  const fluxo = FLUXO_APROVACAO[tipo_documento] || [];

  if (nivel_atual === null) {
    return fluxo[0] || null;
  }

  const indiceAtual = fluxo.indexOf(nivel_atual);
  return indiceAtual >= 0 && indiceAtual < fluxo.length - 1
    ? fluxo[indiceAtual + 1]
    : null;
}

/**
 * Aprova documento no nível especificado
 */
export function aprovarDocumento(
  documento: DocumentoAprovacao,
  usuario_id: string,
  usuario_nome: string,
  nivel: ApprovalLevel,
  comentario?: string
): DocumentoAprovacao {
  // Valida que o usuário está aprovando no nível correto
  if (documento.nivel_atual !== nivel) {
    throw new Error(`Nível de aprovação inválido. Esperado: ${documento.nivel_atual}, Recebido: ${nivel}`);
  }

  const historicoEntry: ApprovalHistory = {
    id: `AH-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    documento_id: documento.id,
    nivel,
    usuario_id,
    usuario_nome,
    acao: "aprovado",
    timestamp: new Date().toISOString(),
    comentario,
  };

  const proximoNivel = obterProximoNivel(documento.tipo_documento, nivel);

  return {
    ...documento,
    historico_aprovacoes: [...documento.historico_aprovacoes, historicoEntry],
    nivel_atual: proximoNivel,
    status:
      proximoNivel === null
        ? "finalizado"
        : `aprovado_${nivel}` as ApprovalStatus,
  };
}

/**
 * Rejeita documento e retorna para status pendente
 */
export function rejeitarDocumento(
  documento: DocumentoAprovacao,
  usuario_id: string,
  usuario_nome: string,
  motivo: string,
  nivel: ApprovalLevel
): DocumentoAprovacao {
  const historicoEntry: ApprovalHistory = {
    id: `AH-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    documento_id: documento.id,
    nivel,
    usuario_id,
    usuario_nome,
    acao: "rejeitado",
    timestamp: new Date().toISOString(),
    comentario: motivo,
  };

  return {
    ...documento,
    historico_aprovacoes: [...documento.historico_aprovacoes, historicoEntry],
    status: "rejeitado",
    nivel_atual: FLUXO_APROVACAO[documento.tipo_documento]?.[0] || null,
  };
}

/**
 * Adiciona comentário ao documento
 */
export function adicionarComentario(
  documento: DocumentoAprovacao,
  usuario_id: string,
  usuario_nome: string,
  comentario: string,
  nivel: ApprovalLevel
): DocumentoAprovacao {
  const historicoEntry: ApprovalHistory = {
    id: `AH-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    documento_id: documento.id,
    nivel,
    usuario_id,
    usuario_nome,
    acao: "comentado",
    timestamp: new Date().toISOString(),
    comentario,
  };

  return {
    ...documento,
    historico_aprovacoes: [...documento.historico_aprovacoes, historicoEntry],
  };
}

/**
 * Finaliza documento após todas as aprovações
 */
export function finalizarDocumento(documento: DocumentoAprovacao): DocumentoAprovacao {
  if (documento.nivel_atual !== null) {
    throw new Error("Documento ainda possui níveis de aprovação pendentes");
  }

  return {
    ...documento,
    status: "finalizado",
  };
}

/**
 * Obtém histórico de aprovação formatado
 */
export function obterHistoricoFormatado(documento: DocumentoAprovacao): string {
  let historico = `Documento: ${documento.id}\nTipo: ${documento.tipo_documento}\nStatus: ${documento.status}\n\n`;

  historico += "Histórico de Aprovações:\n";
  for (const entry of documento.historico_aprovacoes) {
    historico += `- [${entry.timestamp}] ${entry.usuario_nome} (${entry.nivel}): ${entry.acao}`;
    if (entry.comentario) {
      historico += `\n  Comentário: ${entry.comentario}`;
    }
    historico += "\n";
  }

  return historico;
}

/**
 * Verifica se documento pode ser aprovado por um usuário
 */
export function podeAprovar(
  documento: DocumentoAprovacao,
  usuario_nivel: ApprovalLevel
): boolean {
  return documento.status !== "finalizado" && documento.nivel_atual === usuario_nivel;
}

/**
 * Gera relatório de documentos pendentes de aprovação
 */
export function gerarRelatorioPendentes(
  documentos: DocumentoAprovacao[],
  nivel_usuario?: ApprovalLevel
): {
  total_pendentes: number;
  por_nivel: Record<string, number>;
  por_tipo: Record<string, number>;
  meus_pendentes: DocumentoAprovacao[];
} {
  const pendentes = documentos.filter((d) => d.status !== "finalizado" && d.status !== "rejeitado");

  const por_nivel: Record<string, number> = {};
  const por_tipo: Record<string, number> = {};
  const meus_pendentes = nivel_usuario
    ? pendentes.filter((d) => d.nivel_atual === nivel_usuario)
    : [];

  for (const doc of pendentes) {
    if (doc.nivel_atual) {
      por_nivel[doc.nivel_atual] = (por_nivel[doc.nivel_atual] || 0) + 1;
    }
    por_tipo[doc.tipo_documento] = (por_tipo[doc.tipo_documento] || 0) + 1;
  }

  return {
    total_pendentes: pendentes.length,
    por_nivel,
    por_tipo,
    meus_pendentes,
  };
}

/**
 * Valida se fluxo de aprovação é válido para o tipo de documento
 */
export function validarFluxoAprovacao(tipo_documento: string): {
  valido: boolean;
  fluxo: ApprovalLevel[];
} {
  const fluxo = FLUXO_APROVACAO[tipo_documento];
  return {
    valido: !!fluxo && fluxo.length > 0,
    fluxo: fluxo || [],
  };
}
