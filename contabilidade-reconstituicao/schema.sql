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
    cidade          TEXT,                       -- ex: "Florianópolis", "Curitiba" — agrupamento regional p/ relatórios e rateio
    endereco        TEXT,
    fracao_ideal    REAL,                       -- para rateio de despesas coletivas por m²/fração
    area_m2         REAL,
    financiado      INTEGER NOT NULL DEFAULT 0 CHECK (financiado IN (0, 1)),
    -- 1 = residência própria (uso pessoal), não faz parte da atividade de fato de locação —
    -- excluída por padrão do DRE/relatórios da atividade, mas continua rastreável para mostrar
    -- separação clara entre despesa pessoal e despesa do negócio (capacidade contributiva).
    uso_pessoal     INTEGER NOT NULL DEFAULT 0 CHECK (uso_pessoal IN (0, 1))
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

    -- Regra de reajuste não uniforme (padrão real: 1ª renovação com percentual fixo
    -- pré-acordado, renovações seguintes pelo índice). Ver contrato_reajustes para o
    -- histórico do que foi de fato aplicado a cada ciclo.
    percentual_reajuste_primeira_renovacao REAL,          -- ex: 6.0 (=6%). NULL = usa indice_reajuste desde a 1ª renovação
    duracao_minima_meses INTEGER NOT NULL DEFAULT 12,     -- duração do prazo determinado de cada ciclo, para multa proporcional

    -- Multa rescisória por quebra antecipada do prazo determinado (art. 4º Lei 8.245/91).
    multa_rescisoria_teto_meses REAL NOT NULL DEFAULT 3,  -- teto em nº de meses do valor unificado vigente

    observacoes     TEXT
);

-- Histórico de reajustes efetivamente aplicados — prova documental de que o valor
-- cobrado em cada período corresponde à regra contratual (fixo na 1ª renovação,
-- índice nas seguintes), não um valor arbitrário.
CREATE TABLE contrato_reajustes (
    id                  INTEGER PRIMARY KEY,
    contrato_id         INTEGER NOT NULL REFERENCES contratos_locacao(id),
    data_vigencia       DATE NOT NULL,             -- a partir de quando o valor_novo passou a valer
    valor_anterior      REAL NOT NULL,
    valor_novo          REAL NOT NULL,
    percentual_aplicado REAL NOT NULL,
    criterio            TEXT NOT NULL CHECK (criterio IN ('fixo', 'igpm', 'ipca')),
    observacoes         TEXT
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

-- Documento de suporte (contrato, recibo, fatura, nota fiscal, pedido comercial, boleto)
-- usado para identificar a que produto/serviço um pagamento/PIX se refere, antes de
-- classificá-lo num imóvel (ou grupo de imóveis, proporcional) e numa conta do plano.
-- valor/data_documento/cnpj_cpf_contraparte são extraídos automaticamente do texto do
-- arquivo (heurística determinística — regex sobre o texto extraído por PDF/OCR) e usados
-- para sugerir o casamento com transações; nome_contraparte pode vir da extração ou ser
-- preenchido manualmente.
CREATE TABLE documentos (
    id                          INTEGER PRIMARY KEY,
    tipo                        TEXT NOT NULL CHECK (tipo IN ('contrato', 'recibo', 'fatura', 'nota_fiscal', 'pedido_comercial', 'boleto', 'outro')),
    arquivo_nome                TEXT NOT NULL,
    valor                       REAL,
    data_documento              DATE,
    cnpj_cpf_contraparte        TEXT,
    nome_contraparte            TEXT,
    descricao_produto_servico   TEXT,
    plano_conta_codigo          TEXT REFERENCES plano_de_contas(codigo),
    texto_extraido              TEXT,             -- texto bruto extraído do PDF/OCR, p/ auditoria e nova tentativa de extração
    criado_em                   DATE NOT NULL,
    observacoes                 TEXT
);

-- A que imóvel(is) o documento se refere, com percentual quando o gasto/produto é
-- compartilhado entre mais de um (ex: nota fiscal de material usado em 2 kitnets).
-- percentual em 0-100 (não em fração 0-1, ao contrário de `rateios.percentual`).
CREATE TABLE documento_imoveis (
    id              INTEGER PRIMARY KEY,
    documento_id    INTEGER NOT NULL REFERENCES documentos(id),
    imovel_id       INTEGER NOT NULL REFERENCES imoveis(id),
    percentual      REAL NOT NULL DEFAULT 100 CHECK (percentual > 0 AND percentual <= 100)
);

-- Vínculo sugerido/confirmado entre um documento e uma transação bancária — score é a
-- confiança do casamento automático (valor/data/CNPJ), nunca aplicado sem confirmação
-- explícita do usuário (status muda de 'sugerido' para 'confirmado' só nesse momento).
CREATE TABLE documento_transacoes (
    id              INTEGER PRIMARY KEY,
    documento_id    INTEGER NOT NULL REFERENCES documentos(id),
    transacao_id    INTEGER NOT NULL REFERENCES transacoes(id),
    score           REAL NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('sugerido', 'confirmado', 'rejeitado')) DEFAULT 'sugerido',
    UNIQUE (documento_id, transacao_id)
);

CREATE INDEX idx_transacoes_data ON transacoes(data);
CREATE INDEX idx_transacoes_imovel ON transacoes(imovel_id);
CREATE INDEX idx_transacoes_contrato ON transacoes(contrato_id);
CREATE INDEX idx_caucoes_contrato ON caucoes(contrato_id);
CREATE INDEX idx_contrato_locatarios_contrato ON contrato_locatarios(contrato_id);
CREATE INDEX idx_contrato_reajustes_contrato ON contrato_reajustes(contrato_id);
CREATE INDEX idx_documentos_data ON documentos(data_documento);
CREATE INDEX idx_documento_imoveis_documento ON documento_imoveis(documento_id);
CREATE INDEX idx_documento_transacoes_documento ON documento_transacoes(documento_id);
CREATE INDEX idx_documento_transacoes_transacao ON documento_transacoes(transacao_id);
