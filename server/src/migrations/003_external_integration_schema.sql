-- PHASE 4: External Systems Integration Schema
-- Banking, Tax, Open Banking, Cloud ERP, API Gateway, Payment Gateway, Audit Log, and Data Migration

-- ============= BANKING INTEGRATION TABLES =============
CREATE TABLE IF NOT EXISTS conciliacao_bancaria (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  periodo_id INTEGER NOT NULL,
  conta_id INTEGER NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  saldo_inicial_ledger DECIMAL(15, 2),
  saldo_inicial_banco DECIMAL(15, 2),
  total_creditos_ledger DECIMAL(15, 2) DEFAULT 0,
  total_creditos_banco DECIMAL(15, 2) DEFAULT 0,
  total_debitos_ledger DECIMAL(15, 2) DEFAULT 0,
  total_debitos_banco DECIMAL(15, 2) DEFAULT 0,
  saldo_final_ledger DECIMAL(15, 2),
  saldo_final_banco DECIMAL(15, 2),
  diferenca DECIMAL(15, 2),
  status VARCHAR(20) DEFAULT 'pendente', -- reconciliado, pendente, divergencia
  relacao_matching JSON,
  transacoes_nao_reconciliadas JSON,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (periodo_id) REFERENCES periodos_contabeis(id),
  FOREIGN KEY (conta_id) REFERENCES contas_plano_contas(id),
  UNIQUE KEY unique_conciliacao (periodo_id, conta_id, data_inicio)
);

CREATE TABLE IF NOT EXISTS conciliacao_transacao_matching (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  conciliacao_id INTEGER NOT NULL,
  extrato_id INTEGER,
  ledger_id INTEGER,
  data_extrato DATE,
  data_ledger DATE,
  valor DECIMAL(15, 2),
  descricao_extrato VARCHAR(500),
  descricao_ledger VARCHAR(500),
  status VARCHAR(20), -- match, divergencia, pendente
  dias_diferenca INTEGER,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conciliacao_id) REFERENCES conciliacao_bancaria(id)
);

-- ============= TAX COMPLIANCE TABLES =============
CREATE TABLE IF NOT EXISTS impostos_calculados (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  entidade_id INTEGER NOT NULL,
  periodo_id INTEGER NOT NULL,
  tipo_imposto VARCHAR(50), -- IRPJ, PIS, COFINS, ICMS, ISS, INSS
  aliquota DECIMAL(5, 4),
  base_calculo DECIMAL(15, 2),
  valor_imposto DECIMAL(15, 2),
  data_vencimento DATE,
  status VARCHAR(20) DEFAULT 'pendente', -- pendente, pago, em_atraso
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entidade_id) REFERENCES entidades(id),
  FOREIGN KEY (periodo_id) REFERENCES periodos_contabeis(id)
);

CREATE TABLE IF NOT EXISTS obrigacoes_fiscais (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  entidade_id INTEGER NOT NULL,
  descricao VARCHAR(255),
  tipo_obrigacao VARCHAR(50), -- federal, estadual, municipal
  periodicidade VARCHAR(20), -- mensal, trimestral, semestral, anual
  data_vencimento DATE NOT NULL,
  data_entrega DATE,
  status VARCHAR(20) DEFAULT 'pendente', -- pendente, cumprida, em_atraso
  multa_juros DECIMAL(15, 2),
  valor_estimado DECIMAL(15, 2),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entidade_id) REFERENCES entidades(id)
);

CREATE TABLE IF NOT EXISTS relatorio_dre_impostos (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  entidade_id INTEGER NOT NULL,
  periodo_id INTEGER NOT NULL,
  periodo VARCHAR(7), -- YYYY-MM
  receita_bruta DECIMAL(15, 2),
  deducoes DECIMAL(15, 2),
  receita_liquida DECIMAL(15, 2),
  lucro_bruto DECIMAL(15, 2),
  despesas_operacionais DECIMAL(15, 2),
  lucro_operacional DECIMAL(15, 2),
  impostos_federais DECIMAL(15, 2),
  impostos_estaduais DECIMAL(15, 2),
  impostos_municipais DECIMAL(15, 2),
  total_impostos DECIMAL(15, 2),
  lucro_liquido DECIMAL(15, 2),
  aliquota_efetiva_imposto DECIMAL(5, 4),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entidade_id) REFERENCES entidades(id),
  FOREIGN KEY (periodo_id) REFERENCES periodos_contabeis(id)
);

-- ============= OPEN BANKING INTEGRATION TABLES =============
CREATE TABLE IF NOT EXISTS pagamentos_pix (
  id VARCHAR(50) PRIMARY KEY,
  entidade_id INTEGER NOT NULL,
  periodo_id INTEGER NOT NULL,
  txid VARCHAR(100) UNIQUE,
  chave_pix VARCHAR(255),
  valor DECIMAL(15, 2),
  beneficiario VARCHAR(255),
  descricao VARCHAR(500),
  data_solicitacao DATE,
  data_processamento DATE,
  status VARCHAR(20) DEFAULT 'solicitado', -- solicitado, processando, concluido, rejeitado
  motivo_rejeicao VARCHAR(500),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entidade_id) REFERENCES entidades(id),
  FOREIGN KEY (periodo_id) REFERENCES periodos_contabeis(id),
  INDEX idx_status (status),
  INDEX idx_txid (txid)
);

CREATE TABLE IF NOT EXISTS pagamentos_ted (
  id VARCHAR(50) PRIMARY KEY,
  entidade_id INTEGER NOT NULL,
  periodo_id INTEGER NOT NULL,
  banco_destino VARCHAR(10),
  agencia_destino VARCHAR(10),
  conta_destino VARCHAR(20),
  cpf_cnpj_destino VARCHAR(20),
  nome_beneficiario VARCHAR(255),
  valor DECIMAL(15, 2),
  descricao VARCHAR(500),
  data_solicitacao DATE,
  data_agendado DATE,
  num_sequencial VARCHAR(20),
  status VARCHAR(20) DEFAULT 'solicitado', -- solicitado, agendado, processando, concluido, rejeitado
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entidade_id) REFERENCES entidades(id),
  FOREIGN KEY (periodo_id) REFERENCES periodos_contabeis(id),
  INDEX idx_status (status),
  INDEX idx_num_sequencial (num_sequencial)
);

CREATE TABLE IF NOT EXISTS pagamentos_doc (
  id VARCHAR(50) PRIMARY KEY,
  entidade_id INTEGER NOT NULL,
  periodo_id INTEGER NOT NULL,
  banco_destino VARCHAR(10),
  agencia_destino VARCHAR(10),
  conta_destino VARCHAR(20),
  cpf_cnpj_destino VARCHAR(20),
  nome_beneficiario VARCHAR(255),
  valor DECIMAL(15, 2),
  descricao VARCHAR(500),
  data_solicitacao DATE,
  status VARCHAR(20) DEFAULT 'solicitado', -- solicitado, processando, concluido, rejeitado
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entidade_id) REFERENCES entidades(id),
  FOREIGN KEY (periodo_id) REFERENCES periodos_contabeis(id),
  INDEX idx_status (status)
);

CREATE TABLE IF NOT EXISTS confirmacoes_pagamento (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  pagamento_id VARCHAR(50),
  tipo_pagamento VARCHAR(20), -- PIX, TED, DOC
  status VARCHAR(20), -- confirmado, rejeitado, expirado
  data_confirmacao TIMESTAMP,
  data_credito TIMESTAMP,
  valor_confirmado DECIMAL(15, 2),
  referencia_banco VARCHAR(255),
  detalhes_retorno JSON,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pagamento_id (pagamento_id),
  INDEX idx_status (status)
);

-- ============= ERP CLOUD SYNC TABLES =============
CREATE TABLE IF NOT EXISTS conta_mapeamento (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  codigo_local VARCHAR(50),
  descricao_local VARCHAR(255),
  codigo_nuvem VARCHAR(50),
  descricao_nuvem VARCHAR(255),
  tipo_conta VARCHAR(50),
  natureza VARCHAR(20),
  status VARCHAR(20) DEFAULT 'ativo',
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_mapping (codigo_local, codigo_nuvem)
);

CREATE TABLE IF NOT EXISTS sincronizacao_status (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  sistema_origem VARCHAR(50),
  data_inicio TIMESTAMP,
  data_fim TIMESTAMP,
  tipo_sincronizacao VARCHAR(20), -- full, incremental
  status VARCHAR(20), -- em_progresso, sucesso, erro, parcial
  registros_processados INTEGER,
  registros_sucesso INTEGER,
  registros_erro INTEGER,
  mensagem_erro VARCHAR(500),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conflito_sincronizacao (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  recurso_tipo VARCHAR(50), -- conta, lancamento, saldo
  id_local INTEGER,
  id_nuvem VARCHAR(50),
  valor_local JSON,
  valor_nuvem JSON,
  data_conflito TIMESTAMP,
  estrategia_resolucao VARCHAR(50), -- last_write_wins, manual_override, local_priority, cloud_priority
  resolvido BOOLEAN DEFAULT FALSE,
  data_resolucao TIMESTAMP,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============= API GATEWAY TABLES =============
CREATE TABLE IF NOT EXISTS api_chaves (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  cliente_nome VARCHAR(255),
  chave_publica VARCHAR(100) UNIQUE,
  chave_privada_hash VARCHAR(255),
  permissoes JSON,
  ativo BOOLEAN DEFAULT TRUE,
  rate_limit INTEGER DEFAULT 1000,
  criada_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ultima_utilizacao TIMESTAMP,
  expira_em DATE
);

CREATE TABLE IF NOT EXISTS webhooks (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  cliente_id INTEGER,
  url_destino VARCHAR(500),
  eventos JSON,
  ativo BOOLEAN DEFAULT TRUE,
  secret_key VARCHAR(255),
  tentativas_retentativas INTEGER DEFAULT 3,
  ultima_entrega TIMESTAMP,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cliente_id) REFERENCES api_chaves(id)
);

CREATE TABLE IF NOT EXISTS requisicoes_api (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  cliente_id INTEGER,
  endpoint VARCHAR(255),
  metodo VARCHAR(10),
  ip_origem VARCHAR(50),
  status_resposta INTEGER,
  tempo_processamento_ms INTEGER,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cliente_id) REFERENCES api_chaves(id),
  INDEX idx_cliente_timestamp (cliente_id, timestamp)
);

-- ============= PAYMENT GATEWAY TABLES =============
CREATE TABLE IF NOT EXISTS pagamentos_gateway (
  id VARCHAR(50) PRIMARY KEY,
  entidade_id INTEGER NOT NULL,
  periodo_id INTEGER NOT NULL,
  gateway VARCHAR(50), -- stripe, paypal, mercadopago
  id_gateway VARCHAR(255),
  valor DECIMAL(15, 2),
  moeda VARCHAR(10),
  descricao VARCHAR(500),
  cliente_email VARCHAR(255),
  cliente_nome VARCHAR(255),
  data_solicitacao TIMESTAMP,
  status VARCHAR(20) DEFAULT 'pendente', -- pendente, processando, aprovado, rejeitado, reembolsado
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entidade_id) REFERENCES entidades(id),
  FOREIGN KEY (periodo_id) REFERENCES periodos_contabeis(id),
  INDEX idx_status (status),
  INDEX idx_id_gateway (id_gateway)
);

CREATE TABLE IF NOT EXISTS chargebacks (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  pagamento_id VARCHAR(50),
  data_chargeback DATE,
  valor_chargeback DECIMAL(15, 2),
  motivo VARCHAR(500),
  status VARCHAR(20), -- recebido, em_analise, rejeitado, aceito
  data_resolucao DATE,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pagamento_id) REFERENCES pagamentos_gateway(id),
  INDEX idx_pagamento_id (pagamento_id)
);

CREATE TABLE IF NOT EXISTS reembolsos (
  id VARCHAR(50) PRIMARY KEY,
  pagamento_original_id VARCHAR(50),
  valor_reembolso DECIMAL(15, 2),
  motivo_reembolso VARCHAR(500),
  data_solicitacao TIMESTAMP,
  data_processamento TIMESTAMP,
  status VARCHAR(20) DEFAULT 'solicitado', -- solicitado, processando, concluido, rejeitado
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pagamento_original_id) REFERENCES pagamentos_gateway(id)
);

-- ============= COMPLIANCE AUDIT LOG TABLES =============
CREATE TABLE IF NOT EXISTS auditoria_log (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  timestamp TIMESTAMP NOT NULL,
  usuario_id INTEGER,
  usuario_nome VARCHAR(255),
  ip_origem VARCHAR(50),
  modulo_chamador VARCHAR(50), -- banco, fisco, open-banking, api-gateway, pagamento-gateway, nuvem-erp, migracao-legacy
  tipo_operacao VARCHAR(50), -- leitura, escrita, delecao, alteracao, autenticacao, configuracao
  entidade_afetada VARCHAR(100),
  id_entidade INTEGER,
  descricao_alteracao VARCHAR(500),
  valor_anterior JSON,
  valor_novo JSON,
  hash_sha256 VARCHAR(255),
  hash_anterior VARCHAR(255),
  status VARCHAR(20), -- sucesso, erro, pendente
  mensagem_erro VARCHAR(500),
  tempo_processamento_ms INTEGER,
  retencao_ate DATE, -- 7 anos de retenção obrigatória
  assinado BOOLEAN DEFAULT FALSE,
  assinatura_digital VARCHAR(255),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_timestamp (timestamp),
  INDEX idx_usuario_id (usuario_id),
  INDEX idx_modulo (modulo_chamador),
  INDEX idx_entidade (entidade_afetada, id_entidade)
);

-- ============= DATA MIGRATION TABLES =============
CREATE TABLE IF NOT EXISTS migracao_dados (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  sistema_origem VARCHAR(50), -- SAP, Tally, QuickBooks, outro
  periodo_inicio DATE,
  periodo_fim DATE,
  total_contas_importadas INTEGER,
  total_lancamentos_importados INTEGER,
  contas_duplicadas INTEGER,
  lancamentos_duplicados INTEGER,
  contas_erro INTEGER,
  lancamentos_erro INTEGER,
  status VARCHAR(20), -- em_progresso, concluido, erro, parcial, revertida
  mensagem_status VARCHAR(500),
  mapeamento_contas JSON,
  reconciliacao_ok BOOLEAN,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sistema (sistema_origem),
  INDEX idx_periodo (periodo_inicio, periodo_fim)
);

CREATE TABLE IF NOT EXISTS divergencias_migracao (
  id INTEGER PRIMARY KEY AUTO_INCREMENT,
  migracao_id INTEGER,
  conta_codigo VARCHAR(50),
  saldo_legacy DECIMAL(15, 2),
  saldo_ledger DECIMAL(15, 2),
  diferenca DECIMAL(15, 2),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (migracao_id) REFERENCES migracao_dados(id),
  INDEX idx_migracao (migracao_id)
);

-- ============= INDICES FOR PERFORMANCE =============
CREATE INDEX idx_ledger_origem_modulo ON ledger_entries(origem_modulo);
CREATE INDEX idx_pagamentos_status ON pagamentos_gateway(status);
CREATE INDEX idx_auditoria_modulo_timestamp ON auditoria_log(modulo_chamador, timestamp);
CREATE INDEX idx_sincronizacao_sistema ON sincronizacao_status(sistema_origem);

-- ============= VIEWS FOR REPORTING =============
CREATE VIEW IF NOT EXISTS v_conciliacao_resumo AS
SELECT
  cb.periodo_id,
  cp.codigo as conta_codigo,
  cp.descricao as conta_descricao,
  cb.saldo_final_ledger,
  cb.saldo_final_banco,
  cb.diferenca,
  cb.status,
  cb.criado_em
FROM conciliacao_bancaria cb
JOIN contas_plano_contas cp ON cb.conta_id = cp.id;

CREATE VIEW IF NOT EXISTS v_impostos_por_periodo AS
SELECT
  ic.periodo_id,
  ic.tipo_imposto,
  COUNT(*) as quantidade,
  SUM(ic.valor_imposto) as total_valor,
  SUM(ic.base_calculo) as total_base
FROM impostos_calculados ic
GROUP BY ic.periodo_id, ic.tipo_imposto;

CREATE VIEW IF NOT EXISTS v_auditoria_por_modulo AS
SELECT
  al.modulo_chamador,
  COUNT(*) as total_operacoes,
  SUM(CASE WHEN al.status = 'sucesso' THEN 1 ELSE 0 END) as sucessos,
  SUM(CASE WHEN al.status = 'erro' THEN 1 ELSE 0 END) as erros,
  AVG(al.tempo_processamento_ms) as tempo_medio_ms
FROM auditoria_log al
GROUP BY al.modulo_chamador;

CREATE VIEW IF NOT EXISTS v_pagamentos_resumo AS
SELECT
  pg.gateway,
  COUNT(*) as total_pagamentos,
  SUM(pg.valor) as valor_total,
  SUM(CASE WHEN pg.status = 'aprovado' THEN 1 ELSE 0 END) as aprovados,
  SUM(CASE WHEN pg.status = 'rejeitado' THEN 1 ELSE 0 END) as rejeitados
FROM pagamentos_gateway pg
GROUP BY pg.gateway;
