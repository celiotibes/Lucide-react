-- Schema de reconstituição contábil: pessoa física com atividade de fato de locação de imóveis.
-- SQLite. Toda transação deve ser rastreável até um documento-fonte (trilha de auditoria).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS contas_bancarias (
    id              INTEGER PRIMARY KEY,
    banco           TEXT NOT NULL,
    agencia         TEXT,
    numero          TEXT NOT NULL,
    titular         TEXT NOT NULL,
    tipo            TEXT NOT NULL CHECK (tipo IN ('corrente', 'poupanca', 'investimento')),
    ativa_desde     DATE,
    observacoes     TEXT,
    -- Cadastrar a mesma conta duas vezes (dois ids diferentes) e importar o mesmo extrato
    -- contra cada uma dobra a renda/despesa em silêncio: a dedup de transações (UNIQUE
    -- conta_id+fitid) é escopada por conta_id, então não pega esse caso (achado de
    -- auditoria adversarial). Protege bancos novos; ContasBancariasForm.tsx faz a mesma
    -- checagem em bancos já existentes, que não herdam UNIQUE retroativamente.
    UNIQUE (banco, agencia, numero)
);

CREATE TABLE IF NOT EXISTS imoveis (
    id              INTEGER PRIMARY KEY,
    apelido         TEXT NOT NULL,              -- ex: "Kitnet 302 - Ed. Aurora"
    tipo            TEXT NOT NULL CHECK (tipo IN ('apartamento', 'kitnet', 'sala_comercial', 'vaga_garagem', 'outro')),
    cidade          TEXT,                       -- ex: "Florianópolis", "Curitiba" — agrupamento regional p/ relatórios e rateio
    endereco        TEXT,
    fracao_ideal    REAL CHECK (fracao_ideal IS NULL OR fracao_ideal > 0), -- para rateio de despesas coletivas por m²/fração
    area_m2         REAL,
    financiado      INTEGER NOT NULL DEFAULT 0 CHECK (financiado IN (0, 1)),
    -- 1 = residência própria (uso pessoal), não faz parte da atividade de fato de locação —
    -- excluída por padrão do DRE/relatórios da atividade, mas continua rastreável para mostrar
    -- separação clara entre despesa pessoal e despesa do negócio (capacidade contributiva).
    uso_pessoal     INTEGER NOT NULL DEFAULT 0 CHECK (uso_pessoal IN (0, 1)),

    -- Registro imobiliário e avaliação — base do balanço patrimonial (ativo x passivo),
    -- dimensão diferente de uso_pessoal (que é sobre USO, não sobre TITULARIDADE).
    matricula               TEXT,               -- nº de matrícula do imóvel, quando individual
    matricula_mae           TEXT,               -- matrícula-mãe que agrupa várias unidades (ex: kitnets sob 1 condomínio)
    valor_aquisicao         REAL,               -- custo histórico de aquisição
    valor_venal_atual       REAL,               -- valor de mercado/venal mais recente informado pelo usuário
    data_avaliacao_venal    DATE,               -- data de referência de valor_venal_atual
    -- 'proprio' entra no patrimônio líquido do usuário; 'gestao_terceiros' é administrado por
    -- ele (fluxo de caixa rastreado normalmente) mas não soma no patrimônio líquido pessoal —
    -- caso do imóvel de terceiro (ex: "Avani") sob gestão/usufruto.
    regime_patrimonial      TEXT NOT NULL DEFAULT 'proprio' CHECK (regime_patrimonial IN ('proprio', 'gestao_terceiros')),
    proprietario_nome       TEXT,               -- preenchido quando regime_patrimonial = 'gestao_terceiros'

    -- Copropriedade de um imóvel que é 'proprio' (não confundir com regime_patrimonial =
    -- 'gestao_terceiros', que é 100% de terceiro): existe um co-titular real, mas o percentual
    -- de participação de cada um ainda não foi confirmado (matrícula/escritura). Deliberadamente
    -- NÃO é um percentual numérico — sem o dado real, o sistema não estima uma divisão; só
    -- sinaliza a pendência (ver garantirPlanoDeContasPadrao / gerarPainelPendencias) e mantém o
    -- imóvel contando 100% no patrimônio até o usuário confirmar e, então, decidir como tratar.
    co_titular_nome          TEXT
);

-- Inventário de bens (mobiliário/equipamentos) de um imóvel próprio para locação — o mesmo
-- conteúdo do "Relação e Inventário de Bens" que contratos reais anexam na vistoria de entrada
-- (ex: Anexo II), com valor de reposição/seminovo por item. Serve de referência para o Relatório
-- de Apuração de Débitos (RAD) na saída do locatário — nunca gera dedução de caução sozinho, só
-- documenta o que estava lá.
CREATE TABLE IF NOT EXISTS imovel_inventario_bens (
    id                  INTEGER PRIMARY KEY,
    imovel_id           INTEGER NOT NULL REFERENCES imoveis(id),
    descricao           TEXT NOT NULL,      -- ex: "Ar-condicionado split (revisado)"
    valor_reposicao     REAL,               -- custo de aquisição/reposição/seminovo de referência
    data_vistoria       DATE                -- data da vistoria de entrada que registrou o item, se conhecida
);

CREATE TABLE IF NOT EXISTS financiamentos (
    id              INTEGER PRIMARY KEY,
    imovel_id       INTEGER NOT NULL REFERENCES imoveis(id),
    instituicao     TEXT NOT NULL,
    sistema         TEXT NOT NULL CHECK (sistema IN ('SAC', 'PRICE', 'OUTRO')),
    valor_contratado REAL NOT NULL,
    taxa_juros_mensal REAL NOT NULL DEFAULT 0.8,   -- percentual ao mês do contrato, ex: 0.8 (= 0,8% a.m.)
    data_contrato   DATE NOT NULL,
    parcelas_total  INTEGER NOT NULL,

    -- 'OUTRO' cobre financiamentos sem fórmula de amortização bancária conhecida (ex:
    -- hipoteca por consórcio — parcela e saldo devedor não seguem SAC/PRICE, dependem do
    -- extrato da administradora). Para esses, saldo/parcela vêm exclusivamente destes
    -- campos manuais (mesmo padrão de dividas_consumo: usuário relança o valor, o sistema
    -- não calcula uma fórmula que não se aplica). Ignorados quando sistema = SAC/PRICE.
    saldo_devedor_manual        REAL,
    parcela_mensal_manual       REAL,
    data_referencia_saldo_manual DATE,

    observacoes     TEXT
);

-- Dívida de consumo não-imobiliária (consignado, empréstimo pessoal, cartão parcelado) —
-- não tem matrícula/imóvel associado nem cronograma SAC/Price automático porque a fonte
-- típica é um relatório Registrato/SCR do Bacen (autoatendimento do cidadão, sem API
-- pública) ou fatura de cartão: o usuário relança o saldo devedor periodicamente a partir
-- do próprio relatório, em vez do sistema recalcular amortização sozinho.
CREATE TABLE IF NOT EXISTS dividas_consumo (
    id                      INTEGER PRIMARY KEY,
    tipo                    TEXT NOT NULL CHECK (tipo IN ('consignado', 'emprestimo_pessoal', 'cartao_parcelado', 'outro')),
    instituicao             TEXT NOT NULL,
    valor_contratado        REAL,
    saldo_devedor_atual     REAL NOT NULL,
    parcela_mensal          REAL NOT NULL,
    data_referencia_saldo   DATE NOT NULL,      -- data em que saldo_devedor_atual foi apurado (ex: data do Registrato)
    observacoes             TEXT
);

CREATE TABLE IF NOT EXISTS obras (
    id              INTEGER PRIMARY KEY,
    imovel_id       INTEGER NOT NULL REFERENCES imoveis(id),
    descricao       TEXT NOT NULL,
    data_inicio     DATE,
    data_fim        DATE,
    natureza        TEXT NOT NULL CHECK (natureza IN ('capex', 'manutencao')), -- capitalizável x despesa corrente
    valor_total     REAL
);

CREATE TABLE IF NOT EXISTS prestadores (
    id              INTEGER PRIMARY KEY,
    nome            TEXT NOT NULL,
    cpf_cnpj        TEXT,
    servico         TEXT NOT NULL               -- faxina, portaria, gestão de Airbnb, reforma, etc.
);

CREATE TABLE IF NOT EXISTS contratos_locacao (
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
    percentual_aluguel_efetivo REAL NOT NULL DEFAULT 100 CHECK (percentual_aluguel_efetivo BETWEEN 0 AND 100),

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
CREATE TABLE IF NOT EXISTS contrato_reajustes (
    id                  INTEGER PRIMARY KEY,
    contrato_id         INTEGER NOT NULL REFERENCES contratos_locacao(id),
    data_vigencia       DATE NOT NULL,             -- a partir de quando o valor_novo passou a valer
    valor_anterior      REAL NOT NULL,
    valor_novo          REAL NOT NULL,
    percentual_aplicado REAL NOT NULL,
    criterio            TEXT NOT NULL CHECK (criterio IN ('fixo', 'igpm', 'ipca')),
    -- 1 = reajuste anual de fato (conta para "1ª renovação" e fecha o ciclo de
    -- duracao_minima_meses para fins de multa rescisória). 0 = mudança de valor por outro
    -- motivo contratual (ex: recomposição por variação de lotação — 2 → 3 pessoas — prevista
    -- em cláusula própria, sem seguir índice nem contar como o reajuste anual do contrato).
    -- Default 1 preserva o comportamento de todo histórico já registrado antes deste campo
    -- existir (só havia um jeito de registrar reajuste, sempre um reajuste anual de fato).
    eh_reajuste_anual   INTEGER NOT NULL DEFAULT 1 CHECK (eh_reajuste_anual IN (0, 1)),
    observacoes         TEXT
);

-- Locatários e responsáveis financeiros solidários adicionais além do locatário
-- principal — comum em locação estudantil/compartilhada com múltiplos nomes no
-- mesmo contrato e responsabilidade solidária integral (art. 275 do Código Civil).
CREATE TABLE IF NOT EXISTS contrato_locatarios (
    id              INTEGER PRIMARY KEY,
    contrato_id     INTEGER NOT NULL REFERENCES contratos_locacao(id),
    nome            TEXT NOT NULL,
    cpf             TEXT,
    papel           TEXT NOT NULL CHECK (papel IN ('locatario', 'responsavel_solidario')),
    telefone        TEXT,
    email           TEXT
);

-- Depósito caução (Lei do Inquilinato, art. 38 — limite de 3 meses de aluguel).
CREATE TABLE IF NOT EXISTS caucoes (
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

-- Composição CONTRATADA da Cota de Custeio Coletivo (a tabela de rubricas que contratos reais de
-- "valor único mensal" costumam anexar, ex: "conservação de mobiliário de áreas comuns",
-- "lavanderia coletiva" etc., cada uma com seu percentual/valor na data de assinatura).
-- Deliberadamente NÃO tenta reclassificar as transações bancárias já lançadas nessas mesmas
-- sub-rubricas — a conciliação bancária real só existe no grão grosso do plano de contas
-- (condomínio, manutenção, prestadores). Esta tabela guarda o que foi CONTRATADO, como
-- referência/prova documental de que o rateio é itemizado e legítimo (não uma forma de
-- disfarçar renda) — exibida ao lado do gasto real no DSS, nunca somada a ele.
CREATE TABLE IF NOT EXISTS contrato_custeio_rubricas (
    id              INTEGER PRIMARY KEY,
    contrato_id     INTEGER NOT NULL REFERENCES contratos_locacao(id),
    referencia      TEXT,               -- numeração do próprio contrato/anexo, ex: "02" — opcional
    descricao       TEXT NOT NULL,      -- ex: "Custeio de uso e conservação de mobiliário de áreas comuns"
    percentual      REAL,               -- % do valor único mensal, conforme contratado
    valor_base      REAL                -- valor em R$ na data de assinatura, conforme contratado
);

-- Franquia hídrica CONTRATADA por faixa de ocupação (a matriz que contratos reais anexam
-- quando não há hidrômetro individualizado por unidade, ex: Anexo V) — mesmo espírito de
-- contrato_custeio_rubricas: documenta o que foi contratado, não mede consumo real (não há
-- leitura de hidrômetro neste sistema) nem calcula rateio extraordinário por excedente.
CREATE TABLE IF NOT EXISTS contrato_franquia_hidrica (
    id                      INTEGER PRIMARY KEY,
    contrato_id             INTEGER NOT NULL REFERENCES contratos_locacao(id),
    ocupacao_pessoas        INTEGER NOT NULL,   -- nº de moradores desta faixa da matriz
    franquia_total_m3       REAL,               -- consumo interno + cota de lavanderia, m³/mês
    custo_estimado_reais    REAL                -- custo médio estimado (água+esgoto) na data do contrato
);

-- Série mensal de índices para correção monetária (caução, reajuste de aluguel).
-- Popule com valores reais do BACEN/IBGE antes de calcular em produção.
CREATE TABLE IF NOT EXISTS indices_economicos (
    indice          TEXT NOT NULL CHECK (indice IN ('poupanca', 'igpm', 'ipca')),
    mes_referencia  DATE NOT NULL,                -- primeiro dia do mês, ex: 2023-01-01
    taxa_mensal     REAL NOT NULL,                -- percentual do mês, ex: 0.62 (= 0,62%)
    PRIMARY KEY (indice, mes_referencia)
);

-- Cruzamento fiscal: o que foi de fato declarado/pago à Receita Federal (DIRPF anual ou
-- DARF de Carnê-Leão mensal) versus a renda tributável RECONSTITUÍDA a partir dos extratos
-- bancários reais (gerarRendaTributavel/calcularCarneLeaoPorImovel). Sem essa comparação,
-- o sistema mostra "quanto deveria ter sido pago" mas nunca "quanto foi de fato declarado" —
-- lançamento manual porque não há API pública da Receita Federal para consultar declarações
-- já entregues (mesma limitação de Registrato/SCR já documentada em dividas_consumo).
CREATE TABLE IF NOT EXISTS declaracoes_fiscais (
    id                              INTEGER PRIMARY KEY,
    ano_calendario                  INTEGER NOT NULL,
    tipo                            TEXT NOT NULL CHECK (tipo IN ('dirpf_anual', 'carne_leao_mensal')),
    mes_referencia                  DATE,           -- obrigatório quando tipo = 'carne_leao_mensal' (1º dia do mês); NULL para dirpf_anual
    rendimento_tributavel_declarado REAL NOT NULL,  -- valor de aluguéis (rendimento tributável de PF) efetivamente declarado
    imposto_pago                    REAL,           -- DARF pago, quando disponível
    fonte_documento                 TEXT,           -- ex: "DIRPF 2025 - ficha rendimentos recebidos de PF", "DARF Carnê-Leão 06/2025"
    observacoes                     TEXT
);

CREATE TABLE IF NOT EXISTS plano_de_contas (
    codigo          TEXT PRIMARY KEY,            -- ex: "3.1.02"
    descricao       TEXT NOT NULL,
    grupo           TEXT NOT NULL CHECK (grupo IN ('receita', 'despesa', 'pessoal', 'transferencia')),
    natureza        TEXT NOT NULL CHECK (natureza IN ('debito', 'credito'))
);

CREATE TABLE IF NOT EXISTS transacoes (
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

CREATE TABLE IF NOT EXISTS rateios (
    id              INTEGER PRIMARY KEY,
    transacao_id    INTEGER NOT NULL REFERENCES transacoes(id),
    imovel_id       INTEGER NOT NULL REFERENCES imoveis(id),
    criterio        TEXT NOT NULL,                -- ex: "fracao_ideal", "area_m2", "por_unidade"
    percentual      REAL NOT NULL CHECK (percentual > 0 AND percentual <= 1),
    valor_rateado   REAL NOT NULL
);

-- Regras de categorização aprendidas a partir de categorizações manuais (ver
-- src/domain/categorize/regrasAprendidas.ts no app web).
CREATE TABLE IF NOT EXISTS regras_categorizacao (
    id                  INTEGER PRIMARY KEY,
    padrao              TEXT NOT NULL,             -- regex aplicado a descricao_original (case-insensitive)
    plano_conta_codigo  TEXT NOT NULL REFERENCES plano_de_contas(codigo),
    imovel_id           INTEGER REFERENCES imoveis(id), -- opcional: fornecedor recorrente de 1 imóvel só (ex: CEMIG de uma unidade); NULL = regra não decide o imóvel
    criado_em           DATE NOT NULL
);

-- Documento de suporte (contrato, recibo, fatura, nota fiscal, pedido comercial, boleto)
-- usado para identificar a que produto/serviço um pagamento/PIX se refere, antes de
-- classificá-lo num imóvel (ou grupo de imóveis, proporcional) e numa conta do plano.
-- valor/data_documento/cnpj_cpf_contraparte são extraídos automaticamente do texto do
-- arquivo (heurística determinística — regex sobre o texto extraído por PDF/OCR) e usados
-- para sugerir o casamento com transações; nome_contraparte pode vir da extração ou ser
-- preenchido manualmente.
CREATE TABLE IF NOT EXISTS documentos (
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
CREATE TABLE IF NOT EXISTS documento_imoveis (
    id              INTEGER PRIMARY KEY,
    documento_id    INTEGER NOT NULL REFERENCES documentos(id),
    imovel_id       INTEGER NOT NULL REFERENCES imoveis(id),
    percentual      REAL NOT NULL DEFAULT 100 CHECK (percentual > 0 AND percentual <= 100)
);

-- Vínculo sugerido/confirmado entre um documento e uma transação bancária — score é a
-- confiança do casamento automático (valor/data/CNPJ), nunca aplicado sem confirmação
-- explícita do usuário (status muda de 'sugerido' para 'confirmado' só nesse momento).
CREATE TABLE IF NOT EXISTS documento_transacoes (
    id              INTEGER PRIMARY KEY,
    documento_id    INTEGER NOT NULL REFERENCES documentos(id),
    transacao_id    INTEGER NOT NULL REFERENCES transacoes(id),
    score           REAL NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('sugerido', 'confirmado', 'rejeitado')) DEFAULT 'sugerido',
    UNIQUE (documento_id, transacao_id)
);

-- Registro de cada PDF (Laudo pericial / RAD) efetivamente gerado — sem isso, o sistema não
-- tinha como provar depois qual foi o conteúdo exato entregue numa data específica (só o
-- hash do backup do banco INTEIRO, granularidade bem mais grossa). O hash aqui é do PDF em
-- si, calculado no momento da geração (mesmo princípio de cadeia de custódia digital de
-- backupIntegridade.ts) — auditoria de completude identificou essa ausência.
CREATE TABLE IF NOT EXISTS documentos_gerados (
    id              INTEGER PRIMARY KEY,
    tipo            TEXT NOT NULL CHECK (tipo IN ('laudo_pericial', 'rad')),
    nome_arquivo    TEXT NOT NULL,
    data_emissao    DATE NOT NULL,          -- data de referência usada no corpo do PDF
    gerado_em       TEXT NOT NULL,          -- timestamp ISO 8601 completo (hora exata da geração)
    hash_sha256     TEXT NOT NULL,
    tamanho_bytes   INTEGER NOT NULL,
    contrato_id     INTEGER REFERENCES contratos_locacao(id),  -- NULL para laudo (é do portfólio inteiro)
    imovel_id       INTEGER REFERENCES imoveis(id)              -- NULL para laudo
);

-- Trilha de auditoria de EDIÇÃO dos próprios dados cadastrais — distinta da auditoria
-- forense (que audita os dados financeiros). Sem isso, não havia como provar que um campo
-- não foi alterado depois do fato (ex: valor_venal_atual de um imóvel, cláusulas de um
-- contrato) — relevante em contexto pericial se a exatidão de um número for questionada.
-- dados_anteriores/dados_novos guardam um snapshot JSON da linha inteira (não só o campo
-- que mudou) — mais simples e mais robusto que rastrear diff campo a campo, ao custo de
-- redundância de armazenamento (aceitável: são poucas tabelas, poucas edições).
CREATE TABLE IF NOT EXISTS log_alteracoes (
    id                  INTEGER PRIMARY KEY,
    tabela              TEXT NOT NULL,
    registro_id         INTEGER NOT NULL,
    operacao            TEXT NOT NULL CHECK (operacao IN ('criacao', 'edicao', 'exclusao')),
    quando              TEXT NOT NULL,      -- timestamp ISO 8601 completo
    resumo              TEXT NOT NULL,      -- descrição legível (ex: "valor_venal_atual: 450000 -> 480000")
    dados_anteriores    TEXT,               -- JSON da linha antes (NULL em criação)
    dados_novos         TEXT                -- JSON da linha depois (NULL em exclusão)
);

CREATE INDEX IF NOT EXISTS idx_documentos_gerados_tipo ON documentos_gerados(tipo);
CREATE INDEX IF NOT EXISTS idx_log_alteracoes_tabela_registro ON log_alteracoes(tabela, registro_id);

CREATE INDEX IF NOT EXISTS idx_transacoes_data ON transacoes(data);
CREATE INDEX IF NOT EXISTS idx_transacoes_imovel ON transacoes(imovel_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_contrato ON transacoes(contrato_id);
CREATE INDEX IF NOT EXISTS idx_caucoes_contrato ON caucoes(contrato_id);
CREATE INDEX IF NOT EXISTS idx_contrato_locatarios_contrato ON contrato_locatarios(contrato_id);
CREATE INDEX IF NOT EXISTS idx_contrato_reajustes_contrato ON contrato_reajustes(contrato_id);
CREATE INDEX IF NOT EXISTS idx_documentos_data ON documentos(data_documento);
CREATE INDEX IF NOT EXISTS idx_documento_imoveis_documento ON documento_imoveis(documento_id);
CREATE INDEX IF NOT EXISTS idx_documento_transacoes_documento ON documento_transacoes(documento_id);
CREATE INDEX IF NOT EXISTS idx_documento_transacoes_transacao ON documento_transacoes(transacao_id);
