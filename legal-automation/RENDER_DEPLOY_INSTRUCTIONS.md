# Render.com Deployment Instructions

## Checklist Pré-Deployment

- [x] Git repository criado e conectado
- [x] Código compilado (npm run build)
- [x] .env configurado com credenciais Supabase
- [x] render.yaml pronto
- [ ] Migrations SQL executadas no Supabase
- [ ] Conta Render criada
- [ ] GitHub conectado ao Render
- [ ] Web Service criado no Render

---

## Passo 1: Criar Web Service no Render

### 1.1 Acessar Dashboard
1. Acesse: https://dashboard.render.com
2. Você deve estar logado (conectou com GitHub)
3. Clique em **"New +"** no menu

### 1.2 Configurar Novo Serviço

**Opção: Web Service**

#### Conectar Repositório GitHub
1. Clique em **"Connect Account"** (se ainda não conectado)
2. Autorize Render a acessar seu GitHub
3. Selecione o repositório: `celiotibes/lucide-react`
4. Clique em **"Connect"**

#### Configurar o Serviço

| Campo | Valor |
|-------|-------|
| **Name** | `legal-automation-api` |
| **Environment** | `Node` |
| **Region** | `US Oregon` (ou sua região) |
| **Branch** | `claude/eproc-projudi-automation-4cx0tt` |
| **Build Command** | `npm ci && npm run build` |
| **Start Command** | `node dist/index.js` |
| **Plan** | `Free` |

---

## Passo 2: Adicionar Variáveis de Ambiente

Após criar o serviço, clique em **"Environment"** e adicione:

### Copiar e Colar (use exatamente esses valores):

```
NODE_ENV=production
PORT=3000
API_BASE_URL=https://legal-automation-api.onrender.com
DATABASE_URL=postgresql://postgres.rxxcaecznjatsepirrqq:elZrN8Nd14TBqnyH@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true
JWT_SECRET=W1vab0UM0q6pxVTSJpuy8NTfX6X9LYOBdtGI0P6Hd0w=
CERT_ENCRYPTION_KEY=7WeDaZ4Ees/uhvNBL6MO8qMHT6+yF1UAV9Z6JNRdxlI=
CORS_ORIGIN=https://legal-automation-api.onrender.com
LOG_LEVEL=info
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000
AI_PRIMARY_MODEL=claude
AI_OFFLINE_MODE=true
```

### Clique em "Save" para cada variável

---

## Passo 3: Monitorar Deploy

1. Após salvar, Render começará o build automaticamente
2. Clique na aba **"Logs"** para ver o progresso
3. Procure por estas mensagens de sucesso:
   ```
   $ npm ci && npm run build
   $ npm run build
   $ tsc --build
   $ node dist/index.js
   [Server] ✓ Server running on port 3000
   [Server] ✓ Database connection established
   ```

⏱️ **Tempo de deploy**: 5-10 minutos na primeira vez

### Status Esperado
- Verde = Sucesso ✅
- Laranja = Em progresso
- Vermelho = Erro ❌

---

## Passo 4: Obter URL Pública

Uma vez que o deploy completar com sucesso:

1. No dashboard do Render, seu serviço mostrará: **"Live"** (verde)
2. Procure pela **"Live URL"** no topo (ex: `https://legal-automation-api.onrender.com`)
3. Copie e guarde essa URL

---

## Passo 5: Testar Endpoint de Saúde

```bash
# Substituir URL conforme seu deploy
curl https://legal-automation-api.onrender.com/health

# Resposta esperada:
# {
#   "status": "ok",
#   "timestamp": "2026-08-03T...",
#   "environment": "production",
#   "uptime": 123.45
# }
```

Se retornar 200 OK com `"status": "ok"`, o deploy foi bem-sucedido! ✅

---

## Passo 6: Solução de Problemas

### Erro: "Build Failed"

**Causa**: Geralmente falta de variáveis de ambiente
- Verifique se todos os environment variables foram adicionados
- Clique em "Restart Deploy" após corrigir

### Erro: "502 Bad Gateway"

**Causa**: Application crashed
- Verifique Render Logs para erro específico
- Comum: DATABASE_URL inválida
- Solução: Confirme que a connection string está correta

### Erro: "503 Service Unavailable"

**Causa**: Servidor iniciando ou no free tier spindown
- Render free tier desativa após 15 minutos de inatividade
- Primeira requisição demora 30-40 segundos
- Próximas requisições são instantâneas

---

## Status Após Deploy

Seu sistema estará disponível em:

```
🌐 API: https://legal-automation-api.onrender.com
📊 Health Check: https://legal-automation-api.onrender.com/health
💾 Database: Supabase (postgres.rxxcaecznjatsepirrqq)
💰 Custo: $0/mês (free tier)
```

### Endpoints Disponíveis

```
GET    /health                    # Status da aplicação
GET    /status                    # Status do serviço
POST   /auth/login               # Autenticação
GET    /api/pki/certificates    # Certificados
GET    /api/ged/documents       # Documentos
GET    /api/timesheet/entries   # Timesheet
... (43 endpoints total)
```

---

## Próximas Etapas

1. ✅ Banco de dados (Supabase)
2. ✅ Deploy (Render)
3. ⏭️ Testar endpoints
4. ⏭️ Configurar frontend
5. ⏭️ Integrar com plataformas legais

---

**Seu sistema legal automation está LIVE! 🚀**
