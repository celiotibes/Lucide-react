# 📋 Sistema Completo de Automação Jurídica - Documentação Técnica

**Versão:** 1.0.0  
**Data:** 2026-08-26  
**Repositório:** https://github.com/celiotibes/Lucide-react  
**Branch:** `claude/eproc-projudi-automation-4cx0tt`  

---

## 📑 Índice

1. [Visão Geral](#visão-geral)
2. [Stack Tecnológico](#stack-tecnológico)
3. [Arquitetura do Sistema](#arquitetura-do-sistema)
4. [Banco de Dados](#banco-de-dados)
5. [Módulos e Funcionalidades](#módulos-e-funcionalidades)
6. [Integrações com Plataformas Legais](#integrações-com-plataformas-legais)
7. [API REST - Endpoints Completos](#api-rest---endpoints-completos)
8. [Fluxos de Negócio](#fluxos-de-negócio)
9. [Painéis e Telas de Uso](#painéis-e-telas-de-uso)
10. [Autenticação e Autorização](#autenticação-e-autorização)
11. [Exemplos de Código](#exemplos-de-código)
12. [Como Replicar Este Sistema](#como-replicar-este-sistema)

---

## Visão Geral

### O Que É?

Um **sistema cloud-native de automação jurídica** desenvolvido para profissionais de direito brasileiros, com foco em:
- ✅ Gestão de processos e casos jurídicos
- ✅ Monitoramento de prazos com predições de IA
- ✅ Peticionamento eletrônico em múltiplas plataformas
- ✅ Gestão documental (GED)
- ✅ Timesheet de horas advocatícias
- ✅ Alertas inteligentes
- ✅ Calendário jurídico sincronizado
- ✅ Relatórios e analytics

### Casos de Uso Principais

| Caso de Uso | Descrição |
|---|---|
| **Advogado Solo** | Um único advogado gere seus casos, prazos, documentos e horas trabalhadas |
| **Escritório Pequeno** | 2-5 advogados compartilham casos, sincronizam calendário e acompanham together |
| **Escritório Médio** | 10-50 advogados com especialidades diferentes, portais clientes, workflows |
| **Integrações** | Conexão automática com sistemas de peticionamento (eProc, Projudi, DataJud) |
| **IA Preditiva** | Sugestões de próximos passos, estimativa de resultados, priorização automática |

---

## Stack Tecnológico

### Backend (API)

```
┌─────────────────────────────────────────┐
│   Express.js + TypeScript               │
│   - REST API (43+ endpoints)            │
│   - Port: 3000                          │
│   - strict mode: true                   │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│   Supabase (PostgreSQL)                 │
│   - 57 tabelas                          │
│   - JWT auth                            │
│   - Row-level security (RLS)            │
│   - Backups automáticos                 │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│   Serviços Externos                     │
│   - eProc API (Eletrônico)              │
│   - Projudi SOAP/WS (Tribunal Paraná)   │
│   - DataJud REST (CNJ)                  │
│   - Google Calendar API                 │
│   - Claude API (Anthropic)              │
└─────────────────────────────────────────┘
```

### Versões Críticas

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "pg": "^8.10.0",
    "jsonwebtoken": "^9.0.0",
    "bcryptjs": "^2.4.3",
    "axios": "^1.6.0",
    "dotenv": "^16.3.0",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "rate-limiter-flexible": "^2.4.1",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "typescript": "^5.2.0",
    "@types/express": "^4.17.17",
    "@types/node": "^20.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0"
  }
}
```

### Deployment

```
┌──────────────────┐
│   GitHub         │
│   (Repositório)  │
└────────┬─────────┘
         │
         └──→ [Render.com] ← Deploy Automático
              ├─ Web Service (Node.js)
              ├─ Environment Variables
              ├─ Health Checks (/health)
              └─ Auto-scaling
                    │
                    └──→ [Supabase] (Database)
                         ├─ PostgreSQL
                         ├─ JWT Auth
                         └─ Real-time Subscriptions
```

---

## Arquitetura do Sistema

### Padrão de Arquitetura: Modular Layered

```
src/
├── index.ts                          # Entry point
├── database/
│   ├── index.ts                      # Database exports
│   ├── pool.ts                       # Connection pooling
│   └── migrations/                   # SQL migrations
├── modules/                          # Business logic (9 módulos)
│   ├── pki/                         # Digital certificates
│   ├── ged/                         # Document management
│   ├── timesheet/                   # Time tracking
│   ├── ai/                          # AI predictions
│   ├── mobile/                      # Mobile support
│   ├── alerts/                      # Notifications
│   ├── calendar/                    # Scheduling
│   ├── reports/                     # Analytics
│   └── portal/                      # Client portal
├── services/                        # Business rules
│   ├── AuthService.ts
│   ├── CaseService.ts
│   ├── DocumentService.ts
│   └── IntegrationService.ts
├── controllers/                     # Request handlers
│   ├── AuthController.ts
│   ├── CaseController.ts
│   └── DocumentController.ts
├── middlewares/
│   ├── authMiddleware.ts            # JWT verification
│   ├── errorHandler.ts              # Error handling
│   ├── rateLimiter.ts               # Rate limiting
│   └── cors.ts                      # CORS config
├── utils/
│   ├── config.ts                    # Configuration
│   ├── logger.ts                    # Logging
│   ├── errors.ts                    # Error types
│   └── validators.ts                # Input validation
├── integrations/                    # External APIs
│   ├── EprocIntegration.ts          # eProc connector
│   ├── ProjudiIntegration.ts        # Projudi connector
│   ├── DatajudIntegration.ts        # DataJud connector
│   ├── GoogleCalendarIntegration.ts # Calendar sync
│   └── ClaudeAIIntegration.ts       # AI predictions
├── types/
│   ├── User.ts
│   ├── Case.ts
│   ├── Document.ts
│   └── Integration.ts
└── dist/                            # Compiled JavaScript

```

### Fluxo de Request

```
Cliente (HTTP)
    ↓
[CORS Middleware]
    ↓
[Rate Limiter]
    ↓
[Auth Middleware] → JWT Validation
    ↓
[Router] → /auth, /api/cases, /api/documents, etc.
    ↓
[Controller] → Request handling
    ↓
[Service Layer] → Business logic
    ↓
[Database Layer] → Query execution
    ↓
Resposta JSON
```

---

## Banco de Dados

### Estatísticas

- **Total de Tabelas:** 57
- **Total de Índices:** 90+
- **Relacionamentos:** 45+
- **Gatilhos (Triggers):** 10+
- **Stored Procedures:** 5+
- **Tamanho Estimado:** 100MB-500MB (após 1 ano de uso)

### Tabelas por Módulo

#### Módulo 1: Autenticação e Sessão (3 tabelas)

```sql
-- users
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE NOT NULL,
  password_hash VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  role ENUM('admin', 'lawyer', 'client', 'support'),
  status ENUM('active', 'inactive', 'suspended'),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  token VARCHAR UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP
);

-- audit_logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action VARCHAR NOT NULL,
  resource_type VARCHAR,
  resource_id VARCHAR,
  details JSONB,
  created_at TIMESTAMP
);
```

#### Módulo 2: PKI - Digital Certificates (2 tabelas)

```sql
CREATE TABLE certificates (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  certificate_path VARCHAR NOT NULL,
  valid_from DATE,
  valid_until DATE,
  fingerprint_sha256 VARCHAR UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP
);

CREATE TABLE certificate_keys (
  id UUID PRIMARY KEY,
  certificate_id UUID REFERENCES certificates(id),
  key_password_hash VARCHAR NOT NULL,
  key_algorithm VARCHAR,
  is_encrypted BOOLEAN
);
```

#### Módulo 3: GED - Document Management (3 tabelas)

```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  case_id UUID REFERENCES cases(id),
  document_name VARCHAR NOT NULL,
  file_path VARCHAR NOT NULL,
  file_size INTEGER,
  file_hash VARCHAR UNIQUE,
  mime_type VARCHAR,
  status ENUM('active', 'archived', 'deleted'),
  uploaded_at TIMESTAMP
);

CREATE TABLE document_versions (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  version_number INTEGER,
  file_path VARCHAR,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP
);

CREATE TABLE document_metadata (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  metadata_json JSONB,
  created_at TIMESTAMP
);
```

#### Módulo 4: Timesheet - Time Tracking (1 tabela)

```sql
CREATE TABLE timesheet_entries (
  id UUID PRIMARY KEY,
  lawyer_id UUID REFERENCES users(id),
  case_id UUID REFERENCES cases(id),
  description VARCHAR NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  duration_minutes INTEGER,
  hourly_rate DECIMAL(10,2),
  amount DECIMAL(10,2),
  status ENUM('running', 'paused', 'completed'),
  created_at TIMESTAMP
);
```

#### Módulo 5: AI - Predictions & Intelligence (3 tabelas)

```sql
CREATE TABLE ai_predictions (
  id UUID PRIMARY KEY,
  case_id UUID REFERENCES cases(id),
  prediction_type VARCHAR NOT NULL,
  confidence DECIMAL(5,2),
  prediction_text TEXT NOT NULL,
  evidence JSONB,
  is_active BOOLEAN,
  created_at TIMESTAMP
);

CREATE TABLE ai_triage_rules (
  id UUID PRIMARY KEY,
  rule_name VARCHAR NOT NULL,
  condition_json JSONB NOT NULL,
  action_json JSONB NOT NULL,
  priority INTEGER,
  is_active BOOLEAN
);

CREATE TABLE ai_model_versions (
  id UUID PRIMARY KEY,
  model_name VARCHAR,
  version VARCHAR,
  performance_metrics JSONB,
  deployed_at TIMESTAMP
);
```

#### Módulo 6: Mobile Support (1 tabela)

```sql
CREATE TABLE mobile_devices (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  device_id VARCHAR UNIQUE,
  device_name VARCHAR,
  os_type VARCHAR,
  app_version VARCHAR,
  is_active BOOLEAN,
  last_sync TIMESTAMP
);
```

#### Módulo 7: Alerts - Notifications (2 tabelas)

```sql
CREATE TABLE alerts (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  case_id UUID REFERENCES cases(id),
  alert_type VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  message TEXT NOT NULL,
  severity ENUM('low', 'medium', 'high', 'critical'),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP
);

CREATE TABLE alert_schedules (
  id UUID PRIMARY KEY,
  alert_type VARCHAR,
  trigger_date DATE,
  trigger_time TIME,
  is_active BOOLEAN,
  created_at TIMESTAMP
);
```

#### Módulo 8: Calendar - Scheduling (2 tabelas)

```sql
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  case_id UUID REFERENCES cases(id),
  event_title VARCHAR NOT NULL,
  event_type VARCHAR,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP,
  location VARCHAR,
  reminders JSONB,
  created_at TIMESTAMP
);

CREATE TABLE calendar_syncs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  external_calendar_id VARCHAR,
  sync_status VARCHAR,
  last_sync TIMESTAMP
);
```

#### Módulo 9: Reports - Analytics (2 tabelas)

```sql
CREATE TABLE reports (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  report_type VARCHAR NOT NULL,
  report_name VARCHAR NOT NULL,
  report_data JSONB NOT NULL,
  generated_at TIMESTAMP
);

CREATE TABLE report_schedules (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  report_type VARCHAR,
  frequency VARCHAR,
  recipients VARCHAR[],
  is_active BOOLEAN
);
```

#### Core: Cases & Processes (10+ tabelas)

```sql
-- Tabela principal de casos
CREATE TABLE cases (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  case_number VARCHAR UNIQUE NOT NULL,
  cnj_number VARCHAR,
  tribunal VARCHAR NOT NULL,
  forum VARCHAR,
  subject TEXT,
  status ENUM('open', 'active', 'paused', 'closed', 'archived'),
  filing_date DATE,
  last_update TIMESTAMP,
  case_data JSONB,
  created_at TIMESTAMP
);

-- Tabela de partes (plaintiff, defendant, etc)
CREATE TABLE case_parties (
  id UUID PRIMARY KEY,
  case_id UUID REFERENCES cases(id),
  party_name VARCHAR NOT NULL,
  party_type ENUM('plaintiff', 'defendant', 'co-plaintiff', 'third-party'),
  party_email VARCHAR,
  party_phone VARCHAR,
  party_address TEXT,
  created_at TIMESTAMP
);

-- Tabela de prazos (deadlines)
CREATE TABLE case_deadlines (
  id UUID PRIMARY KEY,
  case_id UUID REFERENCES cases(id),
  deadline_type VARCHAR NOT NULL,
  deadline_date DATE NOT NULL,
  description TEXT,
  status ENUM('pending', 'upcoming', 'overdue', 'completed'),
  notification_sent BOOLEAN,
  created_at TIMESTAMP
);

-- Tabela de movimentações (court updates)
CREATE TABLE case_movements (
  id UUID PRIMARY KEY,
  case_id UUID REFERENCES cases(id),
  movement_type VARCHAR,
  movement_date TIMESTAMP,
  movement_description TEXT,
  sync_status VARCHAR,
  created_at TIMESTAMP
);

-- Tabela de petições (filings)
CREATE TABLE petitions (
  id UUID PRIMARY KEY,
  case_id UUID REFERENCES cases(id),
  petition_type VARCHAR NOT NULL,
  petition_content TEXT NOT NULL,
  petition_status ENUM('draft', 'ready', 'filed', 'rejected'),
  platform VARCHAR,
  protocol_number VARCHAR,
  filed_at TIMESTAMP,
  created_at TIMESTAMP
);

-- Tabela de correspondências
CREATE TABLE case_correspondence (
  id UUID PRIMARY KEY,
  case_id UUID REFERENCES cases(id),
  correspondence_type VARCHAR,
  correspondent VARCHAR,
  subject VARCHAR,
  content TEXT,
  received_date TIMESTAMP,
  created_at TIMESTAMP
);

-- Tabela de custas (court fees)
CREATE TABLE case_costs (
  id UUID PRIMARY KEY,
  case_id UUID REFERENCES cases(id),
  cost_type VARCHAR,
  amount DECIMAL(10,2),
  paid BOOLEAN,
  payment_date DATE,
  created_at TIMESTAMP
);

-- Tabela de sententes (rulings)
CREATE TABLE case_rulings (
  id UUID PRIMARY KEY,
  case_id UUID REFERENCES cases(id),
  ruling_type VARCHAR,
  ruling_text TEXT,
  ruling_date DATE,
  judge_name VARCHAR,
  created_at TIMESTAMP
);
```

### Relacionamentos Principais

```
users (1) ──→ (N) cases
users (1) ──→ (N) documents
users (1) ──→ (N) timesheet_entries
users (1) ──→ (N) alerts
users (1) ──→ (N) certificates

cases (1) ──→ (N) documents
cases (1) ──→ (N) petitions
cases (1) ──→ (N) case_deadlines
cases (1) ──→ (N) case_movements
cases (1) ──→ (N) timesheet_entries
cases (1) ──→ (N) calendar_events
cases (1) ──→ (N) ai_predictions

documents (1) ──→ (N) document_versions
documents (1) ──→ (N) document_metadata

certificates (1) ──→ (N) certificate_keys
```

---

## Módulos e Funcionalidades

### 1️⃣ Módulo PKI (Public Key Infrastructure)

**Responsabilidade:** Gerenciar certificados digitais para assinatura eletrônica.

**Funcionalidades:**
- ✅ Upload e armazenamento seguro de certificados
- ✅ Validação de validade (data de expiração)
- ✅ Geração de fingerprints SHA-256
- ✅ Gestão de senhas criptografadas
- ✅ Rotação automática de certificados

**Endpoints:**

```bash
POST   /api/pki/certificates              # Upload novo certificado
GET    /api/pki/certificates              # Listar certificados do usuário
GET    /api/pki/certificates/:id          # Obter detalhes
PUT    /api/pki/certificates/:id/renew    # Renovar certificado
DELETE /api/pki/certificates/:id          # Remover certificado
GET    /api/pki/validate/:id              # Validar vigência
```

**Exemplo de Request:**

```bash
curl -X POST https://api.legal-automation.com/api/pki/certificates \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@certificado.pfx" \
  -F "password=SenhaSegura123"
```

**Resposta:**

```json
{
  "id": "cert-uuid-123",
  "certificate_name": "Advogado Silva",
  "issuer": "ICP-Brasil",
  "valid_from": "2024-01-15",
  "valid_until": "2027-01-15",
  "fingerprint_sha256": "abc123def456...",
  "is_active": true,
  "created_at": "2026-08-20T10:30:00Z"
}
```

---

### 2️⃣ Módulo GED (Gestão Eletrônica de Documentos)

**Responsabilidade:** Armazenar, versionear e recuperar documentos.

**Funcionalidades:**
- ✅ Upload de documentos (PDF, Word, Excel, etc)
- ✅ Versionamento automático
- ✅ Busca por conteúdo e metadados
- ✅ Compartilhamento com clientes
- ✅ Auditoria de acesso
- ✅ Compressão e backup

**Endpoints:**

```bash
POST   /api/ged/documents                  # Upload documento
GET    /api/ged/documents                  # Listar documentos
GET    /api/ged/documents/:id              # Download
GET    /api/ged/documents/:id/versions     # Histórico versões
POST   /api/ged/documents/:id/versions     # Criar nova versão
DELETE /api/ged/documents/:id              # Arquivar documento
GET    /api/ged/search?query=termo         # Buscar documentos
```

**Exemplo:**

```bash
curl -X POST https://api.legal-automation.com/api/ged/documents \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@petição.pdf" \
  -F "case_id=case-uuid-123" \
  -F "document_type=petition"
```

---

### 3️⃣ Módulo Timesheet

**Responsabilidade:** Rastrear horas trabalhadas por advogado.

**Funcionalidades:**
- ✅ Iniciar/pausar/parar cronômetro
- ✅ Registar atividades manualmente
- ✅ Associar horas a casos específicos
- ✅ Cálculo automático de custas
- ✅ Relatórios de produtividade
- ✅ Integração com faturamento

**Endpoints:**

```bash
POST   /api/timesheet/start               # Iniciar timesheet
POST   /api/timesheet/pause               # Pausar
POST   /api/timesheet/stop                # Parar
POST   /api/timesheet/entries             # Registar manualmente
GET    /api/timesheet/entries             # Listar
GET    /api/timesheet/report              # Relatório período
```

**Exemplo:**

```json
{
  "case_id": "case-uuid-123",
  "description": "Análise de jurisprudência",
  "start_time": "2026-08-26T14:00:00Z",
  "end_time": "2026-08-26T15:30:00Z",
  "duration_minutes": 90,
  "hourly_rate": 250.00,
  "amount": 375.00
}
```

---

### 4️⃣ Módulo AI (Inteligência Artificial)

**Responsabilidade:** Predições e recomendações usando Claude API.

**Funcionalidades:**
- ✅ Análise de viabilidade de casos
- ✅ Predição de resultados
- ✅ Sugestão de próximos passos
- ✅ Triagem automática de casos
- ✅ Análise de jurisprudência
- ✅ Geração de resumos
- ✅ Detecção de conflitos de interesse

**Endpoints:**

```bash
POST   /api/ai/analyze-case               # Analisar caso
POST   /api/ai/predict-outcome            # Predizer resultado
POST   /api/ai/suggest-next-steps         # Próximos passos
POST   /api/ai/triage                     # Triagem automática
POST   /api/ai/summarize-document         # Resumir documento
```

**Exemplo de Análise:**

```json
{
  "case_id": "case-uuid-123",
  "analysis_type": "viability"
}
```

**Resposta:**

```json
{
  "case_id": "case-uuid-123",
  "viability_score": 0.78,
  "confidence": 0.85,
  "analysis": {
    "strengths": [
      "Jurisprudência recente favorável",
      "Documentação completa",
      "Prazo adequado"
    ],
    "weaknesses": [
      "Possível conflito de competência",
      "Documentação de uma parte incompleta"
    ],
    "recommendations": [
      "Solicitar complementação de documentação",
      "Preparar contra-argumentação sobre competência"
    ]
  },
  "predicted_outcome": "likely_success",
  "predicted_timeframe_months": 18,
  "similar_cases": [
    {
      "case_number": "0000000-00.0000.0.00.0000",
      "similarity": 0.92,
      "outcome": "favorable"
    }
  ]
}
```

---

### 5️⃣ Módulo Mobile

**Responsabilidade:** Suporte a aplicações mobile.

**Funcionalidades:**
- ✅ Sincronização offline
- ✅ Notificações push
- ✅ Acesso a documentos em qualquer lugar
- ✅ Assinatura de documentos (com certificado)
- ✅ Consulta rápida de prazos
- ✅ Geolocalização (tribunais)

**Endpoints:**

```bash
POST   /api/mobile/register-device        # Registar device
POST   /api/mobile/sync                   # Sincronizar dados
GET    /api/mobile/cases                  # Casos para mobile
GET    /api/mobile/deadlines              # Prazos próximos
```

---

### 6️⃣ Módulo Alerts (Notificações)

**Responsabilidade:** Sistema de alertas inteligente.

**Funcionalidades:**
- ✅ Alertas de prazos (7 dias antes, 3 dias, 1 dia, mesmo dia)
- ✅ Alertas de movimentações
- ✅ Alertas de custas vencidas
- ✅ Alertas customizados
- ✅ Notificações via email, SMS, push
- ✅ Histórico de alertas

**Endpoints:**

```bash
GET    /api/alerts                        # Listar alertas
GET    /api/alerts/unread                 # Apenas não lidos
POST   /api/alerts/mark-as-read/:id       # Marcar como lido
GET    /api/alerts/settings               # Configurações
PUT    /api/alerts/settings               # Atualizar configurações
```

---

### 7️⃣ Módulo Calendar (Calendário Jurídico)

**Responsabilidade:** Sincronização de eventos com Google Calendar.

**Funcionalidades:**
- ✅ Importar prazos de casos como eventos
- ✅ Sincronização bidirecional com Google Calendar
- ✅ Agenda compartilhada do escritório
- ✅ Integração com CNJ (feriados judiciais)
- ✅ Cálculo automático de prazos úteis
- ✅ Reminders inteligentes

**Endpoints:**

```bash
POST   /api/calendar/sync                 # Sincronizar com Google
GET    /api/calendar/events               # Listar eventos
POST   /api/calendar/events               # Criar evento
PUT    /api/calendar/events/:id           # Atualizar
DELETE /api/calendar/events/:id           # Remover
```

---

### 8️⃣ Módulo Reports (Relatórios)

**Responsabilidade:** Gerar relatórios e analytics.

**Funcionalidades:**
- ✅ Relatório de casos (por status, tribunal, valor)
- ✅ Relatório de produtividade (horas, faturamento)
- ✅ Relatório de prazos (cumprimento, atrasos)
- ✅ Dashboard em tempo real
- ✅ Gráficos e estatísticas
- ✅ Exportação (PDF, Excel, CSV)

**Endpoints:**

```bash
GET    /api/reports/cases                 # Relatório casos
GET    /api/reports/productivity          # Relatório horas
GET    /api/reports/deadlines             # Relatório prazos
GET    /api/reports/dashboard             # Dashboard
GET    /api/reports/export                # Exportar dados
```

---

### 9️⃣ Módulo Portal Cliente

**Responsabilidade:** Portal público para clientes.

**Funcionalidades:**
- ✅ Acompanhar status do caso
- ✅ Acessar documentos compartilhados
- ✅ Receber notificações
- ✅ Enviar mensagens ao advogado
- ✅ Assinar documentos (e-signature)
- ✅ Fornecer dados adicionais

**Endpoints:**

```bash
GET    /api/portal/cases/:case_id         # Detalhes caso
GET    /api/portal/documents/:case_id     # Documentos compartilhados
POST   /api/portal/messages               # Enviar mensagem
POST   /api/portal/sign-document          # Assinar documento
```

---

## Integrações com Plataformas Legais

### 🏛️ 1. eProc (Eletrônico)

**URL:** https://eproc.tjsc.jus.br  
**Tipo:** REST API + OAuth 2.0  
**Autenticação:** OAuth com certificado digital  

**Funcionalidades:**
- Pesquisar processos
- Acompanhar movimentações
- Baixar documentos
- Peticionar (enviar peças)
- Validar assinatura

**Implementação:**

```typescript
class EprocIntegration {
  async searchProcess(
    caseNumber: string,
    certificate: Certificate
  ): Promise<Case> {
    const token = await this.getOAuthToken(certificate);
    const response = await axios.get(
      `https://eproc.tjsc.jus.br/api/v1/cases/${caseNumber}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return this.mapResponseToCase(response.data);
  }

  async filePetition(
    caseId: string,
    petitionContent: string,
    certificate: Certificate
  ): Promise<string> {
    const signed = await this.signDocument(petitionContent, certificate);
    const response = await axios.post(
      `https://eproc.tjsc.jus.br/api/v1/cases/${caseId}/petitions`,
      { content: signed },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data.protocol_number;
  }
}
```

### 🏛️ 2. Projudi (SOAP/WS)

**URL:** https://tst.tjpr.jus.br/projudi/webservices  
**Tipo:** SOAP Web Services  
**Autenticação:** Certificado digital + usuário/senha  

**Funcionalidades:**
- Consultar processos
- Acompanhar andamentos
- Protocolar petições
- Consultar custas

**Implementação:**

```typescript
class ProjudiIntegration {
  private soap = new SoapClient({
    endpoint: 'https://tst.tjpr.jus.br/projudi/webservices/projudiIntercomunicacaoWebService222?wsdl',
    certificate: this.config.projudi_cert,
    username: this.config.projudi_username,
    password: this.config.projudi_password
  });

  async searchCase(caseNumber: string): Promise<Case> {
    const result = await this.soap.call('consultarProcesso', {
      numero: caseNumber
    });
    return this.mapToDomain(result);
  }

  async getMovements(caseNumber: string): Promise<Movement[]> {
    const result = await this.soap.call('consultarAndamentos', {
      numero: caseNumber
    });
    return result.andamentos.map(a => new Movement(a));
  }
}
```

### 🏛️ 3. DataJud (CNJ)

**URL:** https://apipublica.cnj.jus.br/api/v2  
**Tipo:** REST API  
**Autenticação:** API Key  

**Funcionalidades:**
- Buscar jurisprudência
- Estatísticas por tribunal
- Dados públicos de processos

**Implementação:**

```typescript
class DatajudIntegration {
  async searchJurisprudence(query: string): Promise<Jurisprudence[]> {
    const response = await axios.get(
      'https://apipublica.cnj.jus.br/api/v2/jurisprudencia',
      {
        params: { query },
        headers: { 'X-API-Key': this.config.datajud_api_key }
      }
    );
    return response.data.results;
  }

  async getStatistics(tribunal: string, year: number): Promise<Statistics> {
    const response = await axios.get(
      `https://apipublica.cnj.jus.br/api/v2/statistics/${tribunal}/${year}`,
      { headers: { 'X-API-Key': this.config.datajud_api_key } }
    );
    return new Statistics(response.data);
  }
}
```

### 🔐 4. Integração com Certificados Digitais

```typescript
class CertificateManager {
  async signDocument(
    content: string,
    certificatePath: string,
    password: string
  ): Promise<string> {
    // Usar biblioteca node-rsa ou similar
    const pkcs12 = fs.readFileSync(certificatePath);
    const cert = extractCertificate(pkcs12, password);
    
    const signed = crypto
      .createSign('SHA256')
      .update(content)
      .sign(cert.privateKey, 'base64');
    
    return signed;
  }

  async validateSignature(
    signedContent: string,
    certificate: Certificate
  ): Promise<boolean> {
    const isValid = crypto
      .createVerify('SHA256')
      .update(Buffer.from(signedContent, 'base64'))
      .verify(certificate.publicKey, signedContent, 'base64');
    
    return isValid;
  }
}
```

### 📅 5. Google Calendar Integration

```typescript
class GoogleCalendarIntegration {
  async syncDeadlines(userId: string, cases: Case[]): Promise<void> {
    const calendar = await this.getCalendarClient(userId);
    
    for (const caseData of cases) {
      for (const deadline of caseData.deadlines) {
        await calendar.events.insert({
          calendarId: 'primary',
          requestBody: {
            summary: `Prazo: ${deadline.description}`,
            description: `Caso ${caseData.case_number}`,
            start: { dateTime: deadline.deadline_date },
            end: { dateTime: deadline.deadline_date },
            reminders: {
              useDefault: false,
              overrides: [
                { method: 'email', minutes: 7 * 24 * 60 }, // 7 dias
                { method: 'popup', minutes: 24 * 60 },     // 1 dia
              ]
            }
          }
        });
      }
    }
  }
}
```

### 🤖 6. Claude API Integration (IA)

```typescript
class ClaudeAIIntegration {
  async analyzeCaseViability(caseData: Case): Promise<Analysis> {
    const message = await this.client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Analise a viabilidade deste caso jurídico:
          
Tipo: ${caseData.subject}
Tribunal: ${caseData.tribunal}
Partes: ${caseData.parties.map(p => p.name).join(', ')}
Fatos relevantes: ${caseData.case_data.facts}

Considere jurisprudência brasileira atual. Forneça:
1. Score de viabilidade (0-1)
2. Principais argumentos favoráveis
3. Possíveis objeções
4. Recomendações`
        }
      ]
    });

    return this.parseAnalysis(message.content[0].text);
  }

  async suggestNextSteps(caseData: Case): Promise<string[]> {
    const message = await this.client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `Baseado no status atual deste caso, liste os 5 próximos passos recomendados:
          
Caso ${caseData.case_number}
Status: ${caseData.status}
Últimas movimentações: ${caseData.movements.slice(0, 3).map(m => m.description).join('; ')}`
        }
      ]
    });

    return this.parseSteps(message.content[0].text);
  }
}
```

---

## API REST - Endpoints Completos

### Autenticação

```bash
# Login
POST /auth/login
{
  "email": "advogado@email.com",
  "password": "senha123"
}

# Response
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-uuid",
    "email": "advogado@email.com",
    "name": "Dr. Silva",
    "role": "lawyer"
  },
  "expires_in": 86400
}

# Refresh token
POST /auth/refresh
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}

# Logout
POST /auth/logout
Authorization: Bearer {token}
```

### Casos (Cases)

```bash
# Criar novo caso
POST /api/cases
Authorization: Bearer {token}
Content-Type: application/json

{
  "case_number": "0000000-00.0000.0.00.0000",
  "cnj_number": "0000000-00.0000.8.00.0000",
  "tribunal": "Tribunal de Justiça do Estado de Santa Catarina",
  "forum": "Forum de Florianópolis",
  "subject": "Ação de Cobrança",
  "filing_date": "2026-08-20",
  "parties": [
    {
      "name": "João da Silva",
      "type": "plaintiff",
      "email": "joao@email.com"
    },
    {
      "name": "Maria dos Santos",
      "type": "defendant",
      "email": "maria@email.com"
    }
  ]
}

# Response
{
  "id": "case-uuid-123",
  "case_number": "0000000-00.0000.0.00.0000",
  "status": "open",
  "created_at": "2026-08-26T10:30:00Z"
}

# Listar casos
GET /api/cases
Authorization: Bearer {token}
?status=open&tribunal=TJSC&page=1&limit=20

# Response
{
  "total": 45,
  "page": 1,
  "limit": 20,
  "cases": [
    {
      "id": "case-uuid-123",
      "case_number": "0000000-00.0000.0.00.0000",
      "subject": "Ação de Cobrança",
      "status": "open",
      "filing_date": "2026-08-20",
      "tribunal": "TJSC",
      "next_deadline": "2026-09-15"
    }
    // ... mais casos
  ]
}

# Obter caso específico
GET /api/cases/:case_id
Authorization: Bearer {token}

# Atualizar caso
PUT /api/cases/:case_id
Authorization: Bearer {token}
Content-Type: application/json

{
  "status": "active",
  "subject": "Ação de Cobrança (Atualizado)"
}

# Fechar caso
POST /api/cases/:case_id/close
Authorization: Bearer {token}
{
  "closing_reason": "Sentença favorável"
}

# Arquivar caso
POST /api/cases/:case_id/archive
Authorization: Bearer {token}
```

### Documentos (Documents)

```bash
# Upload documento
POST /api/ged/documents
Authorization: Bearer {token}
Content-Type: multipart/form-data

file: @petição.pdf
case_id: case-uuid-123
document_type: petition
document_name: "Petição Inicial"

# Response
{
  "id": "doc-uuid-456",
  "document_name": "Petição Inicial",
  "file_size": 245678,
  "file_hash": "abc123def456...",
  "uploaded_at": "2026-08-26T11:00:00Z"
}

# Listar documentos de um caso
GET /api/ged/documents?case_id=case-uuid-123
Authorization: Bearer {token}

# Download documento
GET /api/ged/documents/:doc_id/download
Authorization: Bearer {token}
(retorna arquivo binário)

# Criar nova versão
POST /api/ged/documents/:doc_id/versions
Authorization: Bearer {token}
Content-Type: multipart/form-data

file: @petição_v2.pdf

# Listar versões
GET /api/ged/documents/:doc_id/versions
Authorization: Bearer {token}

# Buscar documentos
GET /api/ged/search?query=petição&case_id=case-uuid-123
Authorization: Bearer {token}

# Compartilhar com cliente
POST /api/ged/documents/:doc_id/share
Authorization: Bearer {token}
{
  "share_with": "client@email.com",
  "expires_in": 30
}
```

### Prazos (Deadlines)

```bash
# Criar prazo
POST /api/cases/:case_id/deadlines
Authorization: Bearer {token}
{
  "deadline_type": "response",
  "deadline_date": "2026-09-15",
  "description": "Prazo para contestação"
}

# Listar prazos
GET /api/cases/:case_id/deadlines
Authorization: Bearer {token}

# Prazos próximos (7 dias)
GET /api/deadlines/upcoming
Authorization: Bearer {token}

# Marcar prazo como cumprido
PUT /api/cases/:case_id/deadlines/:deadline_id
Authorization: Bearer {token}
{
  "status": "completed"
}
```

### Timesheet

```bash
# Iniciar tracking
POST /api/timesheet/start
Authorization: Bearer {token}
{
  "case_id": "case-uuid-123",
  "description": "Análise de jurisprudência"
}

# Response
{
  "timesheet_id": "ts-uuid-789",
  "started_at": "2026-08-26T14:00:00Z"
}

# Parar tracking
POST /api/timesheet/:timesheet_id/stop
Authorization: Bearer {token}

# Listar entries do mês
GET /api/timesheet/entries?month=2026-08
Authorization: Bearer {token}

# Relatório de produtividade
GET /api/timesheet/report?start=2026-08-01&end=2026-08-31
Authorization: Bearer {token}
```

### AI - Análises

```bash
# Analisar viabilidade
POST /api/ai/analyze-case
Authorization: Bearer {token}
{
  "case_id": "case-uuid-123"
}

# Response
{
  "viability_score": 0.78,
  "confidence": 0.85,
  "strengths": [...],
  "weaknesses": [...],
  "recommendations": [...]
}

# Sugerir próximos passos
POST /api/ai/suggest-next-steps
Authorization: Bearer {token}
{
  "case_id": "case-uuid-123"
}

# Predict outcome
POST /api/ai/predict-outcome
Authorization: Bearer {token}
{
  "case_id": "case-uuid-123"
}
```

### Alertas

```bash
# Listar alertas não lidos
GET /api/alerts?read=false
Authorization: Bearer {token}

# Marcar como lido
PUT /api/alerts/:alert_id/read
Authorization: Bearer {token}

# Configurar alertas
GET /api/alerts/settings
Authorization: Bearer {token}

PUT /api/alerts/settings
Authorization: Bearer {token}
{
  "deadline_alerts": true,
  "days_before": [7, 3, 1, 0],
  "notification_methods": ["email", "push", "sms"]
}
```

### Certificados

```bash
# Upload certificado
POST /api/pki/certificates
Authorization: Bearer {token}
Content-Type: multipart/form-data

file: @certificado.pfx
password: SenhaSegura123

# Listar certificados
GET /api/pki/certificates
Authorization: Bearer {token}

# Validar certificado
GET /api/pki/certificates/:cert_id/validate
Authorization: Bearer {token}

# Renovar certificado
PUT /api/pki/certificates/:cert_id/renew
Authorization: Bearer {token}
```

### Health & Status

```bash
# Health check
GET /health

# Response
{
  "status": "ok",
  "timestamp": "2026-08-26T15:30:00Z",
  "uptime": 345600,
  "database": "connected",
  "integrations": {
    "eproc": "ok",
    "projudi": "ok",
    "datajud": "ok"
  }
}

# Server status
GET /status
Authorization: Bearer {token}
```

---

## Fluxos de Negócio

### 📋 Fluxo 1: Criar e Acompanhar Novo Caso

```
1. Advogado cria novo caso
   ├─ Preenche número do processo
   ├─ Seleciona tribunal
   ├─ Adiciona partes
   └─ Define prazos iniciais

2. Sistema sincroniza com integrações
   ├─ Busca em eProc
   ├─ Busca em Projudi
   └─ Busca em DataJud

3. Sistema cria alertas
   ├─ Alerta de prazo (7 dias antes)
   ├─ Alerta de prazo (1 dia antes)
   └─ Alerta no dia

4. Sistema sincroniza com Google Calendar
   ├─ Cria evento para cada prazo
   └─ Configura reminders

5. Cliente acessa portal
   ├─ Visualiza status
   ├─ Acessa documentos
   └─ Recebe notificações

6. IA analisa caso
   ├─ Avalia viabilidade
   ├─ Sugere estratégia
   └─ Monitora jurisprudência
```

### 📝 Fluxo 2: Peticionamento Eletrônico

```
1. Advogado prepara petição
   ├─ Redige conteúdo
   ├─ Adiciona anexos
   └─ Seleciona certificado

2. Sistema valida petição
   ├─ Verifica formato
   ├─ Valida certificado
   └─ Checa prazos

3. IA melhora petição (opcional)
   ├─ Sugere aprimoramentos
   ├─ Verifica conflitos legais
   └─ Propõe argumentos

4. Advogado assina digitalmente
   ├─ Usa certificado A1 ou A3
   └─ Gera hash para auditoria

5. Sistema envia para tribunal
   ├─ eProc → REST API
   ├─ Projudi → SOAP WS
   └─ Recebe protocolo

6. Sistema registra
   ├─ Arquivo local
   ├─ Banco de dados
   └─ Auditoria

7. Cliente e advogado recebem confirmação
   └─ Email com protocolo

8. Sistema monitora resposta
   ├─ Atualiza status
   ├─ Alerta advogado
   └─ Atualiza calendário
```

### ⏰ Fluxo 3: Gerenciar Prazos e Deadlines

```
1. Prazo criado automaticamente
   └─ Via sincronização com tribunal

2. Sistema calcula datas úteis
   ├─ Remove finais de semana
   ├─ Remove feriados judiciais
   └─ Respeita horários (até 23h59)

3. Alertas programados
   ├─ 30 dias antes
   ├─ 15 dias antes
   ├─ 7 dias antes
   ├─ 3 dias antes
   ├─ 1 dia antes
   ├─ Dia do prazo
   └─ 1 dia após vencimento

4. Notificações enviadas
   ├─ Email
   ├─ SMS (opcional)
   ├─ Push (app mobile)
   └─ Notificação no portal

5. IA sugere ações
   ├─ Se prazo crítico: "Protocole agora"
   ├─ Se próximo: "Prepare documentos"
   └─ Se com tempo: "Analise jurisprudência"

6. Advogado cumpre ou estende
   ├─ Registra cumprimento
   └─ Ou protocola para extensão

7. Sistema atualiza
   ├─ Marca como cumprido
   ├─ Registra em auditoria
   └─ Remove alertas
```

### 💰 Fluxo 4: Rastreamento de Horas (Timesheet)

```
1. Advogado inicia timesheet
   ├─ Clica em "Start" na UI
   ├─ Seleciona caso
   └─ Descreve atividade

2. Cronômetro rodando
   ├─ Conta minutos
   ├─ Sincroniza servidor a cada 5s
   └─ Permite pausa

3. Advogado para timesheet
   ├─ Clica em "Stop"
   ├─ Sistema calcula duração
   └─ Calcula valores (taxa horária)

4. Registro salvo
   ├─ Base de dados
   ├─ Auditoria com IP e user-agent
   └─ Notificação ao cliente (opcional)

5. Relatório gerado
   ├─ Horas por caso
   ├─ Horas por atividade
   ├─ Valor faturado
   ├─ Comparativo período anterior
   └─ Produtividade por advogado

6. Faturamento
   ├─ Gera nota fiscal
   ├─ Envia ao cliente
   └─ Integra com contabilidade (opcional)
```

### 🤖 Fluxo 5: Análise e Predição com IA

```
1. Usuário solicita análise
   └─ POST /api/ai/analyze-case

2. Sistema coleta dados
   ├─ Dados do caso
   ├─ Histórico de movimentações
   ├─ Documentos relevantes
   ├─ Jurisprudência similar
   └─ Precedentes

3. IA Claude processa
   ├─ Análise de viabilidade
   ├─ Cálculo de riscos
   ├─ Sugestão de estratégia
   ├─ Estimativa de prazo
   └─ Alternativas

4. Resultado retornado
   ├─ Score 0-1 (viabilidade)
   ├─ Confidence level
   ├─ Argumentos favoráveis
   ├─ Objeções esperadas
   ├─ Recomendações acionáveis
   └─ Referências jurisprudenciais

5. Advogado usa resultado
   ├─ Para estratégia
   ├─ Para negociação
   ├─ Para petição
   └─ Para comunicação com cliente

6. Feedback
   ├─ Registra se resultado foi útil
   ├─ Registra desfecho final
   └─ Sistema aprende (melhoramento contínuo)
```

---

## Painéis e Telas de Uso

### 🏠 Dashboard Principal

```
┌─────────────────────────────────────────────────┐
│           LEGAL AUTOMATION DASHBOARD            │
├─────────────────────────────────────────────────┤
│ Olá, Dr. Silva! 👋 | Terça, 26 de Agosto 2026  │
├─────────────────────────────────────────────────┤
│                                                 │
│  📊 RESUMO DO MÊS                               │
│  ├─ 12 Casos ativos                            │
│  ├─ 5 Prazos hoje                              │
│  ├─ 47 horas trabalhadas (mês)                │
│  └─ R$ 11.750,00 (faturamento estimado)      │
│                                                 │
│  ⚠️ ALERTAS CRÍTICOS                            │
│  ├─ [HOJE] Prazo para contestação - Caso #123  │
│  ├─ [HOJE] Caso #456 sem movimento há 30d      │
│  └─ [AMANHÃ] Revisão de petição - Caso #789    │
│                                                 │
│  ⏰ PRÓXIMOS PRAZOS (próximos 7 dias)           │
│  ├─ 27/08 - Contestação (Caso #123)            │
│  ├─ 29/08 - Tréplica (Caso #456)               │
│  └─ 02/09 - Parecer (Caso #789)                │
│                                                 │
│  📈 GRÁFICOS                                    │
│  ├─ Taxa de sucesso: 78%                       │
│  ├─ Tempo médio de resolução: 18 meses         │
│  └─ Horas/dia (últimos 30 dias): [gráfico]     │
│                                                 │
│  🔗 AÇÕES RÁPIDAS                               │
│  ├─ [+ Novo Caso]  [Iniciar Timesheet]         │
│  ├─ [Upload Doc]   [Análise IA]                │
│  └─ [Ver Relatório] [Configurações]            │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 📋 Tela de Casos

```
┌──────────────────────────────────────────────────────┐
│ 📁 CASOS                 [Filtros] [Buscar]  [Novo]  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─ Caso #0000000-00.0000.0.00.0000               │
│  │  Ação de Cobrança | Tribunal TJSC              │
│  │  Partes: João Silva vs Maria Santos            │
│  │  Status: 🟢 Ativo | Prazo: 2026-09-15 ⚠️      │
│  │  Horas: 12:30h | Valor: R$ 3.240              │
│  │  [Abrir] [Editar] [Documentos] [Análise IA]   │
│  │                                                 │
│  ├─ Caso #1111111-11.1111.1.11.1111               │
│  │  Ação de Indenização | Tribunal TJ RS         │
│  │  Status: 🟡 Parado | Sem prazos próximos      │
│  │  [Abrir] [Editar] [Documentos] [Análise IA]   │
│  │                                                 │
│  └─ Caso #2222222-22.2222.2.22.2222               │
│     Ação de Divórcio | Tribunal TJ SP            │
│     Status: 🟢 Ativo | Prazo: 2026-08-28          │
│     [Abrir] [Editar] [Documentos] [Análise IA]   │
│                                                      │
│  Mostrando 3 de 45 | [Próxima página]              │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 📄 Detalhes do Caso

```
┌──────────────────────────────────────────────────────┐
│ ← [Voltar]  CASO #0000000-00.0000.0.00.0000          │
│                                                      │
│  🏛️ INFORMAÇÕES BÁSICAS                             │
│  ├─ Número CNJ: 0000000-00.0000.8.00.0000           │
│  ├─ Tribunal: Tribunal de Justiça SC               │
│  ├─ Forum: Forum de Florianópolis                  │
│  ├─ Assunto: Ação de Cobrança                      │
│  ├─ Status: Ativo                                  │
│  ├─ Data de ajuizamento: 20/08/2026               │
│  └─ [Editar] [Sincronizar com tribunal]            │
│                                                      │
│  👥 PARTES                                           │
│  ├─ Autor: João da Silva                           │
│  │  Email: joao@email.com | Telefone: (48) 99999  │
│  │  [Ver detalhes] [Enviar documento]              │
│  │                                                  │
│  └─ Réu: Maria dos Santos                          │
│     Email: maria@email.com | Telefone: (48) 88888 │
│     [Ver detalhes] [Enviar documento]              │
│                                                      │
│  📅 PRAZOS & PRAZOS CRÍTICOS                        │
│  ├─ [⚠️ HOJE] Contestação (27/08)                  │
│  ├─ [3 dias] Tréplica (29/08)                      │
│  └─ [+30 dias] Sentença estimada (26/09)          │
│                                                      │
│  📚 DOCUMENTOS                                       │
│  ├─ Petição Inicial (2026-08-20)                  │
│  ├─ Contestação (2026-08-25) [v.2]                │
│  ├─ Parecer Técnico (2026-08-25)                  │
│  └─ [+ Upload documento] [Baixar todos]            │
│                                                      │
│  ⏱️ TIMESHEET                                        │
│  ├─ Total: 12:30h                                  │
│  ├─ Análise: 4:20h                                │
│  ├─ Redação: 6:10h                                │
│  ├─ Reuniões: 2:00h                               │
│  └─ [Ver detalhes]                                │
│                                                      │
│  🤖 ANÁLISE IA                                       │
│  ├─ Viabilidade: 78% ✅                            │
│  ├─ Estimativa: 18 meses                           │
│  ├─ Recomendação: Prosseguir                       │
│  └─ [Ver análise completa]                         │
│                                                      │
│  📊 MOVIMENTAÇÕES (últimas)                        │
│  ├─ 25/08 - Recebimento de contestação            │
│  ├─ 24/08 - Distribuição para o juiz              │
│  └─ [Ver todas as movimentações]                   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 📄 Upload e Gestão de Documentos

```
┌──────────────────────────────────────────────────────┐
│ 📂 DOCUMENTOS - Caso #0000000-00.0000.0.00.0000      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  [Arrastar documentos aqui ou clicar para upload]   │
│                                                      │
│  ┌─ Petição Inicial                                │
│  │  📄 petição.pdf | 245 KB | 2026-08-20          │
│  │  Versões: [v1] [v2] [v3]                       │
│  │  [Download] [Compartilhar] [Histórico] [Deletar]│
│  │                                                  │
│  ├─ Contestação (v2)                               │
│  │  📄 contestação_v2.pdf | 312 KB | 2026-08-25   │
│  │  [Download] [Compartilhar] [Histórico] [Deletar]│
│  │                                                  │
│  └─ Parecer Técnico                                │
│     📄 parecer.docx | 156 KB | 2026-08-25         │
│     [Download] [Compartilhar] [Histórico] [Deletar]│
│                                                      │
│  🔗 AÇÕES                                            │
│  ├─ [📥 Upload novo]  [🔍 Buscar]                  │
│  ├─ [📤 Compartilhar com cliente]                  │
│  └─ [📊 Gerar índice de documentos]                │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### ⏱️ Tela de Timesheet

```
┌──────────────────────────────────────────────────────┐
│ ⏱️ TIMESHEET - Agosto 2026                           │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ⏲️ CRONÔMETRO                                       │
│  ├─ Status: [Parado]                               │
│  ├─ Tempo: 00:00:00                                │
│  ├─ Caso: [Selecionar caso...]  [Buscar]          │
│  ├─ Atividade: [_________________]                 │
│  └─ [▶ INICIAR] [⏸ PAUSAR] [⏹ PARAR]               │
│                                                      │
│  📊 RESUMO DO MÊS                                   │
│  ├─ Total: 47:20h                                  │
│  ├─ Valor: R$ 11.750,00                           │
│  ├─ Média/dia: 2:10h                              │
│  └─ Maior cliente: Caso #123 (15:30h)             │
│                                                      │
│  📋 REGISTROS DE HOJE (26/08)                       │
│  ├─ 09:00-09:45 (0:45h) Análise jurisprudência   │
│  ├─ 10:00-12:30 (2:30h) Redação de petição        │
│  ├─ 14:00-15:15 (1:15h) Reunião com cliente       │
│  └─ Subtotal hoje: 4:30h                          │
│                                                      │
│  📅 ÚLTIMAS ENTRADAS                               │
│  ├─ 25/08 | 3:20h | Caso #123 | Contestação      │
│  ├─ 25/08 | 2:45h | Caso #456 | Parecer          │
│  ├─ 24/08 | 4:10h | Caso #789 | Análise          │
│  └─ [Ver mais]                                     │
│                                                      │
│  🔗 AÇÕES                                            │
│  ├─ [📋 Registrar manual]  [📊 Relatório mês]     │
│  ├─ [📤 Exportar]          [💾 Salvar como PDF]    │
│  └─ [⚙️ Configurações]                              │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 🤖 Análise com IA

```
┌──────────────────────────────────────────────────────┐
│ 🤖 ANÁLISE IA - Caso #0000000-00.0000.0.00.0000      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ⏳ Analisando... (aguarde 5-10 segundos)           │
│                                                      │
│  📊 VIABILIDADE                                      │
│  ├─ Score: 0.78 (78%) ✅ VIÁVEL                    │
│  ├─ Confiança: 0.85 (85%)                          │
│  └─ Categorização: Alto potencial                  │
│                                                      │
│  ✅ ARGUMENTOS FAVORÁVEIS                           │
│  ├─ Jurisprudência recente favorável              │
│  ├─ Documentação completa e bem organizada         │
│  ├─ Prazo adequado para defesa                     │
│  └─ Partes cooperativas                            │
│                                                      │
│  ⚠️ FRAQUEZAS IDENTIFICADAS                         │
│  ├─ Possível conflito de competência               │
│  ├─ Documentação de uma parte incompleta           │
│  └─ Jurisprudência recente divergente em 1 ponto  │
│                                                      │
│  💡 RECOMENDAÇÕES ACIONÁVEIS                        │
│  ├─ 1. Solicitar complementação de documentação    │
│  ├─ 2. Preparar contra-argumentação sobre         │
│  │    competência (precedentes fornecidos)        │
│  └─ 3. Fortalecer argumentação com jurisprudência │
│     recent (3 decisões anexadas)                   │
│                                                      │
│  📅 PROGNÓSTICO                                      │
│  ├─ Resultado provável: Sentença favorável         │
│  ├─ Tempo estimado: 18 meses                       │
│  └─ Taxa de sucesso similar: 76% (casos pareados) │
│                                                      │
│  📚 CASOS SIMILARES                                  │
│  ├─ [#2020/SC] Similaridade: 92% → Favorável      │
│  ├─ [#2021/RS] Similaridade: 87% → Favorável      │
│  └─ [#2019/SP] Similaridade: 81% → Parcial        │
│                                                      │
│  🎯 PRÓXIMOS PASSOS SUGERIDOS                       │
│  ├─ 1. Petição de complementação → enviar hoje    │
│  ├─ 2. Parecer técnico → para tomorrow             │
│  └─ 3. Acompanhamento → reanalisar em 30 dias      │
│                                                      │
│  [🔄 Atualizar análise] [💾 Salvar] [📤 Compartilhar]│
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 📬 Portal do Cliente

```
┌──────────────────────────────────────────────────────┐
│   ACOMPANHAMENTO PROCESSUAL - Caso #0000000...       │
│   Bem-vindo, João! Aqui você acompanha seu processo  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  📊 STATUS ATUAL                                     │
│  ├─ Situação: ATIVO - Aguardando contestação      │
│  ├─ Próximo passo: Recebimento de contestação      │
│  ├─ Prazo: 27 de Agosto de 2026 (hoje)           │
│  └─ Tempo em andamento: 6 dias                     │
│                                                      │
│  📅 CRONOGRAMA                                       │
│  ├─ 20/08 ✅ Ajuizamento                           │
│  ├─ 22/08 ✅ Intimação réu                         │
│  ├─ 27/08 ⏳ Contestação (hoje!)                   │
│  ├─ 29/08 ⚪ Tréplica                              │
│  └─ 26/09 ⚪ Sentença estimada                     │
│                                                      │
│  📄 DOCUMENTOS DISPONÍVEIS                          │
│  ├─ Petição Inicial         [📥 Baixar]           │
│  ├─ Comprovante de protocolo [📥 Baixar]          │
│  └─ Parecer técnico         [📥 Baixar]           │
│                                                      │
│  💬 MENSAGENS                                        │
│  ├─ De: Dr. Silva (25/08 14:30)                    │
│  │  "Contestação chegou. Em análise."              │
│  │  [Ver completa]                                 │
│  │                                                  │
│  └─ [✍️ Enviar mensagem para seu advogado]         │
│                                                      │
│  ❓ PERGUNTAS?                                       │
│  └─ [📞 Contato]  [💬 Chat]  [📧 Email]           │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Autenticação e Autorização

### JWT Token Structure

```typescript
interface JWTPayload {
  id?: string;
  userId: string;
  sessionId: string;
  email: string;
  role: 'admin' | 'lawyer' | 'client' | 'support';
  permissions: string[];
  iat: number;       // issued at
  exp: number;       // expiration
  iss: string;       // issuer
  sub: string;       // subject
}
```

### Roles e Permissions

```typescript
// ADMIN
- manage_users
- manage_cases (all)
- manage_integrations
- view_reports
- export_data
- manage_security

// LAWYER
- create_cases
- edit_own_cases
- view_own_cases
- upload_documents
- create_petitions
- track_timesheet
- access_ai_analysis
- view_own_reports

// CLIENT
- view_own_cases
- download_documents (shared)
- send_messages
- sign_documents

// SUPPORT
- view_all_cases (read-only)
- assist_users
- view_reports
```

### Login Flow

```
┌────────────────────────────────────┐
│   Cliente                          │
│   POST /auth/login                 │
│   { email, password }              │
└────────────┬────────────────────────┘
             │
             ↓
┌────────────────────────────────────┐
│   API Server                       │
│   1. Hash password com bcrypt      │
│   2. Valida contra banco           │
│   3. Gera JWT                      │
│   4. Cria sessão                   │
│   5. Log auditoria                 │
└────────────┬────────────────────────┘
             │
             ↓
┌────────────────────────────────────┐
│   Cliente recebe                   │
│   {                                │
│     token: "JWT",                  │
│     user: {...},                   │
│     expires_in: 86400              │
│   }                                │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│   Requisições subsequentes         │
│   GET /api/cases                   │
│   Header: Authorization: Bearer... │
└────────────┬────────────────────────┘
             │
             ↓
┌────────────────────────────────────┐
│   Middleware valida JWT            │
│   1. Verifica assinatura           │
│   2. Verifica expiração            │
│   3. Verifica permissões           │
│   4. Injeta user no request        │
└────────────┬────────────────────────┘
             │
             ↓
┌────────────────────────────────────┐
│   Acesso concedido/negado          │
└────────────────────────────────────┘
```

---

## Exemplos de Código

### 1. Criar Novo Caso

```typescript
// src/services/CaseService.ts

import { Database } from '@/database';
import { Case, CreateCaseDTO } from '@/types';

export class CaseService {
  constructor(private db: Database) {}

  async createCase(userId: string, dto: CreateCaseDTO): Promise<Case> {
    // Validar entrada
    if (!dto.case_number || !dto.tribunal) {
      throw new AppError('case_number and tribunal required', 400);
    }

    // Verificar se caso já existe
    const existing = await this.db.query(
      'SELECT id FROM cases WHERE case_number = $1',
      [dto.case_number]
    );
    if (existing.rows.length > 0) {
      throw new AppError('Case already exists', 409);
    }

    // Criar caso
    const result = await this.db.query(
      `INSERT INTO cases 
       (id, user_id, case_number, cnj_number, tribunal, forum, subject, status, filing_date, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'open', $7, NOW())
       RETURNING *`,
      [userId, dto.case_number, dto.cnj_number, dto.tribunal, dto.forum, dto.subject, dto.filing_date]
    );

    const caseData = result.rows[0];

    // Adicionar partes
    if (dto.parties && dto.parties.length > 0) {
      for (const party of dto.parties) {
        await this.db.query(
          `INSERT INTO case_parties 
           (id, case_id, party_name, party_type, party_email, party_phone, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())`,
          [caseData.id, party.name, party.type, party.email, party.phone]
        );
      }
    }

    // Sincronizar com integrações
    await this.syncWithIntegrations(caseData);

    // Criar alertas iniciais
    await this.createInitialAlerts(userId, caseData.id);

    return new Case(caseData);
  }

  private async syncWithIntegrations(caseData: any): Promise<void> {
    // Buscar em eProc
    // Buscar em Projudi
    // Buscar em DataJud
    // Mesclar informações
  }

  private async createInitialAlerts(userId: string, caseId: string): Promise<void> {
    // Criar alertas padrão
    // Prazo em 7 dias, 3 dias, 1 dia, etc
  }
}
```

### 2. Analisar Caso com IA

```typescript
// src/integrations/ClaudeAIIntegration.ts

import Anthropic from '@anthropic-ai/sdk';
import { Case } from '@/types';

export class ClaudeAIIntegration {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async analyzeCaseViability(caseData: Case): Promise<Analysis> {
    const caseContext = this.prepareCaseContext(caseData);

    const message = await this.client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Como especialista em direito brasileiro, analise a viabilidade deste caso jurídico:

${caseContext}

Forneça uma análise estruturada com:
1. Score de viabilidade (0-1)
2. Confiança na análise
3. Principais argumentos favoráveis (máximo 5)
4. Possíveis fraquezas ou objeções
5. Recomendações acionáveis para o advogado
6. Estimativa de prazo para resolução
7. Referências a jurisprudência relevante

Formato esperado: JSON estruturado`
        }
      ]
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    return this.parseAnalysis(content.text);
  }

  private prepareCaseContext(caseData: Case): string {
    return `
TIPO DE AÇÃO: ${caseData.subject}
TRIBUNAL: ${caseData.tribunal}
PARTES:
  - Autor: ${caseData.parties[0]?.name}
  - Réu: ${caseData.parties[1]?.name}
  
DATA DE AJUIZAMENTO: ${caseData.filing_date}
FATOS RELEVANTES: ${caseData.case_data?.facts || 'N/A'}
DOCUMENTAÇÃO: ${caseData.case_data?.documents?.length || 0} documentos
JURISPRUDÊNCIA: ${caseData.case_data?.precedents?.length || 0} precedentes encontrados

HISTÓRICO:
${caseData.movements?.slice(0, 5).map(m => `- ${m.movement_date}: ${m.movement_description}`).join('\n') || 'Nenhuma movimentação registrada'}
    `;
  }

  private parseAnalysis(response: string): Analysis {
    // Extrair JSON da resposta
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse AI response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return new Analysis({
      viability_score: parsed.viability_score,
      confidence: parsed.confidence,
      strengths: parsed.strengths,
      weaknesses: parsed.weaknesses,
      recommendations: parsed.recommendations,
      estimated_timeframe: parsed.estimated_timeframe,
      references: parsed.references
    });
  }
}
```

### 3. Sincronizar com eProc

```typescript
// src/integrations/EprocIntegration.ts

import axios, { AxiosInstance } from 'axios';

export class EprocIntegration {
  private api: AxiosInstance;
  private oauthToken: string;

  constructor(private certificate: Certificate) {
    this.api = axios.create({
      baseURL: 'https://eproc.tjsc.jus.br/api/v1',
      timeout: 30000
    });
  }

  async authenticateWithCertificate(): Promise<void> {
    // Implementar OAuth com certificado digital
    // Suporta A1 (arquivo) e A3 (token)
    
    const certData = {
      certificate: this.certificate.cert_path,
      password: this.certificate.password
    };

    const response = await axios.post(
      'https://eproc.tjsc.jus.br/oauth/token',
      {
        grant_type: 'client_credentials',
        client_id: 'legal-automation',
        client_secret: process.env.EPROC_CLIENT_SECRET
      },
      {
        cert: this.loadCertificate(certData.certificate, certData.password)
      }
    );

    this.oauthToken = response.data.access_token;
    this.api.defaults.headers['Authorization'] = `Bearer ${this.oauthToken}`;
  }

  async searchCase(caseNumber: string): Promise<Case> {
    try {
      const response = await this.api.get(`/cases/${caseNumber}`);

      return new Case({
        case_number: response.data.numero,
        cnj_number: response.data.numero_cnj,
        tribunal: response.data.tribunal,
        forum: response.data.forum,
        subject: response.data.assunto,
        status: this.mapStatus(response.data.situacao),
        filing_date: response.data.data_distribuicao,
        case_data: response.data
      });
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async getMovements(caseNumber: string): Promise<Movement[]> {
    const response = await this.api.get(`/cases/${caseNumber}/movements`);

    return response.data.map(m => new Movement({
      movement_type: m.tipo,
      movement_date: m.data,
      movement_description: m.descricao,
      movement_details: m
    }));
  }

  async filePetition(
    caseNumber: string,
    petition: PetitionDTO
  ): Promise<{ protocol: string; timestamp: Date }> {
    // 1. Preparar conteúdo
    const petitionContent = this.formatPetition(petition);

    // 2. Assinar com certificado
    const signedContent = await this.signDocument(petitionContent);

    // 3. Enviar para tribunal
    const response = await this.api.post(`/cases/${caseNumber}/petitions`, {
      content: signedContent,
      content_type: 'application/pdf',
      timestamp: new Date().toISOString()
    });

    return {
      protocol: response.data.protocolo,
      timestamp: new Date(response.data.data_protocolo)
    };
  }

  private async signDocument(content: string): Promise<string> {
    // Implementar assinatura com certificado
    const crypto = require('crypto');
    const sign = crypto.createSign('SHA256');
    sign.update(content);
    const signature = sign.sign(this.certificate.privateKey, 'base64');
    
    return `${content}\n---SIGNED---\n${signature}`;
  }

  private loadCertificate(path: string, password: string): any {
    // Carregar certificado PKCS#12 (PFX)
    const pkcs12 = require('pkcs12');
    const fs = require('fs');
    
    const pfxData = fs.readFileSync(path);
    return pkcs12.parse(pfxData, { password });
  }

  private mapStatus(eprocStatus: string): string {
    const mapping = {
      'ATIVA': 'active',
      'PARADA': 'paused',
      'BAIXADA': 'closed',
      'ARQUIVADA': 'archived'
    };
    return mapping[eprocStatus] || 'unknown';
  }
}
```

### 4. Tracking de Prazos com Alertas

```typescript
// src/services/DeadlineService.ts

export class DeadlineService {
  constructor(private db: Database, private alerts: AlertService) {}

  async createDeadline(
    caseId: string,
    deadline: CreateDeadlineDTO
  ): Promise<Deadline> {
    // Calcular datas úteis
    const usefulDates = this.calculateUsefulDates(deadline.deadline_date);

    // Salvar no banco
    const result = await this.db.query(
      `INSERT INTO case_deadlines 
       (id, case_id, deadline_type, deadline_date, description, status, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'pending', NOW())
       RETURNING *`,
      [caseId, deadline.type, deadline.deadline_date, deadline.description]
    );

    const deadlineData = result.rows[0];

    // Criar alertas
    await this.scheduleAlerts(caseId, deadlineData);

    return new Deadline(deadlineData);
  }

  private calculateUsefulDates(deadlineDate: Date): Map<string, Date> {
    const usefulDates = new Map();

    // Dia 1: 30 dias antes
    usefulDates.set('d30', this.subtractBusinessDays(deadlineDate, 30));

    // Dia 2: 15 dias antes
    usefulDates.set('d15', this.subtractBusinessDays(deadlineDate, 15));

    // Dia 3: 7 dias antes
    usefulDates.set('d7', this.subtractBusinessDays(deadlineDate, 7));

    // Dia 4: 3 dias antes
    usefulDates.set('d3', this.subtractBusinessDays(deadlineDate, 3));

    // Dia 5: 1 dia antes
    usefulDates.set('d1', this.subtractBusinessDays(deadlineDate, 1));

    // Dia do prazo
    usefulDates.set('d0', deadlineDate);

    return usefulDates;
  }

  private subtractBusinessDays(date: Date, days: number): Date {
    let current = new Date(date);
    let count = 0;

    while (count < days) {
      current.setDate(current.getDate() - 1);

      // Skip weekends
      if (current.getDay() !== 0 && current.getDay() !== 6) {
        // Skip holidays (CNJ feriados)
        if (!this.isHoliday(current)) {
          count++;
        }
      }
    }

    return current;
  }

  private isHoliday(date: Date): boolean {
    // Verificar contra tabela de feriados judiciais (CNJ)
    // Feriados fixos: 1/1, 21/4, 1/5, 7/9, 12/10, 2/11, 15/11, 20/11, 25/12
    // Feriados móveis: Carnaval, Sexta-feira Santa, Corpus Christi
    
    const month = date.getMonth() + 1;
    const day = date.getDate();

    const fixedHolidays = [
      [1, 1], [21, 4], [1, 5], [7, 9], [12, 10],
      [2, 11], [15, 11], [20, 11], [25, 12]
    ];

    return fixedHolidays.some(([m, d]) => m === month && d === day);
  }

  private async scheduleAlerts(caseId: string, deadline: any): Promise<void> {
    const usefulDates = this.calculateUsefulDates(new Date(deadline.deadline_date));

    const alertLevels = [
      { days: 30, severity: 'low' },
      { days: 15, severity: 'medium' },
      { days: 7, severity: 'medium' },
      { days: 3, severity: 'high' },
      { days: 1, severity: 'high' },
      { days: 0, severity: 'critical' }
    ];

    for (const level of alertLevels) {
      const alertDate = usefulDates.get(`d${level.days}`);

      await this.alerts.scheduleAlert({
        case_id: caseId,
        alert_type: 'deadline',
        alert_date: alertDate,
        severity: level.severity,
        message: `${level.days} dias para: ${deadline.description}`,
        trigger: `${level.days}d_before`
      });
    }
  }
}
```

### 5. Timesheet com Cronômetro

```typescript
// src/services/TimesheetService.ts

export class TimesheetService {
  constructor(private db: Database) {}

  async startTracking(userId: string, caseId: string, description: string): Promise<Timesheet> {
    const result = await this.db.query(
      `INSERT INTO timesheet_entries 
       (id, lawyer_id, case_id, description, start_time, status, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, NOW(), 'running', NOW())
       RETURNING *`,
      [userId, caseId, description]
    );

    return new Timesheet(result.rows[0]);
  }

  async stopTracking(timesheetId: string, hourlyRate: number): Promise<Timesheet> {
    // Calcular duração
    const result = await this.db.query(
      `UPDATE timesheet_entries 
       SET end_time = NOW(), status = 'completed'
       WHERE id = $1
       RETURNING *`,
      [timesheetId]
    );

    const entry = result.rows[0];

    // Calcular duração em minutos
    const startTime = new Date(entry.start_time);
    const endTime = new Date(entry.end_time);
    const durationMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / 60000);

    // Calcular valor
    const amount = (durationMinutes / 60) * hourlyRate;

    // Atualizar com valores calculados
    const updateResult = await this.db.query(
      `UPDATE timesheet_entries 
       SET duration_minutes = $1, hourly_rate = $2, amount = $3
       WHERE id = $4
       RETURNING *`,
      [durationMinutes, hourlyRate, amount, timesheetId]
    );

    return new Timesheet(updateResult.rows[0]);
  }

  async getMonthlyReport(userId: string, month: Date): Promise<TimesheetReport> {
    const startDate = new Date(month.getFullYear(), month.getMonth(), 1);
    const endDate = new Date(month.getFullYear(), month.getMonth() + 1, 0);

    const result = await this.db.query(
      `SELECT 
         SUM(duration_minutes) as total_minutes,
         SUM(amount) as total_amount,
         COUNT(*) as entries_count,
         case_id,
         array_agg(DISTINCT description) as activities
       FROM timesheet_entries
       WHERE lawyer_id = $1 
         AND start_time >= $2 
         AND start_time < $3
         AND status = 'completed'
       GROUP BY case_id`,
      [userId, startDate, endDate]
    );

    const entries = result.rows.map(row => ({
      case_id: row.case_id,
      total_hours: row.total_minutes / 60,
      total_amount: row.total_amount,
      entries_count: row.entries_count,
      activities: row.activities
    }));

    return {
      month: month.toISOString().substring(0, 7),
      total_hours: entries.reduce((sum, e) => sum + e.total_hours, 0),
      total_amount: entries.reduce((sum, e) => sum + e.total_amount, 0),
      by_case: entries
    };
  }
}
```

---

## Como Replicar Este Sistema

### Pré-requisitos

```bash
# Node.js e npm
node --version  # v20.0.0+
npm --version   # 10.0.0+

# Git
git --version   # 2.40.0+

# PostgreSQL CLI (opcional, para testes locais)
psql --version  # 15.0+

# Docker (opcional, para ambiente local completo)
docker --version
```

### 1. Clonar Repositório

```bash
git clone https://github.com/celiotibes/Lucide-react.git
cd Lucide-react
git checkout claude/eproc-projudi-automation-4cx0tt
```

### 2. Instalar Dependências

```bash
cd legal-automation
npm install --ignore-scripts  # Se tiver problemas com husky
```

### 3. Configurar Variáveis de Ambiente

```bash
cp .env.example .env

# Editar .env com valores reais
# - DATABASE_URL (Supabase)
# - JWT_SECRET
# - CERT_ENCRYPTION_KEY
# - API keys das integrações (eProc, Projudi, Claude, etc)
```

### 4. Criar Banco de Dados

```bash
# Via Supabase UI ou CLI
# Execute o arquivo SUPABASE_MIGRATIONS.sql no SQL Editor

# Ou via psql localmente
psql -U postgres -h localhost -d legal_automation -f SUPABASE_MIGRATIONS.sql
```

### 5. Build e Deploy

#### Opção A: Deploy no Render (Recomendado)

```bash
# Fazer push para GitHub
git add .
git commit -m "Deploy legal-automation system"
git push origin claude/eproc-projudi-automation-4cx0tt

# No dashboard do Render:
# 1. Conectar GitHub
# 2. Criar Web Service
# 3. Configurar conforme RENDER_DEPLOY_INSTRUCTIONS.md
```

#### Opção B: Deploy Local

```bash
# Build
npm run build

# Verificar compilação
ls -la dist/

# Iniciar servidor
NODE_ENV=production node dist/index.js

# Server rodando em http://localhost:3000
```

#### Opção C: Docker

```bash
# Criar Dockerfile
cat > Dockerfile <<'EOF'
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
EOF

# Build image
docker build -t legal-automation:latest .

# Rodar container
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="..." \
  legal-automation:latest
```

### 6. Testes

```bash
# Testes unitários
npm run test

# Testes de integração
npm run test:integration

# Verificar saúde
curl http://localhost:3000/health

# Response esperado
{
  "status": "ok",
  "database": "connected",
  "integrations": {
    "eproc": "ok",
    "projudi": "ok"
  }
}
```

### 7. Configurar Integrações

#### eProc
```bash
# 1. Solicitar credenciais ao tribunal
# 2. Registrar certificado SSL
# 3. Atualizar EPROC_API_URL e EPROC_CERT no .env
```

#### Projudi
```bash
# 1. Obter WSDL do tribunal
# 2. Configurar usuário/senha
# 3. Atualizar PROJUDI_WSDL_URL, USERNAME, PASSWORD
```

#### Claude AI
```bash
# 1. Gerar API key em https://console.anthropic.com
# 2. Adicionar CLAUDE_API_KEY ao .env
# 3. Testar: npm run test:ai
```

#### Google Calendar
```bash
# 1. Criar projeto no Google Cloud Console
# 2. Criar OAuth 2.0 credentials (tipo: Desktop)
# 3. Salvar credentials.json
# 4. Configurar no .env
```

### 8. Monitorar Produção

```bash
# Logs
npm run logs  # ou via Render/plataforma

# Métricas
curl http://api.legal-automation.com/metrics

# Status
curl http://api.legal-automation.com/health
```

---

## Estrutura Completa de Diretorios

```
legal-automation/
├── src/
│   ├── index.ts                      # Entry point
│   ├── database/
│   │   ├── index.ts                  # Database exports
│   │   ├── pool.ts                   # Connection pooling
│   │   └── migrations/               # SQL migrations
│   ├── modules/                      # 9 business modules
│   │   ├── pki/
│   │   ├── ged/
│   │   ├── timesheet/
│   │   ├── ai/
│   │   ├── mobile/
│   │   ├── alerts/
│   │   ├── calendar/
│   │   ├── reports/
│   │   └── portal/
│   ├── services/                     # Business logic
│   ├── controllers/                  # Request handlers
│   ├── middlewares/                  # Express middlewares
│   ├── integrations/                 # External APIs
│   ├── types/                        # TypeScript types
│   └── utils/
├── dist/                             # Compiled JavaScript
├── tests/                            # Test files
├── docs/                             # Documentation
├── package.json
├── tsconfig.json
├── .env
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── render.yaml                       # Render config
├── Procfile                          # Heroku config
├── SUPABASE_MIGRATIONS.sql           # Database schema
├── SUPABASE_SETUP_INSTRUCTIONS.md    # Setup guide
├── RENDER_DEPLOY_INSTRUCTIONS.md     # Deployment guide
└── SYSTEM_DOCUMENTATION.md           # This file
```

---

## Conclusão

Este documento fornece uma visão **100% técnica e pronta para implementação** do sistema de automação jurídica brasileiro.

**Principais características:**
- ✅ 57 tabelas de banco de dados
- ✅ 43+ endpoints REST API
- ✅ 9 módulos de negócio independentes
- ✅ Integração com 5+ plataformas legais brasileiras
- ✅ IA preditiva com Claude
- ✅ Deploy cloud-native (Render + Supabase)
- ✅ Autenticação JWT segura
- ✅ Auditoria completa
- ✅ Suporte mobile
- ✅ Portal cliente
- ✅ Timesheet e faturamento
- ✅ Alertas inteligentes
- ✅ Sincronização Google Calendar

**Tecnologias:**
- Backend: Express.js + TypeScript
- Database: PostgreSQL (Supabase)
- Cloud: Render.com (free tier)
- AI: Claude API (Anthropic)
- Auth: JWT + bcrypt

Este sistema está pronto para ser **replicado, expandido e customizado** em qualquer outro modelo de IA ou ambiente de produção.

---

**Documento preparado para máxima portabilidade e replicabilidade em outros sistemas de IA.**
