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
    valor_rateado   REAL NOT NULL,
    -- 1 = pelo menos um imóvel participante não tinha fracao_ideal/area_m2 cadastrado e o
    -- rateio caiu para divisão igual (ou tratou o peso como 0) em vez de recusar o cálculo —
    -- nunca deveria ser um fallback silencioso (mesmo princípio de "nunca fabricar dado" já
    -- aplicado a valor venal, saldo devedor manual etc.): fica marcado para revisão em vez de
    -- se passar por um rateio por fração ideal/área real e completo.
    base_incompleta INTEGER NOT NULL DEFAULT 0 CHECK (base_incompleta IN (0, 1))
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

-- Aprendizado por CNPJ/CPF — mesmo princípio de regras_categorizacao (transações), mas para
-- documentos: ao salvar um documento com CNPJ/CPF e classificação completa, guarda a regra;
-- o próximo documento do MESMO CNPJ/CPF já chega com tipo/categoria/imóvel/nome pré-
-- preenchidos, exigindo só confirmação em vez de digitar tudo de novo (achado de uso real:
-- boletos/faturas de um mesmo fornecedor — condomínio, concessionária, vaga de garagem —
-- se repetem todo mês com o mesmo CNPJ). UNIQUE por cnpj_cpf: um novo salvamento do mesmo
-- CNPJ atualiza a regra existente em vez de duplicar.
CREATE TABLE IF NOT EXISTS regras_categorizacao_documentos (
    id                  INTEGER PRIMARY KEY,
    cnpj_cpf            TEXT NOT NULL UNIQUE,
    tipo                TEXT NOT NULL CHECK (tipo IN ('contrato', 'recibo', 'fatura', 'nota_fiscal', 'pedido_comercial', 'boleto', 'outro')),
    nome_contraparte    TEXT,
    plano_conta_codigo  TEXT REFERENCES plano_de_contas(codigo),
    imovel_id           INTEGER REFERENCES imoveis(id), -- NULL = despesa administrativa geral/PF (mesma convenção de documento_imoveis vazio)
    criado_em           DATE NOT NULL,
    atualizado_em       DATE NOT NULL
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

-- Vistorias/Inspeções — agendamento, realização e aprovação
CREATE TABLE IF NOT EXISTS vistorias (
    id              INTEGER PRIMARY KEY,
    imovel_id       INTEGER NOT NULL REFERENCES imoveis(id),
    contrato_id     INTEGER REFERENCES contratos_locacao(id),
    data_agendada   DATETIME,
    data_realizada  DATETIME,
    responsavel     TEXT,
    status          TEXT NOT NULL CHECK (status IN ('agendada', 'em_progresso', 'concluida', 'aprovada')) DEFAULT 'agendada',
    observacoes     TEXT,
    valor_estimado  REAL,
    criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Items da vistoria (danos, achados, necessidades de reparo)
CREATE TABLE IF NOT EXISTS vistoria_item (
    id              INTEGER PRIMARY KEY,
    vistoria_id     INTEGER NOT NULL REFERENCES vistorias(id),
    tipo            TEXT NOT NULL CHECK (tipo IN ('dano', 'necessidade_reparo', 'achado_positivo')),
    descricao       TEXT NOT NULL,
    severidade      TEXT CHECK (severidade IN ('baixa', 'media', 'alta')),
    valor_estimado  REAL,
    criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Anexos da vistoria (fotos, documentos, laudos)
CREATE TABLE IF NOT EXISTS vistoria_anexo (
    id              INTEGER PRIMARY KEY,
    vistoria_id     INTEGER NOT NULL REFERENCES vistorias(id),
    tipo            TEXT CHECK (tipo IN ('foto', 'documento', 'laudo')),
    url_storage     TEXT,
    mime_type       TEXT,
    tamanho_bytes   INTEGER,
    criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Log de auditoria das ações realizadas na vistoria
CREATE TABLE IF NOT EXISTS vistoria_log (
    id              INTEGER PRIMARY KEY,
    vistoria_id     INTEGER NOT NULL REFERENCES vistorias(id),
    acao            TEXT NOT NULL CHECK (acao IN ('agendada', 'inspecao_iniciada', 'concluida', 'aprovada', 'rejeitada')),
    usuario_id      INTEGER,
    motivo          TEXT,
    criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vistorias_imovel ON vistorias(imovel_id);
CREATE INDEX IF NOT EXISTS idx_vistorias_contrato ON vistorias(contrato_id);
CREATE INDEX IF NOT EXISTS idx_vistorias_status ON vistorias(status);
CREATE INDEX IF NOT EXISTS idx_vistoria_item_vistoria ON vistoria_item(vistoria_id);
CREATE INDEX IF NOT EXISTS idx_vistoria_anexo_vistoria ON vistoria_anexo(vistoria_id);
CREATE INDEX IF NOT EXISTS idx_vistoria_log_vistoria ON vistoria_log(vistoria_id);

-- ===== SPRINT 1: ERP CORE - LEDGER INTEGRADO =====
-- Tabela central de lançamentos contábeis com rastreabilidade completa e períodos fecháveis.
-- Todas as 7 integrações (contratos, patrimônio, rateios, vistorias, financiamentos, etc.)
-- alimentam esta tabela. Débitos e créditos em colunas separadas para auditoria de balanceamento.

CREATE TABLE IF NOT EXISTS entidades_legais (
    id              INTEGER PRIMARY KEY,
    tipo            TEXT NOT NULL CHECK (tipo IN ('pessoa_fisica', 'pessoa_juridica')),
    cpf_cnpj        TEXT NOT NULL UNIQUE,
    nome            TEXT NOT NULL,
    endereco        TEXT,
    regime_tributario TEXT CHECK (regime_tributario IN ('simples_nacional', 'presumido', 'lucro_real')),
    criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS periodos_contabeis (
    id              INTEGER PRIMARY KEY,
    entidade_id     INTEGER NOT NULL REFERENCES entidades_legais(id),
    ano             INTEGER NOT NULL,
    mes             INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
    status          TEXT NOT NULL CHECK (status IN ('aberto', 'fechado')) DEFAULT 'aberto',
    saldo_anterior_caixa REAL DEFAULT 0,  -- saldo inicial do período (abertura)
    data_abertura   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_fechamento DATETIME,
    encerrado_por   INTEGER,  -- usuario_id que encerrou o período
    motivo_encerramento TEXT,
    UNIQUE (entidade_id, ano, mes)
);

CREATE TABLE IF NOT EXISTS centros_custo (
    id              INTEGER PRIMARY KEY,
    entidade_id     INTEGER NOT NULL REFERENCES entidades_legais(id),
    codigo          TEXT NOT NULL,
    descricao       TEXT NOT NULL,
    tipo            TEXT NOT NULL CHECK (tipo IN ('imavel', 'administrativo', 'operacional')),
    ativo           INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
    UNIQUE (entidade_id, codigo)
);

CREATE TABLE IF NOT EXISTS contas_plano_contas (
    id              INTEGER PRIMARY KEY,
    entidade_id     INTEGER NOT NULL REFERENCES entidades_legais(id),
    codigo          TEXT NOT NULL,
    descricao       TEXT NOT NULL,
    grupo           TEXT NOT NULL CHECK (grupo IN ('ativo', 'passivo', 'patrimonio_liquido', 'receita', 'despesa', 'resultado')),
    natureza        TEXT NOT NULL CHECK (natureza IN ('debito', 'credito')),
    analisavel      INTEGER NOT NULL DEFAULT 1 CHECK (analisavel IN (0, 1)),  -- participa de relatórios
    ativo           INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
    UNIQUE (entidade_id, codigo)
);

-- Ledger integrado: banco de dados de transações contábeis com origem rastreável e auditoria
-- Esta tabela é o "hub central" onde TODAS as operações do ERP alimentam dados.
-- Diferentemente de transacoes (que é só banco), ledger_entries registra CONTABILIDADE OFICIAL.
CREATE TABLE IF NOT EXISTS ledger_entries (
    id                  INTEGER PRIMARY KEY,
    entidade_id         INTEGER NOT NULL REFERENCES entidades_legais(id),
    periodo_id          INTEGER NOT NULL REFERENCES periodos_contabeis(id),
    centro_custo_id     INTEGER REFERENCES centros_custo(id),
    conta_id            INTEGER NOT NULL REFERENCES contas_plano_contas(id),

    -- Data do lançamento (pode diferir de data do documento-fonte)
    data_lancamento     DATE NOT NULL,

    -- Débito e Crédito em colunas separadas (padrão contábil internacional)
    -- Exatamente um deles é NOT NULL e > 0; o outro é 0 ou NULL.
    valor_debito        REAL CHECK (valor_debito IS NULL OR valor_debito > 0),
    valor_credito       REAL CHECK (valor_credito IS NULL OR valor_credito > 0),

    -- Descrição/histórico do lançamento
    descricao           TEXT NOT NULL,

    -- Rastreabilidade: origem do lançamento (qual módulo/operação gerou).
    -- A lista precisa acompanhar a união `origem_modulo` de LancamentoContabil
    -- (src/domain/erp/ledger.ts): o CHECK aqui era mais estreito que o tipo, e sete dos
    -- módulos do ERP (advocacia, contas-pessoais, imovel-gestao, apontamento-prestador,
    -- pagamentos-integracao, skillos, rateios no plural) gravavam um valor que o banco
    -- real rejeitava — nenhum deles conseguia escrever no ledger em produção, só nos
    -- fixtures de teste, que não tinham este CHECK.
    origem_modulo       TEXT NOT NULL CHECK (origem_modulo IN (
        'transacoes',           -- Transação bancária simples
        'contratos',            -- Contrato de locação
        'patrimonio',           -- Aquisição/depreciação de imóvel
        'caucao',               -- Caução
        'financiamento',        -- Financiamento/amortização
        'rateio',               -- Rateio de despesa comum (grafia legada, mantida)
        'rateios',              -- Rateio de despesa comum
        'vistorias',            -- Provisão de dano em vistoria
        'advocacia',            -- Honorários, custas e provisões de processo
        'contas-pessoais',      -- Movimentos da pessoa física
        'imovel-gestao',        -- Gestão operacional do imóvel
        'apontamento-prestador',-- Apontamento de horas de prestador
        'pagamentos-integracao',-- Baixa de pagamento a prestador
        'skillos',              -- Módulo de habilidades
        'manual'                -- Lançamento manual (ajuste, acerto)
    )),
    origem_id           INTEGER NOT NULL,  -- PK da tabela de origem (transacao_id, contrato_id, etc.)
    referencia_documento TEXT NOT NULL,  -- Código único: CT-123, FIN-456-PAR-001, etc.

    -- Auditoria de criação
    criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    criado_por          INTEGER,  -- usuario_id

    -- Auditoria contábil: permitir desfazer/corrigir (estorno ou lançamento de ajuste)
    auditada            INTEGER NOT NULL DEFAULT 0 CHECK (auditada IN (0, 1)),
    auditado_em         DATETIME,
    auditado_por        INTEGER,  -- usuario_id que auditou

    -- Se este lançamento foi estornado (reversão contábil), referencia qual é o estorno
    estornado_por_id    INTEGER REFERENCES ledger_entries(id),
    motivo_estorno      TEXT,

    -- Uma partida dobrada tem DUAS pernas com a mesma origem (débito numa conta, crédito
    -- em outra). O UNIQUE anterior era (origem_modulo, origem_id) e só deixava passar UMA
    -- linha por documento de origem: era impossível registrar a contrapartida, e o ledger
    -- nascia estruturalmente desbalanceado — nenhum período fecharia. A chave certa
    -- inclui a conta, o que continua barrando reimportação duplicada da mesma transação
    -- na mesma conta, que era o objetivo original.
    UNIQUE (origem_modulo, origem_id, conta_id),
    CHECK (
        (valor_debito IS NOT NULL AND valor_credito IS NULL) OR
        (valor_debito IS NULL AND valor_credito IS NOT NULL)
    )
);

-- Saldos por conta por período (cache para performance de relatórios)
-- Recalculado ao fechar um período contábil
CREATE TABLE IF NOT EXISTS ledger_saldos_periodo (
    id              INTEGER PRIMARY KEY,
    periodo_id      INTEGER NOT NULL REFERENCES periodos_contabeis(id),
    conta_id        INTEGER NOT NULL REFERENCES contas_plano_contas(id),
    saldo_anterior  REAL DEFAULT 0,  -- saldo no início do período
    total_debito    REAL DEFAULT 0,  -- somatório de débitos do período
    total_credito   REAL DEFAULT 0,  -- somatório de créditos do período
    saldo_final     REAL DEFAULT 0,  -- saldo_anterior + débitos - créditos (ou conforme natureza)
    atualizado_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (periodo_id, conta_id)
);

-- Histórico de encerramento: cada vez que um período é fechado, registra um snapshot
-- dos saldos finais (para auditoria de que não houve alteração depois de fechado)
CREATE TABLE IF NOT EXISTS ledger_encerramentos (
    id              INTEGER PRIMARY KEY,
    periodo_id      INTEGER NOT NULL REFERENCES periodos_contabeis(id),
    data_encerramento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    encerrado_por   INTEGER,  -- usuario_id
    total_debito    REAL DEFAULT 0,
    total_credito   REAL DEFAULT 0,
    balancete_OK    INTEGER NOT NULL DEFAULT 0 CHECK (balancete_OK IN (0, 1)),  -- débitos = créditos?
    hash_snapshot   TEXT,  -- SHA256 dos saldos finais (para detectar manipulação)
    observacoes     TEXT
);

-- Regras de mapeamento automático: quando uma transação chega de um módulo,
-- qual conta do plano recebe o lançamento contábil?
CREATE TABLE IF NOT EXISTS regras_contabilizacao (
    id              INTEGER PRIMARY KEY,
    entidade_id     INTEGER NOT NULL REFERENCES entidades_legais(id),
    origem_modulo   TEXT NOT NULL,
    tipo_operacao   TEXT NOT NULL,  -- ex: "aluguel_recebido", "aluguel_esperado", "rateio_recebido"
    conta_debito_id INTEGER REFERENCES contas_plano_contas(id),
    conta_credito_id INTEGER REFERENCES contas_plano_contas(id),
    descricao       TEXT,
    UNIQUE (entidade_id, origem_modulo, tipo_operacao)
);

-- Índices para o ledger (performance crítica)
CREATE INDEX IF NOT EXISTS idx_ledger_periodo ON ledger_entries(periodo_id);
CREATE INDEX IF NOT EXISTS idx_ledger_conta ON ledger_entries(conta_id);
CREATE INDEX IF NOT EXISTS idx_ledger_data ON ledger_entries(data_lancamento);
CREATE INDEX IF NOT EXISTS idx_ledger_origem ON ledger_entries(origem_modulo, origem_id);
CREATE INDEX IF NOT EXISTS idx_ledger_auditada ON ledger_entries(auditada);

CREATE INDEX IF NOT EXISTS idx_saldos_periodo ON ledger_saldos_periodo(periodo_id);
CREATE INDEX IF NOT EXISTS idx_encerramentos_periodo ON ledger_encerramentos(periodo_id);

-- ===== SPRINT 2: PORTAL PRESTADOR - APONTAMENTOS E REMUNERAÇÃO =====
-- Apontamentos diários: entrada/saída do prestador com status de workflows
CREATE TABLE IF NOT EXISTS apontamentos_diarios (
    id                  INTEGER PRIMARY KEY,
    prestador_id        INTEGER NOT NULL REFERENCES prestadores(id),
    data                DATE NOT NULL,
    entrada             TEXT NOT NULL,                           -- Hora de chegada (HH:MM:SS)
    saida_intervalo     TEXT,                                    -- Saída para intervalo/almoço
    retorno_intervalo   TEXT,                                    -- Retorno do intervalo
    saida_final         TEXT NOT NULL,                           -- Saída final do dia
    status              TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviado', 'aprovado', 'retificado')),
    observacoes         TEXT,
    criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (prestador_id, data)
);

-- Histórico de eventos de horários (chegada, saída intervalo, retorno, saída final)
-- Permite rastrear alterações e justificativas de retificações
CREATE TABLE IF NOT EXISTS historico_horarios (
    id                  INTEGER PRIMARY KEY,
    apontamento_id      INTEGER NOT NULL REFERENCES apontamentos_diarios(id) ON DELETE CASCADE,
    tipo_evento         TEXT NOT NULL CHECK (tipo_evento IN ('chegada', 'saida_intervalo', 'retorno', 'saida')),
    horario             TEXT NOT NULL,                           -- Horário efetivo (HH:MM:SS)
    horario_original    TEXT,                                    -- Horário original (antes de retificação)
    justificativa_retificacao TEXT,
    criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Itens remuneráveis: diária, Airbnb, urgência, deslocamento, materiais, extras
CREATE TABLE IF NOT EXISTS itens_remuneraveis (
    id                  INTEGER PRIMARY KEY,
    apontamento_id      INTEGER NOT NULL REFERENCES apontamentos_diarios(id) ON DELETE CASCADE,
    tipo                TEXT NOT NULL CHECK (tipo IN ('diaria', 'airbnb', 'urgencia', 'deslocamento', 'materiais', 'extra')),
    rubrica             TEXT NOT NULL,                           -- Descrição da rubrica
    valor_base          REAL NOT NULL,
    adicional_percentual REAL DEFAULT 0,                         -- Percentual de adicional (ex: 10 para 10%)
    valor_final         REAL NOT NULL,                           -- valor_base + (valor_base * adicional_percentual / 100)
    observacao          TEXT,
    criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Movimentações financeiras: vales, empréstimos, adiantamentos
CREATE TABLE IF NOT EXISTS movimentacoes_financeiras (
    id                  INTEGER PRIMARY KEY,
    apontamento_id      INTEGER NOT NULL REFERENCES apontamentos_diarios(id) ON DELETE CASCADE,
    tipo                TEXT NOT NULL CHECK (tipo IN ('vale', 'emprestimo', 'adiantamento')),
    valor               REAL NOT NULL,
    data_solicitacao    DATE NOT NULL,
    data_aprovacao      DATE,
    data_desconto       DATE,                                    -- Data em que foi descontado da remuneração
    motivo              TEXT,
    status              TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'descontado', 'rejeitado')),
    criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Fechamentos semanais: consolidação de apontamentos por semana
CREATE TABLE IF NOT EXISTS fechamentos_semanais (
    id                  INTEGER PRIMARY KEY,
    prestador_id        INTEGER NOT NULL REFERENCES prestadores(id),
    data_inicio         DATE NOT NULL,
    data_fim            DATE NOT NULL,
    valor_bruto         REAL NOT NULL,
    descontos_total     REAL DEFAULT 0,
    valor_liquido       REAL NOT NULL,
    status              TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'fechado', 'aprovado', 'pago')),
    aprovado_em         DATETIME,
    criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (prestador_id, data_inicio, data_fim)
);

-- Empréstimos: contratos de empréstimo com juros
CREATE TABLE IF NOT EXISTS emprestimos (
    id                  INTEGER PRIMARY KEY,
    prestador_id        INTEGER NOT NULL REFERENCES prestadores(id),
    valor_original      REAL NOT NULL,
    taxa_juros          REAL NOT NULL,                           -- Percentual mensal de juros
    parcelas_total      INTEGER NOT NULL,
    parcelas_pagas      INTEGER DEFAULT 0,
    valor_total_com_juros REAL NOT NULL,
    data_contratacao    DATE NOT NULL,
    data_vencimento     DATE NOT NULL,
    status              TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'pago', 'cancelado')),
    observacao          TEXT,
    criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Retificações: histórico de alterações em apontamentos
CREATE TABLE IF NOT EXISTS retificacoes (
    id                  INTEGER PRIMARY KEY,
    apontamento_id      INTEGER NOT NULL REFERENCES apontamentos_diarios(id) ON DELETE CASCADE,
    campo_alterado      TEXT NOT NULL,                           -- Nome do campo modificado
    valor_anterior      TEXT,                                    -- Valor antes (JSON/TEXT para flexibilidade)
    valor_novo          TEXT,                                    -- Valor depois
    motivo              TEXT,
    data_retificacao    DATE NOT NULL,
    aprovada_em         DATETIME,
    observacao          TEXT,
    criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Parâmetros operacionais: combustível, reajustes, tabelas Airbnb
CREATE TABLE IF NOT EXISTS parametros_operacionais (
    id                  INTEGER PRIMARY KEY,
    parametro           TEXT NOT NULL,                           -- Ex: combustivel_litro, combustivel_km_litro, reajuste_ipca_proxima
    valor               REAL,                                    -- Valor numérico do parâmetro
    valor_descricao     TEXT,                                    -- Para parâmetros não-numéricos
    vigencia_inicio     DATE NOT NULL,
    vigencia_fim        DATE,                                    -- NULL = vigente
    atualizado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (parametro, vigencia_inicio)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_apontamentos_prestador_data ON apontamentos_diarios(prestador_id, data);
CREATE INDEX IF NOT EXISTS idx_apontamentos_status ON apontamentos_diarios(status);
CREATE INDEX IF NOT EXISTS idx_historico_horarios_apontamento ON historico_horarios(apontamento_id);
CREATE INDEX IF NOT EXISTS idx_itens_remuneraveis_apontamento ON itens_remuneraveis(apontamento_id);
CREATE INDEX IF NOT EXISTS idx_itens_remuneraveis_tipo ON itens_remuneraveis(tipo);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_apontamento ON movimentacoes_financeiras(apontamento_id);
CREATE INDEX IF NOT EXISTS idx_fechamentos_prestador_data ON fechamentos_semanais(prestador_id, data_inicio);
CREATE INDEX IF NOT EXISTS idx_fechamentos_status ON fechamentos_semanais(status);
CREATE INDEX IF NOT EXISTS idx_emprestimos_prestador ON emprestimos(prestador_id);
CREATE INDEX IF NOT EXISTS idx_emprestimos_status ON emprestimos(status);
CREATE INDEX IF NOT EXISTS idx_retificacoes_apontamento ON retificacoes(apontamento_id);
CREATE INDEX IF NOT EXISTS idx_parametros_operacionais_parametro ON parametros_operacionais(parametro, vigencia_inicio);

-- ============================================================================
-- COFRE DE EVIDÊNCIAS E TRIAGEM DE IMPORTAÇÃO
-- ============================================================================
-- O critério de sucesso do sistema é responder, para qualquer valor: de onde veio, qual
-- regra o classificou, quem aprovou, o que mudou, qual documento prova e como reproduzir
-- o cálculo. Duas dessas perguntas não tinham resposta possível.
--
-- "QUEM APROVOU": os parsers escreviam direto em `transacoes`. A tela de importação tem
-- uma etapa "Revisar antes de importar", mas ela vive em estado do React — recarregar a
-- página perde tudo, e nada fica registrado sobre quem decidiu o quê. Agora cada arquivo
-- vira um LOTE, cada linha do arquivo vira uma LINHA EM TRIAGEM com status próprio, e só
-- linha aprovada vira transação.
--
-- "QUAL DOCUMENTO PROVA": `transacoes.documento_fonte` é só o NOME do arquivo em texto.
-- Nome de arquivo não prova nada — dois arquivos diferentes podem ter o mesmo nome, e o
-- mesmo arquivo pode ser editado sem mudar de nome. O lote guarda o SHA-256 do conteúdo:
-- é isso que permite, num laudo ou numa petição, demonstrar que o extrato apresentado é
-- byte a byte o que originou o lançamento.

CREATE TABLE IF NOT EXISTS lotes_importacao (
    id                  INTEGER PRIMARY KEY,
    arquivo_nome        TEXT NOT NULL,
    -- SHA-256 do CONTEÚDO do arquivo. É a evidência: reapresentado depois, o mesmo
    -- arquivo tem o mesmo hash; alterado em um byte, tem outro.
    arquivo_hash_sha256 TEXT NOT NULL,
    arquivo_bytes       INTEGER NOT NULL,
    tipo_detectado      TEXT NOT NULL,           -- ofx, csv, pdf_extrato, open_finance...
    conta_id            INTEGER REFERENCES contas_bancarias(id),
    status              TEXT NOT NULL CHECK (status IN ('em_triagem', 'concluido', 'descartado')) DEFAULT 'em_triagem',
    importado_em        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    concluido_em        DATETIME,
    total_linhas        INTEGER NOT NULL DEFAULT 0,
    observacoes         TEXT,
    -- Reimportar o mesmo arquivo na mesma conta reabre o lote existente em vez de criar um
    -- segundo — era assim que o mesmo extrato entrava duas vezes sem ninguém ver.
    UNIQUE (arquivo_hash_sha256, conta_id)
);

CREATE TABLE IF NOT EXISTS importacao_linhas (
    id                  INTEGER PRIMARY KEY,
    lote_id             INTEGER NOT NULL REFERENCES lotes_importacao(id),
    -- Posição da linha dentro do arquivo: é o que permite voltar ao documento original e
    -- apontar exatamente de onde o valor saiu.
    linha_numero        INTEGER NOT NULL,
    data                DATE,
    valor               REAL,
    descricao_original  TEXT NOT NULL,
    fitid               TEXT,
    plano_conta_codigo  TEXT REFERENCES plano_de_contas(codigo),
    status              TEXT NOT NULL CHECK (status IN (
        'pendente',              -- aguardando decisão humana
        'aprovada',              -- virou transação (transacao_id preenchido)
        'rejeitada',             -- decidido que não entra; motivo obrigatório na prática
        'duplicata_provavel',    -- casa com transação já existente (duplicata_de_id)
        'malformada'             -- data ou valor ilegíveis no arquivo
    )) DEFAULT 'pendente',
    motivo              TEXT,
    -- Preenchido ao aprovar. É a ponte que responde "qual documento prova este lançamento":
    -- transacoes -> importacao_linhas -> lotes_importacao.arquivo_hash_sha256.
    transacao_id        INTEGER REFERENCES transacoes(id),
    -- A transação já existente que motivou a suspeita de duplicidade.
    duplicata_de_id     INTEGER REFERENCES transacoes(id),
    decidido_em         DATETIME,
    decidido_por        TEXT,
    UNIQUE (lote_id, linha_numero)
);

CREATE INDEX IF NOT EXISTS idx_importacao_linhas_lote ON importacao_linhas(lote_id, status);
CREATE INDEX IF NOT EXISTS idx_importacao_linhas_transacao ON importacao_linhas(transacao_id);
CREATE INDEX IF NOT EXISTS idx_lotes_importacao_hash ON lotes_importacao(arquivo_hash_sha256);

-- Trilha de auditoria persistente, encadeada por hash (hash_anterior -> hash_sha256).
-- src/domain/erp/compliance-audit-log.ts já grava e lê exatamente estas colunas, mas a
-- tabela só existia no fixture de teste: contra o banco real as funções davam
-- "no such table" e devolviam zero registros em silêncio. Sem ela, a trilha do Painel de
-- Auditoria vive só na memória da aba e zera ao recarregar a página.
CREATE TABLE IF NOT EXISTS auditoria_log (
    id                      INTEGER PRIMARY KEY,
    timestamp               TEXT,
    usuario_id              INTEGER,
    usuario_nome            TEXT,
    ip_origem               TEXT,
    modulo_chamador         TEXT,
    tipo_operacao           TEXT,
    entidade_afetada        TEXT,
    id_entidade             INTEGER,
    descricao_alteracao     TEXT,
    valor_anterior          TEXT,
    valor_novo              TEXT,
    hash_sha256             TEXT,
    hash_anterior           TEXT,
    status                  TEXT,
    mensagem_erro           TEXT,
    tempo_processamento_ms  INTEGER,
    retencao_ate            TEXT,
    assinado                INTEGER DEFAULT 0,
    assinatura_digital      TEXT,
    criado_em               TEXT
);

CREATE INDEX IF NOT EXISTS idx_auditoria_log_entidade ON auditoria_log(entidade_afetada, id_entidade);
CREATE INDEX IF NOT EXISTS idx_auditoria_log_timestamp ON auditoria_log(timestamp);

-- ============================================================================
-- CONCILIAÇÃO BANCÁRIA
--
-- `transacoes` (o extrato importado) e `ledger_entries` (o razão, via
-- migracao-ledger.ts) são povoados automaticamente, mas nada até aqui comparava o
-- resultado com o saldo real do banco numa data, nem apontava o que explica a
-- diferença quando os números não batem — requisito central de um núcleo contábil.
--
-- Duas tabelas novas, propositalmente separadas:
--   - extrato_saldos_informados: o FATO que o sistema não tem como deduzir sozinho —
--     o saldo que o extrato bancário real mostrava numa data. É digitado pela pessoa,
--     a partir do próprio extrato/aplicativo do banco, e existe independente de uma
--     conciliação já ter sido rodada (pode ser cadastrado antes, revisitado depois).
--   - conciliacoes_bancarias + conciliacoes_itens: o REGISTRO de cada apuração feita
--     — os três saldos comparados, as diferenças e a decomposição delas — para que uma
--     conciliação já feita continue auditável depois, sem precisar refazer o cálculo.
--
-- src/domain/conciliacao/conciliacao.ts é quem lê e grava estas tabelas.
-- ============================================================================

-- Saldo informado pelo extrato bancário real, numa data, para uma conta. Histórico por
-- data (não só "o saldo mais recente"): uma mesma conta pode ser conciliada em cortes
-- diferentes (fechamento mensal, por exemplo), e cada data guarda o que o extrato de
-- verdade mostrava naquele dia — não um valor recalculado a posteriori.
CREATE TABLE IF NOT EXISTS extrato_saldos_informados (
    id              INTEGER PRIMARY KEY,
    conta_id        INTEGER NOT NULL REFERENCES contas_bancarias(id),
    data            DATE NOT NULL,
    saldo           REAL NOT NULL,
    informado_em    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    informado_por   TEXT,
    observacoes     TEXT,
    -- Reinformar o saldo da mesma conta na mesma data corrige o valor anterior em vez de
    -- acumular duplicata — é sempre "o que o extrato mostrava nesta data", um fato só.
    UNIQUE (conta_id, data)
);

-- Cada conciliação feita: os três saldos comparados (extrato informado, transações
-- acumuladas no app, e a parcela do razão atribuível a esta conta — ver o comentário em
-- conciliacao.ts sobre por que "atribuível", já que o caixa do razão, CONTA_CAIXA_ERP em
-- mapeamentoPlanoApp.ts, é uma única conta compartilhada por todas as contas bancárias
-- cadastradas) e as diferenças apuradas entre eles. `realizada_por` é texto livre, no
-- mesmo padrão de `decidido_por` em importacao_linhas — não há autenticação de usuário
-- neste sistema.
CREATE TABLE IF NOT EXISTS conciliacoes_bancarias (
    id                              INTEGER PRIMARY KEY,
    conta_id                        INTEGER NOT NULL REFERENCES contas_bancarias(id),
    data_corte                      DATE NOT NULL,
    saldo_extrato                   REAL NOT NULL,
    saldo_transacoes                REAL NOT NULL,
    saldo_razao                     REAL NOT NULL,
    diferenca_extrato_transacoes    REAL NOT NULL,  -- saldo_extrato - saldo_transacoes
    diferenca_transacoes_razao      REAL NOT NULL,  -- saldo_transacoes - saldo_razao
    diferenca_extrato_razao         REAL NOT NULL,  -- saldo_extrato - saldo_razao (diferença total)
    fechada_sem_diferenca           INTEGER NOT NULL DEFAULT 0 CHECK (fechada_sem_diferenca IN (0, 1)),
    realizada_em                    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    realizada_por                   TEXT,
    observacoes                     TEXT
);

CREATE INDEX IF NOT EXISTS idx_conciliacoes_bancarias_conta ON conciliacoes_bancarias(conta_id, data_corte);

-- Decomposição da diferença de uma conciliação: cada linha é um FATOR que explica parte
-- (ou a totalidade) do descasamento entre os três saldos — nunca só o número da
-- diferença sem dizer o que a compõe. `referencias_json` guarda os ids das linhas de
-- origem (transacoes, importacao_linhas ou ledger_entries, conforme o tipo) para a tela
-- poder abrir a lista por trás do item; é só para consulta, não FOREIGN KEY, porque o
-- tipo de origem muda conforme `tipo` e os ids podem deixar de existir com o tempo.
CREATE TABLE IF NOT EXISTS conciliacoes_itens (
    id                  INTEGER PRIMARY KEY,
    conciliacao_id      INTEGER NOT NULL REFERENCES conciliacoes_bancarias(id),
    tipo                TEXT NOT NULL CHECK (tipo IN (
        'nao_lancada_no_razao',      -- transação da conta, dentro do corte, sem perna correspondente no razão
        'triagem_pendente',          -- linha de importação ainda sem decisão (pendente/duplicata provável/malformada)
        'classificacao_pendente',    -- já está no razão, mas contra a conta transitória 1.9.99 (não afeta o total)
        'lancamento_orfao_no_razao', -- lançamento de caixa no razão sem transação de origem encontrada (system-wide)
        'residual_nao_identificado'  -- sobra depois dos itens acima — existe para nunca esconder diferença sem explicação
    )),
    descricao           TEXT NOT NULL,
    quantidade          INTEGER NOT NULL DEFAULT 0,
    valor               REAL NOT NULL DEFAULT 0,
    afeta_diferenca     INTEGER NOT NULL DEFAULT 1 CHECK (afeta_diferenca IN (0, 1)),
    referencias_json     TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_conciliacoes_itens_conciliacao ON conciliacoes_itens(conciliacao_id);

-- ============================================================================
-- PROVENIÊNCIA DE CHAMADAS DE IA (src/domain/ia/)
--
-- O roteador multi-provedor de IA (roteador.ts) sempre soube registrar provedor,
-- modelo, quando, tokens, custo estimado, confiança e o motivo do escalonamento/rodízio
-- que levou a ESTE provedor a ser chamado nesta posição — mas só em memória do processo
-- (ver src/domain/ia/proveniencia.ts): recarregar a página (F5) apagava tudo. O critério
-- de sucesso do produto é responder, para qualquer valor, "de onde veio, qual regra o
-- classificou, o que mudou, qual documento prova e como reproduzir o cálculo" — "a IA
-- achou" não é resposta; "o modelo X, em tal data, com confiança média, a partir deste
-- texto" é, e só é verificável se sobrevive a um F5. Esta tabela é o destino dessa
-- persistência.
--
-- `prompt_texto` é o texto efetivamente enviado ao provedor (já truncado pelo chamador —
-- ver o limite de 1000 caracteres em classificarComIA.ts — e sem CPF/CNPJ isolado, saldo
-- ou dado além do próprio texto do documento) — sem ele, "como reproduzir o cálculo" não
-- é respondível de verdade: nem o provedor original repete a mesma resposta sem saber
-- qual foi a entrada. Fica limitado a 4000 caracteres na gravação (ver proveniencia.ts)
-- como cinto e suspensório, já que o próprio chamador nunca deveria mandar mais que isso.
--
-- `documento_id`/`transacao_id` ligam esta chamada ao valor que ela ajudou a produzir —
-- é o que permite, partindo de um valor em `documentos` ou `transacoes`, chegar até a
-- linha exata de IA que o classificou (ver proveniencia.ts: vincularChamadaADocumento,
-- vincularChamadaATransacao, chamadaDoDocumento, chamadaDaTransacao). Nenhum dos dois é
-- NOT NULL nem preenchido no INSERT: a chamada é registrada no momento em que o roteador
-- recebe a resposta do provedor, antes de o chamador saber se vai virar um documento ou
-- uma transação (ou se o resultado será descartado na revisão manual) — por isso o
-- vínculo é um UPDATE posterior, feito por quem cria o registro definitivo. Sem FOREIGN
-- KEY: não há CASCADE aqui de propósito — apagar um documento/transação não deve apagar
-- a prova de qual chamada de IA existiu, só deixar o vínculo pendente de outra explicação.
CREATE TABLE IF NOT EXISTS ia_chamadas (
    id                  INTEGER PRIMARY KEY,
    provedor            TEXT NOT NULL CHECK (provedor IN ('anthropic', 'openai', 'google', 'ollama')),
    modelo              TEXT NOT NULL,
    quando              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tokens_entrada      INTEGER,
    tokens_saida        INTEGER,
    custo_estimado_usd  REAL,
    confianca           TEXT CHECK (confianca IN ('alta', 'media', 'baixa')),
    -- Nunca vazio — é a resposta a "por que a IA foi chamada": "preferido", "rodizio",
    -- "fallback_apos_falha:<provedor-anterior>", "caminho_barato_local" ou
    -- "escalonado_por_qualidade_baixa: <motivos>" (ver roteador.ts).
    motivo              TEXT NOT NULL,
    sucesso             INTEGER NOT NULL CHECK (sucesso IN (0, 1)),
    erro                TEXT,
    prompt_texto        TEXT,
    documento_id        INTEGER,
    transacao_id        INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ia_chamadas_quando ON ia_chamadas(quando);
CREATE INDEX IF NOT EXISTS idx_ia_chamadas_documento ON ia_chamadas(documento_id);
CREATE INDEX IF NOT EXISTS idx_ia_chamadas_transacao ON ia_chamadas(transacao_id);
