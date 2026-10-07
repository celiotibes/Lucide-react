/**
 * Sistema de Papéis e Permissões para Agentes Econômicos
 *
 * Define papéis (tenant, supplier, service provider, etc), suas características,
 * atributos obrigatórios, regimes tributários padrão, validações específicas
 * e matriz de permissões.
 *
 * Papéis disponíveis:
 * - TENANT (inquilino) — contratos de aluguel, concessões
 * - SUPPLIER (fornecedor) — AP, compras, invoices
 * - SERVICE_PROVIDER (prestador) — contratos de serviço, pagamentos
 * - LEGAL_PARTY (parte_processo) — processos, disputas, advogados
 * - CO_OWNER (co-proprietário) — condomínio, joint ventures
 * - BORROWER (tomador) — empréstimos, financiamentos
 * - LENDER (credor) — linhas de crédito, investimentos
 */

import { z } from "zod";
import { PapelAgente, RegimeTributario, TipoEntidade } from "./agentes-tipos.js";

// =====================================================================
// Enums e Tipos
// =====================================================================

/**
 * Ações que podem ser controladas por permissões
 */
export enum AcaoPermissao {
  CRIAR = "criar",
  EDITAR = "editar",
  VISUALIZAR = "visualizar",
  DELETAR = "deletar",
  EXPORTAR = "exportar",
  VINCULAR = "vincular",
  DESVINCULAR = "desvincular",
  RECONCILIAR = "reconciliar",
  APROVAR = "aprovar",
  REJEITAR = "rejeitar",
  ARQUIVAR = "arquivar",
}

/**
 * Atores que podem ter permissões (usuários com esses papéis)
 */
export enum PapelUsuario {
  SUPER_ADMIN = "super_admin",
  ADMIN = "admin",
  GERENTE = "gerente",
  ANALISTA = "analista",
  OPERADOR = "operador",
  VISUALIZADOR = "visualizador",
}

/**
 * Status de um agente
 */
export enum StatusAgente {
  ATIVO = "ativo",
  INATIVO = "inativo",
  SUSPENSO = "suspenso",
  BLOQUEADO = "bloqueado",
  PENDENTE_VALIDACAO = "pendente_validacao",
}

/**
 * Campos obrigatórios para cada papel
 */
export const CAMPOS_OBRIGATORIOS_POR_PAPEL: Record<PapelAgente, string[]> = {
  [PapelAgente.TENANT]: [
    "cpf_cnpj",
    "nome",
    "email",
    "endereco",
  ],
  [PapelAgente.SUPPLIER]: [
    "cpf_cnpj",
    "nome",
    "regime_tributario",
    "email",
    "telefone",
  ],
  [PapelAgente.PROVIDER]: [
    "cpf_cnpj",
    "nome",
    "email",
    "telefone",
  ],
  [PapelAgente.LEGAL_PARTY]: [
    "cpf_cnpj",
    "nome",
    "email",
  ],
  [PapelAgente.CO_OWNER]: [
    "cpf_cnpj",
    "nome",
    "email",
    "endereco",
    "regime_tributario",
  ],
  [PapelAgente.BORROWER]: [
    "cpf_cnpj",
    "nome",
    "email",
    "endereco",
  ],
  [PapelAgente.LENDER]: [
    "cpf_cnpj",
    "nome",
    "regime_tributario",
    "email",
  ],
};

/**
 * Regimes tributários padrão por papel
 */
export const REGIME_TRIBUTARIO_PADRAO_POR_PAPEL: Record<PapelAgente, RegimeTributario | null> = {
  [PapelAgente.TENANT]: null, // Tenants geralmente não têm regime (PF)
  [PapelAgente.SUPPLIER]: RegimeTributario.LUCRO_REAL,
  [PapelAgente.PROVIDER]: RegimeTributario.SIMPLES,
  [PapelAgente.LEGAL_PARTY]: null,
  [PapelAgente.CO_OWNER]: RegimeTributario.LUCRO_REAL,
  [PapelAgente.BORROWER]: null,
  [PapelAgente.LENDER]: RegimeTributario.LUCRO_REAL,
};

/**
 * Tipos de transação típicos por papel
 */
export const TIPOS_TRANSACAO_POR_PAPEL: Record<PapelAgente, string[]> = {
  [PapelAgente.TENANT]: ["aluguel", "taxa_condominio", "utilidades"],
  [PapelAgente.SUPPLIER]: ["compra", "nota_fiscal_entrada", "devolucao"],
  [PapelAgente.PROVIDER]: ["prestacao_servico", "consulta", "manutencao"],
  [PapelAgente.LEGAL_PARTY]: ["honorario_advocaticio", "custas_judiciais", "pericia"],
  [PapelAgente.CO_OWNER]: ["rateio_despesa", "fundo_reserva", "manutencao_comum"],
  [PapelAgente.BORROWER]: ["amortizacao", "juros", "garantia"],
  [PapelAgente.LENDER]: ["juros_recebido", "multa", "comissao"],
};

/**
 * Validações específicas por papel
 */
export const VALIDACOES_ESPECIFICAS_POR_PAPEL: Record<PapelAgente, string[]> = {
  [PapelAgente.TENANT]: [
    "cpf_cnpj",
    "email",
    "endereco_completo",
  ],
  [PapelAgente.SUPPLIER]: [
    "cpf_cnpj",
    "email",
    "regime_tributario",
    "inscricao_estadual_se_aplicavel",
    "dados_bancarios",
  ],
  [PapelAgente.PROVIDER]: [
    "cpf_cnpj",
    "email",
    "telefone",
    "classificacao_nfse",
  ],
  [PapelAgente.LEGAL_PARTY]: [
    "cpf_cnpj",
    "email",
    "numero_oab_se_advogado",
  ],
  [PapelAgente.CO_OWNER]: [
    "cpf_cnpj",
    "email",
    "endereco",
    "percentual_participacao",
  ],
  [PapelAgente.BORROWER]: [
    "cpf_cnpj",
    "email",
    "endereco",
    "dados_bancarios",
  ],
  [PapelAgente.LENDER]: [
    "cpf_cnpj",
    "email",
    "regime_tributario",
    "dados_bancarios",
  ],
};

// =====================================================================
// Definição de Papéis
// =====================================================================

/**
 * Definição de um papel de agente
 */
export interface DefinicaoPapel {
  codigo: PapelAgente;
  nome_pt: string;
  descricao_pt: string;
  camposObrigatorios: string[];
  regimeTributarioPadrao: RegimeTributario | null;
  tiposTransacaoTipicos: string[];
  validacoesEspecificas: string[];
  requerValidacaoManual: boolean;
  requerDocumentacao: boolean;
  nivelRisco: "baixo" | "medio" | "alto";
  ativosPorPadrao: boolean;
}

/**
 * Catálogo de papéis
 */
export const PAPEIS_CATALOGO: Record<PapelAgente, DefinicaoPapel> = {
  [PapelAgente.TENANT]: {
    codigo: PapelAgente.TENANT,
    nome_pt: "Inquilino",
    descricao_pt: "Pessoa ou empresa que aluga propriedade ou espaço",
    camposObrigatorios: CAMPOS_OBRIGATORIOS_POR_PAPEL[PapelAgente.TENANT],
    regimeTributarioPadrao: REGIME_TRIBUTARIO_PADRAO_POR_PAPEL[PapelAgente.TENANT],
    tiposTransacaoTipicos: TIPOS_TRANSACAO_POR_PAPEL[PapelAgente.TENANT],
    validacoesEspecificas: VALIDACOES_ESPECIFICAS_POR_PAPEL[PapelAgente.TENANT],
    requerValidacaoManual: true,
    requerDocumentacao: true,
    nivelRisco: "baixo",
    ativosPorPadrao: true,
  },
  [PapelAgente.SUPPLIER]: {
    codigo: PapelAgente.SUPPLIER,
    nome_pt: "Fornecedor",
    descricao_pt: "Pessoa ou empresa que fornece produtos ou materiais",
    camposObrigatorios: CAMPOS_OBRIGATORIOS_POR_PAPEL[PapelAgente.SUPPLIER],
    regimeTributarioPadrao: REGIME_TRIBUTARIO_PADRAO_POR_PAPEL[PapelAgente.SUPPLIER],
    tiposTransacaoTipicos: TIPOS_TRANSACAO_POR_PAPEL[PapelAgente.SUPPLIER],
    validacoesEspecificas: VALIDACOES_ESPECIFICAS_POR_PAPEL[PapelAgente.SUPPLIER],
    requerValidacaoManual: true,
    requerDocumentacao: true,
    nivelRisco: "medio",
    ativosPorPadrao: true,
  },
  [PapelAgente.PROVIDER]: {
    codigo: PapelAgente.PROVIDER,
    nome_pt: "Prestador de Serviço",
    descricao_pt: "Pessoa ou empresa que fornece serviços",
    camposObrigatorios: CAMPOS_OBRIGATORIOS_POR_PAPEL[PapelAgente.PROVIDER],
    regimeTributarioPadrao: REGIME_TRIBUTARIO_PADRAO_POR_PAPEL[PapelAgente.PROVIDER],
    tiposTransacaoTipicos: TIPOS_TRANSACAO_POR_PAPEL[PapelAgente.PROVIDER],
    validacoesEspecificas: VALIDACOES_ESPECIFICAS_POR_PAPEL[PapelAgente.PROVIDER],
    requerValidacaoManual: false,
    requerDocumentacao: false,
    nivelRisco: "baixo",
    ativosPorPadrao: true,
  },
  [PapelAgente.LEGAL_PARTY]: {
    codigo: PapelAgente.LEGAL_PARTY,
    nome_pt: "Parte Legal",
    descricao_pt: "Advogado, tribunal, ou parte envolvida em processo",
    camposObrigatorios: CAMPOS_OBRIGATORIOS_POR_PAPEL[PapelAgente.LEGAL_PARTY],
    regimeTributarioPadrao: REGIME_TRIBUTARIO_PADRAO_POR_PAPEL[PapelAgente.LEGAL_PARTY],
    tiposTransacaoTipicos: TIPOS_TRANSACAO_POR_PAPEL[PapelAgente.LEGAL_PARTY],
    validacoesEspecificas: VALIDACOES_ESPECIFICAS_POR_PAPEL[PapelAgente.LEGAL_PARTY],
    requerValidacaoManual: true,
    requerDocumentacao: true,
    nivelRisco: "alto",
    ativosPorPadrao: true,
  },
  [PapelAgente.CO_OWNER]: {
    codigo: PapelAgente.CO_OWNER,
    nome_pt: "Co-proprietário",
    descricao_pt: "Proprietário conjunto de imóvel ou empresa",
    camposObrigatorios: CAMPOS_OBRIGATORIOS_POR_PAPEL[PapelAgente.CO_OWNER],
    regimeTributarioPadrao: REGIME_TRIBUTARIO_PADRAO_POR_PAPEL[PapelAgente.CO_OWNER],
    tiposTransacaoTipicos: TIPOS_TRANSACAO_POR_PAPEL[PapelAgente.CO_OWNER],
    validacoesEspecificas: VALIDACOES_ESPECIFICAS_POR_PAPEL[PapelAgente.CO_OWNER],
    requerValidacaoManual: true,
    requerDocumentacao: true,
    nivelRisco: "alto",
    ativosPorPadrao: true,
  },
  [PapelAgente.BORROWER]: {
    codigo: PapelAgente.BORROWER,
    nome_pt: "Tomador",
    descricao_pt: "Pessoa ou empresa que toma empréstimo",
    camposObrigatorios: CAMPOS_OBRIGATORIOS_POR_PAPEL[PapelAgente.BORROWER],
    regimeTributarioPadrao: REGIME_TRIBUTARIO_PADRAO_POR_PAPEL[PapelAgente.BORROWER],
    tiposTransacaoTipicos: TIPOS_TRANSACAO_POR_PAPEL[PapelAgente.BORROWER],
    validacoesEspecificas: VALIDACOES_ESPECIFICAS_POR_PAPEL[PapelAgente.BORROWER],
    requerValidacaoManual: true,
    requerDocumentacao: true,
    nivelRisco: "alto",
    ativosPorPadrao: true,
  },
  [PapelAgente.LENDER]: {
    codigo: PapelAgente.LENDER,
    nome_pt: "Credor",
    descricao_pt: "Banco ou instituição financeira que concede empréstimo",
    camposObrigatorios: CAMPOS_OBRIGATORIOS_POR_PAPEL[PapelAgente.LENDER],
    regimeTributarioPadrao: REGIME_TRIBUTARIO_PADRAO_POR_PAPEL[PapelAgente.LENDER],
    tiposTransacaoTipicos: TIPOS_TRANSACAO_POR_PAPEL[PapelAgente.LENDER],
    validacoesEspecificas: VALIDACOES_ESPECIFICAS_POR_PAPEL[PapelAgente.LENDER],
    requerValidacaoManual: true,
    requerDocumentacao: true,
    nivelRisco: "medio",
    ativosPorPadrao: true,
  },
};

// =====================================================================
// Matriz de Permissões
// =====================================================================

/**
 * Matriz de permissões: quem pode fazer o quê com cada papel de agente
 */
export interface PermissaoPapel {
  papelAgente: PapelAgente;
  papelUsuario: PapelUsuario;
  acoes: AcaoPermissao[];
}

/**
 * Define as permissões padrão por papel de usuário
 */
export const MATRIZ_PERMISSOES: PermissaoPapel[] = [
  // SUPER_ADMIN - acesso total
  {
    papelAgente: PapelAgente.TENANT,
    papelUsuario: PapelUsuario.SUPER_ADMIN,
    acoes: Object.values(AcaoPermissao),
  },
  {
    papelAgente: PapelAgente.SUPPLIER,
    papelUsuario: PapelUsuario.SUPER_ADMIN,
    acoes: Object.values(AcaoPermissao),
  },
  {
    papelAgente: PapelAgente.PROVIDER,
    papelUsuario: PapelUsuario.SUPER_ADMIN,
    acoes: Object.values(AcaoPermissao),
  },
  {
    papelAgente: PapelAgente.LEGAL_PARTY,
    papelUsuario: PapelUsuario.SUPER_ADMIN,
    acoes: Object.values(AcaoPermissao),
  },
  {
    papelAgente: PapelAgente.CO_OWNER,
    papelUsuario: PapelUsuario.SUPER_ADMIN,
    acoes: Object.values(AcaoPermissao),
  },
  {
    papelAgente: PapelAgente.BORROWER,
    papelUsuario: PapelUsuario.SUPER_ADMIN,
    acoes: Object.values(AcaoPermissao),
  },
  {
    papelAgente: PapelAgente.LENDER,
    papelUsuario: PapelUsuario.SUPER_ADMIN,
    acoes: Object.values(AcaoPermissao),
  },

  // ADMIN - acesso praticamente total menos alguns casos críticos
  {
    papelAgente: PapelAgente.TENANT,
    papelUsuario: PapelUsuario.ADMIN,
    acoes: [
      AcaoPermissao.CRIAR,
      AcaoPermissao.EDITAR,
      AcaoPermissao.VISUALIZAR,
      AcaoPermissao.EXPORTAR,
      AcaoPermissao.VINCULAR,
      AcaoPermissao.RECONCILIAR,
    ],
  },
  {
    papelAgente: PapelAgente.SUPPLIER,
    papelUsuario: PapelUsuario.ADMIN,
    acoes: [
      AcaoPermissao.CRIAR,
      AcaoPermissao.EDITAR,
      AcaoPermissao.VISUALIZAR,
      AcaoPermissao.EXPORTAR,
      AcaoPermissao.VINCULAR,
      AcaoPermissao.RECONCILIAR,
      AcaoPermissao.APROVAR,
    ],
  },
  {
    papelAgente: PapelAgente.PROVIDER,
    papelUsuario: PapelUsuario.ADMIN,
    acoes: [
      AcaoPermissao.CRIAR,
      AcaoPermissao.EDITAR,
      AcaoPermissao.VISUALIZAR,
      AcaoPermissao.EXPORTAR,
      AcaoPermissao.VINCULAR,
    ],
  },
  {
    papelAgente: PapelAgente.LEGAL_PARTY,
    papelUsuario: PapelUsuario.ADMIN,
    acoes: [
      AcaoPermissao.CRIAR,
      AcaoPermissao.EDITAR,
      AcaoPermissao.VISUALIZAR,
      AcaoPermissao.EXPORTAR,
      AcaoPermissao.VINCULAR,
      AcaoPermissao.APROVAR,
    ],
  },
  {
    papelAgente: PapelAgente.CO_OWNER,
    papelUsuario: PapelUsuario.ADMIN,
    acoes: [
      AcaoPermissao.CRIAR,
      AcaoPermissao.EDITAR,
      AcaoPermissao.VISUALIZAR,
      AcaoPermissao.EXPORTAR,
      AcaoPermissao.VINCULAR,
      AcaoPermissao.APROVAR,
    ],
  },
  {
    papelAgente: PapelAgente.BORROWER,
    papelUsuario: PapelUsuario.ADMIN,
    acoes: [
      AcaoPermissao.CRIAR,
      AcaoPermissao.EDITAR,
      AcaoPermissao.VISUALIZAR,
      AcaoPermissao.EXPORTAR,
      AcaoPermissao.VINCULAR,
      AcaoPermissao.RECONCILIAR,
    ],
  },
  {
    papelAgente: PapelAgente.LENDER,
    papelUsuario: PapelUsuario.ADMIN,
    acoes: [
      AcaoPermissao.CRIAR,
      AcaoPermissao.EDITAR,
      AcaoPermissao.VISUALIZAR,
      AcaoPermissao.EXPORTAR,
      AcaoPermissao.VINCULAR,
      AcaoPermissao.RECONCILIAR,
    ],
  },

  // GERENTE - acesso CRUD sem deletar
  {
    papelAgente: PapelAgente.TENANT,
    papelUsuario: PapelUsuario.GERENTE,
    acoes: [
      AcaoPermissao.CRIAR,
      AcaoPermissao.EDITAR,
      AcaoPermissao.VISUALIZAR,
      AcaoPermissao.VINCULAR,
    ],
  },
  {
    papelAgente: PapelAgente.SUPPLIER,
    papelUsuario: PapelUsuario.GERENTE,
    acoes: [
      AcaoPermissao.CRIAR,
      AcaoPermissao.EDITAR,
      AcaoPermissao.VISUALIZAR,
      AcaoPermissao.VINCULAR,
      AcaoPermissao.RECONCILIAR,
    ],
  },
  {
    papelAgente: PapelAgente.PROVIDER,
    papelUsuario: PapelUsuario.GERENTE,
    acoes: [
      AcaoPermissao.CRIAR,
      AcaoPermissao.EDITAR,
      AcaoPermissao.VISUALIZAR,
      AcaoPermissao.VINCULAR,
    ],
  },
  {
    papelAgente: PapelAgente.LEGAL_PARTY,
    papelUsuario: PapelUsuario.GERENTE,
    acoes: [
      AcaoPermissao.VISUALIZAR,
      AcaoPermissao.VINCULAR,
    ],
  },
  {
    papelAgente: PapelAgente.CO_OWNER,
    papelUsuario: PapelUsuario.GERENTE,
    acoes: [
      AcaoPermissao.VISUALIZAR,
      AcaoPermissao.VINCULAR,
    ],
  },
  {
    papelAgente: PapelAgente.BORROWER,
    papelUsuario: PapelUsuario.GERENTE,
    acoes: [
      AcaoPermissao.CRIAR,
      AcaoPermissao.EDITAR,
      AcaoPermissao.VISUALIZAR,
      AcaoPermissao.VINCULAR,
    ],
  },
  {
    papelAgente: PapelAgente.LENDER,
    papelUsuario: PapelUsuario.GERENTE,
    acoes: [
      AcaoPermissao.VISUALIZAR,
      AcaoPermissao.VINCULAR,
    ],
  },

  // ANALISTA - leitura + vincular
  {
    papelAgente: PapelAgente.TENANT,
    papelUsuario: PapelUsuario.ANALISTA,
    acoes: [AcaoPermissao.VISUALIZAR, AcaoPermissao.VINCULAR],
  },
  {
    papelAgente: PapelAgente.SUPPLIER,
    papelUsuario: PapelUsuario.ANALISTA,
    acoes: [AcaoPermissao.VISUALIZAR, AcaoPermissao.VINCULAR, AcaoPermissao.EXPORTAR],
  },
  {
    papelAgente: PapelAgente.PROVIDER,
    papelUsuario: PapelUsuario.ANALISTA,
    acoes: [AcaoPermissao.VISUALIZAR],
  },
  {
    papelAgente: PapelAgente.LEGAL_PARTY,
    papelUsuario: PapelUsuario.ANALISTA,
    acoes: [AcaoPermissao.VISUALIZAR],
  },
  {
    papelAgente: PapelAgente.CO_OWNER,
    papelUsuario: PapelUsuario.ANALISTA,
    acoes: [AcaoPermissao.VISUALIZAR],
  },
  {
    papelAgente: PapelAgente.BORROWER,
    papelUsuario: PapelUsuario.ANALISTA,
    acoes: [AcaoPermissao.VISUALIZAR, AcaoPermissao.VINCULAR],
  },
  {
    papelAgente: PapelAgente.LENDER,
    papelUsuario: PapelUsuario.ANALISTA,
    acoes: [AcaoPermissao.VISUALIZAR],
  },

  // OPERADOR - leitura apenas
  {
    papelAgente: PapelAgente.TENANT,
    papelUsuario: PapelUsuario.OPERADOR,
    acoes: [AcaoPermissao.VISUALIZAR],
  },
  {
    papelAgente: PapelAgente.SUPPLIER,
    papelUsuario: PapelUsuario.OPERADOR,
    acoes: [AcaoPermissao.VISUALIZAR],
  },
  {
    papelAgente: PapelAgente.PROVIDER,
    papelUsuario: PapelUsuario.OPERADOR,
    acoes: [AcaoPermissao.VISUALIZAR],
  },
  {
    papelAgente: PapelAgente.LEGAL_PARTY,
    papelUsuario: PapelUsuario.OPERADOR,
    acoes: [AcaoPermissao.VISUALIZAR],
  },
  {
    papelAgente: PapelAgente.CO_OWNER,
    papelUsuario: PapelUsuario.OPERADOR,
    acoes: [AcaoPermissao.VISUALIZAR],
  },
  {
    papelAgente: PapelAgente.BORROWER,
    papelUsuario: PapelUsuario.OPERADOR,
    acoes: [AcaoPermissao.VISUALIZAR],
  },
  {
    papelAgente: PapelAgente.LENDER,
    papelUsuario: PapelUsuario.OPERADOR,
    acoes: [AcaoPermissao.VISUALIZAR],
  },

  // VISUALIZADOR - apenas read para papéis não críticos
  {
    papelAgente: PapelAgente.TENANT,
    papelUsuario: PapelUsuario.VISUALIZADOR,
    acoes: [AcaoPermissao.VISUALIZAR],
  },
  {
    papelAgente: PapelAgente.PROVIDER,
    papelUsuario: PapelUsuario.VISUALIZADOR,
    acoes: [AcaoPermissao.VISUALIZAR],
  },
];

// =====================================================================
// Schemas de Validação
// =====================================================================

/**
 * Schema para requisitos de um papel
 */
export const RequisitoPapelSchema = z.object({
  papelAgente: z.nativeEnum(PapelAgente),
  camposObrigatorios: z.array(z.string()),
  regimeTributarioPadrao: z.nativeEnum(RegimeTributario).nullable(),
  validacoesEspecificas: z.array(z.string()),
  requerValidacaoManual: z.boolean(),
  requerDocumentacao: z.boolean(),
  nivelRisco: z.enum(["baixo", "medio", "alto"]),
});

/**
 * Schema para permissão de papel
 */
export const PermissaoPapelSchema = z.object({
  papelAgente: z.nativeEnum(PapelAgente),
  papelUsuario: z.nativeEnum(PapelUsuario),
  acoes: z.array(z.nativeEnum(AcaoPermissao)),
});

// =====================================================================
// Funções Utilitárias
// =====================================================================

/**
 * Obtém os requisitos de um papel de agente
 * @param papelAgente - Papel do agente
 * @returns Definição do papel com requisitos
 */
export function obterDefinicaoPapel(papelAgente: PapelAgente): DefinicaoPapel {
  const definicao = PAPEIS_CATALOGO[papelAgente];
  if (!definicao) {
    throw new Error(`Papel desconhecido: ${papelAgente}`);
  }
  return definicao;
}

/**
 * Valida se um agente possui todos os campos obrigatórios do seu papel
 * @param agente - Dados do agente
 * @param papel - Papel do agente
 * @returns Array de campos faltantes (vazio se tudo OK)
 */
export function validarCamposObrigatorios(
  agente: Record<string, unknown>,
  papel: PapelAgente
): string[] {
  const definicao = obterDefinicaoPapel(papel);
  const camposFaltantes: string[] = [];

  for (const campo of definicao.camposObrigatorios) {
    const valor = agente[campo];
    if (valor === null || valor === undefined || valor === "") {
      camposFaltantes.push(campo);
    }
  }

  return camposFaltantes;
}

/**
 * Obtém as permissões de um usuário para um papel de agente específico
 * @param papelAgente - Papel do agente
 * @param papelUsuario - Papel do usuário
 * @returns Array de ações permitidas
 */
export function obterPermissoes(
  papelAgente: PapelAgente,
  papelUsuario: PapelUsuario
): AcaoPermissao[] {
  const permissao = MATRIZ_PERMISSOES.find(
    (p) => p.papelAgente === papelAgente && p.papelUsuario === papelUsuario
  );

  return permissao?.acoes ?? [];
}

/**
 * Verifica se um usuário tem permissão específica
 * @param papelAgente - Papel do agente
 * @param papelUsuario - Papel do usuário
 * @param acao - Ação que se deseja realizar
 * @returns true se tem permissão
 */
export function temPermissao(
  papelAgente: PapelAgente,
  papelUsuario: PapelUsuario,
  acao: AcaoPermissao
): boolean {
  const permissoes = obterPermissoes(papelAgente, papelUsuario);
  return permissoes.includes(acao);
}

/**
 * Lista todos os papéis disponíveis com seus requisitos
 * @returns Array com definições de todos os papéis
 */
export function listarPapeis(): DefinicaoPapel[] {
  return Object.values(PAPEIS_CATALOGO);
}

/**
 * Obter tipos de transação por papel
 * @param papel - Papel do agente
 * @returns Array de tipos de transação
 */
export function obterTiposTransacao(papel: PapelAgente): string[] {
  return TIPOS_TRANSACAO_POR_PAPEL[papel] ?? [];
}

/**
 * Valida se um tipo de entidade (PF/PJ) é compatível com o papel
 * @param tipoEntidade - Tipo de entidade
 * @param papel - Papel desejado
 * @returns true se compatível
 */
export function validarCompatibilidadeEntidadePapel(
  tipoEntidade: TipoEntidade,
  papel: PapelAgente
): boolean {
  // Alguns papéis são mais adequados para PJ, outros para PF
  const papeisPJ: PapelAgente[] = [
    PapelAgente.SUPPLIER,
    PapelAgente.PROVIDER,
    PapelAgente.LENDER,
  ];

  const papeisPF: PapelAgente[] = [PapelAgente.TENANT, PapelAgente.BORROWER];

  if (
    tipoEntidade === TipoEntidade.PESSOA_JURIDICA &&
    papeisPF.includes(papel)
  ) {
    return false; // PJ não deveria ser tenant ou borrower
  }

  if (
    tipoEntidade === TipoEntidade.PESSOA_FISICA &&
    papeisPJ.includes(papel)
  ) {
    return false; // PF não deveria ser supplier
  }

  return true; // Outros casos são permitidos
}

/**
 * Obter o nível de risco de um papel
 * @param papel - Papel do agente
 * @returns Nível de risco: 'baixo', 'medio', 'alto'
 */
export function obterNivelRisco(papel: PapelAgente): "baixo" | "medio" | "alto" {
  const definicao = obterDefinicaoPapel(papel);
  return definicao.nivelRisco;
}
