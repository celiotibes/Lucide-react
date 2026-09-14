-- Migration: Criação do módulo de Apontamento do Prestador (Sprint 2)
-- Data: 2025-09-14
-- Descrição: Schema PostgreSQL para gestão de apontamentos diários, remuneração,
--            movimentações financeiras, empréstimos e retificações de prestadores

-- Apontamentos diários: entrada/saída do prestador com status de workflows
CREATE TABLE IF NOT EXISTS apontamentos_diarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prestador_id UUID NOT NULL,
    data DATE NOT NULL,
    entrada TIME NOT NULL,                           -- Hora de chegada
    saida_intervalo TIME,                            -- Saída para intervalo/almoço
    retorno_intervalo TIME,                          -- Retorno do intervalo
    saida_final TIME NOT NULL,                       -- Saída final do dia
    status VARCHAR(20) NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviado', 'aprovado', 'retificado')),
    observacoes TEXT,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (prestador_id, data)
);

-- Histórico de eventos de horários (chegada, saída intervalo, retorno, saída final)
-- Permite rastrear alterações e justificativas de retificações
CREATE TABLE IF NOT EXISTS historico_horarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    apontamento_id UUID NOT NULL REFERENCES apontamentos_diarios(id) ON DELETE CASCADE,
    tipo_evento VARCHAR(30) NOT NULL CHECK (tipo_evento IN ('chegada', 'saida_intervalo', 'retorno', 'saida')),
    horario TIME NOT NULL,                           -- Horário efetivo
    horario_original TIME,                           -- Horário original (antes de retificação)
    justificativa_retificacao TEXT,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Itens remuneráveis: diária, Airbnb, urgência, deslocamento, materiais, extras
CREATE TABLE IF NOT EXISTS itens_remuneraveis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    apontamento_id UUID NOT NULL REFERENCES apontamentos_diarios(id) ON DELETE CASCADE,
    tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('diaria', 'airbnb', 'urgencia', 'deslocamento', 'materiais', 'extra')),
    rubrica VARCHAR(100) NOT NULL,                   -- Descrição da rubrica
    valor_base DECIMAL(10,2) NOT NULL,
    adicional_percentual DECIMAL(5,2) DEFAULT 0,     -- Percentual de adicional (ex: 10 para 10%)
    valor_final DECIMAL(10,2) NOT NULL,              -- valor_base + (valor_base * adicional_percentual / 100)
    observacao TEXT,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Movimentações financeiras: vales, empréstimos, adiantamentos
CREATE TABLE IF NOT EXISTS movimentacoes_financeiras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    apontamento_id UUID NOT NULL REFERENCES apontamentos_diarios(id) ON DELETE CASCADE,
    tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('vale', 'emprestimo', 'adiantamento')),
    valor DECIMAL(10,2) NOT NULL,
    data_solicitacao DATE NOT NULL,
    data_aprovacao DATE,
    data_desconto DATE,                              -- Data em que foi descontado da remuneração
    motivo TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'descotado', 'rejeitado')),
    gestor_id UUID,                                  -- Usuario que aprovou
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Fechamentos semanais: consolidação de apontamentos por semana
CREATE TABLE IF NOT EXISTS fechamentos_semanais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prestador_id UUID NOT NULL,
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    valor_bruto DECIMAL(10,2) NOT NULL,
    descontos_total DECIMAL(10,2) DEFAULT 0,
    valor_liquido DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'fechado', 'aprovado', 'pago')),
    aprovado_em TIMESTAMP,
    gestor_id UUID,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (prestador_id, data_inicio, data_fim)
);

-- Empréstimos: contratos de empréstimo com juros
CREATE TABLE IF NOT EXISTS emprestimos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prestador_id UUID NOT NULL,
    valor_original DECIMAL(10,2) NOT NULL,
    taxa_juros DECIMAL(5,2) NOT NULL,               -- Percentual mensal de juros
    parcelas_total INTEGER NOT NULL,
    parcelas_pagas INTEGER DEFAULT 0,
    valor_total_com_juros DECIMAL(10,2) NOT NULL,
    data_contratacao DATE NOT NULL,
    data_vencimento DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'pago', 'cancelado')),
    observacao TEXT,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Retificações: histórico de alterações em apontamentos
CREATE TABLE IF NOT EXISTS retificacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    apontamento_id UUID NOT NULL REFERENCES apontamentos_diarios(id) ON DELETE CASCADE,
    campo_alterado VARCHAR(100) NOT NULL,            -- Nome do campo modificado
    valor_anterior TEXT,                             -- Valor antes (JSON/TEXT para flexibilidade)
    valor_novo TEXT,                                 -- Valor depois
    motivo TEXT,
    autor_id UUID NOT NULL,                          -- Usuario que fez a retificação
    data_retificacao DATE NOT NULL,
    aprovada_em TIMESTAMP,
    observacao TEXT,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Parâmetros operacionais: combustível, reajustes, tabelas Airbnb
CREATE TABLE IF NOT EXISTS parametros_operacionais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parametro VARCHAR(100) NOT NULL,                 -- Ex: combustivel_litro, combustivel_km_litro, reajuste_ipca_proxima
    valor DECIMAL(10,4),                             -- Valor numérico do parâmetro
    valor_descricao TEXT,                            -- Para parâmetros não-numéricos
    vigencia_inicio DATE NOT NULL,
    vigencia_fim DATE,                               -- NULL = vigente
    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (parametro, vigencia_inicio)
);

-- Índices para performance
CREATE INDEX idx_apontamentos_prestador_data ON apontamentos_diarios(prestador_id, data);
CREATE INDEX idx_apontamentos_status ON apontamentos_diarios(status);
CREATE INDEX idx_historico_horarios_apontamento ON historico_horarios(apontamento_id);
CREATE INDEX idx_itens_remuneraveis_apontamento ON itens_remuneraveis(apontamento_id);
CREATE INDEX idx_itens_remuneraveis_tipo ON itens_remuneraveis(tipo);
CREATE INDEX idx_movimentacoes_apontamento ON movimentacoes_financeiras(apontamento_id);
CREATE INDEX idx_movimentacoes_prestador_status ON movimentacoes_financeiras(apontamento_id);
CREATE INDEX idx_fechamentos_prestador_data ON fechamentos_semanais(prestador_id, data_inicio);
CREATE INDEX idx_fechamentos_status ON fechamentos_semanais(status);
CREATE INDEX idx_emprestimos_prestador ON emprestimos(prestador_id);
CREATE INDEX idx_emprestimos_status ON emprestimos(status);
CREATE INDEX idx_retificacoes_apontamento ON retificacoes(apontamento_id);
CREATE INDEX idx_retificacoes_autor ON retificacoes(autor_id);
CREATE INDEX idx_parametros_operacionais_parametro ON parametros_operacionais(parametro, vigencia_inicio);

-- Comentários descritivos para auditoria
COMMENT ON TABLE apontamentos_diarios IS 'Apontamentos diários de prestadores: entrada, intervalo, retorno, saída com workflow de aprovação';
COMMENT ON TABLE historico_horarios IS 'Histórico de eventos de horários permitindo rastreamento de alterações';
COMMENT ON TABLE itens_remuneraveis IS 'Componentes de remuneração: diária, Airbnb, urgência, deslocamento, materiais, extras';
COMMENT ON TABLE movimentacoes_financeiras IS 'Vales, empréstimos e adiantamentos solicitados por prestadores';
COMMENT ON TABLE fechamentos_semanais IS 'Consolidação semanal de apontamentos com cálculo de líquido';
COMMENT ON TABLE emprestimos IS 'Contratos de empréstimo com cálculo de juros e parcelas';
COMMENT ON TABLE retificacoes IS 'Auditoria de retificações de apontamentos com justificativa';
COMMENT ON TABLE parametros_operacionais IS 'Parâmetros operacionais: tabelas de valores, combustível, reajustes IPCA';
