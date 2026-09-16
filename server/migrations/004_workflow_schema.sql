-- Migration: Phase 6 - Workflow Automation Schema
-- Date: 2026-09-16
-- Description: Complete database schema for workflow automation, approvals,
--              rules engine, process orchestration, notifications, and compliance

-- ============================================================================
-- WORKFLOW INSTANCES - Core approval workflow tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('payment', 'expense', 'contract', 'correction', 'report')),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'recalled', 'paused', 'completed')),
    solicitante_id UUID NOT NULL,
    valor DECIMAL(15,2),
    descricao TEXT,
    prioridade VARCHAR(20) DEFAULT 'medium' CHECK (prioridade IN ('low', 'medium', 'high', 'urgent')),
    data_criacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_vencimento TIMESTAMP,
    data_conclusao TIMESTAMP,
    metadados JSONB,
    UNIQUE (id)
);

CREATE INDEX idx_workflow_instances_status ON workflow_instances(status);
CREATE INDEX idx_workflow_instances_solicitante ON workflow_instances(solicitante_id);
CREATE INDEX idx_workflow_instances_tipo ON workflow_instances(tipo);
CREATE INDEX idx_workflow_instances_criacao ON workflow_instances(data_criacao DESC);

-- ============================================================================
-- APPROVAL STEPS - Individual approval steps within workflows
-- ============================================================================

CREATE TABLE IF NOT EXISTS approval_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
    ordem INTEGER NOT NULL,
    tipo_passo VARCHAR(50) NOT NULL CHECK (tipo_passo IN ('sequential', 'parallel', 'conditional')),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'escalated', 'skipped')),
    aprovador_id UUID,
    grupo_aprovadores TEXT[], -- Array of approver IDs for parallel approval
    tempo_limite_horas INTEGER DEFAULT 24,
    data_assinacao TIMESTAMP,
    data_vencimento TIMESTAMP,
    comentario TEXT,
    condicao TEXT, -- Serialized condition for conditional steps
    resultado_decisao JSONB,
    metadata JSONB,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_approval_steps_workflow ON approval_steps(workflow_id);
CREATE INDEX idx_approval_steps_status ON approval_steps(status);
CREATE INDEX idx_approval_steps_aprovador ON approval_steps(aprovador_id);

-- ============================================================================
-- WORKFLOW HISTORY - Immutable audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
    tipo_evento VARCHAR(50) NOT NULL CHECK (tipo_evento IN ('created', 'submitted', 'approved', 'rejected', 'escalated', 'recalled', 'paused', 'resumed', 'completed')),
    usuario_id UUID,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    mensagem TEXT,
    dados_adicionais JSONB,
    UNIQUE (id)
);

CREATE INDEX idx_workflow_history_workflow ON workflow_history(workflow_id);
CREATE INDEX idx_workflow_history_timestamp ON workflow_history(timestamp DESC);
CREATE INDEX idx_workflow_history_evento ON workflow_history(tipo_evento);

-- ============================================================================
-- APPROVAL RULES - Dynamic routing configurations
-- ============================================================================

CREATE TABLE IF NOT EXISTS approval_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    tipo_documento VARCHAR(50) NOT NULL CHECK (tipo_documento IN ('payment', 'expense', 'contract', 'correction', 'report')),
    condicao TEXT NOT NULL, -- Serialized condition logic
    rota_aprovadores TEXT[] NOT NULL, -- Array of approver IDs in order
    ativo BOOLEAN DEFAULT true,
    prioridade INTEGER DEFAULT 0,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_approval_rules_tipo ON approval_rules(tipo_documento);
CREATE INDEX idx_approval_rules_ativo ON approval_rules(ativo);

-- ============================================================================
-- AUTOMATION RULES - Rule engine with conditions and actions
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    ativa BOOLEAN DEFAULT true,
    versao INTEGER DEFAULT 1,
    tenant_id UUID,
    trigger_tipo VARCHAR(50) NOT NULL CHECK (trigger_tipo IN ('time', 'event', 'threshold', 'manual')),
    trigger_config JSONB NOT NULL,
    condicoes JSONB NOT NULL, -- Complex condition tree
    acoes JSONB NOT NULL, -- Array of actions
    prioridade INTEGER DEFAULT 0,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    criado_por UUID,
    atualizado_por UUID,
    tags TEXT[]
);

CREATE INDEX idx_automation_rules_ativa ON automation_rules(ativa);
CREATE INDEX idx_automation_rules_tenant ON automation_rules(tenant_id);
CREATE INDEX idx_automation_rules_prioridade ON automation_rules(prioridade DESC);

-- ============================================================================
-- AUTOMATION RULE EXECUTIONS - Execution history and results
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_rule_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    regra_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
    dados_entrada JSONB NOT NULL,
    condicoes_avaliadas JSONB NOT NULL,
    acoes_executadas JSONB NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
    tempo_total_ms INTEGER,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_automation_executions_regra ON automation_rule_executions(regra_id);
CREATE INDEX idx_automation_executions_status ON automation_rule_executions(status);
CREATE INDEX idx_automation_executions_timestamp ON automation_rule_executions(timestamp DESC);

-- ============================================================================
-- AUTOMATION RULE VERSIONS - Version control and audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_rule_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    regra_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
    versao INTEGER NOT NULL,
    conteudo JSONB NOT NULL,
    alterado_por UUID,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    motivo TEXT
);

CREATE INDEX idx_rule_versions_regra ON automation_rule_versions(regra_id);

-- ============================================================================
-- PROCESS DEFINITIONS - Business process DAGs
-- ============================================================================

CREATE TABLE IF NOT EXISTS process_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    versao INTEGER DEFAULT 1,
    tarefas JSONB NOT NULL, -- Serialized task definitions (DAG)
    condicoes_parada TEXT, -- Serialized stopping conditions
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_process_definitions_nome ON process_definitions(nome);

-- ============================================================================
-- PROCESS EXECUTIONS - Active and historical process runs
-- ============================================================================

CREATE TABLE IF NOT EXISTS process_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processo_id UUID NOT NULL REFERENCES process_definitions(id) ON DELETE RESTRICT,
    status VARCHAR(50) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed', 'failed', 'stopped')),
    variaveis JSONB,
    estado_tarefas JSONB NOT NULL,
    data_inicio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_fim TIMESTAMP,
    tempo_total_ms INTEGER,
    caminho_execucao TEXT[] -- Array of task IDs executed in order
);

CREATE INDEX idx_process_executions_processo ON process_executions(processo_id);
CREATE INDEX idx_process_executions_status ON process_executions(status);
CREATE INDEX idx_process_executions_data ON process_executions(data_inicio DESC);

-- ============================================================================
-- PROCESS HISTORY - Process execution events
-- ============================================================================

CREATE TABLE IF NOT EXISTS process_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processo_id UUID NOT NULL REFERENCES process_definitions(id) ON DELETE CASCADE,
    execucao_id UUID NOT NULL REFERENCES process_executions(id) ON DELETE CASCADE,
    evento VARCHAR(100) NOT NULL,
    tarefa_id VARCHAR(100),
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    detalhes JSONB
);

CREATE INDEX idx_process_history_execucao ON process_history(execucao_id);
CREATE INDEX idx_process_history_timestamp ON process_history(timestamp DESC);

-- ============================================================================
-- NOTIFICATIONS - Message queue and delivery tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canal VARCHAR(50) NOT NULL CHECK (canal IN ('email', 'sms', 'slack', 'teams', 'whatsapp')),
    template_id UUID,
    destinatarios TEXT[] NOT NULL,
    cco TEXT[],
    assunto VARCHAR(500),
    corpo TEXT NOT NULL,
    html TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'delivered', 'failed', 'bounced')),
    timestamp_criacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    timestamp_envio TIMESTAMP,
    timestamp_entrega TIMESTAMP,
    tentativas INTEGER DEFAULT 0,
    proximo_retry TIMESTAMP,
    erro TEXT,
    prioridade VARCHAR(20) DEFAULT 'normal' CHECK (prioridade IN ('low', 'normal', 'high', 'urgent')),
    tags TEXT[],
    variaveis JSONB,
    resultado_entrega JSONB
);

CREATE INDEX idx_notifications_canal ON notifications(canal);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_timestamp ON notifications(timestamp_criacao DESC);

-- ============================================================================
-- NOTIFICATION TEMPLATES - Reusable message templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo VARCHAR(100) NOT NULL UNIQUE,
    nome VARCHAR(255) NOT NULL,
    canais TEXT[] NOT NULL,
    conteudo JSONB NOT NULL, -- Per-channel content
    variaveis_permitidas TEXT[],
    descricao TEXT,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notification_templates_tipo ON notification_templates(tipo);

-- ============================================================================
-- NOTIFICATION DELIVERY TRACKING - Audit trail for each delivery
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_delivery_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mensagem_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) NOT NULL,
    detalhes JSONB,
    codigo_evento VARCHAR(50),
    destinatario VARCHAR(500)
);

CREATE INDEX idx_tracking_mensagem ON notification_delivery_tracking(mensagem_id);
CREATE INDEX idx_tracking_status ON notification_delivery_tracking(status);

-- ============================================================================
-- SCHEDULED TASKS - Cron-based task scheduling
-- ============================================================================

CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    tipo VARCHAR(100) NOT NULL CHECK (tipo IN ('report_generation', 'data_reconciliation', 'backup', 'cleanup', 'archival', 'sync', 'custom')),
    cron VARCHAR(100) NOT NULL,
    timezone VARCHAR(50) DEFAULT 'UTC',
    parametros JSONB,
    ativo BOOLEAN DEFAULT true,
    retry_em_falha BOOLEAN DEFAULT false,
    tentativas_maximas INTEGER DEFAULT 3,
    timeout_minutos INTEGER DEFAULT 60,
    data_criacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultima_execucao TIMESTAMP,
    proxima_execucao TIMESTAMP,
    disabled_motivo TEXT,
    tags TEXT[]
);

CREATE INDEX idx_scheduled_tasks_ativo ON scheduled_tasks(ativo);
CREATE INDEX idx_scheduled_tasks_tipo ON scheduled_tasks(tipo);
CREATE INDEX idx_scheduled_tasks_proxima ON scheduled_tasks(proxima_execucao);

-- ============================================================================
-- TASK EXECUTIONS - Execution history for scheduled tasks
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tarefa_id UUID NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    tempo_inicio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tempo_fim TIMESTAMP,
    tempo_execucao_ms INTEGER,
    resultado JSONB,
    erro TEXT,
    tentativa INTEGER DEFAULT 1,
    proximo_retry TIMESTAMP,
    worker_id VARCHAR(100),
    logs TEXT[]
);

CREATE INDEX idx_task_executions_tarefa ON task_executions(tarefa_id);
CREATE INDEX idx_task_executions_status ON task_executions(status);
CREATE INDEX idx_task_executions_tempo ON task_executions(tempo_inicio DESC);

-- ============================================================================
-- EVENT STREAM - Change data capture and event sourcing
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_stream (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo VARCHAR(100) NOT NULL CHECK (tipo IN ('EntryCreated', 'EntryModified', 'EntryRetified', 'PeriodClosed', 'WorkflowApproved', 'WorkflowRejected', 'RuleExecuted', 'TaskCompleted', 'NotificationSent', 'ComplianceViolation')),
    agregado_id VARCHAR(500) NOT NULL,
    agregado_tipo VARCHAR(50) NOT NULL CHECK (agregado_tipo IN ('entry', 'workflow', 'rule', 'task', 'period', 'user')),
    versao_agregado INTEGER DEFAULT 1,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    usuario_id UUID,
    dados JSONB NOT NULL,
    dados_anterior JSONB,
    metadata JSONB,
    id_transacao UUID,
    id_causa UUID,
    UNIQUE (id)
);

CREATE INDEX idx_event_stream_tipo ON event_stream(tipo);
CREATE INDEX idx_event_stream_agregado ON event_stream(agregado_id, agregado_tipo);
CREATE INDEX idx_event_stream_timestamp ON event_stream(timestamp DESC);
CREATE INDEX idx_event_stream_usuario ON event_stream(usuario_id);
CREATE INDEX idx_event_stream_transacao ON event_stream(id_transacao);

-- ============================================================================
-- EVENT SNAPSHOTS - Snapshots for event sourcing
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agregado_id VARCHAR(500) NOT NULL,
    agregado_tipo VARCHAR(50) NOT NULL,
    versao_agregado INTEGER NOT NULL,
    estado_snapshot JSONB NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    evento_id UUID REFERENCES event_stream(id)
);

CREATE INDEX idx_snapshots_agregado ON event_snapshots(agregado_id, agregado_tipo);
CREATE INDEX idx_snapshots_versao ON event_snapshots(versao_agregado DESC);

-- ============================================================================
-- COMPLIANCE POLICIES - Policy enforcement and governance
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    tipo VARCHAR(100) NOT NULL CHECK (tipo IN ('spending_limit', 'segregation_of_duties', 'approval_rule', 'data_retention', 'audit_trail')),
    ativa BOOLEAN DEFAULT true,
    tenant_id UUID,
    criterios JSONB NOT NULL,
    limite DECIMAL(15,2),
    acao_em_violacao VARCHAR(50) CHECK (acao_em_violacao IN ('block', 'warn', 'escalate')),
    legislacoes_aplicaveis TEXT[], -- LGPD, Lei 6404/76, Resolução CFC, GDPR, SOX
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_compliance_policies_ativa ON compliance_policies(ativa);
CREATE INDEX idx_compliance_policies_tipo ON compliance_policies(tipo);
CREATE INDEX idx_compliance_policies_tenant ON compliance_policies(tenant_id);

-- ============================================================================
-- COMPLIANCE VIOLATIONS - Violation detection and logging
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    politica_id UUID NOT NULL REFERENCES compliance_policies(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL,
    operacao VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) NOT NULL DEFAULT 'detected' CHECK (status IN ('detected', 'escalated', 'acknowledged', 'resolved')),
    severidade VARCHAR(50) NOT NULL CHECK (severidade IN ('info', 'warning', 'critical')),
    descricao TEXT NOT NULL,
    dados_operacao JSONB,
    motivo_escalacao TEXT,
    escalado_para UUID,
    timestamp_escalacao TIMESTAMP,
    timestamp_resolucao TIMESTAMP,
    observacoes TEXT,
    legislacoes_violadas TEXT[]
);

CREATE INDEX idx_violations_politica ON compliance_violations(politica_id);
CREATE INDEX idx_violations_usuario ON compliance_violations(usuario_id);
CREATE INDEX idx_violations_status ON compliance_violations(status);
CREATE INDEX idx_violations_severidade ON compliance_violations(severidade);
CREATE INDEX idx_violations_timestamp ON compliance_violations(timestamp DESC);

-- ============================================================================
-- SEGREGATION OF DUTIES RULES - SOD enforcement
-- ============================================================================

CREATE TABLE IF NOT EXISTS segregation_of_duties_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    politica_id UUID NOT NULL REFERENCES compliance_policies(id) ON DELETE CASCADE,
    operacao_1 VARCHAR(255) NOT NULL,
    operacao_2 VARCHAR(255) NOT NULL,
    usuarios_mesmo_grupo_bloqueado BOOLEAN DEFAULT true,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sod_politica ON segregation_of_duties_rules(politica_id);
CREATE INDEX idx_sod_operacoes ON segregation_of_duties_rules(operacao_1, operacao_2);

-- ============================================================================
-- COMPLIANCE AUDITS - Audit trail and compliance checks
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_auditoria TIMESTAMP NOT NULL,
    usuario_auditado_id UUID,
    operacoes_auditadas TEXT[] NOT NULL,
    violacoes_encontradas INTEGER DEFAULT 0,
    politicas_verificadas UUID[],
    resultado VARCHAR(50) NOT NULL CHECK (resultado IN ('conforme', 'nao_conforme', 'com_restricoes')),
    observacoes TEXT,
    auditor_id UUID,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audits_usuario ON compliance_audits(usuario_auditado_id);
CREATE INDEX idx_audits_resultado ON compliance_audits(resultado);
CREATE INDEX idx_audits_timestamp ON compliance_audits(timestamp DESC);

-- ============================================================================
-- WORKFLOW DASHBOARD DATA - Materialized views for performance
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_dashboard_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    periodo_data DATE NOT NULL,
    total_workflows INTEGER DEFAULT 0,
    workflows_completados INTEGER DEFAULT 0,
    workflows_aprovados INTEGER DEFAULT 0,
    workflows_rejeitados INTEGER DEFAULT 0,
    tempo_medio_ciclo_minutos NUMERIC(10,2),
    tempo_min_ciclo_minutos NUMERIC(10,2),
    tempo_max_ciclo_minutos NUMERIC(10,2),
    tempo_medio_espera_minutos NUMERIC(10,2),
    taxa_aprovacao_percentual NUMERIC(5,2),
    taxa_rejeicao_percentual NUMERIC(5,2),
    taxa_erro_percentual NUMERIC(5,2),
    numero_escalacoes INTEGER DEFAULT 0,
    sla_compliance_percentual NUMERIC(5,2),
    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (periodo_data)
);

CREATE INDEX idx_dashboard_metrics_data ON workflow_dashboard_metrics(periodo_data DESC);

-- ============================================================================
-- BOTTLENECK DETECTION - Queue monitoring and alerts
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_bottlenecks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tarefa_id VARCHAR(255) NOT NULL,
    numero_pendentes INTEGER NOT NULL,
    tempo_medio_espera_minutos NUMERIC(10,2),
    severidade VARCHAR(50) NOT NULL CHECK (severidade IN ('low', 'medium', 'high')),
    recomendacao TEXT,
    detectado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolvido BOOLEAN DEFAULT false,
    resolvido_em TIMESTAMP
);

CREATE INDEX idx_bottlenecks_severidade ON workflow_bottlenecks(severidade);
CREATE INDEX idx_bottlenecks_detectado ON workflow_bottlenecks(detectado_em DESC);

-- ============================================================================
-- ALERTS - System alerts for operational monitoring
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo VARCHAR(100) NOT NULL CHECK (tipo IN ('sla_violation', 'escalation_needed', 'bottleneck', 'high_error_rate', 'queue_overflow')),
    severidade VARCHAR(50) NOT NULL CHECK (severidade IN ('info', 'warning', 'critical')),
    mensagem TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    detalhes JSONB,
    resolvido BOOLEAN DEFAULT false,
    timestamp_resolucao TIMESTAMP
);

CREATE INDEX idx_alerts_tipo ON workflow_alerts(tipo);
CREATE INDEX idx_alerts_severidade ON workflow_alerts(severidade);
CREATE INDEX idx_alerts_timestamp ON workflow_alerts(timestamp DESC);
CREATE INDEX idx_alerts_resolvido ON workflow_alerts(resolvido);

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

CREATE OR REPLACE VIEW v_workflows_pendentes AS
SELECT
    wi.id,
    wi.nome,
    wi.tipo,
    wi.status,
    wi.solicitante_id,
    wi.valor,
    wi.prioridade,
    COUNT(DISTINCT CASE WHEN ap.status = 'approved' THEN ap.id END) as aprovacoes_completas,
    COUNT(DISTINCT ap.id) as total_aprovacoes,
    wi.data_criacao,
    wi.data_atualizacao
FROM workflow_instances wi
LEFT JOIN approval_steps ap ON wi.id = ap.workflow_id
WHERE wi.status IN ('pending', 'paused')
GROUP BY wi.id;

CREATE OR REPLACE VIEW v_compliance_violations_activas AS
SELECT
    cv.id,
    cv.politica_id,
    cp.nome as politica_nome,
    cv.usuario_id,
    cv.operacao,
    cv.status,
    cv.severidade,
    cv.descricao,
    cv.timestamp
FROM compliance_violations cv
JOIN compliance_policies cp ON cv.politica_id = cp.id
WHERE cv.status IN ('detected', 'escalated')
ORDER BY cv.timestamp DESC;

-- ============================================================================
-- GRANTS (For multi-tenant support)
-- ============================================================================

-- Ensure all tables have created at and updated at tracking
ALTER TABLE workflow_instances
ADD COLUMN IF NOT EXISTS record_version INTEGER DEFAULT 1;

ALTER TABLE approval_steps
ADD COLUMN IF NOT EXISTS record_version INTEGER DEFAULT 1;

ALTER TABLE automation_rules
ADD COLUMN IF NOT EXISTS record_version INTEGER DEFAULT 1;

-- ============================================================================
-- END OF MIGRATION 004
-- ============================================================================
