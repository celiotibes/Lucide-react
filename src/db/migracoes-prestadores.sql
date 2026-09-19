-- ============================================================================
-- Migrações para Módulo de Prestadores de Serviço (Paulo Bruxel + Cristiano)
-- ============================================================================

-- Tabela: Histórico de Parâmetros de Contrato
-- Permite auditoria completa de mudanças de valores
CREATE TABLE IF NOT EXISTS prestadores_parametros_historico (
    id INTEGER PRIMARY KEY,
    prestador_id INTEGER NOT NULL REFERENCES prestadores(id) ON DELETE RESTRICT,
    mes_referencia TEXT NOT NULL, -- YYYY-MM

    -- Valores do contrato
    diaria_base REAL NOT NULL,
    hora_adicional REAL NOT NULL,
    deslocamento_km REAL NOT NULL,
    combustivel_litro REAL NOT NULL,
    combustivel_ajuste_mercado REAL NOT NULL DEFAULT 1.2,
    comunicacao_mensal REAL NOT NULL,
    base_obrigatoria_dias INTEGER NOT NULL DEFAULT 8,
    ipca_percentual REAL NOT NULL,
    taxa_hora_extra REAL NOT NULL DEFAULT 0.1,
    taxa_fim_semana_feriado REAL NOT NULL DEFAULT 0.15,

    -- Auditoria
    versao_calculo TEXT NOT NULL DEFAULT '1.0',
    alterado_por TEXT NOT NULL,
    data_alteracao DATETIME DEFAULT CURRENT_TIMESTAMP,
    motivo_alteracao TEXT,
    aprovado_por TEXT,
    data_aprovacao DATETIME,

    UNIQUE(prestador_id, mes_referencia)
);

-- Índices
CREATE INDEX idx_prestadores_parametros_mes
    ON prestadores_parametros_historico(prestador_id, mes_referencia);

-- Tabela: Apontamentos Mensais
CREATE TABLE IF NOT EXISTS prestadores_apontamentos_mensais (
    id INTEGER PRIMARY KEY,
    prestador_id INTEGER NOT NULL REFERENCES prestadores(id) ON DELETE RESTRICT,
    mes_referencia TEXT NOT NULL, -- YYYY-MM
    data_apontamento DATE NOT NULL,
    tipo_dia TEXT NOT NULL CHECK(tipo_dia IN ('dia_util', 'sabado', 'domingo', 'feriado')),
    horas_trabalhadas REAL NOT NULL CHECK(horas_trabalhadas >= 0 AND horas_trabalhadas <= 24),
    km_percorridos INTEGER NOT NULL CHECK(km_percorridos >= 0),
    descricao TEXT,
    ativo INTEGER DEFAULT 1,

    -- Auditoria
    criado_por TEXT NOT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    modificado_por TEXT,
    modificado_em DATETIME,

    UNIQUE(prestador_id, mes_referencia, data_apontamento)
);

CREATE INDEX idx_prestadores_apontamentos_mes
    ON prestadores_apontamentos_mensais(prestador_id, mes_referencia);

-- Tabela: Reembolsos Mensais
CREATE TABLE IF NOT EXISTS prestadores_reembolsos_mensais (
    id INTEGER PRIMARY KEY,
    prestador_id INTEGER NOT NULL REFERENCES prestadores(id) ON DELETE RESTRICT,
    mes_referencia TEXT NOT NULL,
    reembolso_cartao REAL NOT NULL DEFAULT 0 CHECK(reembolso_cartao >= 0),
    reembolso_pix REAL NOT NULL DEFAULT 0 CHECK(reembolso_pix >= 0),

    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(prestador_id, mes_referencia)
);

-- Tabela: Pagamentos Processados
CREATE TABLE IF NOT EXISTS prestadores_pagamentos_processados (
    id INTEGER PRIMARY KEY,
    prestador_id INTEGER NOT NULL REFERENCES prestadores(id) ON DELETE RESTRICT,
    mes_referencia TEXT NOT NULL,

    -- Componentes (armazenados em centavos para evitar erros de ponto flutuante)
    diarias_normais_centavos INTEGER NOT NULL,
    diarias_fim_semana_centavos INTEGER NOT NULL,
    horas_extras_normais_centavos INTEGER NOT NULL,
    horas_extras_fim_semana_centavos INTEGER NOT NULL,
    deslocamento_centavos INTEGER NOT NULL,
    combustivel_centavos INTEGER NOT NULL,
    reembolso_cartao_centavos INTEGER NOT NULL,
    reembolso_pix_centavos INTEGER NOT NULL,
    comunicacao_centavos INTEGER NOT NULL,
    valor_total_centavos INTEGER NOT NULL,

    -- Metadados
    memoria_calculo TEXT NOT NULL,
    versao_calculo TEXT NOT NULL DEFAULT '1.0',

    -- Status e Aprovação
    status TEXT NOT NULL DEFAULT 'rascunho'
        CHECK(status IN ('rascunho', 'aguardando_aprovacao', 'aprovado', 'pago', 'rejeitado')),
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    criado_por TEXT NOT NULL,

    -- Aprovação
    data_aprovacao DATETIME,
    aprovado_por TEXT,
    motivo_rejeicao TEXT,

    -- Integração contábil
    numero_ledger_debit INTEGER REFERENCES ledger_entries(id),
    numero_ledger_credit INTEGER REFERENCES ledger_entries(id),

    UNIQUE(prestador_id, mes_referencia)
);

CREATE INDEX idx_prestadores_pagamentos_status
    ON prestadores_pagamentos_processados(status, data_aprovacao);
CREATE INDEX idx_prestadores_pagamentos_lookup
    ON prestadores_pagamentos_processados(prestador_id, mes_referencia);

-- Tabela: Histórico IPCA
CREATE TABLE IF NOT EXISTS prestadores_historico_ipca (
    id INTEGER PRIMARY KEY,
    prestador_id INTEGER NOT NULL REFERENCES prestadores(id) ON DELETE RESTRICT,
    mes_referencia TEXT NOT NULL,
    percentual_ipca REAL NOT NULL CHECK(percentual_ipca >= 0),

    diaria_base_anterior REAL NOT NULL,
    diaria_base_nova REAL NOT NULL,
    hora_adicional_anterior REAL NOT NULL,
    hora_adicional_nova REAL NOT NULL,

    alterado_por TEXT NOT NULL,
    data_ajuste DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela: Auditoria de Alterações
CREATE TABLE IF NOT EXISTS prestadores_auditoria (
    id INTEGER PRIMARY KEY,
    prestador_id INTEGER,
    tabela_afetada TEXT NOT NULL,
    registro_id INTEGER,
    campo_alterado TEXT,
    valor_anterior TEXT,
    valor_novo TEXT,

    usuario_alteracao TEXT NOT NULL,
    data_alteracao DATETIME DEFAULT CURRENT_TIMESTAMP,
    motivo_alteracao TEXT,
    endereco_ip TEXT,
    user_agent TEXT
);

CREATE INDEX idx_auditoria_prestador
    ON prestadores_auditoria(prestador_id, data_alteracao);
CREATE INDEX idx_auditoria_tabela
    ON prestadores_auditoria(tabela_afetada, data_alteracao);
