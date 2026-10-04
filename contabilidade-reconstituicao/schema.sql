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
    observacoes             TEXT,
    -- Não existia antes porque a fonte típica (Registrato/SCR) só dá saldo devedor
    -- periódico, sem taxa. Quando preenchida, permite estimar juro implícito pela
    -- variação do saldo entre apurações — decisão do usuário (2026-09-29): sempre
    -- rotulado como estimativa, nunca como valor exato.
    taxa_juros_mensal_estimada REAL
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
    servico         TEXT NOT NULL,              -- faxina, portaria, gestão de Airbnb, reforma, etc.
    -- email/telefone adicionados para notificação de ordem de serviço (decisão do usuário,
    -- 2026-10) — faltavam aqui porque a tela de operações sempre atribuiu prestador só por
    -- nome, sem precisar de contato direto antes.
    telefone        TEXT,
    email           TEXT
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
    -- Data do EXTRATO (quando o dinheiro se moveu na conta) — governa caixa e
    -- data_lancamento do razão. Distinta de `data_competencia` abaixo: um boleto de
    -- dezembro pago em janeiro tem `data` = janeiro, mas pode ter `data_competencia` =
    -- dezembro (mês do fato gerador), para reconstituição em regime de competência.
    data_competencia    DATE,                     -- opcional; preenchida na triagem ou inferida da descrição
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
    observacoes                 TEXT,
    arquivo_hash_sha256         TEXT,             -- hash SHA-256 do arquivo para deduplicação
    chave_nfe                   TEXT              -- chave de acesso de 44 dígitos da NF-e/NFS-e, extraída do XML
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
    -- Espelha o ciclo de provisionamento contábil dos danos desta vistoria
    -- (integracao-vistorias-provisionamento.ts): sincronizarVistoriaConcluidaParaProvisionamento()
    -- grava aqui depois de lançar a provisão no razão, e revertorProvisionamentoDanosVistoria()
    -- atualiza para 'revertido' quando os danos são reparados. Sem estas duas colunas o
    -- UPDATE estourava "no such column" (capturado só porque a função embrulha em try/catch,
    -- reportando "erro ao provisionar" para toda vistoria com dano real).
    status_provisionamento TEXT CHECK (status_provisionamento IN ('nao_requer', 'pendente', 'provisionado', 'revertido', 'erro')),
    data_provisionamento   DATETIME,
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

-- Log de sincronização entre vistoria e provisão contábil (integracao-vistorias-provisionamento.ts).
-- Uma linha por tentativa de sincronização (não por vistoria): sincronizarVistoriaConcluidaParaProvisionamento
-- insere uma nova linha a cada chamada (sucesso, sem danos ou erro), preservando o histórico
-- de tentativas — quem quer o estado atual lê a mais recente por vistoria_id (ORDER BY
-- criado_em DESC LIMIT 1, como obterStatusProvisionamento e validarConsistenciaVistoriaProvisionamento já fazem).
CREATE TABLE IF NOT EXISTS provisionamento_vistoria_log (
    id                          INTEGER PRIMARY KEY,
    vistoria_id                 INTEGER NOT NULL REFERENCES vistorias(id),
    imovel_id                   INTEGER,
    contrato_id                 INTEGER,
    status                      TEXT NOT NULL CHECK (status IN ('nao_requer', 'pendente', 'provisionado', 'revertido', 'erro')),
    valor_danos_estimado        REAL NOT NULL DEFAULT 0,
    valor_provision_registrada  REAL NOT NULL DEFAULT 0,
    valor_desconto_caucao       REAL NOT NULL DEFAULT 0,
    referencia_documento        TEXT,
    criado_em                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    criado_por                  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_vistorias_imovel ON vistorias(imovel_id);
CREATE INDEX IF NOT EXISTS idx_vistorias_contrato ON vistorias(contrato_id);
CREATE INDEX IF NOT EXISTS idx_vistorias_status ON vistorias(status);
CREATE INDEX IF NOT EXISTS idx_vistoria_item_vistoria ON vistoria_item(vistoria_id);
CREATE INDEX IF NOT EXISTS idx_vistoria_anexo_vistoria ON vistoria_anexo(vistoria_id);
CREATE INDEX IF NOT EXISTS idx_vistoria_log_vistoria ON vistoria_log(vistoria_id);
CREATE INDEX IF NOT EXISTS idx_provisionamento_vistoria_log_vistoria ON provisionamento_vistoria_log(vistoria_id);

-- Gestão operacional do imóvel: cadastro de inquilino e agenda de manutenção — o gap
-- identificado em docs/dominios-a-reconstruir.md (seção 3): o app já concilia o financeiro
-- do imóvel (contratos_locacao, vistorias), mas não tinha onde guardar quem mora lá nem
-- quando a próxima manutenção está marcada. Ver src/domain/erp/gestaoOperacionalImovel.ts.
--
-- DECISÃO (não recriar imovel_documentos): `documentos` (tipo, arquivo_nome, valor,
-- data_documento, cnpj_cpf_contraparte, nome_contraparte, criado_em) + `documento_imoveis`
-- (vínculo N:N com percentual) já cobrem "documento do imóvel" (escritura, IPTU, contrato de
-- obra etc. — sob tipo 'outro' ou 'contrato' quando cabível): o mesmo cadastro de documento já
-- usado para boleto/nota fiscal, sem duplicar uma segunda tabela de documento só para imóvel.
-- A única capacidade que o módulo apagado tinha e que não é reconstruída aqui é
-- data_vencimento/status ('vigente'/'expirado') por documento — `documentos` não tem essa
-- coluna hoje — deliberadamente fora de escopo desta tarefa (só inquilinos e manutenções foram
-- pedidos); pode ser acrescentada depois como colunas opcionais em `documentos` se o produto
-- precisar de alerta de vencimento de documento, sem precisar de tabela nova.
--
-- DECISÃO (não recriar despesas_operacionais_agendadas): já resolvida em
-- dashboard-portfolio.ts — despesa operacional agendada do imóvel é uma linha de
-- `contas_a_pagar` com `imovel_id` preenchido e `data_vencimento` futura.
CREATE TABLE IF NOT EXISTS inquilinos (
    id              INTEGER PRIMARY KEY,
    imovel_id       INTEGER NOT NULL REFERENCES imoveis(id),
    nome            TEXT NOT NULL,
    cpf_cnpj        TEXT,
    telefone        TEXT,
    email           TEXT,
    -- Contrato vigente deste inquilino, quando já identificado — opcional porque o
    -- cadastro do inquilino pode ser feito antes do contrato (ex: pré-cadastro) ou o
    -- inquilino pode não ter contrato individual (ex: responsável solidário já coberto
    -- por contrato_locatarios). Histórico de inquilinos passados do mesmo imóvel continua
    -- rastreável (várias linhas por imovel_id ao longo do tempo); "quem mora lá hoje" é
    -- inferido pelo contrato ligado estar vigente (data_fim nulo ou futura), não por uma
    -- coluna de status própria.
    contrato_id     INTEGER REFERENCES contratos_locacao(id),
    observacoes     TEXT,
    criado_em       DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_inquilinos_imovel ON inquilinos(imovel_id);
CREATE INDEX IF NOT EXISTS idx_inquilinos_contrato ON inquilinos(contrato_id);

CREATE TABLE IF NOT EXISTS manutencoes (
    id              INTEGER PRIMARY KEY,
    imovel_id       INTEGER NOT NULL REFERENCES imoveis(id),
    tipo            TEXT NOT NULL,               -- ex: "elétrica", "hidráulica", "pintura"
    descricao       TEXT NOT NULL,
    data_agendada   DATE NOT NULL,
    data_conclusao  DATE,                        -- preenchida só ao concluir
    custo           REAL CHECK (custo IS NULL OR custo >= 0),
    status          TEXT NOT NULL DEFAULT 'agendada' CHECK (status IN ('agendada', 'em_andamento', 'concluida', 'cancelada')),
    prestador_id    INTEGER REFERENCES prestadores(id),
    observacoes     TEXT,
    criado_em       DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_manutencoes_imovel_status ON manutencoes(imovel_id, status, data_agendada);
CREATE INDEX IF NOT EXISTS idx_manutencoes_prestador ON manutencoes(prestador_id);

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
    -- email/telefone adicionados para notificação de cobrança/comunicado (decisão do
    -- usuário, 2026-10) — faltavam aqui porque esta tabela nunca precisou de contato
    -- direto antes (processos_legais sempre referenciava por nome dentro de partes_processo).
    telefone        TEXT,
    email           TEXT,
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
    -- ACHADO (auditoria de execução, alocacao-centros-custo.test.ts): o CHECK original
    -- dizia 'imavel' (erro de digitação — não é palavra nem convenção usada em nenhum
    -- outro lugar do sistema). criarCentroCustoImovel() sempre gravou tipo='imovel'
    -- (grafia correta, igual à tabela `imoveis`, à coluna `imovel_id` e ao tipo
    -- TypeScript `CentroCustoInfo.tipo`) — toda chamada rejeitada pelo CHECK, contra o
    -- schema real. Só não estourava porque nenhum teste chegou a rodar essa função
    -- contra `criarBancoDeTeste()` antes desta auditoria.
    tipo            TEXT NOT NULL CHECK (tipo IN ('imovel', 'administrativo', 'operacional')),
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
        'fisco',                -- Provisão/pagamento de imposto (integracao-fisco.ts) — faltava
                                -- aqui: registrarImpostoNoLedger gravava 'fisco' e todo INSERT
                                -- quebrava contra o schema real (CHECK constraint failed), o
                                -- mesmo defeito que os sete módulos acima já tiveram (ver
                                -- comentário de origem_modulo em ledger.ts).
        'inadimplencia_juros',  -- Provisão de juros/multa de mora + perda esperada sobre ela
                                -- (provisarJurosMora/reverterProvisaoJurosMora,
                                -- integracao-inadimplencia.ts) — origem_id é o id da
                                -- competência (aluguel_competencias.id), não do contrato.
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

    -- O vínculo inverso: se ESTA linha é um estorno, qual lançamento ela reverte.
    -- Não é redundante com estornado_por_id: é o que distingue, na hora do INSERT, uma
    -- reversão deliberada de uma reimportação duplicada — ver o índice parcial abaixo.
    estorno_de_id       INTEGER REFERENCES ledger_entries(id),

    -- A unicidade por (origem_modulo, origem_id, conta_id) NÃO é uma constraint de tabela:
    -- é o índice parcial idx_ledger_origem_unica, logo abaixo. Ver o comentário dele.
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
    observacoes     TEXT,
    -- Selo encadeado: hash_lancamentos cobre os LANÇAMENTOS do período (não só os saldos);
    -- hash_selo = SHA256(hash_anterior|periodo_id|hash_lancamentos|hash_snapshot) e hash_anterior é o
    -- selo do encerramento anterior da mesma entidade ('GENESIS' no primeiro). Alterar qualquer
    -- período passado quebra a cadeia dali para a frente (ver verificarSelosLedger em ledger.ts).
    hash_lancamentos TEXT,
    hash_anterior    TEXT,
    hash_selo        TEXT
);

-- REMOVIDA: `regras_contabilizacao` (mapeamento módulo/operação → conta débito/crédito).
-- Tabela morta — nunca teve uma linha de código lendo ou escrevendo nela
-- (`grep -rn "regras_contabilizacao" src/` não retorna nada). O mapeamento que ela
-- deveria tornar configurável existe de fato, mas hardcoded em
-- src/domain/erp/mapeamentoPlanoApp.ts (MAPA_APP_PARA_ERP): ~32 entradas fixas,
-- código do plano do app → conta de contrapartida no razão, consumidas por 6+ módulos
-- (livroRazao, reclassificarTransacao, contasAPagar, migracao-ledger, aluguel-competencias).
-- Tornar isso configurável via banco exigiria bem mais que criar a tabela: trocar toda
-- leitura síncrona de MAPA_APP_PARA_ERP por consulta ao banco (ou cache invalidável) em
-- cada um desses call sites, decidir fallback quando uma regra não existir (hoje é
-- CONTA_CLASSIFICACAO_PENDENTE, comportamento que precisaria sobreviver), migrar as ~32
-- linhas hardcoded como seed, e alguma tela de administração para editar regra por
-- entidade/módulo/operação sem quebrar a paridade débito=crédito. Isso é trabalho de
-- verdade, não uma tarefa de <1h — fica como recomendação futura, não implementada aqui.
--
-- Índices para o ledger (performance crítica)
CREATE INDEX IF NOT EXISTS idx_ledger_periodo ON ledger_entries(periodo_id);
CREATE INDEX IF NOT EXISTS idx_ledger_conta ON ledger_entries(conta_id);
CREATE INDEX IF NOT EXISTS idx_ledger_data ON ledger_entries(data_lancamento);
CREATE INDEX IF NOT EXISTS idx_ledger_origem ON ledger_entries(origem_modulo, origem_id);

-- Unicidade da origem: no máximo UMA perna VIVA por (documento de origem, conta).
--
-- Histórico, porque as duas versões anteriores estavam erradas de formas diferentes:
--   1ª) UNIQUE (origem_modulo, origem_id) — só deixava passar UMA linha por documento.
--       A contrapartida da partida dobrada era impossível; nenhum período fechava.
--   2ª) UNIQUE (origem_modulo, origem_id, conta_id) como constraint de tabela — liberou a
--       partida dobrada, mas quebrou TODO estorno: estornarLancamento() copia
--       origem_modulo, origem_id E conta_id do original para a reversão, exatamente a
--       tripla da chave. Toda chamada morria com "UNIQUE constraint failed", nas duas
--       pernas. Comprovado em ledger-estorno.test.ts, que existe para não voltar a passar.
--
-- A versão atual indexa a mesma tripla, mas só as linhas VIVAS: nem a reversão em si
-- (estorno_de_id IS NOT NULL) nem o original já revertido (estornado_por_id IS NOT NULL)
-- entram no índice. Isso preserva o objetivo original — barrar reimportação duplicada da
-- mesma transação na mesma conta — e ao mesmo tempo permite as duas operações contábeis
-- que a constraint anterior proibia: estornar, e RELANÇAR na conta certa depois de
-- estornar (o caso de reclassificação, em que a perna de caixa volta na mesma conta).
-- 'manual' fica FORA deste índice: é lançamento avulso de ajuste/acerto, sem origem_id
-- que identifique um registro de negócio real a deduplicar — a tripla
-- (origem_modulo='manual', origem_id, conta_id) não representa "reimportação da mesma
-- operação" como representa para os módulos automatizados (transacoes, contratos etc.);
-- forçar unicidade nela impede o caso legítimo de duas linhas manuais distintas (ex.:
-- entrada de caixa e depois uma saída de caixa) tocarem a mesma conta sob o mesmo lote.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_origem_unica
    ON ledger_entries(origem_modulo, origem_id, conta_id)
    WHERE estorno_de_id IS NULL AND estornado_por_id IS NULL AND origem_modulo != 'manual';
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

-- ============================================================================
-- CONTAS A PAGAR (src/domain/contasAPagar/contasAPagar.ts)
-- ============================================================================
-- Obrigação de pagar um fornecedor, com vencimento, antes de ter sido paga (baixada) —
-- o padrão "aging de contas a pagar" que qualquer ERP de referência (Oracle, Xero,
-- AppFolio) cobre e que faltava por completo: `documentos` já carrega quem cobra e
-- quanto (valor, cnpj_cpf_contraparte, nome_contraparte), mas não tem vencimento nem
-- status de pagamento — é exatamente essa lacuna que esta tabela fecha.
--
-- `documento_id` é opcional de propósito: pode existir uma obrigação de pagar sem
-- documento formal ainda anexado (ex: acordo verbal com prestador, aguardando nota
-- fiscal) — quando o documento chega depois, o vínculo é preenchido por UPDATE, não por
-- recriação da linha.
--
-- `status` guarda só o que é FATO ('pendente', 'paga', 'cancelada') — 'atrasada' está no
-- CHECK só para documentar o domínio completo da coluna, mas nunca é gravado: é
-- CALCULADO em tempo de consulta (hoje > data_vencimento e status ainda 'pendente'), no
-- mesmo espírito de `rateios.base_incompleta`/`caucoes` — nunca fabricar ou congelar um
-- dado que muda sozinho com o calendário. Ver listarContasAPagar()/gerarRelatorioAging().
--
-- `ledger_entry_id_baixa` só é preenchido na baixa (pagamento) — é a prova de que a baixa
-- virou um lançamento real no razão (`ledger_entries`), nunca uma tabela paralela
-- desconectada da contabilidade de verdade. A baixa reusa a MESMA rota que uma transação
-- bancária importada usaria (`registrarLancamentoContabil` com origem_modulo='transacoes'
-- sobre uma linha nova em `transacoes`, ver contasAPagar.ts) — por isso não existe aqui
-- nenhum novo valor de origem_modulo: a baixa É uma transação bancária de saída como
-- qualquer outra, só que originada por uma obrigação já conhecida em vez de um extrato
-- importado depois.
CREATE TABLE IF NOT EXISTS contas_a_pagar (
    id                  INTEGER PRIMARY KEY,
    entidade_id         INTEGER NOT NULL REFERENCES entidades_legais(id),
    documento_id        INTEGER REFERENCES documentos(id),
    fornecedor_nome     TEXT NOT NULL,
    fornecedor_cnpj_cpf TEXT,
    descricao           TEXT,
    valor               REAL NOT NULL CHECK (valor > 0),
    data_vencimento     DATE NOT NULL,
    data_pagamento      DATE,               -- NULL até ser paga
    status              TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'paga', 'atrasada', 'cancelada')),
    plano_conta_codigo  TEXT REFERENCES plano_de_contas(codigo),  -- em que despesa isso vira quando pago
    imovel_id           INTEGER REFERENCES imoveis(id),           -- NULL = despesa não ligada a um imóvel específico
    -- Despesa jurídica vinculada a um processo (advocacia) — NULL = despesa não ligada a
    -- processo. Ver bloco "ADVOCACIA: PROCESSOS E PARTES" no final deste arquivo: não existe
    -- `despesas_legais` própria, a despesa jurídica é uma linha comum desta tabela.
    processo_id         INTEGER REFERENCES processos_legais(id),
    ledger_entry_id_baixa INTEGER REFERENCES ledger_entries(id),  -- preenchido só na baixa
    criado_em           DATE NOT NULL
);

-- Consulta mais comum: aging report de uma entidade, filtrado/ordenado por status e
-- vencimento.
CREATE INDEX IF NOT EXISTS idx_contas_a_pagar_entidade_status_venc ON contas_a_pagar(entidade_id, status, data_vencimento);
CREATE INDEX IF NOT EXISTS idx_contas_a_pagar_processo ON contas_a_pagar(processo_id);

-- Sugestão de classificação de transação por IA — camada A MAIS sobre a classificação
-- determinística (regras_categorizacao) e a manual (TransacoesView.categorizar), NUNCA uma
-- substituição delas: para uma transação sem plano_conta_codigo que nenhuma regra salva
-- capturou, a IA propõe um código do plano_de_contas com confiança e explicação
-- (ver src/domain/categorize/sugestaoClassificacaoIA.ts), e um humano aceita ou rejeita.
-- REGRA DE OURO deste sistema, sem exceção aqui: IA nunca escreve direto no razão nem
-- classifica uma transação sozinha — aceitar passa por reclassificarTransacao (estorno +
-- relançamento no razão quando aplicável), exatamente como uma reclassificação manual.
--
-- pergunta_para_decisao é preenchida só quando a própria IA não consegue decidir sozinha
-- (duas classificações plausíveis, contraparte desconhecida, valor atípico para o padrão da
-- conta) e formula uma pergunta objetiva para o humano — é uma DECISÃO explicitamente pedida,
-- não uma sugestão de confiança baixa escondida atrás de um código qualquer.
--
-- UNIQUE(transacao_id): só a sugestão mais recente por transação faz sentido manter viva —
-- gerar uma nova sugestão para uma transação que já tinha uma (ex: uma rejeitada
-- anteriormente) SUBSTITUI a linha em vez de acumular histórico ali (o histórico de
-- PROVENIÊNCIA de cada chamada de IA que já rodou continua intacto em ia_chamadas, nunca
-- apagado — só a "sugestão viva" por transação é sempre uma só).
CREATE TABLE IF NOT EXISTS sugestoes_classificacao_ia (
    id                              INTEGER PRIMARY KEY,
    transacao_id                    INTEGER NOT NULL REFERENCES transacoes(id),
    plano_conta_codigo_sugerido     TEXT REFERENCES plano_de_contas(codigo), -- NULL quando a IA não teve segurança para sugerir nenhum código (ver pergunta_para_decisao)
    confianca                       TEXT NOT NULL CHECK (confianca IN ('alta', 'media', 'baixa')),
    explicacao                      TEXT NOT NULL,               -- justificativa curta do porquê (auditável — "a IA achou" nunca é suficiente)
    pergunta_para_decisao           TEXT,                         -- preenchida só em caso genuinamente ambíguo — ver comentário acima
    -- Proveniência: qual chamada de IA (ia_chamadas acima) produziu esta sugestão. Sem
    -- FOREIGN KEY de propósito, mesmo motivo de ia_chamadas.documento_id/transacao_id: não
    -- deve travar em cascata se o histórico de chamadas for manipulado por outra via.
    ia_chamada_id                   INTEGER,
    status                          TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aceita', 'rejeitada')),
    criado_em                       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decidido_em                     DATETIME,
    decidido_por                    INTEGER,                      -- usuario_id de quem aceitou/rejeitou (aceitarSugestao/rejeitarSugestao)
    UNIQUE (transacao_id)
);

CREATE INDEX IF NOT EXISTS idx_sugestoes_classificacao_ia_status ON sugestoes_classificacao_ia(status);

-- Competência de aluguel: uma linha por MÊS DEVIDO de cada contrato de locação — o espelho,
-- do lado da RECEITA, do que `contas_a_pagar` já resolveu para o lado da despesa (ver o
-- comentário completo daquela tabela acima). Existe porque `integracao-inadimplencia.ts`
-- (apurarInadimplenciaContrato) recalculava o vencimento a partir do MÊS DA PRÓPRIA data de
-- referência a cada chamada, em vez de fixá-lo no mês em que a inadimplência de fato
-- começou — resultado: `dias_atraso` nunca ultrapassava ~30 dias, tornando os estados
-- em_cobranca/litigioso IMPOSSÍVEIS de produzir, para qualquer entrada (ver o `it.fails`
-- correspondente em integracao-inadimplencia.test.ts). Aqui, cada competência tem seu
-- PRÓPRIO vencimento — fixado uma vez, na geração (gerarCompetenciasPendentes), nunca
-- recalculado depois — e seu próprio status de recebimento, agregável em aging por
-- contrato exatamente como gerarRelatorioAging() faz para contas_a_pagar. Ver
-- src/domain/erp/aluguel-competencias.ts.
--
-- `imovel_id` é herdado do contrato (contratos_locacao.imovel_id) e duplicado aqui de
-- propósito, não por normalização ruim — mesmo motivo de contas_a_pagar.imovel_id: consulta
-- direta por imóvel sem precisar de JOIN em contratos_locacao.
--
-- `status` só grava o que é FATO: 'pendente', 'recebido' ou 'cancelado' (competência
-- anulada — ex.: contrato encerrado antes do mês vencer). 'atrasado' NUNCA é gravado aqui —
-- é sempre CALCULADO comparando `data_vencimento` com uma data de referência, mesmo
-- espírito de contas_a_pagar.status (nunca congelar um dado que muda sozinho com o
-- calendário).
--
-- `ledger_entry_id_baixa` só é preenchida na baixa (recebimento) — prova de que o
-- recebimento virou um lançamento real no razão (baixarCompetencia), pela MESMA rota que
-- `baixarContaAPagar` usa (nova linha em `transacoes` + duas pernas via
-- registrarLancamentoContabil com origem_modulo='transacoes'), só que invertida: débito em
-- Caixa (entrada) e crédito em Receita de Aluguel, não o contrário.
--
-- UNIQUE(contrato_id, ano, mes): uma competência por contrato por mês, nunca duplicada —
-- é o que torna gerarCompetenciasPendentes() idempotente por construção.
CREATE TABLE IF NOT EXISTS aluguel_competencias (
    id                      INTEGER PRIMARY KEY,
    contrato_id             INTEGER NOT NULL REFERENCES contratos_locacao(id),
    imovel_id               INTEGER NOT NULL REFERENCES imoveis(id),
    ano                     INTEGER NOT NULL,
    mes                     INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
    data_vencimento         DATE NOT NULL,          -- vencimento REAL daquele mês; fixado na geração, nunca recalculado
    valor_devido            REAL NOT NULL CHECK (valor_devido > 0),
    data_recebimento        DATE,                   -- NULL até ser recebida
    status                  TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'recebido', 'cancelado')),
    ledger_entry_id_baixa   INTEGER REFERENCES ledger_entries(id),  -- preenchido só na baixa
    criado_em               DATE NOT NULL,
    UNIQUE (contrato_id, ano, mes)
);

-- Consulta mais comum: aging de um contrato, filtrado/ordenado por status e vencimento —
-- mesmo padrão de idx_contas_a_pagar_entidade_status_venc.
CREATE INDEX IF NOT EXISTS idx_aluguel_competencias_contrato_status_venc ON aluguel_competencias(contrato_id, status, data_vencimento);

-- ============================================================================
-- LGPD: DIREITOS DO TITULAR (src/domain/lgpd/direitosTitular.ts)
-- ============================================================================
-- Reconstrução do domínio apagado (`compliance-lgpd.ts`) que não tinha tabela nem teste
-- contra nada real (ver docs/dominios-a-reconstruir.md, seção 6). Aqui a solicitação do
-- titular (art. 18 da Lei 13.709/2018) fica registrada com o resultado de fato aplicado —
-- não um checklist solto, mas uma linha por pedido, rastreável.
CREATE TABLE IF NOT EXISTS solicitacoes_lgpd (
    id                  INTEGER PRIMARY KEY,
    titular_nome        TEXT NOT NULL,
    titular_cpf         TEXT NOT NULL,
    tipo                TEXT NOT NULL CHECK (tipo IN ('acesso', 'portabilidade', 'exclusao', 'correcao')),
    status              TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'atendida', 'recusada')),
    data_solicitacao    TEXT NOT NULL,      -- timestamp ISO 8601 completo
    data_atendimento    TEXT,               -- NULL até atender (aceita ou recusada) — mesmo padrão de data_recebimento em aluguel_competencias
    -- Só recusa que carregue O PORQUÊ: uma solicitação de exclusão negada por retenção
    -- legal ativa (Lei 6404/76 — ver auditoria_log.retencao_ate) precisa do motivo
    -- explícito, nunca um "não" silencioso.
    motivo_recusa       TEXT,
    detalhes            TEXT,               -- o que foi pedido/encontrado/feito — corpo da resposta ao titular
    CHECK (motivo_recusa IS NULL OR status = 'recusada'),
    CHECK ((status = 'pendente') = (data_atendimento IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_lgpd_titular_cpf ON solicitacoes_lgpd(titular_cpf);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_lgpd_status ON solicitacoes_lgpd(status);

-- ============================================================================
-- LGPD: REGISTRO DE POLÍTICA DE ROTAÇÃO DE CHAVE (src/domain/lgpd/rotacaoChave.ts)
-- ============================================================================
-- ATENÇÃO — o que esta tabela NÃO é: não há aqui execução de criptografia de arquivo
-- nenhuma, porque este app roda 100% no navegador (sql.js/IndexedDB, sem backend) e não
-- tem onde guardar uma chave de encriptação com segurança — a mesma limitação já
-- documentada em src/domain/erp/compliance-audit-log.ts sobre o segredo de assinatura
-- HMAC (quem abre o DevTools lê qualquer coisa guardada no cliente). Isto é só o REGISTRO
-- de auditoria/política de que uma rotação de chave (de um sistema de criptografia real,
-- quando o produto for para trás de um backend de verdade) aconteceu — quem, quando, por
-- quê. A criptografia de dados em repouso em si é responsabilidade da infraestrutura
-- (Postgres/Supabase), nunca deste módulo client-side.
CREATE TABLE IF NOT EXISTS politica_rotacao_chave (
    id                      INTEGER PRIMARY KEY,
    data_rotacao            TEXT NOT NULL,      -- timestamp ISO 8601 completo
    responsavel             TEXT NOT NULL,
    motivo                  TEXT NOT NULL,
    -- Hash da chave ANTERIOR (nunca a chave em si) — só para referência/auditoria, prova
    -- de que a rotação trocou de fato a chave sem expor qual era.
    chave_anterior_hash     TEXT NOT NULL,
    observacoes             TEXT
);

CREATE INDEX IF NOT EXISTS idx_politica_rotacao_chave_data ON politica_rotacao_chave(data_rotacao);

-- ============================================================================
-- CONTAS PESSOAIS — segregação patrimonial PF x sociedade de fato
-- (docs/dominios-a-reconstruir.md, seção 2). Reconstrução do zero: os módulos
-- antigos (`contas-pessoais.ts` e primos) escreviam em tabelas que nunca
-- existiram neste schema. `contas_bancarias` (topo do arquivo) são todas da
-- ENTIDADE — nada até agora distinguia dinheiro da pessoa física do dinheiro
-- da atividade, que é exatamente o que perícia contábil de confusão
-- patrimonial cobra. Lógica de escrita em
-- src/domain/contasPessoais/contasPessoais.ts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pessoas (
    id              INTEGER PRIMARY KEY,
    nome            TEXT NOT NULL,
    cpf             TEXT,
    -- Papel da pessoa em relação à entidade/atividade — não é "quem é o
    -- titular do sistema" (isso é entidades_legais), é "por que essa conta
    -- pessoal aparece aqui": o próprio titular ('titular'), um sócio de fato
    -- da sociedade não-formalizada, um familiar cuja conta às vezes recebe/
    -- envia dinheiro da atividade (comum em confusão patrimonial de fato), ou
    -- 'outro' para qualquer caso não previsto.
    tipo_relacao    TEXT NOT NULL CHECK (tipo_relacao IN ('titular', 'socio', 'familiar', 'outro')),
    observacoes     TEXT,
    criado_em       DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_pessoas_tipo_relacao ON pessoas(tipo_relacao);

-- Conta bancária da PESSOA FÍSICA, nunca da entidade — diferença deliberada
-- de `contas_bancarias` (que são todas da atividade/entidade hoje). Sem
-- UNIQUE (banco, agencia, numero) global como em contas_bancarias: a mesma
-- conta bancária real nunca deveria aparecer nas duas tabelas ao mesmo
-- tempo, mas isso é responsabilidade de quem cadastra — cruzar UNIQUE entre
-- duas tabelas diferentes não é possível em SQL puro sem trigger, e não foi
-- criado um aqui.
CREATE TABLE IF NOT EXISTS contas_pessoais (
    id              INTEGER PRIMARY KEY,
    pessoa_id       INTEGER NOT NULL REFERENCES pessoas(id),
    banco           TEXT NOT NULL,
    agencia         TEXT,
    numero          TEXT NOT NULL,
    tipo            TEXT NOT NULL CHECK (tipo IN ('corrente', 'poupanca', 'investimento')),
    observacoes     TEXT,
    criado_em       DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_contas_pessoais_pessoa ON contas_pessoais(pessoa_id);

-- Movimento de uma conta pessoal. `valor` é assinado: positivo = dinheiro
-- ENTRANDO na conta pessoal, negativo = SAINDO dela.
--
-- `transferencia_entidade_id` é o ponto sensível de segregação patrimonial:
-- quando o movimento é uma transferência de/para a entidade (aporte de
-- capital, retirada de capital, empréstimo de sócio ou sua devolução — ver
-- `categoria` abaixo e `registrarMovimentoPessoal` em
-- src/domain/contasPessoais/contasPessoais.ts), este campo aponta para o
-- lançamento espelho em `ledger_entries` do lado da entidade. Um movimento
-- com categoria de transferência e este campo NULO é uma transferência
-- ÓRFÃ — dinheiro que "aparece" de um lado só, sem contrapartida contábil
-- rastreável do lado da entidade; é exatamente o que
-- `relatorioSegregacaoPatrimonial` audita.
CREATE TABLE IF NOT EXISTS movimentos_pessoais (
    id                          INTEGER PRIMARY KEY,
    conta_pessoal_id            INTEGER NOT NULL REFERENCES contas_pessoais(id),
    data                        DATE NOT NULL,
    valor                       REAL NOT NULL CHECK (valor <> 0),
    descricao                   TEXT NOT NULL,
    -- Categoria livre para movimento comum (ex: 'salario', 'alimentacao'); as
    -- quatro categorias reservadas ('aporte_capital', 'retirada_capital',
    -- 'emprestimo_socio', 'devolucao_emprestimo' — ver
    -- CATEGORIAS_TRANSFERENCIA_ENTIDADE em contasPessoais.ts) MARCAM o
    -- movimento como transferência com a entidade. Não é ENUM/CHECK fechado
    -- de propósito: um valor livre continua sendo só uma etiqueta de
    -- relatório; as quatro reservadas é que carregam significado contábil.
    categoria                   TEXT,
    transferencia_entidade_id   INTEGER REFERENCES ledger_entries(id),
    criado_em                   DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_movimentos_pessoais_conta_data ON movimentos_pessoais(conta_pessoal_id, data);
CREATE INDEX IF NOT EXISTS idx_movimentos_pessoais_categoria ON movimentos_pessoais(categoria);

-- ============================================================================
-- OPEN BANKING / PAGAMENTOS INICIADOS (src/domain/pagamentos/pagamentosIniciados.ts)
-- ============================================================================
-- Pagamento eletrônico (PIX/TED/DOC) INICIADO pelo app — modela só o STATUS do pagamento
-- (solicitado → confirmado/falhou → conciliado), não uma integração real com API bancária
-- de pagamento. Hoje o app só IMPORTA extrato (OFX/Pluggy, ver src/domain/importacao/); não
-- existe aqui nenhuma chamada de rede a provedor nenhum. `confirmarPagamento()` é o PONTO DE
-- ENTRADA para quando uma integração real existir: uma função que RECEBE a confirmação do
-- provedor e atualiza o status, nunca uma que liga para fora (ver
-- src/domain/pagamentos/pagamentosIniciados.ts).
--
-- `contas_a_pagar_id` é opcional: um pagamento pode ser a baixa de uma obrigação já
-- registrada (contas_a_pagar) ou avulso (ex.: pagamento pontual sem obrigação prévia). Ao
-- contrário da baixa de contas_a_pagar (que já grava direto em `transacoes` e no razão, ver
-- comentário daquela tabela), este pagamento NÃO lança no razão sozinho — ele só descreve a
-- intenção e o status de um PIX/TED/DOC. O lançamento contábil de fato só acontece quando o
-- extrato bancário real for importado e a transação resultante for conciliada aqui
-- (`transacao_id`), fechando o ciclo por triagem/aprovação como qualquer outra transação
-- (ver src/domain/importacao/triagem.ts) — nunca automaticamente.
--
-- `destinatario_chave_pix` só faz sentido para tipo='pix' — CHECK abaixo recusa gravar chave
-- em TED/DOC. `motivo_falha` só é gravado quando status='falhou' — mesmo princípio de nunca
-- congelar um dado que não corresponde ao status atual (ver contas_a_pagar.status).
--
-- `status`: 'solicitado' (registrado, nada confirmado ainda) → 'confirmado' (provedor real
-- confirmou que o pagamento saiu) OU 'falhou' (provedor recusou/reverteu) → 'conciliado'
-- (a transação bancária correspondente apareceu no extrato importado e foi confirmada
-- manualmente — NUNCA automática, mesma regra de ouro de documento_transacoes.status).
CREATE TABLE IF NOT EXISTS pagamentos_iniciados (
    id                      INTEGER PRIMARY KEY,
    entidade_id             INTEGER NOT NULL REFERENCES entidades_legais(id),
    conta_bancaria_id       INTEGER NOT NULL REFERENCES contas_bancarias(id), -- de onde sai o dinheiro
    tipo                    TEXT NOT NULL CHECK (tipo IN ('pix', 'ted', 'doc')),
    valor                   REAL NOT NULL CHECK (valor > 0),
    destinatario_nome       TEXT NOT NULL,
    destinatario_documento  TEXT NOT NULL,          -- CPF ou CNPJ do destinatário
    destinatario_chave_pix  TEXT,                   -- só preenchida quando tipo='pix'
    status                  TEXT NOT NULL DEFAULT 'solicitado' CHECK (status IN ('solicitado', 'confirmado', 'falhou', 'conciliado')),
    contas_a_pagar_id       INTEGER REFERENCES contas_a_pagar(id), -- opcional: baixa de obrigação já registrada
    data_solicitacao        DATE NOT NULL,
    data_confirmacao        DATE,                   -- NULL até confirmado pelo provedor
    motivo_falha            TEXT,                   -- NULL a menos que status='falhou'
    transacao_id            INTEGER REFERENCES transacoes(id), -- preenchido só na conciliação com o extrato importado
    CHECK (destinatario_chave_pix IS NULL OR tipo = 'pix'),
    CHECK (motivo_falha IS NULL OR status = 'falhou')
);

-- Consulta mais comum: relatório de pagamentos pendentes de uma entidade (solicitados ou
-- confirmados, ainda não conciliados) — mesmo padrão de idx_contas_a_pagar_entidade_status_venc.
CREATE INDEX IF NOT EXISTS idx_pagamentos_iniciados_entidade_status ON pagamentos_iniciados(entidade_id, status, data_solicitacao);

-- ============================================================================
-- ADVOCACIA: PROCESSOS E PARTES (src/domain/advocacia/advocacia.ts)
-- ============================================================================
-- Reconstrução do domínio de advocacia apagado por escrever em tabelas fictícias
-- (`processos_legais`/`despesas_legais` citadas em rls.postgres.sql linha ~318 nunca
-- existiram de verdade neste schema — ver docs/dominios-a-reconstruir.md, seção 1).
--
-- DECISÃO DE DESENHO (por que não existe `despesas_legais` própria): a despesa jurídica
-- É uma obrigação com fornecedor, valor e vencimento — exatamente o que `contas_a_pagar`
-- já resolve (aging, baixa via `registrarLancamentoContabil`, status calculado). Criar
-- `despesas_legais` duplicaria esse controle de vencimento/baixa inteiro só para trocar o
-- rótulo. Em vez disso, `contas_a_pagar` ganhou `processo_id` (ver a coluna, acima, no
-- bloco CONTAS A PAGAR): uma despesa jurídica é uma linha comum de `contas_a_pagar` com
-- `processo_id` preenchido e `plano_conta_codigo` tipicamente '2.1.11' (Advocacia —
-- honorários e despesas jurídicas, que já mapeia para 6.3.01 Honorários advocatícios no
-- razão — ver mapeamentoPlanoApp.ts). Isso também reaproveita de graça o aging/parcelamento
-- (várias linhas de contas_a_pagar com o mesmo processo_id) sem nenhuma tabela ou lógica de
-- vencimento nova.
CREATE TABLE IF NOT EXISTS processos_legais (
    id                  INTEGER PRIMARY KEY,
    entidade_id         INTEGER NOT NULL REFERENCES entidades_legais(id),
    numero_processo     TEXT,          -- NULL até ser protocolado (ex: processo em fase de estudo)
    tipo                TEXT NOT NULL CHECK (tipo IN ('civel', 'trabalhista', 'tributario', 'outro')),
    vara_comarca        TEXT,
    status              TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'suspenso', 'encerrado', 'arquivado')),
    valor_causa         REAL CHECK (valor_causa IS NULL OR valor_causa >= 0),
    data_distribuicao   DATE,
    data_encerramento   DATE,          -- NULL até encerrar
    resultado           TEXT,          -- texto livre; NULL até encerrar
    observacoes         TEXT,
    criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_processos_legais_entidade_status ON processos_legais(entidade_id, status);

-- Parte do processo: quem move ou é movido (autor/réu) e eventual terceiro interessado.
-- `representado_por_nos` é o que distingue "nosso cliente" da parte contrária — sem essa
-- coluna, uma consulta não teria como saber de que lado do processo a entidade está.
CREATE TABLE IF NOT EXISTS partes_processo (
    id                      INTEGER PRIMARY KEY,
    processo_id             INTEGER NOT NULL REFERENCES processos_legais(id),
    papel                   TEXT NOT NULL CHECK (papel IN ('autor', 'reu', 'terceiro_interessado')),
    nome                    TEXT NOT NULL,
    cpf_cnpj                TEXT,
    representado_por_nos    INTEGER NOT NULL DEFAULT 0 CHECK (representado_por_nos IN (0, 1)),
    criado_em               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_partes_processo_processo ON partes_processo(processo_id);

-- =====================================================================================
-- ORDENS DE SERVIÇO — fluxo de manutenção/reparo com aprovação por alçada
-- =====================================================================================
-- Auditoria comparativa com um ERP de referência (CRMT — ver docs/): lá, toda despesa de
-- ordem de serviço acima de um limite exige DOIS aprovadores distintos (quórum) antes de
-- virar título financeiro. `gestaoOperacionalImovel.ts` só tinha manutenção agendada
-- simples, sem workflow de aprovação nem trilha de eventos — este bloco formaliza isso.
CREATE TABLE IF NOT EXISTS ordens_servico (
    id                  INTEGER PRIMARY KEY,
    imovel_id           INTEGER NOT NULL REFERENCES imoveis(id),
    prestador_id        INTEGER REFERENCES prestadores(id),         -- NULL até atribuir
    origem_vistoria_id  INTEGER REFERENCES vistorias(id),           -- NULL = criada manualmente, não a partir de diferença de vistoria
    titulo              TEXT NOT NULL,
    descricao           TEXT,
    prioridade          TEXT NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('baixa', 'normal', 'alta', 'urgente')),
    status              TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'atribuida', 'em_andamento', 'concluida', 'impedida', 'cancelada')),
    sla_data_limite     DATE,
    criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    encerrado_em        DATETIME
);

CREATE INDEX IF NOT EXISTS idx_ordens_servico_imovel_status ON ordens_servico(imovel_id, status);

-- Trilha append-only de eventos (atribuição/aceite/início/progresso/conclusão/
-- impedimento) — nunca UPDATE para reescrever histórico; só o campo `status` da ordem
-- muda, o evento em si fica registrado para sempre.
CREATE TABLE IF NOT EXISTS ordens_servico_eventos (
    id                  INTEGER PRIMARY KEY,
    ordem_servico_id    INTEGER NOT NULL REFERENCES ordens_servico(id),
    tipo_evento         TEXT NOT NULL CHECK (tipo_evento IN ('atribuida', 'aceita', 'iniciada', 'progresso', 'concluida', 'impedida', 'cancelada', 'reaberta')),
    ator                TEXT NOT NULL,
    detalhes            TEXT,
    criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_os_eventos_ordem ON ordens_servico_eventos(ordem_servico_id);

-- Solicitação de despesa da OS com aprovação por alçada (quórum): valor acima do limite
-- definido no domínio (não no schema) exige aprovador_2 diferente de aprovador_1 — nunca
-- a mesma pessoa autoaprovando os dois papéis. Só gera `contas_a_pagar` (idempotente, via
-- `contas_a_pagar_id`) quando o quórum necessário estiver satisfeito.
CREATE TABLE IF NOT EXISTS ordens_servico_despesas (
    id                  INTEGER PRIMARY KEY,
    ordem_servico_id    INTEGER NOT NULL REFERENCES ordens_servico(id),
    valor_solicitado    REAL NOT NULL CHECK (valor_solicitado > 0),
    valor_aprovado      REAL,
    status              TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'rejeitada')),
    aprovador_1         TEXT,
    aprovador_2         TEXT,               -- NULL quando o valor está abaixo do limite de alçada dupla
    contas_a_pagar_id   INTEGER REFERENCES contas_a_pagar(id),      -- preenchido só quando o quórum aprova
    criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decidido_em         DATETIME,
    CHECK (aprovador_2 IS NULL OR aprovador_1 IS NULL OR aprovador_2 <> aprovador_1)
);

CREATE INDEX IF NOT EXISTS idx_os_despesas_ordem ON ordens_servico_despesas(ordem_servico_id);

-- Avaliação do prestador (1 a 5) por ordem de serviço concluída — histórico de qualidade.
CREATE TABLE IF NOT EXISTS avaliacoes_prestador (
    id                  INTEGER PRIMARY KEY,
    prestador_id        INTEGER NOT NULL REFERENCES prestadores(id),
    ordem_servico_id    INTEGER NOT NULL REFERENCES ordens_servico(id),
    nota                INTEGER NOT NULL CHECK (nota BETWEEN 1 AND 5),
    comentario          TEXT,
    criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (ordem_servico_id)
);

-- =====================================================================================
-- RAD — Relatório de Apuração de Débitos, como entidade versionada
-- =====================================================================================
-- Até aqui, `laudo/gerarRadPdf.ts` calculava o RAD "on the fly" a cada exportação, sem
-- persistir o resultado. Formaliza como entidade (auditoria comparativa com ERP de
-- referência): versão, supersessão de versão anterior e item aceito/rejeitado
-- individualmente com motivo — mesma disciplina que já existe em `vistoria_item`, agora
-- aplicada ao cálculo final de dedução de caução.
CREATE TABLE IF NOT EXISTS rad_avaliacoes (
    id                      INTEGER PRIMARY KEY,
    contrato_id             INTEGER NOT NULL REFERENCES contratos_locacao(id),
    vistoria_entrada_id     INTEGER REFERENCES vistorias(id),
    vistoria_saida_id       INTEGER REFERENCES vistorias(id),
    versao                  INTEGER NOT NULL DEFAULT 1,
    status                  TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'emitido', 'superado', 'contestado')),
    superado_por_id         INTEGER REFERENCES rad_avaliacoes(id),   -- aponta para a versão que a substituiu
    valor_total_deducao     REAL,
    criado_em               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    emitido_em              DATETIME,
    -- `contestarRadAvaliacao` exige motivo mas até aqui descartava o texto (nenhuma coluna
    -- para guardá-lo) — contradizia o princípio do sistema de nunca descartar dado do
    -- domínio (o mesmo problema já tinha sido resolvido para `rejeitarDespesaOS`, gravando
    -- o motivo na trilha de eventos da OS; aqui não existe trilha equivalente, então a
    -- coluna direta é a solução mais simples).
    motivo_contestacao      TEXT
);

CREATE INDEX IF NOT EXISTS idx_rad_avaliacoes_contrato ON rad_avaliacoes(contrato_id);

CREATE TABLE IF NOT EXISTS rad_avaliacao_itens (
    id                  INTEGER PRIMARY KEY,
    rad_avaliacao_id    INTEGER NOT NULL REFERENCES rad_avaliacoes(id),
    inventario_bem_id   INTEGER REFERENCES imovel_inventario_bens(id),
    descricao           TEXT NOT NULL,
    valor_referencia    REAL NOT NULL,          -- valor de reposição original
    valor_depreciado    REAL NOT NULL,          -- referência depreciada linear aplicada a este item
    aceito              INTEGER NOT NULL DEFAULT 1 CHECK (aceito IN (0, 1)),
    motivo              TEXT                    -- obrigatório na prática quando aceito = 0 (não pode ser cobrado)
);

CREATE INDEX IF NOT EXISTS idx_rad_itens_avaliacao ON rad_avaliacao_itens(rad_avaliacao_id);

-- =====================================================================================
-- RETENÇÃO E RETENÇÃO LEGAL (LEGAL HOLD) — generaliza a regra hoje fixa em direitosTitular.ts
-- =====================================================================================
-- Antes, o prazo de retenção (7 anos contábil, contrato vigente, processo em curso) estava
-- embutido como regra fixa dentro de `lgpd/direitosTitular.ts`. Formaliza como tabela
-- versionada (auditoria comparativa com ERP de referência: eles têm `retention_policies`
-- versionadas + `legal_hold` por entidade) — permite mudar prazo por lei nova sem alterar
-- código, e registrar uma retenção EXCEPCIONAL (legal hold) ligada a um registro
-- específico, independente da política geral do domínio.
CREATE TABLE IF NOT EXISTS politicas_retencao (
    id              INTEGER PRIMARY KEY,
    dominio         TEXT NOT NULL,          -- ex: 'contabil', 'contrato_locacao', 'processo_legal', 'documento_fiscal'
    prazo_anos      INTEGER NOT NULL CHECK (prazo_anos > 0),
    base_legal      TEXT NOT NULL,          -- ex: 'Lei 6.404/76 art. 177' — nunca um prazo sem fundamento citável
    versao          INTEGER NOT NULL DEFAULT 1,
    vigente_desde   DATE NOT NULL,
    observacoes     TEXT
);

CREATE INDEX IF NOT EXISTS idx_politicas_retencao_dominio ON politicas_retencao(dominio, vigente_desde);

-- Retenção legal (legal hold) sobre um registro específico — independe da política geral:
-- mesmo com o prazo padrão vencido, um registro sob hold ativo não pode ser excluído/
-- anonimizado. `entidade_tipo`+`entidade_id` é referência genérica (mesmo padrão de
-- `documento_imoveis`/`documento_transacoes`), porque o alvo pode ser qualquer tabela com
-- dado pessoal (documento, transação, pessoa, contrato).
CREATE TABLE IF NOT EXISTS retencoes_legais (
    id              INTEGER PRIMARY KEY,
    entidade_tipo   TEXT NOT NULL,
    entidade_id     INTEGER NOT NULL,
    motivo          TEXT NOT NULL,          -- ex: "Processo nº ... em curso"
    ativo           INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
    criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    encerrado_em    DATETIME
);

CREATE INDEX IF NOT EXISTS idx_retencoes_legais_entidade ON retencoes_legais(entidade_tipo, entidade_id, ativo);

-- =====================================================================================
-- EXPORTAÇÃO CONTROLADA — checksum, expiração e auditoria de acesso
-- =====================================================================================
-- Hoje cada exportação (laudo PDF, RAD, ECD/SPED) é gerada e entregue sem registro
-- central de quem gerou, quando expira e quem acessou depois. Formaliza um envelope
-- comum (auditoria comparativa com ERP de referência: `report_export_requests`/
-- `_artifacts`/`_access_audit`) por cima das exportações que já existem, sem alterar a
-- lógica de geração de cada uma.
CREATE TABLE IF NOT EXISTS exportacoes_geradas (
    id              INTEGER PRIMARY KEY,
    tipo            TEXT NOT NULL,          -- ex: 'laudo_pericial', 'rad', 'ecd', 'dre'
    formato         TEXT NOT NULL CHECK (formato IN ('pdf', 'csv', 'json', 'txt', 'xlsx')),
    arquivo_hash    TEXT NOT NULL,          -- SHA-256 do conteúdo exportado
    gerado_por      TEXT NOT NULL,
    gerado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_em       DATETIME,               -- NULL = sem expiração definida
    revogado        INTEGER NOT NULL DEFAULT 0 CHECK (revogado IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_exportacoes_tipo ON exportacoes_geradas(tipo, gerado_em);

-- Cada acesso/reabertura de uma exportação já gerada — append-only.
CREATE TABLE IF NOT EXISTS exportacoes_acessos (
    id              INTEGER PRIMARY KEY,
    exportacao_id   INTEGER NOT NULL REFERENCES exportacoes_geradas(id),
    acessado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ator            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exportacoes_acessos_exportacao ON exportacoes_acessos(exportacao_id);

-- =====================================================================================
-- HUB DE CONSOLIDAÇÃO FINANCEIRA — fatos canônicos com links entre fontes
-- =====================================================================================
-- Camada de EVIDÊNCIA acima do razão (não substitui `ledger_entries`, não tem débito/
-- crédito): reúne, de várias fontes (banco, competência, contas a pagar, ordem de
-- serviço), um "fato" canônico idempotente e permite ligar dois fatos que representam o
-- mesmo evento econômico visto por ângulos diferentes (ex: competência de aluguel ↔
-- recebimento bancário; despesa de OS aprovada ↔ título a pagar). Auditoria comparativa
-- com ERP de referência: eles têm exatamente essa camada (`financial_consolidation_
-- facts`/`_fact_links`) como fronteira deliberada antes do lançamento contábil — aqui o
-- razão já existe, então o hub serve para reforçar rastreabilidade cruzada entre módulos,
-- não para "propor" o lançamento em si.
CREATE TABLE IF NOT EXISTS fatos_financeiros (
    id                  INTEGER PRIMARY KEY,
    entidade_id         INTEGER NOT NULL REFERENCES entidades_legais(id),
    tipo_origem         TEXT NOT NULL CHECK (tipo_origem IN ('banco', 'competencia', 'contas_a_pagar', 'ordem_servico', 'vistoria', 'historico')),
    origem_id           INTEGER NOT NULL,          -- id na tabela de origem (transacoes/aluguel_competencias/contas_a_pagar/...)
    data_fato           DATE NOT NULL,
    valor               REAL NOT NULL,
    chave_idempotencia  TEXT NOT NULL UNIQUE,      -- ex: 'competencia:123', 'banco:456' — impede duplicar o mesmo fato
    estado_revisao      TEXT NOT NULL DEFAULT 'pendente' CHECK (estado_revisao IN ('pendente', 'revisado', 'rejeitado')),
    criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fatos_financeiros_origem ON fatos_financeiros(tipo_origem, origem_id);

-- Ligação entre dois fatos que representam o mesmo evento por ângulos diferentes. Nunca
-- liga um fato a si mesmo; começa pendente; nunca apaga nenhum dos dois fatos.
CREATE TABLE IF NOT EXISTS fatos_financeiros_links (
    id              INTEGER PRIMARY KEY,
    fato_a_id       INTEGER NOT NULL REFERENCES fatos_financeiros(id),
    fato_b_id       INTEGER NOT NULL REFERENCES fatos_financeiros(id),
    tipo_relacao    TEXT NOT NULL,          -- ex: 'competencia_recebimento', 'os_titulo_debito'
    status          TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmado', 'rejeitado')),
    criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (fato_a_id <> fato_b_id)
);

CREATE INDEX IF NOT EXISTS idx_fatos_links_a ON fatos_financeiros_links(fato_a_id);
CREATE INDEX IF NOT EXISTS idx_fatos_links_b ON fatos_financeiros_links(fato_b_id);

-- =====================================================================================
-- CRM LEVE — leads, funil e propostas (captação de novo inquilino/comprador)
-- =====================================================================================
-- Auditoria comparativa com ERP de referência: eles têm CRM completo (crm_leads,
-- crm_lead_stage_events, crm_lead_proposals) com a regra de ouro "nenhuma criação
-- automática de contrato" — proposta aceita muda o lead para 'convertido', mas o
-- contrato em contratos_locacao continua sendo criado manualmente pelo usuário.
CREATE TABLE IF NOT EXISTS leads (
    id              INTEGER PRIMARY KEY,
    imovel_id       INTEGER REFERENCES imoveis(id),        -- NULL = interesse ainda não ligado a um imóvel específico
    nome            TEXT NOT NULL,
    contato         TEXT,                                  -- telefone/e-mail em texto livre
    fonte           TEXT,                                  -- ex: 'indicacao', 'site', 'portal'
    interesse       TEXT,
    etapa           TEXT NOT NULL DEFAULT 'novo' CHECK (etapa IN ('novo', 'contatado', 'visita_agendada', 'proposta', 'convertido', 'perdido')),
    criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_leads_etapa ON leads(etapa);

-- Histórico append-only do funil — nunca UPDATE apagando a etapa anterior.
CREATE TABLE IF NOT EXISTS lead_etapa_eventos (
    id              INTEGER PRIMARY KEY,
    lead_id         INTEGER NOT NULL REFERENCES leads(id),
    etapa_anterior  TEXT NOT NULL,
    etapa_nova      TEXT NOT NULL,
    ator            TEXT NOT NULL,
    criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lead_etapa_eventos_lead ON lead_etapa_eventos(lead_id);

CREATE TABLE IF NOT EXISTS lead_propostas (
    id              INTEGER PRIMARY KEY,
    lead_id         INTEGER NOT NULL REFERENCES leads(id),
    imovel_id       INTEGER NOT NULL REFERENCES imoveis(id),
    valor_proposto  REAL NOT NULL CHECK (valor_proposto > 0),
    condicoes       TEXT,
    status          TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviada', 'aceita', 'recusada')),
    criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decidido_em     DATETIME
);

CREATE INDEX IF NOT EXISTS idx_lead_propostas_lead ON lead_propostas(lead_id);

-- =====================================================================================
-- EXERCÍCIO DE RESTAURAÇÃO — formaliza o que verificarBackup.ts já confere
-- =====================================================================================
-- `verificarBackup.ts` já restaura um .sqlite em memória e confere invariantes contábeis,
-- mas isso nunca ficou registrado como um PROGRAMA (planejado, executado, revisado, com
-- RTO/RPO medido) — auditoria comparativa com ERP de referência: eles têm
-- `restore_exercise_plans/_executions/_evidence/_reviews` justamente para provar que a
-- restauração foi EXERCITADA de verdade, não só que o código de verificação existe.
CREATE TABLE IF NOT EXISTS exercicios_restauracao (
    id                  INTEGER PRIMARY KEY,
    descricao           TEXT NOT NULL,
    rpo_horas_alvo      REAL NOT NULL CHECK (rpo_horas_alvo >= 0),
    rto_horas_alvo      REAL NOT NULL CHECK (rto_horas_alvo >= 0),
    planejado_para      DATE NOT NULL,
    status              TEXT NOT NULL DEFAULT 'planejado' CHECK (status IN ('planejado', 'executado', 'revisado')),
    criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exercicios_restauracao_status ON exercicios_restauracao(status);

CREATE TABLE IF NOT EXISTS exercicios_restauracao_execucoes (
    id                  INTEGER PRIMARY KEY,
    exercicio_id        INTEGER NOT NULL REFERENCES exercicios_restauracao(id),
    iniciado_em         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    concluido_em        DATETIME,
    rpo_horas_real      REAL,
    rto_horas_real      REAL,
    resultado           TEXT CHECK (resultado IN ('sucesso', 'falha')),
    evidencia_hash      TEXT,               -- SHA-256 do relatório de verificarBackup gerado nesta execução
    -- Cadeia de custódia mais forte (decisão do usuário 2026-09-29): além do hash do
    -- relatório acima, guarda também o SHA-256 do próprio arquivo .sqlite restaurado —
    -- prova a integridade do arquivo em si, não só do resultado da verificação sobre ele.
    evidencia_hash_arquivo TEXT,
    observacoes         TEXT,
    revisado_por        TEXT,
    revisado_em         DATETIME
);

CREATE INDEX IF NOT EXISTS idx_exercicios_execucoes_exercicio ON exercicios_restauracao_execucoes(exercicio_id);

-- =====================================================================================
-- AVALIAÇÃO PATRIMONIAL DE MERCADO — camada gerencial paralela, nunca oficial
-- =====================================================================================
-- Decisão do usuário (2026-09-29): os relatórios oficiais (DRE, Balanço, Fluxo de Caixa)
-- continuam SEMPRE a custo histórico, para fins fiscais/periciais — nunca mudam por causa
-- desta tabela. Esta é uma camada PARALELA e opcional: histórico de avaliações de mercado
-- (valor venal) por imóvel, consumida só por um relatório/tela GERENCIAL separado
-- (viabilidade, ROI, indicadores de negócio) — nunca lançada no razão (`ledger_entries`),
-- nunca lida por `relatorios-integrados.ts`/`reports/dre.ts`/etc. `imoveis.valor_venal_
-- atual`/`data_avaliacao_venal` continuam existindo como o "valor mais recente" em cache
-- para o cadastro; esta tabela guarda a SÉRIE histórica completa, necessária para
-- tendência/ROI ao longo do tempo (o que um único valor em cache não permite).
CREATE TABLE IF NOT EXISTS imovel_avaliacoes_mercado (
    id                  INTEGER PRIMARY KEY,
    imovel_id           INTEGER NOT NULL REFERENCES imoveis(id),
    valor_avaliado      REAL NOT NULL CHECK (valor_avaliado > 0),
    data_avaliacao      DATE NOT NULL,
    metodologia         TEXT,               -- ex: 'comparativo de mercado', 'avaliação de corretor', 'IPTU/venal municipal'
    fonte               TEXT,               -- ex: nome do avaliador/corretor, ou 'estimativa do usuário'
    observacoes         TEXT,
    criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_imovel_avaliacoes_mercado_imovel ON imovel_avaliacoes_mercado(imovel_id, data_avaliacao);

-- =====================================================================================
-- RATEIO DE DESTINO (PF × empresa de fato × advocacia) DE DÍVIDAS — decisão do usuário
-- =====================================================================================
-- `dividas_consumo` e `financiamentos` não tinham nenhum campo indicando a que parte da
-- vida/atividade uma dívida pertence. Decisão do usuário (2026-09-29): em vez de um
-- campo único PF/PJ, uma mesma dívida pode ser rateada por PERCENTUAL entre vários
-- destinos (ex: 60% empresa de fato dos imóveis de locação/Airbnb, 20% vida pessoal, 20%
-- advocacia) — cada linha leva sua própria observação/justificativa, e o usuário pode
-- abrir quantas linhas precisar para segregar mais. `destino` é texto livre (a UI sugere
-- valores comuns) para não travar numa lista fixa que não cubra um caso novo. Referência
-- polimórfica (`divida_tipo`+`divida_id`, sem FK) — mesmo padrão já usado em
-- `retencoes_legais(entidade_tipo, entidade_id)` — porque o alvo pode ser uma linha de
-- `dividas_consumo` OU de `financiamentos`.
CREATE TABLE IF NOT EXISTS divida_rateio_destinos (
    id              INTEGER PRIMARY KEY,
    divida_tipo     TEXT NOT NULL CHECK (divida_tipo IN ('divida_consumo', 'financiamento')),
    divida_id       INTEGER NOT NULL,
    destino         TEXT NOT NULL,          -- texto livre; sugestões na UI: 'pessoal', 'imoveis_locacao', 'advocacia', 'outro'
    percentual      REAL NOT NULL CHECK (percentual > 0 AND percentual <= 100),
    observacoes     TEXT,
    criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_divida_rateio_destinos_divida ON divida_rateio_destinos(divida_tipo, divida_id);

-- =====================================================================================
-- UPLOAD DE CONTRATO/HISTÓRICO DE PAGAMENTOS DE DÍVIDA + EXTRAÇÃO POR IA
-- =====================================================================================
-- Decisão do usuário (2026-09-29): além da taxa estimada acima, permitir subir o
-- contrato/extrato de pagamentos e deixar a IA tentar extrair os dados mais exatos —
-- SEMPRE como sugestão sujeita a confirmação humana (regra de ouro do sistema: IA nunca
-- decide/lança sozinha), nunca aplicado automaticamente.
CREATE TABLE IF NOT EXISTS documento_dividas (
    id              INTEGER PRIMARY KEY,
    documento_id    INTEGER NOT NULL REFERENCES documentos(id),
    divida_tipo     TEXT NOT NULL CHECK (divida_tipo IN ('divida_consumo', 'financiamento')),
    divida_id       INTEGER NOT NULL,
    criado_em       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_documento_dividas_divida ON documento_dividas(divida_tipo, divida_id);

-- Histórico de pagamentos (decompostos em juros/amortização quando possível) de uma
-- dívida sem cronograma de partida dobrada exato (dívida de consumo, ou financiamento
-- 'OUTRO'). É a fonte de dado real para o relatório de juros pagos mês a mês dessas
-- dívidas — financiamentos SAC/PRICE continuam usando o cronograma calculado em
-- `financiamento/amortizacao.ts`, que já é exato, e não precisam desta tabela.
CREATE TABLE IF NOT EXISTS divida_pagamentos_historico (
    id                      INTEGER PRIMARY KEY,
    divida_tipo             TEXT NOT NULL CHECK (divida_tipo IN ('divida_consumo', 'financiamento')),
    divida_id               INTEGER NOT NULL,
    data_pagamento          DATE NOT NULL,
    valor_pago              REAL NOT NULL CHECK (valor_pago > 0),
    valor_juros             REAL,           -- NULL se não decomposto (nem toda fonte separa juros de amortização)
    valor_amortizacao       REAL,
    origem                  TEXT NOT NULL CHECK (origem IN ('extraido_ia', 'manual')),
    -- Regra de ouro: um valor com origem='extraido_ia' só entra nos relatórios depois de
    -- confirmado_por_usuario=1 — extração de IA é sempre candidata, nunca fato até
    -- confirmação humana (mesmo padrão de documentos/matching.ts).
    confirmado_por_usuario  INTEGER NOT NULL DEFAULT 0 CHECK (confirmado_por_usuario IN (0, 1)),
    documento_id            INTEGER REFERENCES documentos(id),  -- proveniência, se veio de upload
    observacoes             TEXT,
    criado_em               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_divida_pagamentos_historico_divida ON divida_pagamentos_historico(divida_tipo, divida_id, data_pagamento);

-- =====================================================================================
-- PROJETOS DE EXPANSÃO/AMPLIAÇÃO — calculadora de viabilidade (decisão do usuário)
-- =====================================================================================
-- Calculadora completa: usuário entra manualmente com custo de obra e receita/despesa
-- adicional esperada (o sistema não tem — e não deveria inventar — nenhuma base de custo
-- de construção); o módulo de domínio calcula payback/ROI a partir disso. `imovel_id`
-- nulo = unidade nova hipotética, não ampliação de um imóvel já cadastrado.
CREATE TABLE IF NOT EXISTS projetos_expansao (
    id                                  INTEGER PRIMARY KEY,
    imovel_id                           INTEGER REFERENCES imoveis(id),
    descricao                           TEXT NOT NULL,
    custo_obra_estimado                 REAL NOT NULL CHECK (custo_obra_estimado > 0),
    receita_adicional_mensal_estimada   REAL NOT NULL CHECK (receita_adicional_mensal_estimada >= 0),
    despesa_adicional_mensal_estimada   REAL NOT NULL DEFAULT 0 CHECK (despesa_adicional_mensal_estimada >= 0),
    data_estimativa                     DATE NOT NULL,
    status                              TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'em_analise', 'aprovado', 'descartado')),
    observacoes                         TEXT,
    criado_em                           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projetos_expansao_status ON projetos_expansao(status);

-- =====================================================================================
-- INTEGRAÇÕES EXTERNAS — ASAAS (emissão de boleto/PIX) E MEUPLUGGY (sincronização bancária)
-- =====================================================================================
-- Decisão do usuário (2026-10): emitir boletos para inquilinos e clientes da advocacia via
-- Asaas, e sincronizar extratos de banco/cartão via MeuPluggy (uso pessoal gratuito da
-- Pluggy). As credenciais (Asaas API key; Pluggy client_id/client_secret) vivem SOMENTE em
-- variável de ambiente do servidor — nunca neste banco nem no bundle do cliente, mesmo
-- padrão já usado por `exigirChaveApi`/`server/src/pluggy.ts`. O servidor é só um proxy que
-- fala com Asaas/Pluggy; o registro de negócio (cobrança emitida, conta vinculada) continua
-- morando no banco local do cliente, como todo o resto do sistema.

-- Recebível de honorários advocatícios — não existia tabela de "contas a receber" para
-- clientes da advocacia (só despesas/custas em advocacia.ts); sem isso não há o que
-- referenciar ao emitir boleto. Mesmo desenho de `aluguel_competencias` (uma linha por
-- parcela/vencimento, baixa real só via ledger_entry_id_baixa).
CREATE TABLE IF NOT EXISTS honorarios_advocaticios (
    id                      INTEGER PRIMARY KEY,
    processo_id             INTEGER NOT NULL REFERENCES processos_legais(id),
    parcela_numero          INTEGER NOT NULL DEFAULT 1,
    descricao               TEXT,
    valor_devido            REAL NOT NULL CHECK (valor_devido > 0),
    data_vencimento         DATE NOT NULL,
    data_recebimento        DATE,                  -- NULL até ser recebida
    status                  TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'recebido', 'cancelado')),
    ledger_entry_id_baixa   INTEGER REFERENCES ledger_entries(id),  -- preenchido só na baixa
    criado_em               DATE NOT NULL,
    UNIQUE (processo_id, parcela_numero)
);

CREATE INDEX IF NOT EXISTS idx_honorarios_advocaticios_processo_status ON honorarios_advocaticios(processo_id, status, data_vencimento);

-- Mapeamento local ↔ cliente Asaas. Polimórfico porque o "cliente" que recebe o boleto pode
-- ser o locatário de um contrato de locação ou uma entidade_legal (cliente da advocacia) —
-- mesmo padrão de `retencoes_legais(entidade_tipo, entidade_id)`.
CREATE TABLE IF NOT EXISTS asaas_clientes_externos (
    id                  INTEGER PRIMARY KEY,
    referencia_tipo     TEXT NOT NULL CHECK (referencia_tipo IN ('contrato_locacao', 'entidade_legal')),
    referencia_id       INTEGER NOT NULL,
    asaas_customer_id   TEXT NOT NULL UNIQUE,
    nome                TEXT NOT NULL,
    cpf_cnpj            TEXT,
    email               TEXT,
    telefone            TEXT,
    criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (referencia_tipo, referencia_id)
);

-- Cobrança (boleto ou PIX) emitida via Asaas. origem é polimórfica (aluguel de inquilino ou
-- honorário da advocacia). multa_percentual/juros_percentual_mensal aqui são um ESPELHO da
-- config enviada ao Asaas na criação da cobrança (decisão do usuário: deixar o próprio Asaas
-- calcular e cobrar automaticamente o atraso) — nunca a fonte de cálculo para outros módulos
-- (inadimplência/juros do sistema já tem sua própria lógica, independente desta tabela).
-- Sem UNIQUE em (origem_tipo, origem_id): uma cobrança cancelada pode ser reemitida.
CREATE TABLE IF NOT EXISTS cobrancas_asaas (
    id                          INTEGER PRIMARY KEY,
    origem_tipo                 TEXT NOT NULL CHECK (origem_tipo IN ('aluguel_competencia', 'honorario_advocaticio')),
    origem_id                   INTEGER NOT NULL,
    asaas_customer_id           TEXT NOT NULL,
    asaas_charge_id              TEXT UNIQUE,         -- NULL até a API da Asaas confirmar criação
    tipo_cobranca                TEXT NOT NULL DEFAULT 'boleto' CHECK (tipo_cobranca IN ('boleto', 'pix')),
    valor                        REAL NOT NULL CHECK (valor > 0),
    data_vencimento              DATE NOT NULL,
    status                       TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'atrasado', 'cancelado')),
    boleto_url                   TEXT,
    linha_digitavel               TEXT,
    pix_qrcode                   TEXT,
    multa_percentual             REAL,
    juros_percentual_mensal      REAL,
    data_pagamento_confirmado    DATE,
    webhook_ultimo_evento        TEXT,
    webhook_recebido_em          DATETIME,
    criado_em                    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cobrancas_asaas_origem ON cobrancas_asaas(origem_tipo, origem_id);
CREATE INDEX IF NOT EXISTS idx_cobrancas_asaas_status ON cobrancas_asaas(status, data_vencimento);
CREATE INDEX IF NOT EXISTS idx_cobrancas_asaas_charge_id ON cobrancas_asaas(asaas_charge_id);
CREATE INDEX IF NOT EXISTS idx_cobrancas_asaas_status_v2 ON cobrancas_asaas(status, criado_em DESC);

-- Rastreamento de reembolsos/devoluções de cobranças Asaas com idempotência (UNIQUE constraint
-- em origem_tipo + origem_id previne reemissão acidental). Suporta dois tipos:
-- - 'reversao': cobrança < 24h (tenta reverter na Asaas se suportado)
-- - 'devolucao': cobrança ≥ 24h (registra como novo lançamento de saída 'Devolução de Pagamento')
CREATE TABLE IF NOT EXISTS reembolsos_asaas (
    id                        INTEGER PRIMARY KEY,
    asaas_charge_id           TEXT NOT NULL UNIQUE REFERENCES cobrancas_asaas(asaas_charge_id),
    motivo                    TEXT NOT NULL,
    tipo                      TEXT NOT NULL CHECK (tipo IN ('reversao', 'devolucao')),
    status                    TEXT NOT NULL DEFAULT 'processando' CHECK (status IN ('processando', 'sucesso', 'erro')),
    data_processamento        DATE NOT NULL,
    origem_tipo               TEXT NOT NULL CHECK (origem_tipo IN ('aluguel_competencia', 'honorario_advocaticio')),
    origem_id                 INTEGER NOT NULL,
    mensagem_erro             TEXT,
    criado_em                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (origem_tipo, origem_id)  -- Idempotência: impede reemissão acidental
);

CREATE INDEX IF NOT EXISTS idx_reembolsos_asaas_tipo ON reembolsos_asaas(tipo);
CREATE INDEX IF NOT EXISTS idx_reembolsos_asaas_status ON reembolsos_asaas(status);
CREATE INDEX IF NOT EXISTS idx_reembolsos_asaas_data ON reembolsos_asaas(data_processamento DESC);
CREATE INDEX IF NOT EXISTS idx_reembolsos_asaas_origem ON reembolsos_asaas(origem_tipo, origem_id);
CREATE INDEX IF NOT EXISTS idx_reembolsos_asaas_charge ON reembolsos_asaas(asaas_charge_id);

-- Vínculo entre uma conta bancária já cadastrada e a conta equivalente no MeuPluggy (uso
-- pessoal gratuito, até 5 conexões — ver docs/viabilidade-backend-pagamentos.md). O usuário
-- conecta a conta em meu.pluggy.ai por fora do sistema; aqui só guardamos o mapeamento para
-- a sincronização (import de transações) saber qual conta_bancaria_id atualizar.
CREATE TABLE IF NOT EXISTS pluggy_contas_vinculadas (
    id                          INTEGER PRIMARY KEY,
    conta_bancaria_id           INTEGER NOT NULL REFERENCES contas_bancarias(id),
    pluggy_item_id               TEXT NOT NULL,
    pluggy_account_id            TEXT NOT NULL UNIQUE,
    nome_instituicao_pluggy      TEXT,
    ultima_sincronizacao         DATETIME,
    status_sincronizacao         TEXT NOT NULL DEFAULT 'ok' CHECK (status_sincronizacao IN ('ok', 'erro', 'desconectado')),
    observacoes                  TEXT,
    criado_em                    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pluggy_contas_vinculadas_conta ON pluggy_contas_vinculadas(conta_bancaria_id);

-- Trilha de envio de notificações (e-mail/WhatsApp/Telegram) disparadas quando uma cobrança
-- Asaas é emitida ou um comunicado genérico é enviado (decisão do usuário, 2026-10: toda
-- cobrança/boleto/comunicado deve sair por e-mail e WhatsApp/Telegram cadastrados). Uma
-- notificação pode gerar várias linhas aqui (uma por canal tentado) — rastreável como
-- qualquer outra ação do sistema que produz efeito fora do banco local.
CREATE TABLE IF NOT EXISTS notificacoes_enviadas (
    id                  INTEGER PRIMARY KEY,
    -- 'lembrete_aluguel'/'lembrete_honorario' adicionados (2026-10) para os lembretes
    -- automáticos de vencimento (2 dias antes + no dia) — origem_id aponta para
    -- aluguel_competencias.id / honorarios_advocaticios.id, para permitir checar "já
    -- mandei lembrete pra essa competência hoje?" antes de disparar de novo.
    origem_tipo         TEXT NOT NULL CHECK (origem_tipo IN ('cobranca_asaas', 'comunicado_generico', 'lembrete_aluguel', 'lembrete_honorario')),
    origem_id           INTEGER,                -- cobrancas_asaas.id quando origem_tipo='cobranca_asaas'; NULL p/ comunicado solto
    canal               TEXT NOT NULL CHECK (canal IN ('email', 'whatsapp', 'telegram')),
    destinatario        TEXT NOT NULL,           -- endereço de e-mail, número de WhatsApp (E.164) ou chat_id do Telegram
    assunto             TEXT,
    mensagem            TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'falha')),
    erro_mensagem       TEXT,                    -- preenchido só quando status='falha'
    enviado_em          DATETIME,
    criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_enviadas_origem ON notificacoes_enviadas(origem_tipo, origem_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_enviadas_status ON notificacoes_enviadas(status, criado_em);

-- Vínculo de Telegram para CONTATOS EXTERNOS (locatário, cliente da advocacia, prestador de
-- serviço) — diferente de `telegram_vinculos` no servidor, que só vincula chat_id a
-- usuario_id (usuário DO SISTEMA). Aqui a identidade (contrato_locatario/entidade_legal/
-- prestador) é dado de NEGÓCIO, que só existe neste banco local — por isso o código de
-- vínculo é gerado e resolvido aqui, não no servidor (que só vê o código bruto chegando
-- pelo webhook do bot, sem saber a quem ele pertence — ver
-- server/src/migrations-phase4-vinculos-externos.sql).
CREATE TABLE IF NOT EXISTS vinculos_telegram_externos (
    id                  INTEGER PRIMARY KEY,
    referencia_tipo     TEXT NOT NULL CHECK (referencia_tipo IN ('contrato_locatario', 'entidade_legal', 'prestador')),
    referencia_id       INTEGER NOT NULL,
    codigo_vinculo      TEXT NOT NULL UNIQUE,
    chat_id             TEXT UNIQUE,            -- NULL até o bot confirmar o vínculo
    vinculado_em        DATETIME,
    expira_em           DATETIME NOT NULL,      -- código não usado expira
    criado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vinculos_telegram_externos_referencia ON vinculos_telegram_externos(referencia_tipo, referencia_id);

-- Phase 2.3: Categorização inteligente de transações
-- Histórico de sugestões de categorias geradas automaticamente.
-- Usada para:
-- 1. Auditar as sugestões feitas ao usuário
-- 2. Aprender padrões no futuro (feedback loop)
-- 3. Medir acurácia do sistema (categoria_sugerida vs categoria_real quando usuário confirma)
CREATE TABLE IF NOT EXISTS categorias_sugeridas_historico (
    id                      INTEGER PRIMARY KEY,
    transacao_id            INTEGER NOT NULL REFERENCES transacoes(id),
    categoria_sugerida      TEXT NOT NULL,             -- plano_conta_codigo sugerido
    categoria_real          TEXT,                      -- preenchido depois quando usuário confirma/corrige
    confianca_sugestao      INTEGER NOT NULL CHECK (confianca_sugestao BETWEEN 0 AND 100),
    motivo                  TEXT NOT NULL,             -- ex: "Baseado em histórico: 7 transações", "Keyword match: aluguel, imóvel"
    criado_em               TEXT NOT NULL              -- timestamp ISO 8601
);

CREATE INDEX IF NOT EXISTS idx_categorias_sugeridas_transacao ON categorias_sugeridas_historico(transacao_id);
CREATE INDEX IF NOT EXISTS idx_categorias_sugeridas_criado ON categorias_sugeridas_historico(criado_em DESC);

-- Deduplicação de documentos: índices ÚNICOS PARCIAIS para arquivo_hash_sha256 e chave_nfe
CREATE UNIQUE INDEX IF NOT EXISTS idx_documentos_arquivo_hash_unique ON documentos(arquivo_hash_sha256) WHERE arquivo_hash_sha256 IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_documentos_chave_nfe_unique ON documentos(chave_nfe) WHERE chave_nfe IS NOT NULL;

-- Revisão de sugestões de IA para campos de documentos — rastreamento completo de ciclo
-- de vida (pendente → aceita/corrigida/rejeitada) com possibilidade de revisão múltipla,
-- limite de confiança e registros de quem revisou e quando. Imprescindível para medir
-- acurácia da IA e garantir que campos com baixa confiança ou documentos de alto valor
-- passem por revisão humana obrigatória.
CREATE TABLE IF NOT EXISTS sugestoes_ia_documentos (
    id                      INTEGER PRIMARY KEY,
    documento_id            INTEGER REFERENCES documentos(id),  -- NULL até documento ser inserido; depois imutável
    campo                   TEXT NOT NULL,                     -- nome do campo (ex: 'tipo', 'nome_contraparte', 'valor')
    valor_sugerido          TEXT NOT NULL,                     -- valor da sugestão (pode ser null em JSON, mas aqui TEXT para simplicidade)
    confianca               REAL NOT NULL CHECK (confianca BETWEEN 0 AND 1),  -- 0-1 (ex: 0.92 = 92%)
    modelo                  TEXT,                              -- ex: 'claude-3-5-sonnet', 'ollama-mistral'
    status                  TEXT NOT NULL CHECK (status IN ('pendente', 'aceita', 'corrigida', 'rejeitada')) DEFAULT 'pendente',
    valor_final             TEXT,                              -- preenchido quando status = 'corrigida' (valor humano após revisão)
    revisado_por            TEXT,                              -- email/identificador de quem revisou
    revisado_em             DATETIME,                          -- timestamp da revisão
    criado_em               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Uma sugestão só sai de 'pendente' uma vez: depois de revisada é imutável (trilha de quem revisou).
CREATE TRIGGER IF NOT EXISTS tg_sugestoes_ia_revisada_imutavel
BEFORE UPDATE ON sugestoes_ia_documentos
WHEN OLD.status != 'pendente'
BEGIN
    SELECT RAISE(ABORT, 'Sugestão de IA já revisada: não pode ser alterada.');
END;

CREATE TRIGGER IF NOT EXISTS tg_sugestoes_ia_revisada_no_delete
BEFORE DELETE ON sugestoes_ia_documentos
WHEN OLD.status != 'pendente'
BEGIN
    SELECT RAISE(ABORT, 'Sugestão de IA já revisada: não pode ser excluída.');
END;

CREATE INDEX IF NOT EXISTS idx_sugestoes_ia_documento ON sugestoes_ia_documentos(documento_id);
CREATE INDEX IF NOT EXISTS idx_sugestoes_ia_status ON sugestoes_ia_documentos(status);
CREATE INDEX IF NOT EXISTS idx_sugestoes_ia_criado ON sugestoes_ia_documentos(criado_em DESC);

-- BEGIN IMUTABILIDADE LEDGER (lido também por src/domain/erp/__tests__/test-setup.ts)
-- Lançamento oficial é imutável: correção só por estorno (novo lançamento). Os campos de
-- auditoria/estorno (estornado_por_id, motivo_estorno, auditada, auditado_*) e centro_custo_id
-- (alocação gerencial) continuam atualizáveis. `IS NOT` (e não `!=`) porque `!=` com NULL
-- devolve NULL e o trigger deixaria de disparar. CREATE TRIGGER IF NOT EXISTS: o schema roda a
-- cada abertura do banco e sobrevive à reconstrução de ledger_entries (reconstruirLedgerEntries).
CREATE TRIGGER IF NOT EXISTS tg_ledger_entries_no_update_dados
BEFORE UPDATE ON ledger_entries
FOR EACH ROW
WHEN (
    NEW.entidade_id IS NOT OLD.entidade_id
    OR NEW.periodo_id IS NOT OLD.periodo_id
    OR NEW.conta_id IS NOT OLD.conta_id
    OR NEW.valor_debito IS NOT OLD.valor_debito
    OR NEW.valor_credito IS NOT OLD.valor_credito
    OR NEW.data_lancamento IS NOT OLD.data_lancamento
    OR NEW.descricao IS NOT OLD.descricao
    OR NEW.origem_modulo IS NOT OLD.origem_modulo
    OR NEW.origem_id IS NOT OLD.origem_id
)
BEGIN
    SELECT RAISE(ABORT, 'Dados contábeis são imutáveis. Corrija pelo estorno.');
END;

CREATE TRIGGER IF NOT EXISTS tg_ledger_entries_no_delete
BEFORE DELETE ON ledger_entries
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'Lançamentos contábeis não podem ser excluídos. Use estorno.');
END;

CREATE TRIGGER IF NOT EXISTS tg_ledger_entries_periodo_fechado
BEFORE INSERT ON ledger_entries
FOR EACH ROW
WHEN NEW.periodo_id IN (SELECT id FROM periodos_contabeis WHERE status = 'fechado')
BEGIN
    SELECT RAISE(ABORT, 'Período contábil fechado não aceita novos lançamentos.');
END;
-- Trilha de centro de custo: centro_custo_id continua editável (alocação gerencial, rateios),
-- mas TODA troca vira uma linha append-only, gravada por trigger — pega qualquer escritor,
-- inclusive os que não passam por reclassificarCentro (ex.: alocarLancamentoACentro).
CREATE TABLE IF NOT EXISTS ledger_centro_custo_historico (
    id                          INTEGER PRIMARY KEY,
    ledger_entry_id             INTEGER NOT NULL,
    centro_custo_anterior_id    INTEGER,
    centro_custo_novo_id        INTEGER,
    alterado_em                 TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ledger_cc_hist_lancamento ON ledger_centro_custo_historico(ledger_entry_id);

CREATE TRIGGER IF NOT EXISTS tg_ledger_cc_hist_no_update
BEFORE UPDATE ON ledger_centro_custo_historico
BEGIN
    SELECT RAISE(ABORT, 'A trilha de centro de custo é append-only.');
END;

CREATE TRIGGER IF NOT EXISTS tg_ledger_cc_hist_no_delete
BEFORE DELETE ON ledger_centro_custo_historico
BEGIN
    SELECT RAISE(ABORT, 'A trilha de centro de custo é append-only.');
END;

CREATE TRIGGER IF NOT EXISTS tg_ledger_entries_centro_custo_trilha
AFTER UPDATE OF centro_custo_id ON ledger_entries
FOR EACH ROW
WHEN NEW.centro_custo_id IS NOT OLD.centro_custo_id
BEGIN
    INSERT INTO ledger_centro_custo_historico (ledger_entry_id, centro_custo_anterior_id, centro_custo_novo_id)
    VALUES (OLD.id, OLD.centro_custo_id, NEW.centro_custo_id);
END;
-- Trava de centavos: rede de segurança do banco. O código (normalizarCentavos em ledger.ts) já recusa
-- valores com mais de 2 casas; isto impede que outro escritor grave fração de centavo no razão.
CREATE TRIGGER IF NOT EXISTS tg_ledger_entries_centavos
BEFORE INSERT ON ledger_entries
FOR EACH ROW
WHEN (NEW.valor_debito IS NOT NULL AND ABS(NEW.valor_debito * 100 - ROUND(NEW.valor_debito * 100)) > 0.000001)
  OR (NEW.valor_credito IS NOT NULL AND ABS(NEW.valor_credito * 100 - ROUND(NEW.valor_credito * 100)) > 0.000001)
BEGIN
    SELECT RAISE(ABORT, 'Valor do lançamento deve ter no máximo 2 casas decimais (centavos).');
END;
-- END IMUTABILIDADE LEDGER

-- BEGIN IMUTABILIDADE PERIODOS
-- Período fechado não reabre nem some (a UI de fechamento já promete "irreversível"), e o registro
-- de encerramento (com o selo) é append-only. Sem isso, reabrir o período desligaria o trigger de
-- "INSERT em período fechado" e o selo poderia ser reescrito.
CREATE TRIGGER IF NOT EXISTS tg_periodos_fechado_imutavel
BEFORE UPDATE ON periodos_contabeis
FOR EACH ROW
WHEN OLD.status = 'fechado' AND (
    NEW.status IS NOT OLD.status
    OR NEW.ano IS NOT OLD.ano
    OR NEW.mes IS NOT OLD.mes
    OR NEW.entidade_id IS NOT OLD.entidade_id
)
BEGIN
    SELECT RAISE(ABORT, 'Período contábil fechado é irreversível: não pode ser reaberto nem alterado.');
END;

CREATE TRIGGER IF NOT EXISTS tg_periodos_fechado_no_delete
BEFORE DELETE ON periodos_contabeis
FOR EACH ROW
WHEN OLD.status = 'fechado'
BEGIN
    SELECT RAISE(ABORT, 'Período contábil fechado não pode ser excluído.');
END;

CREATE TRIGGER IF NOT EXISTS tg_ledger_encerramentos_no_update
BEFORE UPDATE ON ledger_encerramentos
BEGIN
    SELECT RAISE(ABORT, 'Encerramento contábil é append-only: não pode ser alterado.');
END;

CREATE TRIGGER IF NOT EXISTS tg_ledger_encerramentos_no_delete
BEFORE DELETE ON ledger_encerramentos
BEGIN
    SELECT RAISE(ABORT, 'Encerramento contábil é append-only: não pode ser excluído.');
END;
-- END IMUTABILIDADE PERIODOS

-- BEGIN TITULARIDADE ECONOMICA
-- Separação retroativa PF x empresa SEM reescrever o razão: ledger_entries.entidade_id continua
-- sendo quem registrou o lançamento (hoje o CPF); este overlay append-only diz a quem o lançamento
-- pertence economicamente. A atribuição vigente é a de maior id; mudar de ideia é inserir outra
-- (substitui_id aponta a anterior), nunca UPDATE. Sem atribuição, o titular é o próprio entidade_id.
CREATE TABLE IF NOT EXISTS ledger_atribuicoes_titularidade (
    id                      INTEGER PRIMARY KEY,
    ledger_entry_id         INTEGER NOT NULL REFERENCES ledger_entries(id),
    titular_economico_id    INTEGER NOT NULL REFERENCES entidades_legais(id),
    motivo                  TEXT NOT NULL,
    regra                   TEXT,        -- lote/regra que gerou (ex.: 'CORTE-PJ-2026-01'); NULL = manual
    atribuido_por           INTEGER,     -- usuario_id
    atribuido_em            TEXT NOT NULL DEFAULT (datetime('now')),
    substitui_id            INTEGER REFERENCES ledger_atribuicoes_titularidade(id)
);

CREATE INDEX IF NOT EXISTS idx_ledger_atrib_lancamento ON ledger_atribuicoes_titularidade(ledger_entry_id, id);

CREATE TRIGGER IF NOT EXISTS tg_ledger_atrib_no_update
BEFORE UPDATE ON ledger_atribuicoes_titularidade
BEGIN
    SELECT RAISE(ABORT, 'Atribuição de titularidade é append-only: registre uma nova atribuição.');
END;

CREATE TRIGGER IF NOT EXISTS tg_ledger_atrib_no_delete
BEFORE DELETE ON ledger_atribuicoes_titularidade
BEGIN
    SELECT RAISE(ABORT, 'Atribuição de titularidade é append-only: não pode ser excluída.');
END;

CREATE VIEW IF NOT EXISTS v_ledger_titular_atual AS
SELECT le.*,
       COALESCE(
         (SELECT a.titular_economico_id FROM ledger_atribuicoes_titularidade a
           WHERE a.ledger_entry_id = le.id ORDER BY a.id DESC LIMIT 1),
         le.entidade_id
       ) AS titular_economico_id
FROM ledger_entries le;
-- END TITULARIDADE ECONOMICA
