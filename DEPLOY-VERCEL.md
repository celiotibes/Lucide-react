# Deploy em Vercel — Guia Completo

Este guia descreve como fazer deploy automático do Lucide Contabilidade no Vercel.

## Visão Geral

**Vercel** é a plataforma ideal para aplicações Next.js/React em produção:

- **Auto-deploy**: Cada push para `main` faz deploy automático
- **CDN global**: Distribuição de conteúdo em ~150 data centers
- **Serverless functions**: APIs rodando como edge functions (sem servidor a gerenciar)
- **Gratuito**: Até 100GB bandwidth/mês (generoso para MVPs)
- **Produção vs Staging**: Branches automáticos para preview antes de merge

---

## 1. Preparar Repositório GitHub

### 1.1 GitHub Setup

```bash
# Certifique-se que o projeto está em um repositório GitHub
git remote -v
# Deve mostrar: origin  https://github.com/seu-usuario/Lucide-react.git

# Se não estiver, inicialize:
git init
git remote add origin https://github.com/seu-usuario/Lucide-react.git
git branch -M main
git push -u origin main
```

### 1.2 Validar Estrutura do Projeto

Vercel detecta automaticamente:
- `package.json` na raiz ✓ (seu projeto tem)
- Scripts de build: `npm run build` ✓ (Vite detecta automaticamente)
- Configuração de output: pasta `dist/` ✓ (Vite cria)

### 1.3 Opcional: Adicionar vercel.json (Configuração Customizada)

Se você quiser customizar build/deploy, crie `vercel.json` na raiz:

```json
{
  "buildCommand": "npm run build",
  "installCommand": "npm install --legacy-peer-deps",
  "devCommand": "npm run dev",
  "env": {
    "VITE_CLASIFICACAO_BACKEND": "@vite_backend_url"
  }
}
```

---

## 2. Conectar Vercel ao GitHub

### 2.1 Criar Conta Vercel

1. Acesse [vercel.com](https://vercel.com)
2. Clique em "Sign Up"
3. Escolha "Continue with GitHub" (mais fácil)
4. Autorize a Vercel a acessar seus repositórios

### 2.2 Import Projeto

1. No dashboard Vercel: **+ New Project**
2. Clique em "Import Git Repository"
3. Selecione seu repositório `Lucide-react`
4. Vercel detecta automaticamente:
   - Framework: Vite (React)
   - Build command: `npm run build`
   - Output directory: `dist/`

---

## 3. Configurar Variáveis de Ambiente

### 3.1 Definir Environment Variables no Vercel

No painel Vercel:

1. Vá para **Project Settings** → **Environment Variables**
2. Adicione cada variável do `.env.example`:

```
VITE_ANTROPIC_API_KEY = sk-ant-xxxxx (se usar IA no frontend)
VITE_TELEGRAM_BOT_USERNAME = seu_bot_name
```

**Nota**: Variáveis com prefixo `VITE_` são públicas (expostas ao bundle).
Qualquer chave secreta deve estar **apenas no .env do servidor**.

### 3.2 Variáveis Sensíveis

Para variáveis que vão ao **servidor Node.js** (backend):

```
API_KEY = xxx
ASAAS_API_KEY = xxx
TELEGRAM_BOT_TOKEN = xxx
```

Se quiser usar a backend no Vercel também, use **Vercel Functions**.

---

## 4. Deploy Automático (GitHub Actions)

### 4.1 Fluxo Padrão

```
Push para main
    ↓
Vercel detecta mudança
    ↓
Executa: npm run build
    ↓
Deploy para produção
    ↓
Site live em: https://seu-projeto.vercel.app
```

### 4.2 Branches de Preview

Cada branch automáticamente ganha preview URL:

```bash
# Criar feature branch
git checkout -b feature/nova-funcionalidade

# Fazer push
git push origin feature/nova-funcionalidade

# Vercel cria: https://feature-nova-funcionalidade-seu-projeto.vercel.app
```

Merge na main → deploy automático para produção.

---

## 5. Backend: Opções de Deployment

### Opção A: Backend Separado no Render/Railway (Recomendado)

Se não quiser backend Node.js no Vercel, use um serviço especializado:

**Railway.app** (recomendado — muito fácil):

```bash
# 1. Criar conta em railway.app
# 2. Conectar seu GitHub
# 3. "New Project" → GitHub
# 4. Selecionar repositório
# 5. Railway detecta Node.js automaticamente
# 6. Configurar variáveis de ambiente
# 7. Deploy automático a cada push
```

**Render.com** (alternativa):

```bash
# Similar ao Railway, mas com mais controle
# https://render.com/docs/deploy-node-express-app
```

Depois, atualize `VITE_CLASSIFICACAO_BACKEND` no Vercel para apontar para seu Railway:

```
VITE_CLASIFICACAO_BACKEND = https://seu-backend-railway.com/api/classificar
```

### Opção B: Backend como Vercel Serverless Function

Crie arquivo `api/index.js` ou `api/index.ts`:

```typescript
// api/index.ts
import express from 'express';

const app = express();

app.post('/api/classificar', (req, res) => {
  // seu código aqui
  res.json({ tipo: 'fatura' });
});

export default app;
```

Vercel detecta `/api/*` automaticamente como serverless functions.

---

## 6. Domínio Customizado

### 6.1 Adicionar Domínio

No painel Vercel:

1. **Settings** → **Domains**
2. "Add Domain"
3. Escolha:
   - **Vercel Managed DNS** (mais fácil)
   - **External Domain** (seu registrador)

### 6.2 SSL/HTTPS

Vercel fornece **certificado Let's Encrypt automático** gratuitamente.

---

## 7. Monitoramento em Produção

### 7.1 Vercel Analytics

Dashboard automático mostra:
- Page performance
- Web Vitals
- Error tracking
- Real User Monitoring (RUM)

Ative em **Project Settings** → **Analytics**.

### 7.2 Logs

```bash
# Ver logs de build/deploy
vercel logs

# Ver logs da aplicação em tempo real
vercel logs --follow
```

### 7.3 Rollback

Se algo quebrou:

1. No painel Vercel: **Deployments**
2. Selecione deployment anterior
3. Clique em **Promote to Production**

---

## 8. Checklist de Deploy

- [ ] Repositório GitHub público ou private com acesso Vercel
- [ ] `.env.example` contém apenas variáveis não-sensíveis
- [ ] Variáveis sensíveis (`API_KEY`, `TELEGRAM_BOT_TOKEN`) **NÃO** estão no repo
- [ ] `npm run build` funciona localmente
- [ ] `npm install` funciona sem erros
- [ ] `.gitignore` inclui: `.env`, `dist/`, `node_modules/`
- [ ] Environment variables configuradas no Vercel
- [ ] Backend (se Node.js) deployado em Railway/Render
- [ ] CORS configurado corretamente entre frontend (Vercel) e backend (Railway)
- [ ] SSL/HTTPS habilitado
- [ ] Analytics habilitado

---

## 9. Troubleshooting Vercel

### Build falha com "Cannot find module"

```bash
# Localmente, tente:
npm ci  # instala exatamente como em package-lock.json
npm run build

# Se funcionar localmente mas falhar em Vercel:
# 1. Verifique se package-lock.json está no repo
# 2. Limpe Vercel cache: Settings → Git → Clear Cache
# 3. Faça novo push
```

### Aplicação fica lenta em produção

- Ative Vercel Image Optimization (`next/image`)
- Use code splitting (Vite faz automaticamente)
- Verifique bundle size: `npm run build` mostra tamanho

### Environment variables não funcionam

- Variáveis com prefixo `VITE_` precisam estar no bundle em build time
- Se mudar variável, precisa fazer novo deploy (não basta reiniciar)
- Verifique escopo: Production vs Preview vs Development

---

## 10. Exemplo Completo: Deploy First Time

```bash
# 1. Criar projeto GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/seu-usuario/Lucide-react.git
git push -u origin main

# 2. Criar conta Vercel (vercel.com)

# 3. Import projeto via Vercel UI
# → Select repository → Import

# 4. Configure Environment Variables (Vercel UI)

# 5. Clique "Deploy"

# 6. Acesse: https://lucide-react-seu-usuario.vercel.app
```

---

## 11. Próximos Passos

- [ ] Setup CI/CD com GitHub Actions para testes antes de deploy
- [ ] Configurar alertas de erro com Sentry ou Vercel Error Tracking
- [ ] Setup backup automático de database
- [ ] Configurar monitoring de performance com Web Vitals
- [ ] Setup email notifications de builds falhados

---

## Referências

- Docs Vercel: https://vercel.com/docs
- Vite Deployment: https://vitejs.dev/guide/build.html
- Railway.app: https://railway.app/docs
- GitHub + Vercel: https://vercel.com/docs/git

---

**Dúvidas?** Abra issue no repositório ou veja [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
