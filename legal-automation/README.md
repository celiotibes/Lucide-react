# Legal Automation Tool - eProc & Projudi

Plataforma completa de automação jurídica para peticionamento, consulta de processos e análise com IA.

## 🚀 Features

- **Autenticação Segura**: Login + 2FA (TOTP) + Certificado Digital OAB
- **Geração de Petições com IA**: Gemini 1.5 Flash + Grok + Ollama (fallback)
- **Validação Automática**: Score de qualidade + warnings
- **Assinatura Digital**: AES-256 encrypted certificate storage
- **Integração Projudi**: SOAP WebService TJPR
- **Integração DataJud**: API CNJ para consulta de processos
- **Análise com IA**: Movimentações processuais + risco + recomendações
- **PostgreSQL**: Banco de dados completo com migrations
- **Docker Compose**: Development environment pronto

## 📋 Pré-Requisitos

- Node.js 18+
- PostgreSQL 15+ (ou Docker)
- Ollama (opcional, para fallback local)

## 🔧 Instalação Rápida

### 1. Setup Básico

```bash
cd legal-automation
npm install
cp .env.example .env
```

### 2. Configurar .env

```env
# Banco de dados
DATABASE_URL=postgresql://legaluser:legalpass@localhost:5432/legal_automation

# IA
GEMINI_API_KEY=sua_chave_aqui
AI_PRIMARY_MODEL=gemini
AI_FALLBACK_MODELS=ollama

# JWT
JWT_SECRET=sua_chave_super_secreta_aqui
```

### 3. Setup com Docker Compose

```bash
docker-compose up -d
```

Isso inicia:
- App (porta 3000)
- PostgreSQL (porta 5432)
- Redis (porta 6379)

### 4. Rodar em Desenvolvimento

```bash
npm run dev
```

Servidor disponível em: http://localhost:3000

## 📚 Documentação

- [Autenticação](docs/AUTHENTICATION.md) - Login, 2FA, Certificado Digital
- [DataJud API](docs/DATAJUD.md) - Busca de processos públicos
- [Projudi](docs/PROJUDI.md) - Peticionamento automático
- [AI Integration](docs/AI_INTEGRATION.md) - Gemini, Grok, Ollama
- [Digital Signature & AI](docs/DIGITAL_SIGNATURE_AND_AI.md) - Fluxo completo
- [API REST](docs/API.md) - Todos os endpoints

## 🧪 Testes

```bash
# Rodar testes
npm test

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

## 🔍 Linting & Formatting

```bash
# Verificar
npm run lint

# Corrigir automaticamente
npm run lint:fix

# Formatar código
npm run format

# Verificar tipos
npm run type-check
```

## 🏗️ Build & Deploy

### Build para Produção

```bash
npm run build
npm start
```

### Docker

```bash
# Build imagem
make docker-build

# Iniciar containers
make docker-up

# Parar containers
make docker-down

# Ver logs
make docker-logs
```

### Com Make

```bash
# Ajuda com todos os comandos
make help

# Setup completo
make ready

# Deploy staging
make deploy-staging

# Deploy produção
make deploy-production
```

## 📡 Endpoints Principais

### Autenticação
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/register` - Registrar
- `POST /api/v1/auth/2fa/challenge` - Desafio 2FA
- `POST /api/v1/auth/2fa/verify` - Verificar 2FA
- `POST /api/v1/auth/certificate/upload` - Upload certificado digital

### Petições
- `GET /api/v1/petitions` - Listar petições
- `POST /api/v1/petitions` - Criar rascunho
- `POST /api/v1/petitions/:id/generate` - Gerar com IA
- `POST /api/v1/petitions/:id/validate` - Validar
- `POST /api/v1/petitions/:id/sign` - Assinar digitalmente
- `POST /api/v1/petitions/:id/submit` - Enviar para Projudi

### Processos
- `GET /api/v1/processes/search/:number` - Buscar por número
- `GET /api/v1/processes/search-party?partyName=...` - Buscar por parte
- `GET /api/v1/processes/:number/movements` - Movimentações
- `POST /api/v1/processes/:number/analyze-movements` - Analisar com IA

### IA
- `POST /api/v1/ai/generate-petition` - Gerar petição
- `POST /api/v1/ai/validate-petition` - Validar
- `POST /api/v1/ai/analyze-movements` - Analisar movimentações
- `POST /api/v1/ai/extract-document` - Extrair dados
- `POST /api/v1/ai/suggest-arguments` - Sugerir argumentos

## 💰 Custos Estimados

| Provedor | Tier | Custo/Mês | Capacidade |
|----------|------|-----------|-----------|
| Gemini | Free | $0-5 | 50 petições |
| Gemini | Paid | $20-100 | Ilimitado com cache |
| Grok | Free | $0 | Limite baixo |
| Grok | Paid | $150+ | Ilimitado |
| Ollama | Local | $0 | Ilimitado |

**Recomendado**: Gemini (free/paid) + Ollama (local fallback) = $0-50/mês

## 🛡️ Segurança

✅ **LGPD Compliant**
- Dados sensíveis processados localmente (Ollama)
- Certificados criptografados (AES-256)
- Audit trail completo

✅ **Autenticação Forte**
- 2FA com TOTP (Google Authenticator)
- Certificado digital OAB
- JWT com expiração

✅ **Validações**
- Input validation com Zod
- Rate limiting via Redis
- CORS configurado

## 🚨 Troubleshooting

### Erro de conexão PostgreSQL

```bash
# Verificar se container está rodando
docker-compose ps

# Restartar banco de dados
docker-compose restart postgres
```

### Gemini API Key não funciona

1. Gerar chave em: https://ai.google.dev/
2. Adicionar em `.env`
3. Testar: `curl http://localhost:3000/api/v1/ai/status`

### Ollama não disponível

```bash
# Instalar Ollama
curl https://ollama.ai/install.sh | sh

# Puxar modelo
ollama pull initium/law_model

# Iniciar servidor
ollama serve
```

### Database migrations falhando

```bash
# Reset completo
docker-compose down -v
docker-compose up -d
npm run db:migrate
```

## 📖 Arquitetura

```
┌─────────────────────────────────────────────────┐
│  Frontend / Mobile                              │
└────────────────┬────────────────────────────────┘
                 │
        ┌────────▼─────────┐
        │   Express API    │
        │  (Controllers)   │
        └────────┬─────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
    ▼            ▼            ▼
┌────────┐  ┌─────────┐  ┌──────────┐
│Services│  │Database │  │AI Layer  │
│(Logic) │  │(PostgreSQL)  │(Gemini) │
└───┬────┘  └─────────┘  └──────┬───┘
    │                           │
    ├──────────────────────────┤
    │                          │
    ▼                          ▼
┌──────────┐            ┌──────────────┐
│Projudi   │            │External APIs │
│(SOAP)    │            │(DataJud)     │
└──────────┘            └──────────────┘
```

## 🤝 Contribuindo

1. Crie uma branch: `git checkout -b feature/sua-feature`
2. Commit: `git commit -am "Add feature"`
3. Push: `git push origin feature/sua-feature`
4. Abra um Pull Request

## 📝 License

MIT

## 📧 Suporte

Email: celiotibes@gmail.com

---

**Última atualização**: 2024-01-15

**Status**: ✅ Production Ready
