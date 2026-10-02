# CRMT - Histórico Contábil & Financeiro

Sistema completo de reconstituição contábil para locação de imóveis, com integração Open Finance, gestão de fluxo de caixa, auditoria forense e laudo pericial.

## Características Principais

- **DRE (Demonstração de Resultado do Exercício)**: análise mensal de receitas, despesas e lucro
- **Fluxo de Caixa**: projeção e histórico com anomalias detectadas automaticamente
- **Margens por Propriedade**: análise de rentabilidade por ativo
- **Integração Open Finance**: sincronização bancária via Pluggy
- **Asaas Payments**: emissão de boletos/PIX e rastreamento de cobrança
- **Reembolsos de Despesas**: gestão e conciliação de reembolsos
- **Lembretes Automáticos**: alertas de vencimento sincronizados em tempo real
- **Auditoria & Segurança**: trilha completa de ações, autenticação JWT, permissões por papel
- **OCR de Documentos**: extração de texto via Tesseract.js para NF, recibos, contratos
- **100% Offline**: banco de dados local (sql.js) no navegador

## Estrutura de Pastas

```
.
├── server/                          # Backend Node.js + Express
│   ├── src/
│   │   ├── index.ts                # Servidor principal
│   │   ├── swagger.ts              # Documentação OpenAPI/Swagger
│   │   ├── database-init.ts        # Inicialização SQLite
│   │   ├── pluggy.ts               # SDK Pluggy (Open Finance)
│   │   ├── asaas.ts                # SDK Asaas (Payments)
│   │   ├── telegram-bot.ts         # Bot Telegram
│   │   ├── lembretes-dispatcher.ts # Loop de lembretes agendados
│   │   ├── domain/                 # Lógica de negócio
│   │   │   ├── auth/               # Autenticação e permissões
│   │   │   ├── relatorios/         # DRE, Executivo, Margens
│   │   │   ├── integracoes/        # Pluggy, Asaas, Telegram
│   │   │   └── notificacoes/       # Email, WhatsApp, Telegram
│   │   └── routes/                 # Endpoints HTTP
│   ├── migrations/                 # Scripts SQL de criação de tabelas
│   └── package.json
├── src/                            # Frontend React + Vite
│   ├── App.tsx                     # Componente raiz
│   ├── main.tsx                    # Entry point
│   ├── components/
│   │   ├── integracoes/            # Views principais
│   │   │   ├── DREView.tsx
│   │   │   ├── MargensPropriedadesView.tsx
│   │   │   ├── CobrancasAsaasView.tsx
│   │   │   ├── ReembolsosAsaasPanel.tsx
│   │   │   ├── PluggySyncView.tsx
│   │   │   └── NotificacoesView.tsx
│   │   ├── cadastros/              # Formulários
│   │   └── painel-conferencia/     # Painel de controle
│   ├── domain/                     # Lógica frontend
│   ├── db/                         # Operações de banco local
│   └── ui/                         # Componentes reutilizáveis
├── public/                         # Ativos estáticos
├── vite.config.ts                  # Configuração Vite (build, proxy, PWA)
├── package.json                    # Dependências frontend
└── index.html                      # HTML de entrada
```

## Instalação Local

### Requisitos
- Node.js ^20.19.0 ou >=22.12.0
- npm ou yarn
- Variaveis de ambiente (.env)

### Passo 1: Clonar e Instalar Dependências

```bash
cd Lucide-react
npm install
cd server && npm install && cd ..
```

### Passo 2: Configurar Variáveis de Ambiente

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

Arquivo `.env` necessário:

```env
# Backend (server/.env)
API_KEY=<gere com: openssl rand -hex 32>
SESSION_SECRET=<chave para assinar JWT — ausência gera temporária por processo>
JWT_SECRET=<alternativa a SESSION_SECRET>
NODE_ENV=development
PORT=3000
ALLOWED_ORIGIN=http://localhost:5173

# Pluggy (Open Finance)
PLUGGY_CLIENT_ID=seu_client_id_pluggy
PLUGGY_CLIENT_SECRET=seu_client_secret_pluggy

# Asaas (Pagamentos)
ASAAS_API_TOKEN=seu_api_token_asaas
ASAAS_WALLET_ID=id_sua_carteira_asaas

# Telegram Bot (opcional)
TELEGRAM_BOT_TOKEN=seu_bot_token_telegram

# Email (opcional)
SMTP_HOST=smtp.seuservidor.com
SMTP_PORT=587
SMTP_USER=seu_email@example.com
SMTP_PASS=sua_senha
SMTP_FROM=noreply@crmt.app

# Frontend (raiz/.env)
VITE_API_BASE_URL=http://localhost:3000/api
```

### Passo 3: Rodar Localmente

**Terminal 1 - Backend (porta 3000)**:
```bash
cd server
npm run dev
```

**Terminal 2 - Frontend (porta 5173)**:
```bash
npm run dev
```

Abra http://localhost:5173 no navegador.

Documentação API: http://localhost:3000/api/docs

### Passo 4: Build para Produção

```bash
# Frontend (gera dist/)
npm run build

# Backend (otimizado com tsx)
cd server
npm run start
```

## Variáveis de Ambiente Detalhadas

### Backend (server/.env)

| Variável | Obrigatório | Padrão | Descrição |
|----------|-------------|--------|-----------|
| API_KEY | Sim | - | Chave secreta para endpoints legados. Gere: `openssl rand -hex 32` |
| SESSION_SECRET | Sim* | - | Chave para assinar JWT. Alternativa a JWT_SECRET |
| JWT_SECRET | Sim* | - | Chave para assinar JWT (usado por padrão se SESSION_SECRET ausente) |
| NODE_ENV | Não | development | Modo execução (development/production) |
| PORT | Não | 3000 | Porta servidor Express |
| ALLOWED_ORIGIN | Não | http://localhost:5173 | CORS origin permitido |
| PLUGGY_CLIENT_ID | Não | - | Client ID da Pluggy (deixe vazio para desabilitar Open Finance) |
| PLUGGY_CLIENT_SECRET | Não | - | Client Secret da Pluggy |
| ASAAS_API_TOKEN | Não | - | Token API Asaas (deixe vazio para desabilitar Payments) |
| ASAAS_WALLET_ID | Não | - | ID da carteira Asaas |
| TELEGRAM_BOT_TOKEN | Não | - | Token bot Telegram (deixe vazio para desabilitar) |
| SMTP_HOST | Não | - | Host SMTP (deixe vazio para desabilitar email) |
| SMTP_PORT | Não | 587 | Porta SMTP |
| SMTP_USER | Não | - | Usuário SMTP |
| SMTP_PASS | Não | - | Senha SMTP |
| SMTP_FROM | Não | - | Email origem notificações |

*Pelo menos um de SESSION_SECRET ou JWT_SECRET deve ser definido. Se ambos forem omitidos, o servidor gera uma chave temporária válida apenas para este processo (aviso no console).

### Frontend (raiz/.env)

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| VITE_API_BASE_URL | http://localhost:3000/api | URL base da API (proxy no dev, respeitado no build) |

## Configuração Vite

O arquivo `vite.config.ts` inclui:

- **Proxy `/api`** → backend (localhost:3000)
- **Build otimizado**: minificação Terser, sourcemaps hidden
- **Hash em assets**: cache busting automático (app-[hash].js)
- **PWA**: instalável offline, sincronização de dados em background

### Servidor Estático (Produção)

```bash
# Build frontend
npm run build

# Servir dist/ estático na porta 5000
npx serve -l 5000 dist

# Backend continua na 3000 (fronten proxy para /api)
cd server && npm start
```

Ou hospedar `dist/` em CDN (Vercel, Netlify, AWS S3) e configurar CORS no backend.

## Scripts Disponíveis

### Frontend
- `npm run dev` - Inicia Vite dev server (HMR, proxy /api)
- `npm run build` - Build otimizado para produção
- `npm run build:typecheck` - TypeScript + build
- `npm run preview` - Visualiza build localmente
- `npm run lint` - Lint com ESLint
- `npm run test` - Testes com Vitest
- `npm run test:watch` - Testes em modo watch

### Backend
- `npm run dev` - Inicia servidor com nodemon (recarrega em mudanças)
- `npm start` - Inicia servidor (produção)
- `npm run typecheck` - TypeScript check
- `npm test` - Testes com Vitest

## Banco de Dados

### Estrutura

O sistema usa **SQLite3** (better-sqlite3) no backend com **sql.js** (100% JavaScript) no frontend.

**Backend** (server/db):
- Tabelas: usuarios, transacoes, contas_bancarias, integracoes, lembretes_agendados, etc.
- Migrations SQL em `server/migrations/`
- Inicializado automaticamente em `server/src/database-init.ts`

**Frontend** (navegador):
- Banco local do IndexedDB + sql.js (100% privado)
- Sincronizado com backend via /api
- Funciona 100% offline

### Criar Usuário Inicial

```bash
curl -X POST http://localhost:3000/api/auth/bootstrap \
  -H "Content-Type: application/json" \
  -H "X-API-Key: SUA_API_KEY" \
  -d '{"email":"admin@example.com","senha":"suaSenha123","nome":"Admin"}'
```

## Documentação API

### Swagger/OpenAPI

Após iniciar o backend:

```
http://localhost:3000/api/docs
```

Documenta todos os endpoints com:
- Método HTTP (GET, POST, etc)
- Parâmetros (query, body, path)
- Request/Response schemas
- Autenticação (Bearer token)

### Endpoints Principais

```
POST   /api/auth/login                              # Fazer login
POST   /api/auth/bootstrap                          # Criar usuário inicial
GET    /api/auth/me                                 # Usuário autenticado
GET    /api/relatorios/dre                          # DRE on-the-fly
GET    /api/relatorios/executivo/dashboard          # Dashboard executivo
GET    /api/asaas/cobrancas                         # Listar cobranças
POST   /api/asaas/cobrancas/criar                   # Criar boleto/PIX
GET    /api/pluggy-meu/contas                       # Contas bancárias
GET    /api/anomalias/alertas                       # Anomalias detectadas
GET    /api/asaas/pagamentos-pix                    # Pagamentos PIX
```

## Segurança

### Autenticação
- JWT (JSON Web Tokens) com expiração 24h
- X-API-Key para endpoints legados (integrações)
- CORS restrito a ALLOWED_ORIGIN

### Autorização
- Papéis: titular, contador, auditor
- Matriz de permissões configurável
- Trilha de auditoria completa (quem fez o quê, quando)

### Sensibilidade
- Senhas com hash bcrypt
- Nunca loga segredos (API_KEY, JWT_SECRET, etc) mesmo em erro
- Sourcemaps hidden em produção
- Proteção contra força bruta (rate limit 100 req/15min)

## Troubleshooting

### "Chave de API ausente ou inválida"
- Verifique `.env` → API_KEY
- Envie header `X-API-Key` com o valor

### "Cannot find module 'swagger-ui-express'"
- Rodar: `cd server && npm install`

### Frontend não conecta no backend
- Verificar se porta 3000 está aberta (`sudo lsof -i :3000`)
- Verificar ALLOWED_ORIGIN em .env (padrão: localhost:5173)
- CORS habilitado em server/src/index.ts

### Banco de dados corrompido
- Deletar arquivo banco SQLite (location: varia por SO)
- Backend recria automaticamente ao iniciar
- Frontend: limpar Storage > IndexedDB

## Roadmap Futuro

- [ ] Exportação automática para EFD-Reinf
- [ ] Integração Nuvem Fiscal
- [ ] Relatório de auditoria em PDF (jsPDF)
- [ ] Compartilhamento seguro com contador (criptografia)
- [ ] App mobile (React Native)
- [ ] Análise preditiva de fluxo (ML)

## Suporte

- Relatório bugs: abrir issue no GitHub
- Perguntas: consultar GUIA_DE_USO.md
- Documentação completa: ver CLAUDE.md (arquitetura)

## Licença

Proprietário. Desenvolvido por CRMT © 2026.
