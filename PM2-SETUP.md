# PM2 Setup — Guia Completo para MacBook

Este guia descreve como configurar PM2 para gerenciar a aplicação Lucide Contabilidade localmente no MacBook.

---

## O que é PM2?

**PM2** é um gerenciador de processos Node.js que:

- **Reinicia automaticamente** o servidor se ele cair
- **Monitora** CPU/memória
- **Registra logs** em arquivo
- **Inicia na boot** do sistema (após restart do Mac)
- **Oferece dashboard** para visualizar status em tempo real

---

## 1. Instalação

### 1.1 Instalar PM2 Globalmente

```bash
# Usar sudo para instalar globalmente
sudo npm install -g pm2

# Verificar instalação
pm2 --version

# Esperado output: versão (ex: 5.3.0)
```

### 1.2 Instalar Dependências do Projeto

```bash
# Frontend
npm install --legacy-peer-deps

# Backend
cd server
npm install --legacy-peer-deps
cd ..
```

### 1.3 Verificar tsx (TypeScript executor)

PM2 precisa de `tsx` para rodar TypeScript. Deve estar instalado como dev dependency no server:

```bash
cd server
npm list tsx  # deve estar listado

# Se não estiver:
npm install --save-dev tsx
cd ..
```

---

## 2. Configuração Inicial

### 2.1 Criar .env (se não existir)

```bash
# Copiar do exemplo
cp .env.example .env

# Editar e adicionar valores mínimos
nano .env

# Adicionar:
# API_KEY=seu_valor_aleatorio_aqui
# NODE_ENV=production

# Gerar API_KEY aleatório (macOS):
openssl rand -hex 32
```

### 2.2 Verificar ecosystem.config.js

O arquivo `ecosystem.config.js` já foi criado. Verificar se está na raiz:

```bash
ls -la ecosystem.config.js

# Deve estar presente e conter:
# - name: "contabilidade-server"
# - script: "./server/src/index.ts"
# - interpreter: "tsx"
```

---

## 3. Iniciar Primeira Vez

### 3.1 Testar Localmente (sem PM2)

```bash
# Terminal 1: Backend
cd server
npm run start

# Terminal 2: Frontend (em outro terminal)
npm run dev

# Verificar que ambos funcionam sem PM2
# Frontend: http://localhost:5173
# Backend: http://localhost:3000
```

### 3.2 Iniciar com PM2

```bash
# Parar processos locais (Ctrl+C nos terminais acima)

# Iniciar com PM2
pm2 start ecosystem.config.js

# Verificar status
pm2 status

# Esperado output:
# id │ name                    │ namespace   │ version │ mode   │ pid     │ uptime │ ↺    │ status    │ cpu  │ mem
# ─┼─────────────────────────┼─────────────┼─────────┼────────┼─────────┼────────┼──────┼───────────┼──────┼─────
# 0 │ contabilidade-server    │ default     │ N/A     │ fork   │ 12345   │ 1s     │ 0    │ online    │ 0.3% │ 20MB
```

### 3.3 Visualizar Logs

```bash
# Ver logs em tempo real
pm2 logs contabilidade-server

# Ver últimas 100 linhas
pm2 logs contabilidade-server --lines 100

# Ver apenas output (não erros)
pm2 logs contabilidade-server --out

# Ver apenas erros
pm2 logs contabilidade-server --err
```

---

## 4. Dashboard PM2 Web

### 4.1 Iniciar Dashboard

```bash
# Iniciar web dashboard
pm2 web

# Acessar em: http://localhost:9615
# Dashboard mostra:
# - Status de todos os processos
# - CPU/Memória em tempo real
# - Logs
```

### 4.2 Acessar em Outro Mac (Rede)

Se quiser monitorar de outro computador:

```bash
# No Mac rodando PM2:
pm2 web 0.0.0.0 9615

# De outro Mac, acessar:
# http://<ip_do_mac>:9615
# Ex: http://192.168.1.10:9615

# Encontrar IP do Mac:
ifconfig | grep "inet " | grep -v 127.0.0.1
```

---

## 5. Startup Automático (Boot)

### 5.1 Configurar Startup

```bash
# Fazer PM2 iniciar na boot do Mac
pm2 startup

# Saída será algo como:
# [PM2] Init system you are using is: launchd
# [PM2] To setup the Launchpad agent, copy/paste this command:
# sudo env PATH=$PATH:/usr/local/bin /usr/local/lib/node_modules/pm2/bin/pm2 startup launchd -u seu_usuario --hp /Users/seu_usuario

# Copiar e colar o comando da saída:
sudo env PATH=$PATH:/usr/local/bin /usr/local/lib/node_modules/pm2/bin/pm2 startup launchd -u seu_usuario --hp /Users/seu_usuario
```

### 5.2 Salvar Processos

```bash
# Salvar lista de processos para recuperar na boot
pm2 save

# Output: [PM2] Processes have been dumped and will be restored on reboot

# Verificar que foi salvo
cat ~/.pm2/dump.pm2

# Deve listar "contabilidade-server"
```

### 5.3 Testar Startup

```bash
# Reiniciar Mac
sudo reboot

# Após reiniciar, verificar que processo está online
pm2 status

# Deve mostrar "contabilidade-server" como "online"
```

---

## 6. Commandos Principais

```bash
# Ver lista de processos
pm2 list

# Ver detalhes de um processo
pm2 describe contabilidade-server

# Parar um processo
pm2 stop contabilidade-server

# Reiniciar um processo
pm2 restart contabilidade-server

# Deletar da lista PM2 (mas não mata o processo imediatamente)
pm2 delete contabilidade-server

# Parar tudo
pm2 stop all

# Ver logs
pm2 logs

# Limpar logs antigos
pm2 flush

# Monitoramento (tipo top para Node.js)
pm2 monit

# Salvar estado (para startup)
pm2 save

# Listar processos salvos para startup
pm2 dump

# Carregar processos salvos
pm2 resurrect

# Dashboard web
pm2 web

# Gerar script de startup
pm2 startup

# Desabilitar startup automático
pm2 unstartup
```

---

## 7. Deploy Automático

### 7.1 Usar Script deploy-local.sh

```bash
# Dar permissão
chmod +x deploy-local.sh

# Executar (fará deploy automático)
./deploy-local.sh

# Passos:
# 1. Valida .env
# 2. Confirma deploy
# 3. Git pull
# 4. npm install (frontend + backend)
# 5. npm run build (frontend)
# 6. pm2 restart contabilidade-server
# 7. Verifica saúde
```

### 7.2 Deploy com Backup

```bash
# Script de backup automático
chmod +x deploy-local-backup.sh

# Executar (cria backup antes de deploy)
./deploy-local-backup.sh

# Backups armazenados em: ./backups/YYYYMMDD_HHMMSS/
# Mantém últimos 7 backups
```

---

## 8. Troubleshooting PM2

### Processo não inicia

```bash
# Ver logs de erro
pm2 logs contabilidade-server

# Comum: .env não existe
ls -la .env  # deve existir

# Comum: tsx não instalado
cd server && npm list tsx
```

### Processo morre após alguns minutos

```bash
# Ver por quanto tempo o processo rodou
pm2 describe contabilidade-server

# Verificar logs para mensagens de erro
pm2 logs contabilidade-server --lines 50

# Se está atingindo limite de memória:
# Editar ecosystem.config.js:
# max_memory_restart: "1G"  # aumentar de 500M
```

### PM2 não inicia na boot

```bash
# Verificar se startup foi configurado
pm2 describe contabilidade-server | grep "auto-restart"

# Verificar launchd (macOS)
ls ~/Library/LaunchAgents/ | grep pm2

# Se não existir, refazer setup:
pm2 startup
pm2 save
```

### Limpar tudo e começar do zero

```bash
# Parar e deletar todos processos
pm2 stop all
pm2 delete all

# Remover startup automático
pm2 unstartup

# Limpar logs
pm2 flush

# Iniciar novamente
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## 9. Monitoramento em Produção

### 9.1 Alertas

PM2 Plus (versão paga) oferece:
- Alertas por email quando processo cai
- Monitoring em tempo real
- Dashboard online

Para MVP, o free tier é suficiente.

### 9.2 Logs Manuais

```bash
# Manter arquivo de log rápido para referência
tail -f ~/.pm2/logs/contabilidade-server-out.log

# Rotacionar logs quando fica grande
pm2 flush
```

---

## 10. Integração com Deploy Vercel

Se estiver usando Vercel para frontend + Railway/Render para backend:

1. **Frontend**: Deploy no Vercel (automático com GitHub push)
2. **Backend**: Deploy em Railway/Render (similiar ao Vercel)
3. **Local**: Use PM2 para testar antes de push

```bash
# Workflow local:
./deploy-local.sh  # testa tudo localmente

# Se funcionar:
git push  # faz deploy automático em Vercel/Railway

# Se não funcionar:
pm2 logs  # ver erro
# corrigir
./deploy-local.sh  # tentar novamente
```

---

## 11. Checklist de Setup

- [ ] PM2 instalado globalmente: `pm2 --version`
- [ ] Dependências instaladas: `npm install && cd server && npm install`
- [ ] .env existe e contém API_KEY
- [ ] ecosystem.config.js na raiz do projeto
- [ ] tsx instalado em server: `cd server && npm list tsx`
- [ ] Teste local funciona: `pm2 start ecosystem.config.js`
- [ ] Processo está online: `pm2 status`
- [ ] Logs sem erros: `pm2 logs contabilidade-server`
- [ ] Dashboard acessível: `pm2 web` → http://localhost:9615
- [ ] Startup configurado: `pm2 startup` → `pm2 save`
- [ ] Deploy script testado: `./deploy-local.sh`
- [ ] Backup script testado: `./deploy-local-backup.sh`

---

## 12. Próximos Passos

1. **Configurar alertas** (email quando server cai)
2. **Setup CI/CD** com GitHub Actions
3. **Configurar monitoring** com Sentry/LogRocket
4. **Deploy em produção** (Vercel + Railway)
5. **Documentar runbooks** para sua equipe

---

## Referências

- PM2 Docs: https://pm2.keymetrics.io/docs/usage/quick-start/
- PM2 Plus: https://app.pm2.io/ (monitoring online)
- Node.js Best Practices: https://nodejs.org/en/docs/guides/nodejs-performance/

---

**Dúvidas?** Veja [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) ou abra issue no repositório.

**Atualização**: 2026-10-02
