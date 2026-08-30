# 🚀 Guia Completo de Setup Local - CRMT Gestão Imobiliária

## 📋 Requisitos Mínimos

### Obrigatórios
- **Node.js** 18+ (recomendado 20+)
- **npm** ou **yarn** (vem com Node.js)
- **PostgreSQL** 14+ (local ou Docker)
- **Git**

### Opcionais (Para recursos avançados)
- **Docker** + **Docker Compose** (para Postgres, Metabase, N8N)
- **Supabase CLI** (para migrations automáticas)
- **Anthropic API Key** (para IA - pode usar sem para testes básicos)

---

## ✅ Passo 1: Clonar o Repositório

```bash
git clone https://github.com/celiotibes/lucide-react.git
cd lucide-react
git checkout claude/crmt-imobiliaria-erp-design-w794ml
```

---

## ✅ Passo 2: Instalar Dependências Node.js

```bash
npm install
# ou
yarn install
```

**O que será instalado:**
- Next.js 15.5.4 (framework web)
- Supabase JS client (ORM para PostgreSQL)
- React 19 (UI)
- TypeScript (type safety)
- Vitest (testes)
- Playwright (testes E2E)
- ExcelJS, PDFKit (geração de documentos)
- Recharts (gráficos)
- TesseractJS (OCR)

---

## ✅ Passo 3: Configurar PostgreSQL Local

### Opção A: PostgreSQL com Docker (RECOMENDADO)

**Criar arquivo `docker-compose.db.yml`:**

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: crmt-postgres
    restart: always
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: crmt_user
      POSTGRES_PASSWORD: crmt_senha_123
      POSTGRES_DB: crmt_db
      POSTGRES_INITDB_ARGS: "-E UTF8"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U crmt_user -d crmt_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: crmt-pgadmin
    restart: always
    ports:
      - "5050:80"
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@crmt.local
      PGADMIN_DEFAULT_PASSWORD: admin123
    depends_on:
      - postgres
    volumes:
      - pgadmin_data:/var/lib/pgadmin

volumes:
  postgres_data:
  pgadmin_data:
```

**Iniciar containers:**

```bash
docker-compose -f docker-compose.db.yml up -d
```

**Verificar status:**

```bash
docker-compose -f docker-compose.db.yml ps
```

**Acessar pgAdmin (GUI):**
- URL: http://localhost:5050
- Email: admin@crmt.local
- Senha: admin123

---

### Opção B: PostgreSQL Instalado Localmente

**macOS (Homebrew):**
```bash
brew install postgresql@16
brew services start postgresql@16
createuser crmt_user -P  # Digitar senha: crmt_senha_123
createdb -O crmt_user crmt_db
```

**Ubuntu/Debian:**
```bash
sudo apt-get install postgresql postgresql-contrib
sudo -u postgres createuser crmt_user
sudo -u postgres psql -c "ALTER USER crmt_user WITH PASSWORD 'crmt_senha_123';"
sudo -u postgres createdb -O crmt_user crmt_db
```

**Windows (PostgreSQL Installer):**
1. Baixar de https://www.postgresql.org/download/windows/
2. Instalar com usuario: `crmt_user`, senha: `crmt_senha_123`
3. Selecionar PostgreSQL 16+

---

## ✅ Passo 4: Carregar Schema do Banco de Dados

### Opção A: Com Supabase CLI

```bash
npm install -g supabase
supabase start
supabase db push
```

### Opção B: Com psql (Recomendado para Desenvolvimento Local)

```bash
# Conectar ao banco
psql -U crmt_user -d crmt_db -h localhost

# Dentro do psql, executar schema:
\i database/schema.sql

# Opcional - carregar dados de exemplo:
\i database/seed-portfolio-floripa-kitnets.sql

# Verificar tabelas criadas:
\dt

# Sair
\q
```

### Opção C: SQL direto (Docker)

```bash
docker exec -i crmt-postgres psql -U crmt_user -d crmt_db < database/schema.sql
docker exec -i crmt-postgres psql -U crmt_user -d crmt_db < database/seed-portfolio-floripa-kitnets.sql
```

---

## ✅ Passo 5: Configurar Variáveis de Ambiente

**Criar arquivo `.env.local` na raiz do projeto:**

```bash
# ========================================
# DATABASE - Connection String Local
# ========================================
DATABASE_URL=postgres://crmt_user:crmt_senha_123@localhost:5432/crmt_db

# ========================================
# SUPABASE (Opcional - use com credentials locais)
# ========================================
# Se está usando Supabase Cloud:
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key

# Se está usando Supabase Local:
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ========================================
# ANTHROPIC API (Opcional para IA)
# ========================================
# Pegar em: https://console.anthropic.com/settings/keys
# Se não tiver chave, sistema roda sem IA
ANTHROPIC_API_KEY=sk-ant-...

# ========================================
# EMAIL (Opcional para notificações)
# ========================================
EMAIL_ADMIN_NOTIFICACOES=admin@seudominio.com.br
RESEND_API_KEY=re_...  # Para enviar emails via Resend
```

**Importante:**
- NUNCA commitar `.env.local` (já está no .gitignore)
- A `DATABASE_URL` é a configuração CRÍTICA

---

## ✅ Passo 6: Iniciar Servidor de Desenvolvimento

```bash
npm run dev
```

**Saída esperada:**
```
  ▲ Next.js 15.5.4
  - Local:        http://localhost:3000
  - Environments: .env.local
```

**Acessar em:**
- 🌐 http://localhost:3000
- 📊 API disponível em http://localhost:3000/api

---

## 📊 Passo 7 (OPCIONAL): Ativar Metabase para BI

**Criar dados BI no banco (primeira vez):**

```bash
docker exec -i crmt-postgres psql -U crmt_user -d crmt_db < database/schema_bi_warehouse.sql
docker exec -i crmt-postgres psql -U crmt_user -d crmt_db < database/views-analytics.sql
```

**Iniciar Metabase:**

```bash
docker-compose -f docker-compose.metabase.yml up -d
```

**Acessar Metabase:**
- URL: http://localhost:3000
- Setup inicial (primeira vez): conectar ao banco

---

## 🤖 Passo 8 (OPCIONAL): Ativar N8N para Automações

```bash
docker-compose -f docker-compose.n8n.yml up -d
```

**Acessar N8N:**
- URL: http://localhost:5678
- Criar conta e conectar ao banco

---

## 🧪 Testando o Sistema

### 1️⃣ Verificar Conexão com Banco

```bash
npm run test
```

Ou manualmente via psql:

```bash
psql -U crmt_user -d crmt_db -h localhost -c "SELECT COUNT(*) FROM properties;"
```

### 2️⃣ Testar API

```bash
# Terminal 1: Iniciar servidor
npm run dev

# Terminal 2: Fazer requisição
curl http://localhost:3000/api/health
```

### 3️⃣ Executar Testes E2E (Playwright)

```bash
npm run test:e2e
```

### 4️⃣ Type Check (TypeScript)

```bash
npm run typecheck:server
```

---

## 🏗️ Estrutura do Projeto

```
lucide-react/
├── app/                          # Aplicação Next.js
│   ├── api/                      # APIs REST
│   │   ├── leases/               # Contratos
│   │   ├── inspections/          # Vistorias
│   │   ├── payments/             # Pagamentos
│   │   └── audit-logs/           # Auditoria
│   ├── dashboard/                # Dashboard principal
│   ├── properties/               # Gestão de imóveis
│   ├── tenants/                  # Gestão de inquilinos
│   └── admin/                    # Painel administrativo
│
├── src/
│   ├── services/                 # Lógica de negócio
│   │   ├── LeaseService.ts       # Contratos
│   │   ├── CriticalDatesService.ts # Prazos críticos (10/30/40/60)
│   │   ├── InspectionService.ts  # Vistorias eletrônicas
│   │   ├── OccupancyService.ts   # Regras de ocupação
│   │   ├── LaundryService.ts     # Franquia de lavanderia
│   │   ├── AuditService.ts       # Auditoria (Lei 12.682/2012)
│   │   └── JobScheduler.ts       # Agendador de tarefas
│   │
│   ├── integrations/             # Integrações externas
│   │   ├── StrDetectionService.ts    # Detecção AirBnB/Booking
│   │   ├── SerAsaService.ts          # Integração SERASA
│   │   └── WebhookService.ts         # Webhooks
│   │
│   ├── types/                    # TypeScript interfaces
│   └── utils/                    # Utilitários
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Cliente Supabase (com RLS)
│   │   ├── server.ts             # Server-side Supabase
│   │   └── serviceClient.ts      # Service role (bypassa RLS)
│   └── validations/              # Validadores (CPF, CNPJ, etc)
│
├── database/                     # Migrações SQL
│   ├── schema.sql                # Schema principal
│   ├── audit-compliance.sql      # Auditoria (Lei 12.682/2012)
│   ├── views-analytics.sql       # Views para BI
│   └── seed-*.sql                # Dados de exemplo
│
├── .env.example                  # Template de variáveis
├── .env.local                    # Variáveis locais (NÃO commitar)
├── docker-compose.db.yml         # Docker Postgres (novo)
├── docker-compose.metabase.yml   # Docker Metabase (BI)
├── docker-compose.n8n.yml        # Docker N8N (automações)
├── SETUP_LOCAL_COMPLETO.md       # Este arquivo
├── IMPLEMENTATION_GUIDE.md       # Guia técnico
└── README.md                     # Documentação geral
```

---

## 🔐 Segurança Local

### ✅ Boas práticas já implementadas

1. **Variáveis de Ambiente**: Sensíveis não versionadas
2. **RLS (Row-Level Security)**: Isolamento de dados por tenant
3. **Auditoria (Lei 12.682/2012)**: Hash chain com SHA-256
4. **Validações**: CPF, CNPJ, duplicação de pagamentos
5. **TypeScript**: Type safety desde compilação

### ⚠️ Configuração LOCAL (apenas desenvolvimento)

```sql
-- Para testes, pode desabilitar RLS localmente:
ALTER TABLE properties DISABLE ROW LEVEL SECURITY;

-- Restaurar quando terminar:
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
```

---

## 🐛 Troubleshooting

### ❌ Erro: "connect ECONNREFUSED 127.0.0.1:5432"

**Problema**: Postgres não está rodando

**Solução**:
```bash
# Docker
docker-compose -f docker-compose.db.yml up -d

# Ou localmente:
brew services start postgresql@16  # macOS
sudo systemctl start postgresql    # Linux
```

---

### ❌ Erro: "role 'crmt_user' does not exist"

**Problema**: Usuário Postgres não criado

**Solução**:
```bash
docker exec crmt-postgres createuser -U postgres crmt_user
docker exec crmt-postgres psql -U postgres -c "ALTER USER crmt_user WITH PASSWORD 'crmt_senha_123';"
```

---

### ❌ Erro: "database 'crmt_db' does not exist"

**Problema**: Banco não criado

**Solução**:
```bash
docker exec crmt-postgres createdb -U crmt_user crmt_db
docker exec -i crmt-postgres psql -U crmt_user -d crmt_db < database/schema.sql
```

---

### ❌ Erro: "NEXT_PUBLIC_SUPABASE_URL is not defined"

**Problema**: `.env.local` não criado

**Solução**:
```bash
cp .env.example .env.local
# Editar .env.local com valores locais
```

---

## 📈 Logs e Monitoramento Local

### Ver logs do Next.js

```bash
npm run dev 2>&1 | tee app.log
```

### Ver logs do Postgres

```bash
docker logs -f crmt-postgres
```

### Ver logs do Supabase (se usar CLI)

```bash
supabase status
supabase logs --follow
```

### Acessar pgAdmin para queries SQL

```
http://localhost:5050
```

---

## 🚀 Deploy para Produção (Próximo Passo)

Uma vez testado localmente:

```bash
# Build
npm run build

# Verificar bundle
npm run start

# Deploy para Vercel (recomendado)
npm install -g vercel
vercel

# Ou usar seu servidor:
# - Copiar .env para .env.production
# - Usar DATABASE_URL remoto (Supabase/Render/Railway)
# - npm run build && npm run start
```

---

## 📚 Documentação Complementar

- **IMPLEMENTATION_GUIDE.md** - APIs e endpoints
- **PROJECT_STATUS.md** - Estado do projeto
- **AUDITORIA_SISTEMA.md** - Problemas identificados
- **database/README.md** - Schema detalhado
- **CRMT-Sistema-Completo-Documentacao.md** - Documentação 20K palavras

---

## 📞 Suporte

**Dúvidas sobre setup?**
- Verificar `.env.example` vs `.env.local`
- Confirmar Postgres rodando: `psql -U crmt_user -d crmt_db -h localhost -c "SELECT 1"`
- Logs: `npm run dev` mostra erros em tempo real

**Issues no código?**
- Verificar TypeScript: `npm run typecheck:server`
- Executar testes: `npm test`
- Verificar auditoria: `AUDITORIA_SISTEMA.md`

