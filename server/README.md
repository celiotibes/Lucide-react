# Backend de integração Open Finance (Pluggy)

Existe só por um motivo: a Pluggy exige que o Client Secret e a criação de
Connect Token aconteçam no servidor, nunca no navegador ("Sempre crie Connect
Tokens no servidor. Nunca envie credenciais para o navegador" — aviso do
próprio dashboard da Pluggy). O resto do app roda 100% local; isto aqui é a
única peça que precisa ficar de pé em algum lugar com o `.env` configurado.

## Rodando localmente

```bash
cd server
npm install
cp .env.example .env   # preencha CLIENT_ID e CLIENT_SECRET do dashboard.pluggy.ai
npm run dev
```

Sobe em `http://localhost:8787`. O app web (rodando em `npm run dev` na raiz
do repo, porta 5173) já aponta pra essa URL por padrão na tela de conexão.

## Endpoints

- `POST /api/connect-token` — `{ clientUserId? }` → `{ accessToken }` (usado pelo widget do navegador)
- `GET /api/accounts?itemId=` — lista contas do item conectado
- `GET /api/transactions?accountId=&from=&to=` — transações já normalizadas para o formato de importação do app
- `POST /api/webhooks/pluggy` — recebe eventos `item/created`, `item/updated`, `item/error`
- `GET /api/health` — checagem simples

## Testando webhooks localmente

A Pluggy precisa de uma URL pública para chamar seu webhook. Para testar sem
implantar nada, use um túnel temporário:

```bash
npx ngrok http 8787
```

E registre `https://SEU-SUBDOMINIO.ngrok.app/api/webhooks/pluggy` no dashboard
da Pluggy. Para o fluxo básico (conectar → listar contas → buscar transações
sob demanda), o webhook nem é necessário — ele só importa para sincronização
automática em segundo plano, que este backend ainda não implementa.

## Onde hospedar de verdade

Qualquer lugar que rode Node e permita configurar variável de ambiente
funciona — Render, Railway, Fly.io, uma VPS, etc. Nenhum foi escolhido por
você ainda; isto é só o código, pronto para subir onde você decidir.

## Segurança

- `.env` nunca é commitado (`.gitignore` já cobre isso).
- Se o Client Secret já vazou (por exemplo, apareceu num print de tela em
  algum lugar), regenere-o no dashboard da Pluggy antes de colocar este
  backend em produção.
