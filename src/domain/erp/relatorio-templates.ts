/**
 * Relatorio Templates - Template definitions for standard reports
 *
 * Provides pre-configured templates for:
 * - Apontamentos de Prestadores
 * - Advocacia/Legal
 * - Contas Pessoais
 * - Imóveis/Gestão Patrimonial
 *
 * Each template defines: columns, aggregations, validations, formatting
 */

import type {
  ColunasRelatorio,
  Agregacao,
  Validacao,
  ConfiguracaoFormatacao,
} from "./relatorio-builder";

/**
 * Template base abstrato para relatórios
 */
export abstract class TemplateRelatorio {
  abstract nome: string;
  abstract descricao: string;
  abstract colunas: ColunasRelatorio[];
  abstract agregacoes: Agregacao[];
  abstract validacoes: Validacao[];
  abstract formatacao: ConfiguracaoFormatacao;

  /**
   * Obtém configuração completa do template
   */
  obterConfiguracao() {
    return {
      nome: this.nome,
      descricao: this.descricao,
      colunas: this.colunas,
      agregacoes: this.agregacoes,
      validacoes: this.validacoes,
      formatacao: this.formatacao,
    };
  }

  /**
   * Clona o template para customização
   */
  clonar(): TemplateRelatorio {
    const clone = Object.create(Object.getPrototypeOf(this));
    Object.assign(clone, this);
    clone.colunas = JSON.parse(JSON.stringify(this.colunas));
    clone.agregacoes = JSON.parse(JSON.stringify(this.agregacoes));
    clone.validacoes = JSON.parse(JSON.stringify(this.validacoes));
    clone.formatacao = JSON.parse(JSON.stringify(this.formatacao));
    return clone;
  }
}

/**
 * Template para Relatório de Apontamentos de Prestadores
 *
 * Inclui:
 * - Dados do apontamento (período, prestador, horas/valores)
 * - Centro de custo
 * - Status de auditoria
 * - Agregações por prestador, centro de custo, status
 */
export class TemplateApontamentos extends TemplateRelatorio {
  nome = "Relatório de Apontamentos";
  descricao = "Apontamentos de horas e despesas de prestadores";

  colunas: ColunasRelatorio[] = [
    {
      nome: "id",
      tipo: "inteiro",
      largura: 80,
      alinhamento: "direita",
    },
    {
      nome: "data_apontamento",
      tipo: "data",
      largura: 100,
      alinhamento: "centro",
    },
    {
      nome: "prestador_nome",
      tipo: "texto",
      largura: 200,
      alinhamento: "esquerda",
    },
    {
      nome: "centro_custo_codigo",
      tipo: "texto",
      largura: 120,
      alinhamento: "centro",
    },
    {
      nome: "descricao_atividade",
      tipo: "texto",
      largura: 250,
      alinhamento: "esquerda",
    },
    {
      nome: "horas_apontadas",
      tipo: "inteiro",
      largura: 100,
      alinhamento: "direita",
    },
    {
      nome: "valor_hora",
      tipo: "moeda",
      largura: 120,
      alinhamento: "direita",
    },
    {
      nome: "valor_total",
      tipo: "moeda",
      largura: 120,
      alinhamento: "direita",
    },
    {
      nome: "status_auditoria",
      tipo: "texto",
      largura: 100,
      alinhamento: "centro",
    },
    {
      nome: "observacoes",
      tipo: "texto",
      largura: 200,
      alinhamento: "esquerda",
    },
  ];

  agregacoes: Agregacao[] = [
    {
      tipo: "SUM",
      campo: "valor_total",
      alias: "total_valor",
    },
    {
      tipo: "SUM",
      campo: "horas_apontadas",
      alias: "total_horas",
    },
    {
      tipo: "COUNT",
      campo: "id",
      alias: "total_apontamentos",
    },
    {
      tipo: "AVG",
      campo: "valor_hora",
      alias: "media_valor_hora",
    },
  ];

  validacoes: Validacao[] = [
    {
      campo: "data_apontamento",
      tipo: "requerido",
      mensagem: "Data do apontamento é obrigatória",
    },
    {
      campo: "prestador_nome",
      tipo: "requerido",
      mensagem: "Nome do prestador é obrigatório",
    },
    {
      campo: "horas_apontadas",
      tipo: "faixa",
      parametros: { min: 0, max: 24 },
      mensagem: "Horas apontadas deve estar entre 0 e 24",
    },
    {
      campo: "valor_total",
      tipo: "faixa",
      parametros: { min: 0 },
      mensagem: "Valor total deve ser positivo",
    },
  ];

  formatacao: ConfiguracaoFormatacao = {
    moeda: "BRL",
    dataFormat: "DD/MM/YYYY",
    casasDecimais: 2,
    percentualPrecisao: 2,
    incluirHashAuditoria: true,
  };
}

/**
 * Template para Relatório de Advocacia
 *
 * Inclui:
 * - Dados do processo (número, tipo, status)
 * - Partes envolvidas
 * - Despesas legais
 * - Risco e estimativas
 * - Agregações por tipo, status, risco
 */
export class TemplateAdvocacia extends TemplateRelatorio {
  nome = "Relatório de Advocacia";
  descricao = "Processos legais, despesas e riscos";

  colunas: ColunasRelatorio[] = [
    {
      nome: "id",
      tipo: "inteiro",
      largura: 80,
      alinhamento: "direita",
    },
    {
      nome: "numero_processo",
      tipo: "texto",
      largura: 180,
      alinhamento: "centro",
    },
    {
      nome: "tipo_processo",
      tipo: "texto",
      largura: 120,
      alinhamento: "esquerda",
    },
    {
      nome: "descricao",
      tipo: "texto",
      largura: 250,
      alinhamento: "esquerda",
    },
    {
      nome: "status",
      tipo: "texto",
      largura: 100,
      alinhamento: "centro",
    },
    {
      nome: "foro",
      tipo: "texto",
      largura: 150,
      alinhamento: "esquerda",
    },
    {
      nome: "valor_causa",
      tipo: "moeda",
      largura: 120,
      alinhamento: "direita",
    },
    {
      nome: "estimativa_despesa",
      tipo: "moeda",
      largura: 120,
      alinhamento: "direita",
    },
    {
      nome: "despesa_realizada",
      tipo: "moeda",
      largura: 120,
      alinhamento: "direita",
    },
    {
      nome: "risco_potencial",
      tipo: "texto",
      largura: 100,
      alinhamento: "centro",
    },
    {
      nome: "data_ajuizamento",
      tipo: "data",
      largura: 100,
      alinhamento: "centro",
    },
    {
      nome: "advogado_responsavel",
      tipo: "texto",
      largura: 150,
      alinhamento: "esquerda",
    },
  ];

  agregacoes: Agregacao[] = [
    {
      tipo: "COUNT",
      campo: "id",
      alias: "total_processos",
    },
    {
      tipo: "SUM",
      campo: "valor_causa",
      alias: "total_valor_causas",
    },
    {
      tipo: "SUM",
      campo: "estimativa_despesa",
      alias: "total_estimativa_despesas",
    },
    {
      tipo: "SUM",
      campo: "despesa_realizada",
      alias: "total_despesa_realizada",
    },
    {
      tipo: "AVG",
      campo: "valor_causa",
      alias: "media_valor_causa",
    },
  ];

  validacoes: Validacao[] = [
    {
      campo: "numero_processo",
      tipo: "requerido",
      mensagem: "Número do processo é obrigatório",
    },
    {
      campo: "numero_processo",
      tipo: "formato",
      parametros: { regex: "^\\d{7}-\\d{2}\\.\\d{4}\\.\\d{1}\\.\\d{2}\\.\\d{4}$" },
      mensagem: "Número de processo em formato inválido",
    },
    {
      campo: "valor_causa",
      tipo: "faixa",
      parametros: { min: 0 },
      mensagem: "Valor da causa deve ser positivo",
    },
    {
      campo: "status",
      tipo: "customizado",
      parametros: { valores: ["ativo", "suspenso", "arquivado", "finalizado"] },
      mensagem: "Status inválido",
    },
  ];

  formatacao: ConfiguracaoFormatacao = {
    moeda: "BRL",
    dataFormat: "DD/MM/YYYY",
    casasDecimais: 2,
    percentualPrecisao: 1,
    incluirHashAuditoria: true,
  };
}

/**
 * Template para Relatório de Contas Pessoais
 *
 * Inclui:
 * - Dados das contas (correntista, banco, tipo)
 * - Saldos e movimentações
 * - Integração com ledger
 * - Agregações por tipo, status, correntista
 */
export class TemplateContas extends TemplateRelatorio {
  nome = "Relatório de Contas Pessoais";
  descricao = "Saldos, movimentações e integração com ledger";

  colunas: ColunasRelatorio[] = [
    {
      nome: "id",
      tipo: "inteiro",
      largura: 80,
      alinhamento: "direita",
    },
    {
      nome: "correntista_nome",
      tipo: "texto",
      largura: 200,
      alinhamento: "esquerda",
    },
    {
      nome: "banco_codigo",
      tipo: "texto",
      largura: 100,
      alinhamento: "centro",
    },
    {
      nome: "banco_nome",
      tipo: "texto",
      largura: 150,
      alinhamento: "esquerda",
    },
    {
      nome: "agencia",
      tipo: "texto",
      largura: 100,
      alinhamento: "centro",
    },
    {
      nome: "numero_conta",
      tipo: "texto",
      largura: 150,
      alinhamento: "centro",
    },
    {
      nome: "tipo_conta",
      tipo: "texto",
      largura: 120,
      alinhamento: "centro",
    },
    {
      nome: "saldo_anterior",
      tipo: "moeda",
      largura: 120,
      alinhamento: "direita",
    },
    {
      nome: "total_creditos",
      tipo: "moeda",
      largura: 120,
      alinhamento: "direita",
    },
    {
      nome: "total_debitos",
      tipo: "moeda",
      largura: 120,
      alinhamento: "direita",
    },
    {
      nome: "saldo_final",
      tipo: "moeda",
      largura: 120,
      alinhamento: "direita",
    },
    {
      nome: "status",
      tipo: "texto",
      largura: 100,
      alinhamento: "centro",
    },
    {
      nome: "data_atualizacao",
      tipo: "data",
      largura: 100,
      alinhamento: "centro",
    },
  ];

  agregacoes: Agregacao[] = [
    {
      tipo: "COUNT",
      campo: "id",
      alias: "total_contas",
    },
    {
      tipo: "SUM",
      campo: "saldo_final",
      alias: "saldo_total",
    },
    {
      tipo: "SUM",
      campo: "total_creditos",
      alias: "total_creditos_periodo",
    },
    {
      tipo: "SUM",
      campo: "total_debitos",
      alias: "total_debitos_periodo",
    },
    {
      tipo: "AVG",
      campo: "saldo_final",
      alias: "media_saldo",
    },
  ];

  validacoes: Validacao[] = [
    {
      campo: "correntista_nome",
      tipo: "requerido",
      mensagem: "Nome do correntista é obrigatório",
    },
    {
      campo: "banco_codigo",
      tipo: "requerido",
      mensagem: "Código do banco é obrigatório",
    },
    {
      campo: "numero_conta",
      tipo: "formato",
      parametros: { regex: "^[0-9-]+$" },
      mensagem: "Número de conta em formato inválido",
    },
    {
      campo: "saldo_final",
      tipo: "customizado",
      parametros: { validar: (v: number) => typeof v === "number" },
      mensagem: "Saldo final deve ser numérico",
    },
  ];

  formatacao: ConfiguracaoFormatacao = {
    moeda: "BRL",
    dataFormat: "DD/MM/YYYY",
    casasDecimais: 2,
    percentualPrecisao: 2,
    incluirHashAuditoria: true,
  };
}

/**
 * Template para Relatório de Imóveis
 *
 * Inclui:
 * - Dados do imóvel (localização, tipo, valor)
 * - Status de financiamento
 * - Documentação e registros
 * - Agregações por tipo, localização, status
 */
export class TemplateImoveis extends TemplateRelatorio {
  nome = "Relatório de Imóveis";
  descricao = "Gestão patrimonial, financiamentos e registros";

  colunas: ColunasRelatorio[] = [
    {
      nome: "id",
      tipo: "inteiro",
      largura: 80,
      alinhamento: "direita",
    },
    {
      nome: "endereco_completo",
      tipo: "texto",
      largura: 300,
      alinhamento: "esquerda",
    },
    {
      nome: "tipo_imovel",
      tipo: "texto",
      largura: 120,
      alinhamento: "centro",
    },
    {
      nome: "metragem",
      tipo: "inteiro",
      largura: 100,
      alinhamento: "direita",
    },
    {
      nome: "valor_aquisicao",
      tipo: "moeda",
      largura: 120,
      alinhamento: "direita",
    },
    {
      nome: "valor_mercado",
      tipo: "moeda",
      largura: 120,
      alinhamento: "direita",
    },
    {
      nome: "uso_pessoal",
      tipo: "texto",
      largura: 100,
      alinhamento: "centro",
    },
    {
      nome: "financiado",
      tipo: "texto",
      largura: 100,
      alinhamento: "centro",
    },
    {
      nome: "saldo_financiamento",
      tipo: "moeda",
      largura: 120,
      alinhamento: "direita",
    },
    {
      nome: "instituicao_financeira",
      tipo: "texto",
      largura: 180,
      alinhamento: "esquerda",
    },
    {
      nome: "data_aquisicao",
      tipo: "data",
      largura: 100,
      alinhamento: "centro",
    },
    {
      nome: "status",
      tipo: "texto",
      largura: 100,
      alinhamento: "centro",
    },
    {
      nome: "documentacao_ok",
      tipo: "texto",
      largura: 100,
      alinhamento: "centro",
    },
  ];

  agregacoes: Agregacao[] = [
    {
      tipo: "COUNT",
      campo: "id",
      alias: "total_imoveis",
    },
    {
      tipo: "SUM",
      campo: "valor_aquisicao",
      alias: "valor_total_aquisicao",
    },
    {
      tipo: "SUM",
      campo: "valor_mercado",
      alias: "valor_total_mercado",
    },
    {
      tipo: "SUM",
      campo: "metragem",
      alias: "metragem_total",
    },
    {
      tipo: "SUM",
      campo: "saldo_financiamento",
      alias: "total_financiado",
    },
  ];

  validacoes: Validacao[] = [
    {
      campo: "endereco_completo",
      tipo: "requerido",
      mensagem: "Endereço é obrigatório",
    },
    {
      campo: "tipo_imovel",
      tipo: "requerido",
      mensagem: "Tipo de imóvel é obrigatório",
    },
    {
      campo: "valor_aquisicao",
      tipo: "faixa",
      parametros: { min: 0 },
      mensagem: "Valor de aquisição deve ser positivo",
    },
    {
      campo: "metragem",
      tipo: "faixa",
      parametros: { min: 1, max: 1000000 },
      mensagem: "Metragem deve estar entre 1 e 1.000.000",
    },
  ];

  formatacao: ConfiguracaoFormatacao = {
    moeda: "BRL",
    dataFormat: "DD/MM/YYYY",
    casasDecimais: 2,
    percentualPrecisao: 2,
    incluirHashAuditoria: true,
  };
}

/**
 * Registry de templates disponíveis
 */
export const TemplateRegistry = {
  apontamentos: () => new TemplateApontamentos(),
  advocacia: () => new TemplateAdvocacia(),
  contas: () => new TemplateContas(),
  imoveis: () => new TemplateImoveis(),

  /**
   * Lista todos os templates disponíveis
   */
  listar(): string[] {
    return ["apontamentos", "advocacia", "contas", "imoveis"];
  },

  /**
   * Obtém template por nome
   */
  obter(nome: string): TemplateRelatorio | null {
    const templates: Record<string, () => TemplateRelatorio> = {
      apontamentos: () => new TemplateApontamentos(),
      advocacia: () => new TemplateAdvocacia(),
      contas: () => new TemplateContas(),
      imoveis: () => new TemplateImoveis(),
    };
    return templates[nome.toLowerCase()]?.() || null;
  },

  /**
   * Registra novo template customizado
   */
  registrar(nome: string, template: TemplateRelatorio): void {
    // Implementação em cliente ou extensão
    console.log(`Template '${nome}' registrado`);
  },
};

export default {
  TemplateApontamentos,
  TemplateAdvocacia,
  TemplateContas,
  TemplateImoveis,
  TemplateRegistry,
};
