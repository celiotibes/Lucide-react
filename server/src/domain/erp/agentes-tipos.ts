/**
 * Tipos e schemas para o sistema de agentes econômicos
 *
 * Sistema unificado de gestão de pessoas físicas e jurídicas:
 * - Pessoas Físicas (CPF): inquilinos, fiadores, devedores
 * - Pessoas Jurídicas (CNPJ): fornecedores, prestadores, co-proprietários
 *
 * Valida:
 * - CPF/CNPJ (formato e dígitos verificadores)
 * - Email
 * - Papéis e permissões
 * - Regimes tributários
 * - Nomes de endereço
 */

import { z } from "zod";

// =====================================================================
// Enums e constantes
// =====================================================================

/**
 * Tipo de entidade econômica
 */
export enum TipoEntidade {
  PESSOA_FISICA = "pessoa_fisica",
  PESSOA_JURIDICA = "pessoa_juridica",
}

/**
 * Papéis que um agente pode ter na organização
 */
export enum PapelAgente {
  TENANT = "tenant",           // Inquilino
  SUPPLIER = "supplier",       // Fornecedor
  PROVIDER = "provider",       // Prestador de serviços
  LEGAL_PARTY = "legal_party", // Parte legal (advogado, etc)
  CO_OWNER = "co_owner",       // Co-proprietário
  BORROWER = "borrower",       // Devedor/Mutuário
  LENDER = "lender",           // Credor/Mutuante
}

/**
 * Regimes tributários
 */
export enum RegimeTributario {
  SIMPLES = "simples",
  LUCRO_REAL = "lucro_real",
  LUCRO_PRESUMIDO = "lucro_presumido",
  MEI = "MEI",
  OUTRO = "outro",
}

/**
 * Tipos de validação de agente
 */
export enum TipoValidacao {
  CPF_CNPJ = "cpf_cnpj",
  EMAIL = "email",
  TELEFONE = "telefone",
  ENDERECO = "endereco",
  REGIME_TRIBUTARIO = "regime_tributario",
  CLASSIFICACAO_NFSE = "classificacao_nfse",
  DOCUMENTAL = "documental",
  FINANCEIRA = "financeira",
  MANUAL = "manual",
}

/**
 * Status de validação
 */
export enum ResultadoValidacao {
  APROVADO = "aprovado",
  REJEITADO = "rejeitado",
  PENDENTE = "pendente",
}

/**
 * Motivos de duplicata suspeita
 */
export enum MotivoDuplicata {
  CPF_CNPJ_SIMILAR = "cpf_cnpj_similar",
  NOME_SIMILAR = "nome_similar",
  EMAIL_IDENTICO = "email_identico",
  TELEFONE_IDENTICO = "telefone_identico",
  ENDERECO_IDENTICO = "endereco_identico",
  DADOS_CONFLITANTES = "dados_conflitantes",
  OUTRA = "outra",
}

/**
 * Status de análise de duplicata
 */
export enum StatusDuplicata {
  PENDENTE = "pendente",
  CONFIRMADA = "confirmada",
  REFUTADA = "refutada",
  MESCLADA = "mesclada",
}

/**
 * Tipos de vinculação
 */
export enum TipoVinculacao {
  PROPRIEDADE = "propriedade",
  CONTRATO_LOCACAO = "contrato_locacao",
  CONTRATO_PRESTACAO = "contrato_prestacao",
  CONTRATO_FINANCEIRO = "contrato_financeiro",
  PAGAMENTO = "pagamento",
  RECEBIMENTO = "recebimento",
  NOTA_FISCAL = "nota_fiscal",
  OUTRA = "outra",
}


// =====================================================================
// Schemas de Validação Zod
// =====================================================================

/**
 * Schema para validação de CPF
 * Formato: 11 dígitos numéricos
 */
export const CPFSchema = z
  .string()
  .regex(/^\d{11}$/, "CPF deve conter exatamente 11 dígitos")
  .refine((cpf) => isValidCPF(cpf), "CPF com dígitos verificadores inválidos");

/**
 * Schema para validação de CNPJ
 * Formato: 14 dígitos numéricos
 */
export const CNPJSchema = z
  .string()
  .regex(/^\d{14}$/, "CNPJ deve conter exatamente 14 dígitos")
  .refine((cnpj) => isValidCNPJ(cnpj), "CNPJ com dígitos verificadores inválidos");

/**
 * Schema para validação de CPF ou CNPJ
 */
export const CPFCNPJSchema = z
  .string()
  .refine(
    (value) => {
      const digits = value.replace(/\D/g, "");
      return digits.length === 11 || digits.length === 14;
    },
    "CPF ou CNPJ deve ter 11 ou 14 dígitos"
  )
  .refine(
    (value) => {
      const digits = value.replace(/\D/g, "");
      return digits.length === 11 ? isValidCPF(digits) : isValidCNPJ(digits);
    },
    "CPF ou CNPJ com dígitos verificadores inválidos"
  );

/**
 * Schema para validação de email
 */
export const EmailSchema = z
  .string()
  .email("Email inválido")
  .max(255, "Email deve ter no máximo 255 caracteres")
  .optional()
  .nullable();

/**
 * Schema para validação de telefone brasileiro
 */
export const TelefoneSchema = z
  .string()
  .regex(/^\d{10,11}$/, "Telefone deve ter 10 ou 11 dígitos")
  .optional()
  .nullable();

/**
 * Schema para endereço
 */
export const EnderecoSchema = z.object({
  logradouro: z.string().max(255).optional().nullable(),
  numero: z.string().max(10).optional().nullable(),
  complemento: z.string().max(255).optional().nullable(),
  bairro: z.string().max(100).optional().nullable(),
  cidade: z.string().max(100).optional().nullable(),
  estado: z.string().length(2).optional().nullable(),
  cep: z.string().regex(/^\d{8}$/, "CEP deve ter 8 dígitos").optional().nullable(),
  pais: z.string().max(50).default("Brasil").optional(),
});

/**
 * Schema para validação de agente econômico
 */
export const AgenteEconomicoSchema = z
  .object({
    id: z.string().uuid().optional(),

    // Identificação
    tipo_entidade: z.nativeEnum(TipoEntidade),
    cpf_cnpj: CPFCNPJSchema,
    nome: z.string().min(1).max(255),
    nome_fantasia: z.string().max(255).optional().nullable(),

    // Dados PF
    pessoa_fisica_pf_nome_mae: z.string().max(255).optional().nullable(),

    // Papel
    papel: z.nativeEnum(PapelAgente),

    // Informações fiscais
    regime_tributario: z.nativeEnum(RegimeTributario).optional().nullable(),
    inscricao_estadual: z.string().max(20).optional().nullable(),
    inscricao_municipal: z.string().max(20).optional().nullable(),
    classificacao_nfse: z.string().max(20).optional().nullable(),

    // Contato
    email: EmailSchema,
    telefone: TelefoneSchema,
    celular: TelefoneSchema,

    // Endereço
    endereco: EnderecoSchema.optional(),

    // Status
    ativo: z.boolean().default(true),

    // Metadados
    observacoes: z.string().optional().nullable(),
    tags: z.string().optional().nullable(), // Separado por vírgula

    // Validação
    validado: z.boolean().default(false),
  })
  .refine(
    (data) => {
      if (data.tipo_entidade === TipoEntidade.PESSOA_JURIDICA) {
        return data.nome_fantasia !== undefined && data.nome_fantasia !== null;
      }
      return true;
    },
    {
      message: "Pessoa jurídica deve ter nome fantasia",
      path: ["nome_fantasia"],
    }
  )
  .refine(
    (data) => {
      if (data.tipo_entidade === TipoEntidade.PESSOA_FISICA) {
        return (
          data.pessoa_fisica_pf_nome_mae !== undefined &&
          data.pessoa_fisica_pf_nome_mae !== null
        );
      }
      return true;
    },
    {
      message: "Pessoa física deve ter nome da mãe",
      path: ["pessoa_fisica_pf_nome_mae"],
    }
  );

/**
 * Schema para criação de agente (sem ID)
 */
export const CriarAgenteEconomicoSchema = AgenteEconomicoSchema.omit({
  id: true,
});

/**
 * Schema para atualização de agente (todos os campos opcionais)
 */
export const AtualizarAgenteEconomicoSchema = CriarAgenteEconomicoSchema.partial();

/**
 * Schema para validação de agente
 */
export const ValidacaoAgenteSchema = z.object({
  agente_id: z.string().uuid(),
  tipo_validacao: z.nativeEnum(TipoValidacao),
  resultado: z.nativeEnum(ResultadoValidacao),
  motivo: z.string().optional().nullable(),
  detalhes: z.record(z.any()).optional(),
});

/**
 * Schema para duplicata suspeita
 */
export const DuplicataSchema = z.object({
  agente_id_1: z.string().uuid(),
  agente_id_2: z.string().uuid(),
  score: z.number().min(0).max(100),
  motivo: z.nativeEnum(MotivoDuplicata),
  status: z.nativeEnum(StatusDuplicata).default(StatusDuplicata.PENDENTE),
  score_cpf: z.number().optional(),
  score_nome: z.number().optional(),
  score_email: z.number().optional(),
  score_telefone: z.number().optional(),
  score_endereco: z.number().optional(),
});

/**
 * Schema para vinculação de agente
 */
export const VinculacaoSchema = z.object({
  agente_id: z.string().uuid(),
  tipo_vinculacao: z.nativeEnum(TipoVinculacao),
  entidade_id: z.string().uuid(),
  entidade_nome: z.string().optional(),
  tipo_relacionamento: z.string().optional().nullable(),
  ativo: z.boolean().default(true),
});


// =====================================================================
// Interfaces TypeScript
// =====================================================================

/**
 * Agente econômico completo
 */
export interface AgenteEconomico {
  id: string; // UUID
  tipo_entidade: TipoEntidade;
  cpf_cnpj: string;
  nome: string;
  nome_fantasia?: string | null;
  pessoa_fisica_pf_nome_mae?: string | null;
  papel: PapelAgente;
  regime_tributario?: RegimeTributario | null;
  inscricao_estadual?: string | null;
  inscricao_municipal?: string | null;
  classificacao_nfse?: string | null;
  email?: string | null;
  telefone?: string | null;
  celular?: string | null;
  endereco?: {
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    estado?: string | null;
    cep?: string | null;
    pais?: string;
  };
  ativo: boolean;
  criado_em: Date;
  criado_por: string; // UUID
  atualizado_em: Date;
  atualizado_por: string; // UUID
  observacoes?: string | null;
  tags?: string | null;
  validado: boolean;
  validado_em?: Date | null;
  validado_por?: string | null;
}

/**
 * Validação de agente
 */
export interface ValidacaoAgente {
  id: string; // UUID
  agente_id: string; // UUID
  tipo_validacao: TipoValidacao;
  resultado: ResultadoValidacao;
  motivo?: string | null;
  detalhes?: Record<string, any>;
  executado_em: Date;
  executado_por: string; // UUID
}

/**
 * Duplicata suspeita
 */
export interface DuplicataSuspeita {
  id: string; // UUID
  agente_id_1: string; // UUID
  agente_id_2: string; // UUID
  score: number; // 0-100
  motivo: MotivoDuplicata;
  score_cpf?: number;
  score_nome?: number;
  score_email?: number;
  score_telefone?: number;
  score_endereco?: number;
  status: StatusDuplicata;
  analisado_em?: Date | null;
  analisado_por?: string | null;
  decisao?: string | null;
  criado_em: Date;
  criado_por: string; // UUID
}

/**
 * Vinculação de agente
 */
export interface VinculacaoAgente {
  id: string; // UUID
  agente_id: string; // UUID
  tipo_vinculacao: TipoVinculacao;
  entidade_id: string; // UUID
  entidade_nome?: string;
  tipo_relacionamento?: string | null;
  ativo: boolean;
  criado_em: Date;
  criado_por: string; // UUID
}

/**
 * Papel de agente com permissões
 */
export interface PapelDefinicao {
  id: string; // UUID
  chave: string;
  nome: string;
  descricao?: string;
  permissoes?: {
    ler?: boolean;
    escrever?: boolean;
    aprovar?: boolean;
    deletar?: boolean;
    [key: string]: boolean | undefined;
  };
  ativo: boolean;
  criado_em: Date;
  criado_por: string; // UUID
  atualizado_em: Date;
  atualizado_por: string; // UUID
}


// =====================================================================
// Funções de validação
// =====================================================================

/**
 * Valida CPF usando algoritmo de dígitos verificadores
 * Baseado em: https://www.brasil.gov.br/cidadao/pessoas-fisicas
 *
 * @param cpf - CPF com 11 dígitos
 * @returns true se CPF é válido
 */
export function isValidCPF(cpf: string): boolean {
  // Remove caracteres não numéricos
  const cleaned = cpf.replace(/\D/g, "");

  // Verifica se tem 11 dígitos
  if (cleaned.length !== 11) {
    return false;
  }

  // Rejeita CPF com todos os dígitos iguais
  if (/^(\d)\1{10}$/.test(cleaned)) {
    return false;
  }

  // Calcula primeiro dígito verificador
  let sum = 0;
  let remainder: number;

  for (let i = 1; i <= 9; i++) {
    sum += parseInt(cleaned.substring(i - 1, i)) * (11 - i);
  }

  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) {
    remainder = 0;
  }

  if (remainder !== parseInt(cleaned.substring(9, 10))) {
    return false;
  }

  // Calcula segundo dígito verificador
  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(cleaned.substring(i - 1, i)) * (12 - i);
  }

  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) {
    remainder = 0;
  }

  if (remainder !== parseInt(cleaned.substring(10, 11))) {
    return false;
  }

  return true;
}

/**
 * Valida CNPJ usando algoritmo de dígitos verificadores
 * Baseado em: https://www.brasil.gov.br/cidadao/pessoas-juridicas
 *
 * @param cnpj - CNPJ com 14 dígitos
 * @returns true se CNPJ é válido
 */
export function isValidCNPJ(cnpj: string): boolean {
  // Remove caracteres não numéricos
  const cleaned = cnpj.replace(/\D/g, "");

  // Verifica se tem 14 dígitos
  if (cleaned.length !== 14) {
    return false;
  }

  // Rejeita CNPJ com todos os dígitos iguais
  if (/^(\d)\1{13}$/.test(cleaned)) {
    return false;
  }

  // Calcula primeiro dígito verificador
  let size = cleaned.length - 2;
  let numbers = cleaned.substring(0, size);
  let digits = cleaned.substring(size);
  let sum = 0;
  let pos = size - 7;

  for (let i = size; i >= 1; i--) {
    sum += numbers.charAt(size - i) * pos--;
    if (pos < 2) {
      pos = 9;
    }
  }

  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) {
    return false;
  }

  // Calcula segundo dígito verificador
  size = size + 1;
  numbers = cleaned.substring(0, size);
  sum = 0;
  pos = size - 7;

  for (let i = size; i >= 1; i--) {
    sum += numbers.charAt(size - i) * pos--;
    if (pos < 2) {
      pos = 9;
    }
  }

  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) {
    return false;
  }

  return true;
}

/**
 * Formata CPF para exibição
 * @param cpf - CPF com 11 dígitos
 * @returns CPF formatado: XXX.XXX.XXX-XX
 */
export function formatCPF(cpf: string): string {
  const cleaned = cpf.replace(/\D/g, "");
  if (cleaned.length !== 11) {
    return cpf;
  }
  return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

/**
 * Formata CNPJ para exibição
 * @param cnpj - CNPJ com 14 dígitos
 * @returns CNPJ formatado: XX.XXX.XXX/XXXX-XX
 */
export function formatCNPJ(cnpj: string): string {
  const cleaned = cnpj.replace(/\D/g, "");
  if (cleaned.length !== 14) {
    return cnpj;
  }
  return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

/**
 * Formata CPF ou CNPJ de acordo com o tipo
 * @param value - CPF ou CNPJ
 * @returns Valor formatado
 */
export function formatCPFCNPJ(value: string): string {
  const cleaned = value.replace(/\D/g, "");
  if (cleaned.length === 11) {
    return formatCPF(cleaned);
  } else if (cleaned.length === 14) {
    return formatCNPJ(cleaned);
  }
  return value;
}

/**
 * Calcula similaridade entre dois strings (Levenshtein distance)
 * Retorna um score de 0 a 100 onde 100 = idêntico
 *
 * @param str1 - Primeiro string
 * @param str2 - Segundo string
 * @returns Score de similaridade (0-100)
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) {
    return 100;
  }

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) {
    return 100;
  }

  const editDistance = getLevenshteinDistance(longer, shorter);
  return Math.round(((longer.length - editDistance) / longer.length) * 100);
}

/**
 * Calcula Levenshtein distance entre dois strings
 * @param s1 - Primeiro string
 * @param s2 - Segundo string
 * @returns Distância de Levenshtein
 */
function getLevenshteinDistance(s1: string, s2: string): number {
  const costs: number[] = [];

  for (let k = 0; k <= s1.length; k++) {
    costs[k] = k;
  }

  for (let i = 1; i <= s2.length; i++) {
    let nw = i - 1;
    costs[0] = i;

    for (let j = 1; j <= s1.length; j++) {
      const cj = Math.min(
        1 + Math.min(costs[j], costs[j - 1]),
        s1.charAt(j - 1) === s2.charAt(i - 1) ? nw : nw + 1
      );
      nw = costs[j];
      costs[j] = cj;
    }
  }

  return costs[s1.length];
}

/**
 * Calcula score de duplicata entre dois agentes
 * @param agente1 - Primeiro agente
 * @param agente2 - Segundo agente
 * @returns Score de duplicata (0-100)
 */
export function calculateDuplicataScore(agente1: AgenteEconomico, agente2: AgenteEconomico): number {
  let score = 0;

  // CPF/CNPJ: 40 pontos se idêntico
  if (agente1.cpf_cnpj === agente2.cpf_cnpj) {
    score += 40;
  }

  // Nome: até 30 pontos (similaridade)
  if (agente1.nome && agente2.nome) {
    const nameSimilarity = calculateSimilarity(agente1.nome, agente2.nome);
    score += (nameSimilarity / 100) * 30;
  }

  // Email: 20 pontos se idêntico
  if (
    agente1.email &&
    agente2.email &&
    agente1.email.toLowerCase() === agente2.email.toLowerCase()
  ) {
    score += 20;
  }

  // Telefone: 10 pontos se idêntico
  if (
    agente1.telefone &&
    agente2.telefone &&
    agente1.telefone === agente2.telefone
  ) {
    score += 10;
  }

  return Math.min(100, Math.round(score));
}

/**
 * Limpa e padroniza CPF/CNPJ removendo caracteres especiais
 * @param value - CPF ou CNPJ com ou sem formatação
 * @returns CPF ou CNPJ apenas com dígitos
 */
export function cleanCPFCNPJ(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Detecta tipo de entidade baseado no comprimento do CPF/CNPJ
 * @param cpfCnpj - CPF ou CNPJ
 * @returns TipoEntidade correspondente
 */
export function detectTipoEntidade(cpfCnpj: string): TipoEntidade {
  const cleaned = cleanCPFCNPJ(cpfCnpj);
  if (cleaned.length === 11) {
    return TipoEntidade.PESSOA_FISICA;
  } else if (cleaned.length === 14) {
    return TipoEntidade.PESSOA_JURIDICA;
  }
  throw new Error("CPF ou CNPJ com formato inválido");
}
