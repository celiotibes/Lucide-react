/**
 * Test Setup e Definição de Tabelas de Banco de Dados
 * Estrutura de dados para SPRINT 1
 */

/**
 * Definição de tabelas SQL para implementação completa
 * Quando integrado com banco de dados real, rodar estas migrations
 */
export const TABELAS_SQL = {
  // PAYROLL
  payroll_contratos: `
    CREATE TABLE payroll_contratos (
      id VARCHAR(100) PRIMARY KEY,
      funcionario_id VARCHAR(100) NOT NULL,
      funcionario_nome VARCHAR(255) NOT NULL,
      cargo VARCHAR(100) NOT NULL,
      salario_base DECIMAL(12,2) NOT NULL,
      data_admissao DATE NOT NULL,
      tipo_contrato ENUM('CLT', 'PJ') NOT NULL,
      ativo BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_funcionario (funcionario_id),
      INDEX idx_ativo (ativo)
    )
  `,

  payroll_processamento: `
    CREATE TABLE payroll_processamento (
      id VARCHAR(100) PRIMARY KEY,
      mes VARCHAR(7) NOT NULL,
      data_processamento TIMESTAMP NOT NULL,
      contrato_id VARCHAR(100) NOT NULL,
      funcionario_nome VARCHAR(255) NOT NULL,
      salario_bruto DECIMAL(12,2) NOT NULL,
      desconto_inss DECIMAL(12,2) NOT NULL,
      desconto_irrf DECIMAL(12,2) NOT NULL,
      salario_liquido DECIMAL(12,2) NOT NULL,
      status ENUM('processando', 'finalizado', 'erro') DEFAULT 'processando',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contrato_id) REFERENCES payroll_contratos(id),
      INDEX idx_mes (mes),
      INDEX idx_contrato (contrato_id)
    )
  `,

  payroll_descontos: `
    CREATE TABLE payroll_descontos (
      id VARCHAR(100) PRIMARY KEY,
      processamento_folha_id VARCHAR(100) NOT NULL,
      tipo ENUM('INSS', 'IRRF', 'OUTRO') NOT NULL,
      valor DECIMAL(12,2) NOT NULL,
      percentual DECIMAL(5,2) NOT NULL,
      observacao VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (processamento_folha_id) REFERENCES payroll_processamento(id),
      INDEX idx_processamento (processamento_folha_id),
      INDEX idx_tipo (tipo)
    )
  `,

  // DESPESAS OPERACIONAIS
  despesas_operacionais: `
    CREATE TABLE despesas_operacionais (
      id VARCHAR(100) PRIMARY KEY,
      imovel_id VARCHAR(100) NOT NULL,
      descricao VARCHAR(255) NOT NULL,
      valor DECIMAL(12,2) NOT NULL,
      tipo ENUM('CONDOMINIO', 'AGUA', 'LUZ', 'GAS', 'INTERNET', 'MANUTENCAO', 'OUTRA') NOT NULL,
      categoria_contabil VARCHAR(20) NOT NULL,
      recorrencia ENUM('mensal', 'trimestral', 'semestral', 'anual') NOT NULL,
      dia_vencimento INT NOT NULL,
      ativa BOOLEAN DEFAULT true,
      data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      observacao VARCHAR(255),
      INDEX idx_imovel (imovel_id),
      INDEX idx_ativa (ativa),
      INDEX idx_tipo (tipo)
    )
  `,

  processamento_despesas: `
    CREATE TABLE processamento_despesas (
      id VARCHAR(100) PRIMARY KEY,
      despesa_id VARCHAR(100) NOT NULL,
      mes VARCHAR(7) NOT NULL,
      data_processamento TIMESTAMP NOT NULL,
      valor_processado DECIMAL(12,2) NOT NULL,
      status ENUM('agendado', 'processado', 'pago', 'erro') DEFAULT 'agendado',
      data_pagamento DATE,
      comprovante_id VARCHAR(100),
      mensagem_erro VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (despesa_id) REFERENCES despesas_operacionais(id),
      INDEX idx_despesa (despesa_id),
      INDEX idx_mes (mes),
      INDEX idx_status (status)
    )
  `,

  agendador_despesas: `
    CREATE TABLE agendador_despesas (
      id VARCHAR(100) PRIMARY KEY,
      imovel_id VARCHAR(100) NOT NULL,
      proxima_execucao TIMESTAMP NOT NULL,
      despesas_pendentes JSON,
      status ENUM('ativo', 'pausado', 'erro') DEFAULT 'ativo',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_imovel (imovel_id),
      INDEX idx_status (status)
    )
  `,

  // APPROVALS
  document_approvals: `
    CREATE TABLE document_approvals (
      id VARCHAR(100) PRIMARY KEY,
      tipo_documento ENUM('folha', 'despesa', 'lancamento', 'relatorio') NOT NULL,
      entidade_id VARCHAR(100) NOT NULL,
      descricao VARCHAR(255) NOT NULL,
      valor DECIMAL(12,2),
      data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      criado_por VARCHAR(100) NOT NULL,
      status ENUM('pendente', 'aprovado_gerente', 'aprovado_contabilista', 'rejeitado', 'finalizado') DEFAULT 'pendente',
      nivel_atual VARCHAR(20),
      INDEX idx_tipo (tipo_documento),
      INDEX idx_status (status),
      INDEX idx_nivel_atual (nivel_atual),
      INDEX idx_criado_por (criado_por)
    )
  `,

  approval_history: `
    CREATE TABLE approval_history (
      id VARCHAR(100) PRIMARY KEY,
      documento_id VARCHAR(100) NOT NULL,
      nivel VARCHAR(20) NOT NULL,
      usuario_id VARCHAR(100) NOT NULL,
      usuario_nome VARCHAR(255) NOT NULL,
      acao ENUM('aprovado', 'rejeitado', 'comentado') NOT NULL,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      comentario TEXT,
      FOREIGN KEY (documento_id) REFERENCES document_approvals(id),
      INDEX idx_documento (documento_id),
      INDEX idx_usuario (usuario_id),
      INDEX idx_timestamp (timestamp)
    )
  `,

  // WEBHOOKS
  webhook_events: `
    CREATE TABLE webhook_events (
      id VARCHAR(100) PRIMARY KEY,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      origem_modulo VARCHAR(50) NOT NULL,
      tipo_evento VARCHAR(50) NOT NULL,
      entidade_id VARCHAR(100) NOT NULL,
      dados_lancamento JSON NOT NULL,
      INDEX idx_origem (origem_modulo),
      INDEX idx_tipo (tipo_evento),
      INDEX idx_timestamp (timestamp)
    )
  `,

  webhook_registros: `
    CREATE TABLE webhook_registros (
      id VARCHAR(100) PRIMARY KEY,
      webhook_event_id VARCHAR(100) NOT NULL,
      timestamp_recebimento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      status ENUM('recebido', 'processando', 'finalizado', 'erro') DEFAULT 'recebido',
      lancamento_id VARCHAR(100),
      mensagem_erro VARCHAR(255),
      tentativas INT DEFAULT 0,
      proxima_tentativa TIMESTAMP,
      FOREIGN KEY (webhook_event_id) REFERENCES webhook_events(id),
      INDEX idx_evento (webhook_event_id),
      INDEX idx_status (status),
      INDEX idx_timestamp (timestamp_recebimento)
    )
  `,

  // API GATEWAY
  api_gateway_logs: `
    CREATE TABLE api_gateway_logs (
      id VARCHAR(100) PRIMARY KEY,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      origem_modulo VARCHAR(50) NOT NULL,
      tipo_documento VARCHAR(50) NOT NULL,
      usuario_id VARCHAR(100) NOT NULL,
      sucesso BOOLEAN NOT NULL,
      lancamento_id VARCHAR(100),
      mensagem VARCHAR(255),
      INDEX idx_timestamp (timestamp),
      INDEX idx_origem (origem_modulo),
      INDEX idx_sucesso (sucesso)
    )
  `,
};

/**
 * Dados de teste para validação
 */
export const DADOS_TESTE = {
  contrato: {
    funcionario_id: "FUNC-001",
    funcionario_nome: "João Silva",
    cargo: "Gerente de Imóvel",
    salario_base: 3000,
    data_admissao: "2023-01-15",
    tipo_contrato: "CLT" as const,
    ativo: true,
  },

  despesa: {
    imovel_id: "IMOV-001",
    descricao: "Condomínio - Bloco A",
    valor: 500,
    tipo: "CONDOMINIO" as const,
    categoria_contabil: "3.1.10",
    recorrencia: "mensal" as const,
    dia_vencimento: 15,
    ativa: true,
  },

  payload_streamlit: {
    origem_modulo: "app-bruxel" as const,
    tipo_documento: "diaria" as const,
    data_evento: "2024-09-14",
    valor: 1500,
    descricao: "Diária de cliente",
    centro_custo_id: "CC-001",
    usuario_id: "USER-001",
  },

  webhook_event: {
    origem_modulo: "app-bruxel" as const,
    tipo_evento: "diaria_criada" as const,
    entidade_id: "DIARIA-001",
    dados_lancamento: {
      data: "2024-09-14",
      valor: 1500,
      descricao: "Diária de cliente",
      conta_debito: "2.1.01",
      conta_credito: "1.0.01",
      centro_custo: "CC-001",
    },
  },

  documento_aprovacao: {
    tipo_documento: "folha" as const,
    entidade_id: "FLH-2024-09",
    descricao: "Folha de Setembro 2024",
    valor: 3000,
    criado_por: "USER-001",
  },
};

/**
 * Funções auxiliares para testes em memória
 */

export interface InMemoryDatabase {
  contratos: Map<string, any>;
  processamentos: Map<string, any>;
  descontos: Map<string, any>;
  despesas: Map<string, any>;
  processamento_despesas: Map<string, any>;
  documentos_aprovacao: Map<string, any>;
  approval_history: Map<string, any>;
  webhook_events: Map<string, any>;
  webhook_registros: Map<string, any>;
}

export function criarBancoDados(): InMemoryDatabase {
  return {
    contratos: new Map(),
    processamentos: new Map(),
    descontos: new Map(),
    despesas: new Map(),
    processamento_despesas: new Map(),
    documentos_aprovacao: new Map(),
    approval_history: new Map(),
    webhook_events: new Map(),
    webhook_registros: new Map(),
  };
}

/**
 * Reseta banco de dados para testes
 */
export function resetarBancoDados(db: InMemoryDatabase): void {
  db.contratos.clear();
  db.processamentos.clear();
  db.descontos.clear();
  db.despesas.clear();
  db.processamento_despesas.clear();
  db.documentos_aprovacao.clear();
  db.approval_history.clear();
  db.webhook_events.clear();
  db.webhook_registros.clear();
}

/**
 * Gera estatísticas do banco de dados para validação
 */
export function obterEstatisticasBanco(db: InMemoryDatabase): Record<string, number> {
  return {
    contratos: db.contratos.size,
    processamentos: db.processamentos.size,
    descontos: db.descontos.size,
    despesas: db.despesas.size,
    processamento_despesas: db.processamento_despesas.size,
    documentos_aprovacao: db.documentos_aprovacao.size,
    approval_history: db.approval_history.size,
    webhook_events: db.webhook_events.size,
    webhook_registros: db.webhook_registros.size,
  };
}
