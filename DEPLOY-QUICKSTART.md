# Deploy — Quick Start

Guia rápido para colocar a aplicação em produção.

---

## 📱 MacBook (Desenvolvimento/Teste)

### Setup Inicial (primeira vez)

```bash
# 1. Instalar PM2
sudo npm install -g pm2

# 2. Copiar .env
cp .env.example .env
# Editar .env com seus valores (especialmente API_KEY)
nano .env

# 3. Instalar dependências
npm install --legacy-peer-deps
cd server && npm install --legacy-peer-deps && cd ..

# 4. Criar ecosystem.config.js (deve estar na raiz)
ls ecosystem.config.js  # deve existir

# 5. Iniciar primeiro processo
pm2 start ecosystem.config.js

# 6. Verificar
pm2 status
pm2 logs contabilidade-server --lines 20
```

### Comandos Rotina

```bash
# Ver status
pm2 status

# Ver logs
pm2 logs contabilidade-server

# Restart
pm2 restart contabilidade-server

# Stop
pm2 stop contabilidade-server

# Start
pm2 start ecosystem.config.js

# Dashboard (http://localhost:9615)
pm2 web
```

### Deploy Automático

```bash
# Dar permissão
chmod +x deploy-local.sh deploy-local-backup.sh

# Fazer deploy (git pull + npm install + build + restart PM2)
./deploy-local.sh

# Se quiser com backup
./deploy-local-backup.sh  # rodar primeiro
```

### Startup na Boot

```bash
# Configurar para iniciar quando Mac reinicia
pm2 startup
pm2 save

# Testar:
# sudo reboot
# Após reiniciar: pm2 status → deve estar online
```

---

## 🌐 Vercel (Frontend em Produção)

### Setup Inicial

1. **Criar conta em [vercel.com](https://vercel.com)**
   - Use GitHub para login (mais fácil)

2. **Conectar Repositório**
   - Dashboard → "New Project"
   - Selecionar `Lucide-react`
   - Vercel detecta: Vite, build command, output dir
   - Clique "Deploy"

3. **Configurar Environment Variables**
   - Settings → Environment Variables
   - Adicionar do `.env.example` (prefixo VITE_)
   - Redeploiar se necessário

### URL

- Produção: `https://seu-projeto.vercel.app`
- Preview (branches): `https://branch-name-seu-projeto.vercel.app`

### Deploy

```bash
# Automático: cada push para main faz deploy

# Manual:
# Vercel Dashboard → Deployments → Redeploy (se mudanças no .env)

# Rollback:
# Vercel Dashboard → Deployments → selecione versão anterior → "Promote"
```

---

## 🚂 Railway/Render (Backend em Produção)

### Setup (Railway recomendado)

1. Acesse [railway.app](https://railway.app)
2. "New Project" → "Deploy from GitHub"
3. Selecionar repositório
4. Railway detecta Node.js
5. Configurar variáveis de ambiente (API_KEY, etc)
6. Deploy automático

### URL Backend

- Será algo como: `https://seu-projeto-production.up.railway.app`

### Conectar Frontend

No Vercel, adicionar environment variable:

```
VITE_CLASSIFICACAO_BACKEND = https://seu-projeto-production.up.railway.app/api/classificar
```

Redeploiar Vercel.

---

## 📋 Checklist de Deploy Produção

- [ ] `.env` NÃO commitado (está em `.gitignore`?)
- [ ] `API_KEY` é valor aleatório forte
- [ ] Repository é público ou privado com acesso concedido
- [ ] Frontend build funciona: `npm run build`
- [ ] Backend inicia: `cd server && npm run start`
- [ ] PM2 pode reiniciar servidor: `pm2 start ecosystem.config.js`
- [ ] Vercel conectado e fazendo deploy automático
- [ ] Railway/Render configurado para backend (se usar)
- [ ] Environment variables sincronizadas entre Vercel/Railway/.env
- [ ] CORS configurado corretamente
- [ ] Logs sendo monitorados
- [ ] Backup automático configura (se aplicável)

---

## 🔧 Troubleshooting Rápido

| Problema | Solução |
|----------|---------|
| PM2 não encontrado | `sudo npm install -g pm2` |
| Processo morre | `pm2 logs contabilidade-server` — ver erro |
| .env não carrega | `pm2 restart contabilidade-server` |
| CORS error | Editar server/src/index.ts configuração cors |
| Vercel build falha | `rm -rf node_modules && npm install` local, depois push |
| Vercel deploy é lento | Verificar se `package-lock.json` está commitado |

Veja [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) para mais detalhes.

---

## 📚 Documentação Completa

- **PM2**: [PM2-SETUP.md](./PM2-SETUP.md)
- **Vercel**: [DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md)
- **Troubleshooting**: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

---

## 📞 Support

1. Verificar logs: `pm2 logs`
2. Ler documentação acima
3. Abrir issue no GitHub com logs e detalhes

---

**Última atualização**: 2026-10-02
