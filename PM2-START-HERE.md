# PM2 & Deploy — START HERE

Bem-vindo! Este documento lhe guia pelos primeiros passos para colocar a aplicação em produção.

## TL;DR — Comece em 5 minutos

```bash
# 1. Instalar PM2
sudo npm install -g pm2

# 2. Preparar ambiente
cp .env.example .env
nano .env  # Adicionar API_KEY (gere com: openssl rand -hex 32)

# 3. Instalar dependências
npm install --legacy-peer-deps
cd server && npm install --legacy-peer-deps && cd ..

# 4. Iniciar aplicação
pm2 start ecosystem.config.js

# 5. Verificar status
pm2 status
pm2 logs contabilidade-server
```

Pronto! Aplicação está rodando.

---

## Próximas Ações

### Para MacBook (Desenvolvimento/Teste)

Leia: [PM2-SETUP.md](./PM2-SETUP.md)

Comandos úteis:
```bash
pm2 status                    # Ver status
pm2 logs                      # Ver logs
pm2 restart contabilidade-server
pm2 web                       # Dashboard em http://localhost:9615
./deploy-local.sh             # Deploy automático (pull + build + restart)
pm2 startup && pm2 save       # Startup automático na boot
```

### Para Produção (Vercel + Railway)

Leia: [DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md)

Passos:
1. Frontend → Vercel
2. Backend → Railway (recomendado)
3. Conectar com environment variables

### Se Algo Quebrou

Consulte: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

Problema mais comum:
```bash
# Processo não inicia?
pm2 logs contabilidade-server --lines 50  # Ver erro

# .env não encontrado?
cp .env.example .env && nano .env
pm2 restart contabilidade-server
```

---

## Estrutura de Arquivos

```
/Lucide-react/
├── ecosystem.config.js              ← Configuração PM2
├── deploy-local.sh                  ← Deploy automático
├── deploy-local-backup.sh           ← Backup pre-deploy
├── PM2-SETUP.md                     ← Guia completo PM2
├── DEPLOY-VERCEL.md                 ← Deploy produção
├── DEPLOY-QUICKSTART.md             ← Quick start (2 min)
├── TROUBLESHOOTING.md               ← Problemas comuns
├── PM2-START-HERE.md                ← Você está aqui
├── .env.example
├── server/
│   ├── src/index.ts                 ← Aplicação Node.js
│   └── package.json
├── src/                             ← Frontend React
├── package.json
└── dist/                            ← Build frontend (após npm run build)
```

---

## Três Cenários Comuns

### Cenário 1: Desenvolvendo Localmente

```bash
# Terminal 1: Frontend
npm run dev
# Acessa em http://localhost:5173

# Terminal 2: Backend (sem PM2, desenvolvimento)
cd server
npm run dev
# Ou com PM2 (watch mode)
# cd.. && pm2 start ecosystem.config.js
```

### Cenário 2: Testando com PM2

```bash
# Setup
pm2 start ecosystem.config.js

# Fazer mudanças em server/src/...
# PM2 detecta mudanças e reinicia automaticamente (watch mode)

# Logs em tempo real
pm2 logs contabilidade-server --follow

# Deploy completo (git + build + restart)
./deploy-local.sh
```

### Cenário 3: Em Produção (MacBook)

```bash
# Setup uma vez
pm2 startup
pm2 save

# Depois disso, PM2 inicia na boot do Mac automaticamente

# Para deploy:
./deploy-local.sh

# Para monitorar:
pm2 web  # http://localhost:9615
pm2 logs contabilidade-server
```

---

## Comandos Essenciais

| Comando | O que faz |
|---------|-----------|
| `pm2 status` | Ver lista de processos |
| `pm2 logs` | Ver logs em tempo real |
| `pm2 logs --lines 50` | Ver últimas 50 linhas |
| `pm2 restart contabilidade-server` | Reiniciar |
| `pm2 stop contabilidade-server` | Parar |
| `pm2 delete contabilidade-server` | Remover da lista |
| `pm2 web` | Dashboard web (localhost:9615) |
| `./deploy-local.sh` | Deploy completo |
| `pm2 startup && pm2 save` | Startup automático |

---

## Checklist antes de Produção

- [ ] `.env` existe e contém `API_KEY`
- [ ] `npm install` rodou sem erros
- [ ] `npm run build` funciona (cria pasta `dist/`)
- [ ] `pm2 start ecosystem.config.js` inicia sem erros
- [ ] `pm2 logs` não mostra erros
- [ ] `./deploy-local.sh` funciona
- [ ] Backup automático (`./deploy-local-backup.sh`)
- [ ] PM2 startup configurado (`pm2 startup && pm2 save`)

---

## Referências Rápidas

- **Setup detalhado**: [PM2-SETUP.md](./PM2-SETUP.md)
- **Deploy Vercel**: [DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md)
- **Quick start rápido**: [DEPLOY-QUICKSTART.md](./DEPLOY-QUICKSTART.md)
- **Troubleshooting**: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

---

## Precisa de Ajuda?

1. **Rápido** (2 min): Ler [DEPLOY-QUICKSTART.md](./DEPLOY-QUICKSTART.md)
2. **Detalhado** (15 min): Ler [PM2-SETUP.md](./PM2-SETUP.md)
3. **Problema específico**: Procurar em [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
4. **Produção**: Seguir [DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md)

---

**Próximo passo**: Escolha seu cenário acima e siga as instruções.

Boa sorte!
