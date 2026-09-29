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
                        # e gere sua própria API_KEY (ex: openssl rand -hex 32)
npm run dev
```

Sobe em `http://localhost:8787`. O app web (rodando em `npm run dev` na raiz
do repo, porta 5173) já aponta pra essa URL por padrão na tela de conexão —
lá você também precisa colar a mesma `API_KEY` que definiu aqui, no campo
"Chave de API do backend".

O servidor recusa iniciar se `API_KEY` não estiver definida no `.env`
(ver `.env.example`) — sem ela, qualquer pessoa que descubra a URL pública
deste backend conseguiria ler extratos bancários de qualquer item/conta,
sem credencial nenhuma.

## Endpoints

- `POST /api/connect-token` — `{ clientUserId? }` → `{ accessToken }` (usado pelo widget do navegador). Exige header `X-API-Key`.
- `GET /api/accounts?itemId=` — lista contas do item conectado. Exige header `X-API-Key`.
- `GET /api/transactions?accountId=&from=&to=` — transações já normalizadas para o formato de importação do app. Exige header `X-API-Key`.
- `POST /api/webhooks/pluggy?key=` — recebe eventos `item/created`, `item/updated`, `item/error`. A Pluggy chama esta URL diretamente (não é o navegador do usuário), então a autenticação vai na própria query string (`?key=SUA_API_KEY`) em vez de um header — registre a URL completa, com o parâmetro, no dashboard da Pluggy.
- `GET /api/health` — checagem simples, sem autenticação.

Toda rota autenticada compara com a mesma `API_KEY` do `.env`. Há também um
limite de 100 requisições por IP a cada 15 minutos (`express-rate-limit`),
para conter força bruta de `itemId`/`accountId` e evitar estourar a cota
paga da API da Pluggy.

### Autenticação de usuário (Fase 1 — ver `docs/viabilidade-backend-pagamentos.md`)

Login real por usuário, separado da `API_KEY` compartilhada acima (que só
autoriza "é este app", não "é este usuário"). Papéis do produto: `titular`,
`contador`, `perito`, `advogado` — ver `server/src/domain/auth/auth-service.ts`.

- `POST /api/auth/bootstrap` — `{ nome, email, senha }` → cria o primeiro
  usuário `titular`. Só funciona uma vez (enquanto não existir nenhum
  `titular` no banco); depois disso responde 403. É a porta de entrada da
  primeira instalação — não existe rota alguma para criar usuário depois
  disso nesta fase (ver limitações abaixo).
- `POST /api/auth/login` — `{ email, senha }` → `{ token, usuario }`.
  Credencial errada (e-mail inexistente OU senha errada) sempre devolve a
  mesma mensagem genérica 401 — nunca revela qual das duas errou. Rate limit
  próprio e mais agressivo que o geral (8 tentativas / 15 min por IP).
- `GET /api/auth/me` — header `Authorization: Bearer <token>` → dados do
  usuário autenticado.
- `POST /api/auth/logout` — header `Authorization: Bearer <token>` → invalida
  a sessão no servidor (é stateful, não é "só o cliente esquecer o token";
  o mesmo token para de funcionar imediatamente).

Toda tentativa de login (sucesso e falha) e o bootstrap geram um registro na
trilha de auditoria (`auditoria`, ver `audit-trail-db.ts`), com IP e
user-agent. Senha é armazenada com hash `scrypt` (nunca em texto puro nem
logada); o token de sessão é assinado com HMAC-SHA256 usando `SESSION_SECRET`
(ver `.env.example` e `server/src/domain/auth/token.ts`).

**Limitação conhecida desta fase**: não existe rota para um `titular`
convidar/criar contas de `contador`/`perito`/`advogado` depois do bootstrap —
`AuthServiceDB.criarUsuario` existe e funciona, mas só é chamável de dentro
do processo Node (por outro código do servidor), não por HTTP. Ver
`docs/viabilidade-backend-pagamentos.md` para o que falta.

## Testando webhooks localmente

A Pluggy precisa de uma URL pública para chamar seu webhook. Para testar sem
implantar nada, use um túnel temporário:

```bash
npx ngrok http 8787
```

E registre `https://SEU-SUBDOMINIO.ngrok.app/api/webhooks/pluggy?key=SUA_API_KEY`
no dashboard da Pluggy (com o parâmetro `?key=`, ver seção Endpoints acima).
Para o fluxo básico (conectar → listar contas → buscar transações sob
demanda), o webhook nem é necessário — ele só importa para sincronização
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
- Toda rota de dados exige a `API_KEY` própria deste backend (não é a
  credencial da Pluggy) — é o que impede que qualquer pessoa que descubra a
  URL pública do servidor leia extratos alheios. Trate essa chave com o
  mesmo cuidado de uma senha.
- Os logs de erro nunca imprimem o objeto de erro inteiro (só a mensagem) —
  erros do Axios usados internamente pelo SDK da Pluggy podem carregar o
  Client Secret na configuração da requisição, e logar o objeto completo
  arriscaria vazá-lo em qualquer plataforma de hospedagem que agregue logs.
- Um middleware de erro dedicado (último `app.use()`) garante que nenhuma
  resposta HTTP devolva stack trace com caminho absoluto do servidor —
  achado de auditoria: `express.json()` roda antes de `exigirChaveApi` em
  toda rota, então um corpo JSON malformado, mesmo sem nenhuma API_KEY,
  batia no handler de erro padrão do Express, que em ambiente de
  desenvolvimento (o padrão quando `NODE_ENV` não é definido) devolve o
  stack trace completo no corpo da resposta. Corrigido de forma que não
  depende de configurar `NODE_ENV=production` corretamente em cada lugar
  onde isto for hospedado.
