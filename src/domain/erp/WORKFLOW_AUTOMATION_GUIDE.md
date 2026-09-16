# Phase 6: Workflow Automation & Business Process Management

## Overview

Phase 6 implements a comprehensive workflow automation layer on top of the fully-integrated ERP system (Phases 1-5). This phase introduces 8 interconnected modules providing approval workflows, automation rules, process orchestration, notifications, scheduled tasks, event streaming, compliance management, and monitoring.

## Architecture

### Module Structure

```
workflow-automation/
├── workflow-aprovacoes.ts        # Approval Workflow Engine (700+ lines)
├── automation-rules.ts            # Automation Rules Engine (650+ lines)
├── orquestracao-processos.ts     # Process Orchestration (600+ lines)
├── hub-notificacoes.ts           # Notification Hub (550+ lines)
├── executor-tarefas-agendadas.ts # Scheduled Task Executor (500+ lines)
├── event-stream.ts               # Event Stream & Change Capture (550+ lines)
├── engine-politicas-compliance.ts # Compliance & Policy Engine (600+ lines)
├── workflow-dashboard.ts         # Workflow Dashboard (450+ lines)
├── __tests__/
│   └── workflow-automation.test.ts # 200+ comprehensive tests
├── WORKFLOW_AUTOMATION_GUIDE.md   # This guide
└── database/
    └── 004_workflow_schema.sql    # Complete schema
```

## Module Details

### 1. Approval Workflow Engine (workflow-aprovacoes.ts)

**Purpose**: Multi-level approval workflows with sequential, parallel, and conditional routing.

**Key Features**:
- Sequential and parallel approval chains
- Automatic escalation after 24 hours of inactivity
- Dynamic routing based on amount/type/requestor
- Workflow states: pending, approved, rejected, recalled, paused
- Complete audit trail

**Core Classes**:
- `FluxoAprovacaoEngine`: Main workflow orchestrator

**Key Methods**:
```typescript
// Create workflow
await engine.criarFluxoAprovacao({
  tipo: 'expense',
  valor: 5000,
  solicitante_id: 'user-1',
  descricao: 'Travel expenses'
});

// Submit for approval
await engine.submeterAprovacao(fluxo_id);

// Approve/Reject step
await engine.aprovarOuRejeitar(fluxo_id, passo_id, true, 'Approved');

// Escalate
await engine.escalarAprovacao(fluxo_id, passo_id, 'director');

// Pause/Resume
await engine.pausarFluxo(fluxo_id);
await engine.resumirFluxo(fluxo_id);

// Recall
await engine.recallarFluxo(fluxo_id, 'User changed mind');

// Get status
const status = await engine.obterStatusFluxo(fluxo_id);
const history = await engine.obterHistoricoFluxo(fluxo_id);
```

**Use Cases**:
1. **Expense Approval**: Route based on amount (manager → director → CFO)
2. **Payment Approval**: High-value payments require multiple approvals
3. **Contract Review**: Legal review → financial review → signature authority

**Database Tables**:
- `workflow_instances`: Active workflows
- `approval_steps`: Individual steps
- `workflow_history`: Immutable audit trail
- `approval_rules`: Dynamic routing rules

---

### 2. Automation Rules Engine (automation-rules.ts)

**Purpose**: Dynamic rule builder with if-then-else conditions and multiple actions.

**Supported Triggers**:
- **Time-based**: Cron expressions (e.g., "0 9 * * *" for 9 AM daily)
- **Event-based**: Application events (invoice_received, expense_submitted)
- **Threshold-based**: KPI monitoring (daily_expenses > 5000)
- **Manual**: User-triggered

**Supported Actions**:
- `create_entry`: Create new ledger entry
- `send_notification`: Notify via email, SMS, Slack, etc.
- `run_report`: Generate report
- `archive_data`: Move data to archive
- `update_status`: Change entity status
- `execute_workflow`: Trigger workflow
- `create_task`: Create tracking task

**Condition Logic**:
- **AND**: All conditions must be true
- **OR**: At least one condition must be true
- **NOT**: Negate a condition
- **Nested**: Combine conditions recursively

**Core Classes**:
- `MecanismoRegraAutomacao`: Main rules engine

**Key Methods**:
```typescript
// Create rule
const regra_id = await engine.criarRegra({
  nome: 'Auto-approve small expenses',
  trigger: { tipo: 'event', evento: 'expense_submitted' },
  condicoes: {
    operador: 'AND',
    criterios: [
      { campo: 'valor', operador: '<', valor: 500 },
      { campo: 'categoria', operador: '==', valor: 'travel' }
    ]
  },
  acoes: [
    { tipo: 'execute_workflow', parametros: { aprovacao_automatica: true } }
  ],
  criado_por: 'system'
});

// Execute rule
const execucao = await engine.executarRegra(regra_id, {
  valor: 300,
  categoria: 'travel'
});

// Subscribe to event
engine.inscreverEvento('invoice_received', regra_id);
await engine.publicarEvento('invoice_received', { valor: 1000 });

// List rules with filters
const regras = engine.listarRegras({ ativa: true, tags: ['important'] });

// Get execution history
const historico = engine.obterHistoricoExecucoes(regra_id, 100);

// Update rule
await engine.atualizarRegra(regra_id, 
  { nome: 'Updated name' }, 
  'system', 
  'Updated criteria');
```

**Use Cases**:
1. **Auto-Categorization**: Categorize expenses based on vendor
2. **Auto-Approval**: Approve small expenses automatically
3. **Notifications**: Notify when invoice is overdue
4. **Reconciliation**: Match invoices to purchase orders

**Database Tables**:
- `automation_rules`: Rule definitions
- `automation_rule_executions`: Execution log
- `automation_rule_versions`: Version history

---

### 3. Process Orchestration (orquestracao-processos.ts)

**Purpose**: Define and execute business processes as DAGs (Directed Acyclic Graphs).

**Task Types**:
- **tarefa**: Regular task
- **subprocesso**: Execute another process
- **decisao**: Conditional branch
- **paralelo**: Execute multiple tasks concurrently

**Process States**:
- running, paused, completed, failed, stopped

**Error Handling**:
- `fail`: Stop process on error
- `retry`: Retry task up to N times
- `skip`: Skip failed task and continue

**Core Classes**:
- `OrquestradorProcessos`: Process orchestrator

**Key Methods**:
```typescript
// Define process
const processo_id = await engine.definirProcesso({
  nome: 'Month-End Close',
  descricao: 'Complete month-end closing procedures',
  tarefas: [
    { 
      id: 'coleta', 
      nome: 'Collect transactions', 
      tipo: 'tarefa',
      timeout_minutos: 30
    },
    { 
      id: 'validacao', 
      nome: 'Validate data', 
      tipo: 'tarefa',
      depende_de: ['coleta'],
      retry_tentativas: 3,
      onError: 'retry'
    },
    { 
      id: 'consolidacao', 
      nome: 'Consolidate', 
      tipo: 'tarefa',
      depende_de: ['validacao']
    },
    {
      id: 'aprovacao',
      nome: 'Require approval',
      tipo: 'decisao',
      depende_de: ['consolidacao'],
      handler: async (contexto) => contexto.variaveis.get('valor') > 10000
    }
  ]
});

// Execute process
const execucao_id = await engine.executarProcesso(processo_id, {
  mes: 9,
  ano: 2026
});

// Control execution
await engine.pausarProcesso(execucao_id);
await engine.resumirProcesso(execucao_id);
await engine.pararProcesso(execucao_id);

// Get status
const status = engine.obterStatusExecucao(execucao_id);

// Get history
const historico = engine.obterHistoricoExecucao(execucao_id);
```

**Use Cases**:
1. **Month-End Close**: Multi-step consolidation and reporting
2. **Reconciliation**: Bank reconciliation with parallel checks
3. **Year-End Closing**: Complete closing procedure with approvals
4. **Data Migration**: Multi-step data transformation

**Database Tables**:
- `process_definitions`: Process definitions
- `process_executions`: Execution instances
- `process_history`: Execution events

---

### 4. Notification & Communication Hub (hub-notificacoes.ts)

**Purpose**: Multi-channel messaging with template support and delivery tracking.

**Supported Channels**:
- Email (SendGrid, AWS SES)
- SMS (Twilio)
- Slack
- Microsoft Teams
- WhatsApp

**Features**:
- Template-based messages with variable substitution
- Message queue with retry logic (exponential backoff)
- Delivery tracking and status monitoring
- Priority-based processing
- Rich message support (HTML, attachments, markdown)

**Core Classes**:
- `HubNotificacoes`: Central notification hub

**Key Methods**:
```typescript
// Configure channel
hub.configurarCanal('email', {
  ativo: true,
  credenciais: {
    api_key: 'sk-...',
    sender_email: 'noreply@company.com'
  }
});

// Register template
const template_id = await hub.registrarTemplate({
  tipo: 'expense_approved',
  nome: 'Expense Approved',
  canais: ['email', 'slack'],
  conteudo: {
    email: {
      assunto: 'Expense Approved: {{valor}}',
      corpo: 'Your expense of {{valor}} in category {{categoria}} has been approved.'
    },
    slack: {
      corpo: 'Expense {{valor}} approved! :tada:'
    }
  },
  variaveis_permitidas: ['valor', 'categoria', 'motivo_rejeicao']
});

// Send notification
const ids = await hub.enviarNotificacao({
  canal: ['email', 'slack'],
  destinatarios: ['user@example.com'],
  template: 'expense_approved',
  variaveis: { valor: '1000', categoria: 'travel' },
  prioridade: 'high',
  tags: ['expense', 'approval']
});

// Track delivery
const rastreamento = await hub.rastrearEntrega(ids[0]);

// Get metrics
const metricas = hub.obterMetricasEntrega();
// { total: 100, entregues: 98, falhadas: 1, bounced: 1, taxa_sucesso: 98% }

// Resend failed message
await hub.resendirMensagem(ids[0]);
```

**Message States**:
- queued → sending → delivered (success)
- queued → sending → failed → retry → delivered (after retry)
- queued → sending → failed → bounced (permanent failure)

**Retry Logic**:
- Initial delay: 60 seconds
- Exponential backoff: delay * 2^(tentativa-1)
- Maximum delay: 1 hour
- Max attempts: 5

**Database Tables**:
- `notifications`: Message queue
- `notification_templates`: Message templates
- `notification_delivery_tracking`: Delivery audit trail

---

### 5. Scheduled Task Executor (executor-tarefas-agendadas.ts)

**Purpose**: Cron-based task scheduling with distributed execution.

**Task Types**:
- `report_generation`: Generate reports
- `data_reconciliation`: Reconcile data
- `backup`: System backup
- `cleanup`: Delete old data
- `archival`: Archive historical data
- `sync`: Synchronize with external systems
- `custom`: User-defined tasks

**Features**:
- Cron expression support
- Distributed worker pool
- Task retry with exponential backoff
- Execution history and error logging
- Task queue and priority handling

**Core Classes**:
- `ExecutorTarefasAgendadas`: Task executor

**Key Methods**:
```typescript
// Create executor with worker pool
const executor = new ExecutorTarefasAgendadas({
  timezone: 'America/Sao_Paulo',
  max_workers: 4,
  max_tarefas_paralelas: 10
});

// Schedule task
const tarefa_id = await executor.agendarTarefa({
  nome: 'Daily Report Generation',
  tipo: 'report_generation',
  cron: '0 9 * * *', // 9 AM daily
  parametros: { tipo_relatorio: 'diario' },
  timeout_minutos: 60,
  retry_em_falha: true,
  handler: async () => {
    // Custom logic
    return { relatorio_id: 'rel-123' };
  }
});

// Execute immediately
const execucao_id = await executor.executarTarefa(tarefa_id);

// Manage task
await executor.pausarTarefa(tarefa_id);
await executor.resumirTarefa(tarefa_id);
await executor.cancelarTarefa(tarefa_id);

// List tasks
const tarefas = executor.listarTarefas({
  ativa: true,
  tipo: 'report_generation'
});

// Get execution history
const historico = executor.obterHistoricoExecucao(tarefa_id, 50);

// Statistics
const stats = executor.obterEstatisticas();
// { total_tarefas, tarefas_ativas, total_execucoes, taxa_sucesso, workers_ativos }
```

**Cron Format**:
```
* * * * *
│ │ │ │ │
│ │ │ │ └─ Day of Week (0-6, 0=Sunday)
│ │ │ └─── Month (1-12)
│ │ └───── Day of Month (1-31)
│ └─────── Hour (0-23)
└───────── Minute (0-59)

Examples:
0 9 * * *     - 9 AM every day
0 0 * * 1     - Midnight every Monday
*/15 * * * *  - Every 15 minutes
0 */4 * * *   - Every 4 hours
```

**Database Tables**:
- `scheduled_tasks`: Task definitions
- `task_executions`: Execution history

---

### 6. Event Stream & Change Capture (event-stream.ts)

**Purpose**: Event publishing for all ledger changes with replay capability.

**Event Types**:
- EntryCreated
- EntryModified
- EntryRetified
- PeriodClosed
- WorkflowApproved
- WorkflowRejected
- RuleExecuted
- TaskCompleted
- NotificationSent
- ComplianceViolation

**Features**:
- Event sourcing pattern
- Event replay for audit
- Projections (materialized views)
- Snapshots for performance
- Subscriber pattern for automation

**Core Classes**:
- `EventStream`: Event broker

**Key Methods**:
```typescript
const stream = new EventStream();

// Publish event
const evento_id = await stream.publicarEvento({
  tipo: 'EntryCreated',
  agregado_id: 'entry-123',
  agregado_tipo: 'entry',
  versao_agregado: 1,
  usuario_id: 'user-1',
  dados: { valor: 1000, conta: 'CC-001' },
  metadata: { origem: 'api' },
  id_transacao: 'txn-456'
});

// Subscribe to events
stream.inscreverEvento('EntryCreated', async (evento) => {
  console.log(`Nova entrada: ${evento.agregado_id}`);
  // Trigger automation rule
});

// Subscribe with filter
stream.inscreverEvento(['EntryCreated', 'EntryModified'], 
  async (evento) => {
    if (evento.dados.valor > 10000) {
      // Handle large transactions
    }
  },
  {
    filtro: (evento) => evento.dados.valor > 10000
  }
);

// Replay events
const replayed = await stream.replayEventos({
  tipos_evento: ['EntryCreated'],
  agregado_id: 'entry-123',
  desde_timestamp: '2026-09-01T00:00:00Z',
  ate_timestamp: '2026-09-30T23:59:59Z'
});

// Create projection
const projecao_id = stream.criarProjecao({
  nome: 'Daily Totals',
  tipos_evento: ['EntryCreated', 'EntryModified'],
  handler: (estado, evento) => ({
    ...estado,
    [evento.agregado_id]: evento.dados.valor
  })
});

// Get projection state
const projecao = stream.obterProjecao(projecao_id);

// Create snapshot
await stream.criarSnapshot('entry-123', 'entry', 5, {
  saldo: 5000,
  data_atualizacao: new Date()
});

// Get statistics
const stats = stream.obterEstatisticas();
// { total_eventos, eventos_por_tipo, ultimos_24h, subscriptores_ativos, projecoes }
```

**Database Tables**:
- `event_stream`: Event log
- `event_snapshots`: Snapshots for performance

---

### 7. Compliance & Policy Engine (engine-politicas-compliance.ts)

**Purpose**: Policy enforcement and compliance management.

**Policy Types**:
- Spending limits (max expense by category/user)
- Segregation of duties (prevent same user from conflicting operations)
- Approval rules (require specific approvers)
- Data retention (minimum retention periods)
- Audit trail (completeness checks)

**Compliance Regulations**:
- LGPD (Brazilian data protection)
- Lei 6404/76 (Brazilian corporate law)
- Resolução CFC (Accounting standards)
- GDPR (EU data protection)
- SOX (US securities regulation)

**Core Classes**:
- `EnginePoliticasCompliance`: Compliance orchestrator

**Key Methods**:
```typescript
const engine = new EnginePoliticasCompliance();

// Register policy
const politica_id = await engine.registrarPolitica({
  nome: 'Expense Limit',
  tipo: 'spending_limit',
  descricao: 'Maximum expense per user per day',
  criterios: { categoria: 'travel', periodo: 'daily' },
  limite: 5000,
  acao_em_violacao: 'block',
  legislacoes_aplicaveis: ['LGPD', 'Lei_6404']
});

// Register SOD rule
const sod_id = await engine.registrarRegraSegregacao({
  politica_id,
  operacao_1: 'create_entry',
  operacao_2: 'approve_entry',
  usuarios_mesmo_grupo_bloqueado: true
});

// Register approval rule
const aprv_id = await engine.registrarRegraAprovacao({
  politica_id,
  operacao: 'approve_large_expense',
  usuarios_que_podem_aprovar: ['CFO', 'Director'],
  usuarios_que_nao_podem: ['Requestor'],
  requer_multiplos_aprovadores: true,
  numero_aprovadores_requerido: 2
});

// Execute compliance check
const resultado = await engine.executarVerificacaoCompliance({
  usuario_id: 'user-1',
  operacao: 'create_entry',
  dados: { valor: 3000, categoria: 'travel' },
  contexto: { departamento: 'sales' }
});

// Check results
if (resultado.bloqueado) {
  console.log('Operação bloqueada:', resultado.violacoes);
} else if (resultado.avisos.length > 0) {
  console.log('Avisos:', resultado.avisos);
}

// Get violations
const violacoes = engine.obterViolacoes({
  usuario_id: 'user-1',
  severidade: 'critical',
  dias: 30
});

// Generate compliance report
const relatorio = await engine.gerarRelatorioConformidade(
  '2026-09-01T00:00:00Z',
  '2026-09-30T23:59:59Z'
);
// { total_violacoes, violacoes_por_tipo, usuarios_com_violacoes, legislacoes_e_conformidade }
```

**Violation Severity**:
- `info`: Informational only
- `warning`: Non-blocking warning
- `critical`: Blocking violation

**Database Tables**:
- `compliance_policies`: Policy definitions
- `compliance_violations`: Violation log
- `segregation_of_duties_rules`: SOD rules
- `compliance_audits`: Audit history

---

### 8. Workflow Dashboard & Monitoring (workflow-dashboard.ts)

**Purpose**: Workflow monitoring, performance metrics, and bottleneck detection.

**Key Metrics**:
- Average cycle time
- Approval rate
- Rejection rate
- Error rate
- SLA compliance
- Queue size
- Bottleneck detection

**Core Classes**:
- `DashboardFluxoTrabalho`: Dashboard controller

**Key Methods**:
```typescript
const dashboard = new DashboardFluxoTrabalho();

// Register workflow status
dashboard.registrarStatusFluxo({
  fluxo_id: 'fluxo-123',
  nome: 'Expense Approval',
  status: 'in_progress',
  progresso: 50,
  tempo_decorrido_minutos: 30,
  proxima_acao: 'Aguardando aprovação do director',
  proxima_acao_usuario: 'director-1'
});

// Add to processing queue
const item_id = dashboard.adicionarFilaProcessamento({
  fluxo_id: 'fluxo-123',
  tarefa_id: 'approval-step-1',
  prioridade: 'high',
  data_vencimento: '2026-09-17T17:00:00Z'
});

// Detect bottlenecks
const gargalos = dashboard.detectarGargalos();
// Identifies tasks with >5 pending items

// Get metrics
const metricas = dashboard.obterMetricasPerformance(30);
// {
//   tempo_medio_ciclo_minutos: 45,
//   taxa_aprovacao_percentual: 92,
//   numero_escalacoes_total: 5,
//   sla_compliance_percentual: 98
// }

// Generate report
const relatorio = await dashboard.gerarRelatorioPerformance(
  '2026-09-01T00:00:00Z',
  '2026-09-30T23:59:59Z'
);

// Get dashboard overview
const visao = dashboard.obterVisaoGeral();
// {
//   total_fluxos_ativos: 15,
//   fluxos_em_espera: 3,
//   fila_processamento_tamanho: 8,
//   alertas_pendentes: 2,
//   tempo_medio_ciclo_minutos: 45,
//   taxa_aprovacao: 92,
//   gargalos_detectados: 1
// }

// Manage alerts
const alertas = dashboard.obterAlertas({
  severidade: 'critical',
  resolvido: false
});

dashboard.resolverAlerta(alerta_id);
```

**Database Tables**:
- `workflow_dashboard_metrics`: Aggregated metrics
- `workflow_bottlenecks`: Bottleneck records
- `workflow_alerts`: Alert log

---

## Real-World Use Cases

### Use Case 1: Expense Approval Workflow

```
User submits expense → Auto-categorize (ML) → Route to manager
→ Manager approves → Auto-ledger entry → Notification sent
```

**Implementation**:
1. User submits expense via app
2. Automation rule categorizes expense
3. Approval workflow routes to manager based on amount
4. Manager approves → Event published
5. Event trigger creates ledger entry
6. Notification sent to user and accountant

### Use Case 2: Month-End Close Process

```
Day 25: Reminder sent → Collections task started
Day 28: Auto-consolidate all entries → Reports generated
Day 29: Finance director reviews → Approves
Day 30: Lock period → No manual entries allowed
```

**Implementation**:
1. Scheduled task at 9 AM on day 25 sends reminder
2. Collections process started (parallel tasks)
3. Automation rules consolidate entries
4. Process orchestrator manages workflow
5. Report generation task runs
6. Compliance engine verifies completeness
7. Period lock enforced

### Use Case 3: Compliance Monitoring

```
Daily: Check segregation of duties
→ Alert if violation → Manager review → Action required
→ Escalate if not resolved → Audit report generated
```

**Implementation**:
1. Scheduled task runs daily compliance check
2. Compliance engine verifies policies
3. Violations logged and escalated
4. Event published for notification
5. Audit trail maintained
6. Monthly compliance report generated

---

## Integration Guide

### With Ledger Module
```typescript
// Event from workflow triggers ledger entry
stream.inscreverEvento('WorkflowApproved', async (evento) => {
  if (evento.dados.tipo === 'expense') {
    await ledger.registrarLancamentoContabil({
      tipo: 'expense',
      valor: evento.dados.valor,
      origem_workflow: evento.agregado_id
    });
  }
});
```

### With Reports Module
```typescript
// Automation rule generates report
const regra_id = await rules.criarRegra({
  nome: 'Daily Revenue Report',
  trigger: { tipo: 'time', cron: '0 9 * * *' },
  condicoes: { campo: 'sempre', operador: '==', valor: true },
  acoes: [{
    tipo: 'run_report',
    parametros: { 
      tipo_relatorio: 'daily_revenue',
      formato: 'pdf'
    }
  }]
});
```

---

## Performance Optimization

### Metrics
- Workflow execution < 100ms for simple rules
- Event publishing < 50ms
- Compliance check < 200ms
- Dashboard metrics updated every 5 minutes

### Scaling
- Distributed task executor with worker pool
- Event stream supports 1000+ events/second
- Compliance checks cached with TTL
- Dashboard metrics materialized views

---

## Testing

### Test Coverage
- 200+ comprehensive test cases
- All 8 modules fully tested
- Integration tests for end-to-end workflows
- Database schema validation

### Running Tests
```bash
npm test -- workflow-automation.test.ts
```

---

## Deployment Checklist

- [ ] Database migration 004 applied
- [ ] All 8 modules deployed
- [ ] Tests passing (200+ cases)
- [ ] Approval rules configured
- [ ] Automation rules created
- [ ] Processes defined
- [ ] Notification channels configured
- [ ] Scheduled tasks deployed
- [ ] Compliance policies registered
- [ ] Dashboard metrics calculation started
- [ ] Event stream subscriptions active
- [ ] Monitoring and alerts configured

---

## Support & Troubleshooting

### Common Issues

**Approval not progressing**:
- Check workflow status: `engine.obterStatusFluxo(fluxo_id)`
- Verify approval steps: `status.passos`
- Check approver permissions

**Events not triggering automation**:
- Verify rule is active: `engine.obterRegra(regra_id).ativa`
- Check trigger configuration: `rule.trigger`
- Test event publication: `await engine.publicarEvento(...)`

**Compliance violations missed**:
- Verify policy is active and enabled
- Check policy criteria: `policy.criterios`
- Review violation log for details

---

## Version History

- **v1.0.0** (2026-09-16): Initial release
  - All 8 modules implemented
  - 200+ tests passing
  - Production-ready

---

## Next Steps (Phase 7)

- AI-powered process optimization
- Advanced analytics and predictions
- Mobile app support
- Real-time dashboards (WebSocket)
- External system integrations (SAP, Oracle)
- Machine learning for route prediction
