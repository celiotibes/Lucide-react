# Guia de Troubleshooting — Lucide Contabilidade

Soluções para problemas comuns com deploy, PM2 e produção.

---

## 1. PM2 — Problemas de Inicialização

### Problema: "PM2 não encontrado"

```bash
# Solução: Instalar PM2 globalmente
npm install -g pm2

# Verificar instalação
pm2 --version
```

### Problema: "Processo não inicia com PM2"

```bash
# Verificar logs de erro
pm2 logs

# Verificar status detalhado
pm2 status

# Ver detalhes de um processo específico
pm2 describe contabilidade-server

# Reiniciar manualmente
pm2 restart contabilidade-server
```

**Causas comuns**:
- `.env` não existe ou não contém `API_KEY`
- Dependências não instaladas (`npm install` no server)
- Porta 3000+ já está em uso
- Arquivo TypeScript com erro de sintaxe

### Problema: "tsx não encontrado"

```bash
# tsx é necessário para rodar TypeScript
cd server
npm install --save-dev tsx

# Ou instale globalmente
npm install -g tsx

# Verifique que ecosystem.config.js usa interpreter: "tsx"
cat ecosystem.config.js | grep interpreter
```

### Problema: "Processo morre minutos depois de iniciar"

```bash
# Verificar se está atingindo limite de memória
pm2 describe contabilidade-server

# Logs detalhados
pm2 logs contabilidade-server --lines 100

# Aumentar limite de memória em ecosystem.config.js
# max_memory_restart: "1G"  # aumentar de 500M para 1GB
```

---

## 2. Deploy Script — Problemas

### Problema: "deploy-local.sh: permission denied"

```bash
# Dar permissão de execução
chmod +x deploy-local.sh
chmod +x deploy-local-backup.sh

# Executar
./deploy-local.sh
```

### Problema: "npm run build falha"

```bash
# Verificar erros específicos
npm run build

# Se falhar com "Cannot find module", limpar e reinstalar
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm run build

# Se ainda falhar, verificar erros TypeScript
npm run build:typecheck
```

### Problema: ".env não encontrado"

```bash
# Copiar do exemplo
cp .env.example .env

# Editar e adicionar valores
nano .env

# Mínimo necessário:
# API_KEY=seu_valor_aleatorio_aqui
# Gerar valor aleatório:
# macOS/Linux: openssl rand -hex 32
```

### Problema: "Git pull falha"

```bash
# Verificar estado do repositório
git status

# Se houver mudanças locais não commitadas
git stash  # guardar mudanças temporárias

# Tentar pull novamente
git pull origin main

# Se houver conflitos
git merge --abort
# Depois resolver conflitos manualmente
```

---

## 3. Port Conflicts — Porta já em uso

### Problema: "Error: listen EADDRINUSE :::3000"

```bash
# Encontrar processo usando porta 3000
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Matar processo (macOS/Linux)
kill -9 <PID>

# Ou, fazer PM2 rodar em porta diferente
# Editar ecosystem.config.js e adicionar ao app config:
# "args": "--port 3001"
```

---

## 4. Database — Problemas

### Problema: "Database file is not readable" ou "database is locked"

```bash
# Verificar se database existe
ls -la server/src/*.db

# Se estiver corrompido, usar backup
ls -la backups/

# Restaurar database do backup
cp backups/<mais_recente>/database/*.db server/src/

# Reiniciar servidor
pm2 restart contabilidade-server
```

### Problema: "Database migration falha"

```bash
# Rodar migration manualmente para ver erro detalhado
cd server
npm run migrate  # se script existir

# Se não existir, verificar em que versão está
# Mais comumente não há script de migration automático
# Nesse caso, validar que database.db está corretamente inicializado
```

---

## 5. Backend Server — Issues

### Problema: "Server inicia mas não responde a requisições"

```bash
# Verificar se servidor está realmente escutando
curl http://localhost:3000

# Verificar logs
pm2 logs contabilidade-server

# Verificar se CORS está configurado (se receber erro CORS)
# Editar server/src/index.ts:
# const corsOptions = {
#   origin: ['http://localhost:5173', 'https://seu-dominio.com'],
#   credentials: true
# };
# app.use(cors(corsOptions));

# Reiniciar
pm2 restart contabilidade-server
```

### Problema: "Erro de CORS entre frontend e backend"

```bash
# Exemplo: Frontend em localhost:5173, Backend em localhost:3000
# Erro: "Access to XMLHttpRequest has been blocked by CORS policy"

# Solução no backend (server/src/index.ts):
import cors from 'cors';

const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? 'https://seu-dominio.com'
    : 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

# Reiniciar
pm2 restart contabilidade-server
```

---

## 6. Environment Variables — Problemas

### Problema: "API_KEY não definido" ou "Variável de ambiente não funciona"

```bash
# Verificar que .env está sendo lido
cat .env | grep API_KEY

# Verificar se arquivo é UTF-8 sem BOM
file .env

# Testar leitura de variável localmente
npm run dev  # deve funcionar e mostrar logs

# Se PM2, reiniciar para recarregar .env
pm2 restart contabilidade-server
```

### Problema: "Produção usa valor errado de variável"

```bash
# Verificar qual .env PM2 está usando
ps aux | grep "contabilidade-server"

# Se em produção, nenhuma variável de desenvolvimento deve estar lá
# Verificar arquivo .env produção
ls -la ~/.pm2/logs/  # ver logs onde variáveis aparecem

# Atualizar .env
nano .env
# Restrar aplicação
pm2 restart contabilidade-server
```

---

## 7. Monitoramento — Problemas

### Problema: "pm2 web não acessível"

```bash
# Iniciar dashboard
pm2 web

# Acessar em: http://localhost:9615

# Se porta já em uso
pm2 web -p 9616  # usar porta diferente

# Se não consegue acessar externamente (ex: de outro Mac)
# Usar ngrok para expor
ngrok http 9615
```

### Problema: "Logs muito grandes"

```bash
# PM2 logs podem ficar enormes com o tempo
# Limpar logs antigos
pm2 flush

# Ou limpar manual
rm ~/.pm2/logs/*

# Configurar rotação de logs em ecosystem.config.js:
# "log_file": "~/.pm2/logs/app.log",
# "out_file": "~/.pm2/logs/out.log",
# "error_file": "~/.pm2/logs/error.log",
# Depois usar ferramentas como logrotate
```

---

## 8. Backup — Problemas

### Problema: "Backup script não funciona"

```bash
# Verificar permissões
chmod +x deploy-local-backup.sh

# Rodar manualmente para ver erro
bash deploy-local-backup.sh

# Verificar se diretórios existem
ls -la backups/

# Se disk está cheio, limpar backups antigos
rm -rf backups/20230101_*  # remover backups de meses atrás
```

### Problema: "Restaurar do backup"

```bash
# Encontrar backup mais recente
ls -la backups/ | tail -5

# Copiar arquivo específico (ex: .env)
cp backups/<TIMESTAMP>/.env .env

# Ou restaurar database
cp backups/<TIMESTAMP>/database/*.db server/src/

# Reiniciar servidor
pm2 restart contabilidade-server
```

---

## 9. Vercel — Problemas

### Problema: "Build falha no Vercel mas funciona localmente"

```bash
# Razão comum: package-lock.json fora de sync

# Solução:
git status  # verificar se package-lock.json tem mudanças

# Atualizar lock file localmente
rm -rf node_modules
npm install

# Commitar
git add package-lock.json
git commit -m "Update package-lock.json"
git push

# Vercel vai tentar build novamente
```

### Problema: "Variáveis de ambiente não funcionam em Vercel"

```bash
# Variáveis tipo VITE_* precisam estar no build
# Se mudar variável no painel Vercel:
# 1. Ir para Settings → Environment Variables
# 2. Adicionar/atualizar valor
# 3. Forçar rebuild: ir para Deployments → selecionar latest → Redeploy

# Não basta apenas alterar variável e reiniciar — precisa rebuild
```

### Problema: "Vercel falha com 'Cannot find module'"

```bash
# Limpar cache de build Vercel
# Settings → Git → Clear Cache

# Depois fazer push forçado
git commit --allow-empty -m "Trigger rebuild"
git push
```

---

## 10. Performance — Otimizações

### Problema: "Servidor lento"

Checklist:
- [ ] Check logs: `pm2 logs contabilidade-server | grep -i "slow\|error"`
- [ ] CPU/Memory: `pm2 describe contabilidade-server`
- [ ] Database queries: adicionar índices se necessário
- [ ] Cache: implementar cache em endpoints frequentes
- [ ] Compressão: ativar gzip em Express

```javascript
// Em server/src/index.ts
import compression from 'compression';
app.use(compression());  // comprime respostas gzip
```

### Problema: "Frontend lento (JavaScript bundle grande)"

```bash
# Analisar bundle size
npm run build

# Usar ferramentas de análise
npm install -g @vite/plugin-visualizer
# Adicionar a vite.config.ts:
// import { visualizer } from 'rollup-plugin-visualizer';
// export default { plugins: [visualizer()] }
```

---

## 11. Segurança — Checklist

- [ ] `.env` **nunca** commitado (está no `.gitignore`?)
- [ ] `API_KEY` é valor aleatório forte (`openssl rand -hex 32`)
- [ ] CORS habilitado apenas para domínios esperados
- [ ] Rate limiting configurado (proteção contra DDoS)
- [ ] HTTPS/SSL certificado válido (Vercel fornece)
- [ ] Dependências atualizadas: `npm audit fix`

```bash
# Verificar vulnerabilidades
npm audit

# Atualizar dependências seguras
npm audit fix

# Forçar update se necessário
npm update
```

---

## 12. Logs e Debugging

### Visualizar Logs

```bash
# Ver últimas 100 linhas
pm2 logs contabilidade-server --lines 100

# Ver tempo real
pm2 logs contabilidade-server --follow

# Ver apenas erros
pm2 logs contabilidade-server --err

# Ver logs salvos
tail -f ~/.pm2/logs/contabilidade-server-out.log
tail -f ~/.pm2/logs/contabilidade-server-err.log
```

### Aumentar Verbosidade

```bash
# Adicionar a ecosystem.config.js:
env_production: {
  NODE_ENV: "production",
  DEBUG: "app:*"  // ativa logs DEBUG
},

# Depois reiniciar
pm2 restart contabilidade-server
pm2 logs  # ver mais detalhes
```

---

## Checklist de Resolução Rápida

Se algo não funciona:

1. **Verificar logs**:
   ```bash
   pm2 logs contabilidade-server --lines 50
   ```

2. **Verificar processo status**:
   ```bash
   pm2 status
   ```

3. **Reiniciar tudo**:
   ```bash
   pm2 delete ecosystem.config.js
   pm2 start ecosystem.config.js
   ```

4. **Verificar variáveis de ambiente**:
   ```bash
   cat .env | grep -E "API_KEY|NODE_ENV"
   ```

5. **Verificar conectividade**:
   ```bash
   curl http://localhost:3000
   ```

6. **Checar disco/memória**:
   ```bash
   df -h  # disco
   top    # memória
   ```

---

## Escalação

Se nenhuma solução acima funcionar:

1. Fazer backup do projeto
2. Limpar tudo e começar do zero:
   ```bash
   rm -rf node_modules server/node_modules dist backups
   npm install
   cd server && npm install && cd ..
   ```
3. Rodar localmente sem PM2 para ver erro real:
   ```bash
   cd server
   npm run start  # sem PM2
   ```
4. Anotar o erro exacto e abrir issue no repositório

---

**Última atualização**: 2026-10-02
