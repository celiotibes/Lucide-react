-- Schema de reconstituição contábil: pessoa física com atividade de fato de locação de imóveis.
-- SQLite. Toda transação deve ser rastreável até um documento-fonte (trilha de auditoria).

PRAGMA foreign_keys = ON;

CREATE TABLE contas_bancarias (
    id              INTEGER PRIMARY KEY,
    banco           TEXT NOT NULL,
    agencia         TEXT,
    numero          TEXT NOT NULL,
    titular         TEXT NOT NULL,
    tipo            TEXT NOT NULL CHECK (tipo IN ('corrente', 'poupanca', 'investimento')),
    ativa_desde     DATE,
    observacoes     TEXT
);

CREATE TABLE imoveis (
    id              INTEGER PRIMARY KEY,
    apelido         TEXT NOT NULL,              -- ex: "Kitnet 302 - Ed. Aurora"
    tipo            TEXT NOT NULL CHECK (tipo IN ('apartamento', 'kitnet', 'outro')),
    endereco        TEXT,
    fracao_ideal    REAL,                       -- para rateio de despesas coletivas por m²/fração
    area_m2         REAL,
    financiado      INTEGER NOT NULL DEFAULT 0 CHECK (financiado IN (0, 1))
);

CREATE TABLE financiamentos (
    id              INTEGER PRIMARY KEY,
    imovel_id       INTEGER NOT NULL REFERENCES imoveis(id),
    instituicao     TEXT NOT NULL,
    sistema         TEXT NOT NULL CHECK (sistema IN ('SAC', 'PRICE', 'OUTRO')),
    valor_contratado REAL NOT NULL,
    taxa_juros_mensal REAL NOT NULL DEFAULT 0.8,   -- percentual ao mês do contrato, ex: 0.8 (= 0,8% a.m.)
    data_contrato   DATE NOT NULL,
    parcelas_total  INTEGER NOT NULL,
    observacoes     TEXT
);

CREATE TABLE obras (
    id              INTEGER PRIMARY KEY,
    imovel_id       INTEGER NOT NULL REFERENCES imoveis(id),
    descricao       TEXT NOT NULL,
    data_inicio     DATE,
    data_fim        DATE,
    natureza        TEXT NOT NULL CHECK (natureza IN ('capex', 'manutencao')), -- capitalizável x despesa corrente
    valor_total     REAL
);

CREATE TABLE prestadores (
    id              INTEGER PRIMARY KEY,
    nome            TEXT NOT NULL,
    cpf_cnpj        TEXT,
    servico         TEXT NOT NULL               -- faxina, portaria, gestão de Airbnb, reforma, etc.
);

CREATE TABLE contratos_locacao (
    id              INTEGER PRIMARY KEY,
    imovel_id       INTEGER NOT NULL REFERENCES imoveis(id),
    locatario       TEXT NOT NULL,               -- locatário principal; demais partes em contrato_locatarios
    tipo            TEXT NOT NULL CHECK (tipo IN ('residencial_fixo', 'airbnb_temporada')),
    valor_referencia REAL NOT NULL,
    dia_vencimento  INTEGER,                     -- 1-31, nulo para airbnb
    data_inicio     DATE NOT NULL,
    data_fim        DATE,                        -- nulo = vigente
    indice_reajuste TEXT CHECK (indice_reajuste IN ('igpm', 'ipca', 'nenhum')) DEFAULT 'igpm',

    -- Decomposição do "valor único mensal": percentual que é de fato Aluguel Efetivo
    -- (base tributável do Carnê-Leão) vs. reembolso de rateio de custeio coletivo
    -- (trânsito contábil, não tributável). 100 = contrato simples, sem rateio embutido.
    percentual_aluguel_efetivo REAL NOT NULL DEFAULT 100,

    -- Encargos por inadimplemento em duas faixas (padrão real de contrato de locação
    -- estudantil/residencial): multa_percentual até `multa_ate_dias`, substituída
    -- (não somada) por multa_percentual_substitutiva a partir daí.
    multa_percentual REAL NOT NULL DEFAULT 2.0,          -- multa inicial (até multa_ate_dias)
    multa_ate_dias INTEGER NOT NULL DEFAULT 5,
    multa_percentual_substitutiva REAL NOT NULL DEFAULT 10.0,
    juros_mensal_percentual REAL NOT NULL DEFAULT 1.0,   -- juros de mora, pro-rata die
    indice_correcao_mora TEXT CHECK (indice_correcao_mora IN ('igpm', 'ipca', 'nenhum')) DEFAULT 'ipca',
    honorarios_percentual REAL NOT NULL DEFAULT 0,       -- sobre o débito consolidado, se for a juízo
    dias_gatilho_judicial INTEGER NOT NULL DEFAULT 9999, -- dias de atraso a partir do qual honorários incidem

    observacoes     TEXT
);

-- Locatários e responsáveis financeiros solidários adicionais além do locatário
-- principal — comum em locação estudantil/compartilhada com múltiplos nomes no
-- mesmo contrato e responsabilidade solidária integral (art. 275 do Código Civil).
CREATE TABLE contrato_locatarios (
    id              INTEGER PRIMARY KEY,
    contrato_id     INTEGER NOT NULL REFERENCES contratos_locacao(id),
    nome            TEXT NOT NULL,
    cpf             TEXT,
    papel           TEXT NOT NULL CHECK (papel IN ('locatario', 'responsavel_solidario')),
    telefone        TEXT,
    email           TEXT
);

-- Depósito caução (Lei do Inquilinato, art. 38 — limite de 3 meses de aluguel).
CREATE TABLE caucoes (
    id                  INTEGER PRIMARY KEY,
    contrato_id         INTEGER NOT NULL REFERENCES contratos_locacao(id),
    valor_inicial       REAL NOT NULL,
    data_deposito       DATE NOT NULL,
    indice_correcao     TEXT NOT NULL CHECK (indice_correcao IN ('poupanca', 'igpm', 'ipca', 'nenhum')),
    data_devolucao      DATE,                     -- nulo = ainda retida
    valor_devolvido     REAL,
    deducoes_descricao  TEXT,                     -- ex: "reparo de pintura", "aluguel em aberto"
    deducoes_valor      REAL DEFAULT 0,
    observacoes         TEXT
);

-- Série mensal de índices para correção monetária (caução, reajuste de aluguel).
-- Popule com valores reais do BACEN/IBGE antes de calcular em produção.
CREATE TABLE indices_economicos (
    indice          TEXT NOT NULL CHECK (indice IN ('poupanca', 'igpm', 'ipca')),
    mes_referencia  DATE NOT NULL,                -- primeiro dia do mês, ex: 2023-01-01
    taxa_mensal     REAL NOT NULL,                -- percentual do mês, ex: 0.62 (= 0,62%)
    PRIMARY KEY (indice, mes_referencia)
);

CREATE TABLE plano_de_contas (
    codigo          TEXT PRIMARY KEY,            -- ex: "3.1.02"
    descricao       TEXT NOT NULL,
    grupo           TEXT NOT NULL CHECK (grupo IN ('receita', 'despesa', 'pessoal', 'transferencia')),
    natureza        TEXT NOT NULL CHECK (natureza IN ('debito', 'credito'))
);

CREATE TABLE transacoes (
    id                  INTEGER PRIMARY KEY,
    conta_id            INTEGER NOT NULL REFERENCES contas_bancarias(id),
    data                DATE NOT NULL,
    valor               REAL NOT NULL,            -- positivo = entrada, negativo = saída
    descricao_original  TEXT NOT NULL,            -- texto cru do extrato, nunca editado
    fitid               TEXT,                     -- id da transação no OFX, para evitar duplicidade
    documento_fonte      TEXT,                     -- caminho/hash do boleto, recibo PIX ou contrato digitalizado
    plano_conta_codigo  TEXT REFERENCES plano_de_contas(codigo),
    imovel_id           INTEGER REFERENCES imoveis(id),
    contrato_id         INTEGER REFERENCES contratos_locacao(id),
    prestador_id        INTEGER REFERENCES prestadores(id),
    categorizado_por    TEXT CHECK (categorizado_por IN ('regra', 'ia', 'manual')),
    revisado            INTEGER NOT NULL DEFAULT 0 CHECK (revisado IN (0, 1)),
    UNIQUE (conta_id, fitid)
);

CREATE TABLE rateios (
    id              INTEGER PRIMARY KEY,
    transacao_id    INTEGER NOT NULL REFERENCES transacoes(id),
    imovel_id       INTEGER NOT NULL REFERENCES imoveis(id),
    criterio        TEXT NOT NULL,                -- ex: "fracao_ideal", "area_m2", "por_unidade"
    percentual      REAL NOT NULL CHECK (percentual > 0 AND percentual <= 1),
    valor_rateado   REAL NOT NULL
);

-- Regras de categorização aprendidas a partir de categorizações manuais (ver
-- src/domain/categorize/regrasAprendidas.ts no app web).
CREATE TABLE regras_categorizacao (
    id                  INTEGER PRIMARY KEY,
    padrao              TEXT NOT NULL,             -- regex aplicado a descricao_original (case-insensitive)
    plano_conta_codigo  TEXT NOT NULL REFERENCES plano_de_contas(codigo),
    criado_em           DATE NOT NULL
);

CREATE INDEX idx_transacoes_data ON transacoes(data);
CREATE INDEX idx_transacoes_imovel ON transacoes(imovel_id);
CREATE INDEX idx_transacoes_contrato ON transacoes(contrato_id);
CREATE INDEX idx_caucoes_contrato ON caucoes(contrato_id);
CREATE INDEX idx_contrato_locatarios_contrato ON contrato_locatarios(contrato_id);
