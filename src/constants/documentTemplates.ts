/**
 * Legal Document Templates - ABNT Compliance
 * Predefined templates for different legal documents
 */

import type { DocumentTemplate } from '../types/editor'
import { TemplateType } from '../types/editor'

// ==================== TEMPLATE: PETIÇÃO INICIAL ====================

export const petitionTemplate: DocumentTemplate = {
  id: 'template-petition-001',
  type: TemplateType.PETITION,
  name: 'Petição Inicial',
  description: 'Documento de abertura de processo com argumentação jurídica',
  sections: [
    {
      id: 'section-header',
      title: 'Cabeçalho',
      placeholder: '[NOME DO TRIBUNAL]\n[ENDEREÇO]\n[DADOS DE PROTOCOLO]',
      order: 1,
      required: true,
      guidance: 'Preencha com dados do tribunal onde a ação será ajuizada',
    },
    {
      id: 'section-title',
      title: 'Título',
      placeholder: 'PETIÇÃO INICIAL DE [TIPO DE AÇÃO]\n[SUBTÍTULO SE HOUVER]',
      order: 2,
      required: true,
      examples: ['PETIÇÃO INICIAL DE AÇÃO ORDINÁRIA', 'PETIÇÃO INICIAL DE AÇÃO DE COBRANÇA'],
    },
    {
      id: 'section-parties',
      title: 'Partes',
      placeholder: 'Autor: [nome completo, CPF/CNPJ, endereço]\nRéu: [nome completo, CPF/CNPJ, endereço]',
      order: 3,
      required: true,
    },
    {
      id: 'section-exposition',
      title: 'Relatório',
      placeholder: 'Narra-se de forma sucinta os fatos que originaram a demanda...',
      order: 4,
      required: true,
      guidance: 'Apresente cronologicamente os fatos relevantes',
    },
    {
      id: 'section-foundation',
      title: 'Fundamentação Jurídica',
      placeholder: 'I. DO DIREITO APLICÁVEL\n...\nII. DA CARACTERIZAÇÃO DO DIREITO',
      order: 5,
      required: true,
    },
    {
      id: 'section-prayer',
      title: 'Pedidos',
      placeholder: 'Diante do exposto, requer-se:\n1. [pedido principal]\n2. [pedidos subsidiários]',
      order: 6,
      required: true,
    },
    {
      id: 'section-proof',
      title: 'Documentos',
      placeholder: 'Acompanham a presente:\n- Anexo I: [documento 1]\n- Anexo II: [documento 2]',
      order: 7,
      required: false,
    },
    {
      id: 'section-conclusion',
      title: 'Conclusão',
      placeholder: 'Nestes termos,\nPede deferimento.',
      order: 8,
      required: true,
    },
    {
      id: 'section-signature',
      title: 'Assinatura',
      placeholder: '[Local], [data]\n\n_____________________\n[Nome e OAB do Advogado]',
      order: 9,
      required: true,
    },
  ],
  variables: [
    {
      name: 'tribunal_name',
      type: 'text',
      label: 'Nome do Tribunal',
      required: true,
      defaultValue: 'TRIBUNAL DE JUSTIÇA DO ESTADO DE SÃO PAULO',
    },
    {
      name: 'plaintiff_name',
      type: 'text',
      label: 'Nome do Autor',
      required: true,
    },
    {
      name: 'plaintiff_cpf',
      type: 'text',
      label: 'CPF do Autor',
      required: true,
    },
    {
      name: 'defendant_name',
      type: 'text',
      label: 'Nome do Réu',
      required: true,
    },
    {
      name: 'defendant_cpf',
      type: 'text',
      label: 'CPF do Réu',
      required: true,
    },
    {
      name: 'action_type',
      type: 'select',
      label: 'Tipo de Ação',
      required: true,
      options: [
        'AÇÃO ORDINÁRIA',
        'AÇÃO DE COBRANÇA',
        'AÇÃO DE INDENIZAÇÃO',
        'AÇÃO DE DANO MORAL',
        'AÇÃO DE RESCISÃO',
        'AÇÃO POSSESSÓRIA',
      ],
    },
    {
      name: 'attorney_name',
      type: 'text',
      label: 'Nome do Advogado',
      required: true,
    },
    {
      name: 'attorney_oab',
      type: 'text',
      label: 'OAB do Advogado',
      required: true,
    },
  ],
  defaultFormat: {
    fontSize: 12,
    fontFamily: 'Times New Roman',
    lineHeight: 1.5,
    margins: {
      top: 30,
      right: 20,
      bottom: 20,
      left: 30,
    },
  },
}

// ==================== TEMPLATE: RECURSO DE APELAÇÃO ====================

export const appealTemplate: DocumentTemplate = {
  id: 'template-appeal-001',
  type: TemplateType.APPEAL,
  name: 'Recurso de Apelação',
  description: 'Documento para contestar sentença de primeira instância',
  sections: [
    {
      id: 'section-header',
      title: 'Cabeçalho',
      placeholder: '[TRIBUNAL DE APELAÇÃO]\n[DADOS DO RECURSO]',
      order: 1,
      required: true,
    },
    {
      id: 'section-title',
      title: 'Título',
      placeholder: 'RECURSO DE APELAÇÃO',
      order: 2,
      required: true,
    },
    {
      id: 'section-parties',
      title: 'Partes',
      placeholder: 'Apelante: [nome]\nApelado: [nome]',
      order: 3,
      required: true,
    },
    {
      id: 'section-preliminaries',
      title: 'Preliminares',
      placeholder: 'I. PRELIMINARES\n1. Do cumprimento do requisito de tempestividade\n...',
      order: 4,
      required: false,
    },
    {
      id: 'section-grounds',
      title: 'Do Mérito',
      placeholder: 'II. DO MÉRITO\n1. Da alegada violação do direito...',
      order: 5,
      required: true,
    },
    {
      id: 'section-prayer-appeal',
      title: 'Pedidos',
      placeholder: 'Nestes termos, requer-se:\n1. Provimento do recurso\n2. Reforma da sentença',
      order: 6,
      required: true,
    },
    {
      id: 'section-signature-appeal',
      title: 'Assinatura',
      placeholder: '[Local], [data]\n\n_____________________\n[Nome e OAB do Advogado]',
      order: 7,
      required: true,
    },
  ],
  variables: [
    {
      name: 'appeal_type',
      type: 'select',
      label: 'Tipo de Recurso',
      required: true,
      options: ['APELAÇÃO', 'AGRAVO DE INSTRUMENTO', 'EMBARGOS'],
    },
    {
      name: 'sentence_date',
      type: 'date',
      label: 'Data da Sentença',
      required: true,
    },
  ],
  defaultFormat: {
    fontSize: 12,
    fontFamily: 'Times New Roman',
    lineHeight: 1.5,
    margins: {
      top: 30,
      right: 20,
      bottom: 20,
      left: 30,
    },
  },
}

// ==================== TEMPLATE: PARECER JURÍDICO ====================

export const opinionTemplate: DocumentTemplate = {
  id: 'template-opinion-001',
  type: TemplateType.OPINION,
  name: 'Parecer Jurídico',
  description: 'Análise técnica sobre questão jurídica específica',
  sections: [
    {
      id: 'section-header-opinion',
      title: 'Cabeçalho',
      placeholder: 'PARECER JURÍDICO',
      order: 1,
      required: true,
    },
    {
      id: 'section-metadata-opinion',
      title: 'Metadados',
      placeholder: 'Consulente: [cliente]\nConsultado: [assunto]\nData: [data]\nParecer nº [número]',
      order: 2,
      required: true,
    },
    {
      id: 'section-question',
      title: 'Questão Proposta',
      placeholder: 'Indaga-se se...',
      order: 3,
      required: true,
      guidance: 'Apresente claramente a dúvida ou questão jurídica',
    },
    {
      id: 'section-legal-foundation',
      title: 'Fundamentação Legal',
      placeholder: '1. DO MARCO LEGAL\n\n2. DA LEGISLAÇÃO APLICÁVEL',
      order: 4,
      required: true,
    },
    {
      id: 'section-analysis-opinion',
      title: 'Análise e Conclusão',
      placeholder: '3. DA ANÁLISE DO CASO\n\n4. CONCLUSÕES PRELIMINARES',
      order: 5,
      required: true,
    },
    {
      id: 'section-opinion-final',
      title: 'Opinião',
      placeholder: 'Em face do exposto, é nossa opinião que...',
      order: 6,
      required: true,
    },
    {
      id: 'section-signature-opinion',
      title: 'Assinatura',
      placeholder: '[Local], [data]\n\n_____________________\n[Nome e OAB do Advogado]',
      order: 7,
      required: true,
    },
  ],
  variables: [
    {
      name: 'consulting_client',
      type: 'text',
      label: 'Cliente Consultante',
      required: true,
    },
    {
      name: 'subject_matter',
      type: 'text',
      label: 'Assunto',
      required: true,
    },
    {
      name: 'opinion_number',
      type: 'text',
      label: 'Número do Parecer',
      required: false,
    },
  ],
  defaultFormat: {
    fontSize: 12,
    fontFamily: 'Times New Roman',
    lineHeight: 1.5,
    margins: {
      top: 30,
      right: 20,
      bottom: 20,
      left: 30,
    },
  },
}

// ==================== TEMPLATE: CONTRATO ====================

export const contractTemplate: DocumentTemplate = {
  id: 'template-contract-001',
  type: TemplateType.CONTRACT,
  name: 'Contrato',
  description: 'Acordo entre partes com cláusulas e condições',
  sections: [
    {
      id: 'section-title-contract',
      title: 'Título',
      placeholder: 'CONTRATO DE [TIPO]\n\nData: [data]',
      order: 1,
      required: true,
    },
    {
      id: 'section-parties-contract',
      title: 'Partes',
      placeholder: 'PARTES:\nPRIMEIRA PARTE: [dados]\nSEGUNDA PARTE: [dados]',
      order: 2,
      required: true,
    },
    {
      id: 'section-whereas',
      title: 'Considerandos',
      placeholder: 'CONSIDERANDO que:\n1. [contexto 1]\n2. [contexto 2]',
      order: 3,
      required: false,
    },
    {
      id: 'section-clauses',
      title: 'Cláusulas',
      placeholder: 'CLÁUSULAS:\n1. DO OBJETO\n2. DAS OBRIGAÇÕES\n3. DA REMUNERAÇÃO\n4. DO PRAZO\n5. DA RESCISÃO\n6. DISPOSIÇÕES GERAIS',
      order: 4,
      required: true,
    },
    {
      id: 'section-signature-contract',
      title: 'Assinaturas',
      placeholder: '[Local], [data]\n\n[Assinatura Parte 1]          [Assinatura Parte 2]\n[Nome]                         [Nome]',
      order: 5,
      required: true,
    },
  ],
  variables: [
    {
      name: 'contract_type',
      type: 'select',
      label: 'Tipo de Contrato',
      required: true,
      options: [
        'PRESTAÇÃO DE SERVIÇOS',
        'COMPRA E VENDA',
        'LOCAÇÃO',
        'MÚTUO',
        'DEPÓSITO',
        'PARCERIA',
      ],
    },
    {
      name: 'party1_name',
      type: 'text',
      label: 'Primeira Parte',
      required: true,
    },
    {
      name: 'party2_name',
      type: 'text',
      label: 'Segunda Parte',
      required: true,
    },
  ],
  defaultFormat: {
    fontSize: 12,
    fontFamily: 'Times New Roman',
    lineHeight: 1.5,
    margins: {
      top: 30,
      right: 20,
      bottom: 20,
      left: 30,
    },
  },
}

// ==================== TEMPLATE: MOÇÃO ====================

export const motionTemplate: DocumentTemplate = {
  id: 'template-motion-001',
  type: TemplateType.MOTION,
  name: 'Moção',
  description: 'Requerimento processual simples',
  sections: [
    {
      id: 'section-header-motion',
      title: 'Cabeçalho',
      placeholder: '[TRIBUNAL]\n[PROCESSO Nº]\n[DATAS]',
      order: 1,
      required: true,
    },
    {
      id: 'section-title-motion',
      title: 'Título',
      placeholder: 'MOÇÃO [tipo do pedido]',
      order: 2,
      required: true,
    },
    {
      id: 'section-opening-motion',
      title: 'Abertura',
      placeholder: 'Aos [data] [tribunal]\n\nRequerente: [nome]\nRequerido: [nome]',
      order: 3,
      required: true,
    },
    {
      id: 'section-request',
      title: 'Pedido',
      placeholder: 'Requeiro ao Ilustríssimo Sr. Juiz que [pedido específico].',
      order: 4,
      required: true,
    },
    {
      id: 'section-reasons-motion',
      title: 'Fundamentação',
      placeholder: 'RAZÕES:\n[argumentação do pedido]',
      order: 5,
      required: true,
    },
    {
      id: 'section-closing-motion',
      title: 'Fechamento',
      placeholder: 'Nestes termos,\nPede deferimento.',
      order: 6,
      required: true,
    },
  ],
  variables: [
    {
      name: 'motion_type',
      type: 'select',
      label: 'Tipo de Moção',
      required: true,
      options: [
        'DILAÇÃO DE PRAZO',
        'SUBSTITUIÇÃO DE ADVOGADO',
        'DESISTÊNCIA DE RECURSO',
        'JUNTADA DE DOCUMENTOS',
        'ADOÇÃO DE MEDIDA CAUTELAR',
      ],
    },
  ],
  defaultFormat: {
    fontSize: 12,
    fontFamily: 'Times New Roman',
    lineHeight: 1.5,
    margins: {
      top: 30,
      right: 20,
      bottom: 20,
      left: 30,
    },
  },
}

// ==================== TEMPLATE: BLANK ====================

export const blankTemplate: DocumentTemplate = {
  id: 'template-blank-001',
  type: TemplateType.BLANK,
  name: 'Documento em Branco',
  description: 'Página em branco para criação livre',
  sections: [
    {
      id: 'section-blank-content',
      title: 'Conteúdo',
      placeholder: '[Digite seu conteúdo aqui...]',
      order: 1,
      required: false,
    },
  ],
  variables: [],
  defaultFormat: {
    fontSize: 12,
    fontFamily: 'Times New Roman',
    lineHeight: 1.5,
    margins: {
      top: 30,
      right: 20,
      bottom: 20,
      left: 30,
    },
  },
}

// ==================== TEMPLATE REGISTRY ====================

export const ALL_TEMPLATES: Record<TemplateType, DocumentTemplate> = {
  [TemplateType.PETITION]: petitionTemplate,
  [TemplateType.APPEAL]: appealTemplate,
  [TemplateType.OPINION]: opinionTemplate,
  [TemplateType.CONTRACT]: contractTemplate,
  [TemplateType.MOTION]: motionTemplate,
  [TemplateType.BLANK]: blankTemplate,
}

export const getTemplate = (type: TemplateType): DocumentTemplate => {
  return ALL_TEMPLATES[type] || blankTemplate
}

export const getTemplateSection = (type: TemplateType, sectionId: string) => {
  const template = getTemplate(type)
  return template.sections.find((s) => s.id === sectionId)
}

export const getTemplateSectionsByOrder = (type: TemplateType) => {
  const template = getTemplate(type)
  return template.sections.sort((a, b) => a.order - b.order)
}
