# Topologia de implantação: cliente e servidor

O cliente (React/Vite, `src/`) é local-first: roda sozinho no navegador, sem servidor. O servidor
Express (`server/`) só é necessário para as funções que falam com ele (login, permissões, portais,
integrações). Este documento descreve as duas formas suportadas de publicá-los e como configurar
cada uma. A recomendação é a **topologia A (mesmo domínio)**.

## Resumo

| | A. Mesmo domínio (padrão, recomendada) | B. Domínios diferentes (cross-origin) |
|---|---|---|
| Exemplo | `https://app.exemplo.com` serve o cliente em `/` e a API em `/api` | cliente em `https://app.exemplo.com`, API em `https://api.exemplo.com` |
| CORS | nenhum (nenhum cabeçalho `Access-Control-*` é emitido) | allowlist explícita em `CORS_ORIGINS` |
| Cookie de sessão | `SameSite=Lax; HttpOnly` (`Secure` em produção) | `SameSite=None; Secure; HttpOnly` (exige HTTPS) |
| `COOKIE_CROSS_SITE` | não definir | `true` |
| `VITE_API_URL` (build do cliente) | vazio | `https://api.exemplo.com` |
| Superfície de ataque | menor (cookie nunca vai em requisição de outro site) | maior (cookie viaja em requisições cross-site; CSRF e CORS passam a ser a única defesa) |

## Variáveis de ambiente

### Servidor (`server/.env`)

- **`CORS_ORIGINS`** — lista de origens permitidas, separadas por vírgula
  (ex.: `https://app.exemplo.com,https://admin.exemplo.com`). Cada item é uma origem (esquema +
  host + porta, sem caminho). Comportamento:
  - vazio/ausente: só mesma origem; o servidor não emite nenhum cabeçalho CORS;
  - origem na lista: recebe `Access-Control-Allow-Origin` com a própria origem (nunca `*`),
    `Access-Control-Allow-Credentials: true` e `Access-Control-Expose-Headers: XSRF-TOKEN`;
    o preflight (`OPTIONS`) responde 204 com métodos e `Access-Control-Allow-Headers` incluindo
    `Content-Type`, `Authorization`, `X-XSRF-TOKEN`, `X-CSRF-Token` e `X-API-Key`;
  - origem fora da lista: resposta sem cabeçalhos CORS (o navegador bloqueia a leitura);
  - `*`, valores que não são URL `http(s)` e duplicatas são descartados (com aviso no log);
    `*` nunca é aceito porque é incompatível com credenciais.
  - `ALLOWED_ORIGIN` (legado, origem única) ainda é aceito como mais uma entrada, mas não tem mais
    valor padrão.
- **`COOKIE_CROSS_SITE`** — `true` ativa `SameSite=None; Secure` nos cookies de sessão
  (`session_token`, `connect.sid` do csurf e `csrf_token`). Qualquer outro valor mantém
  `SameSite=Lax`. Só use na topologia B. `Secure` é obrigatório para `SameSite=None`, então a API
  precisa ser servida por HTTPS.
- **`TRUST_PROXY`** — número de proxies reversos confiáveis à frente do servidor (`1` para um
  nginx/Caddy; `true` equivale a `1`). Necessário quando o proxy termina o TLS: sem isso o
  `express-session` considera a conexão insegura e não grava o cookie `Secure`.
- **`SESSION_SECRET`** — obrigatório em produção (assina a sessão do csurf).

### Cliente (variáveis `VITE_*`, fixadas no build)

- **`VITE_API_URL`** — base da API. **Vazio = mesmo domínio** (as chamadas vão para `/api/...`
  relativo à página). Preencha (sem barra final) apenas na topologia B. Como é fixada no build,
  trocar de topologia exige novo build do cliente.
- **`VITE_DEV_API_TARGET`** (só dev, opcional) — alvo do proxy `/api` do Vite; padrão
  `http://localhost:8787`, a porta padrão do servidor.

## Topologia A: mesmo domínio via proxy reverso (recomendada)

O proxy reverso serve os arquivos estáticos do cliente e encaminha `/api` ao servidor Express. Para
o navegador é uma única origem: não há CORS, o cookie é `SameSite=Lax` e o CSRF (`csurf`) continua
exigindo o token nas requisições mutáveis.

```nginx
server {
  listen 443 ssl;
  server_name app.exemplo.com;

  root /var/www/crmt/dist;             # saída de `npm run build`
  location / { try_files $uri /index.html; }

  location /api/ {
    proxy_pass http://127.0.0.1:8787;  # servidor Express (PORT)
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

Configuração:

- servidor: `NODE_ENV=production`, `TRUST_PROXY=1`, `SESSION_SECRET`, e **sem** `CORS_ORIGINS` nem
  `COOKIE_CROSS_SITE`;
- cliente: build com `VITE_API_URL` vazio.

Em desenvolvimento a mesma ideia é feita pelo proxy do Vite (`vite.config.ts`: `/api` ->
`http://localhost:8787`): abra `http://localhost:5173`, deixe `VITE_API_URL` vazio e rode o servidor
na porta 8787.

## Topologia B: domínios diferentes (cross-origin)

Use quando o cliente é hospedado separadamente (CDN, Vercel/Netlify) e a API fica em outro domínio.

- servidor: `CORS_ORIGINS=https://app.exemplo.com`, `COOKIE_CROSS_SITE=true`, `NODE_ENV=production`,
  `TRUST_PROXY=1` (se houver proxy), `SESSION_SECRET`; API em HTTPS;
- cliente: build com `VITE_API_URL=https://api.exemplo.com`.

Como funciona o CSRF nesse cenário:

1. o cliente faz uma requisição GET (`/api/auth/me`) com `credentials: 'include'`;
2. o servidor responde com o cabeçalho `XSRF-TOKEN`, legível pelo JS porque está em
   `Access-Control-Expose-Headers`;
3. o cliente (`src/api/cliente.ts`) mantém esse token só em memória e o reenvia em `X-XSRF-TOKEN`
   em POST/PUT/PATCH/DELETE (permitido por `Access-Control-Allow-Headers`);
4. se o token vencer (403 `EBADCSRFTOKEN`), o cliente o renova e repete a chamada uma vez.

Ressalvas da topologia B:

- Navegadores com bloqueio de cookies de terceiros (Safari/ITP, Chrome com a restrição ativada,
  modo privado) podem descartar o cookie `SameSite=None`, e a sessão deixa de funcionar. Domínios
  irmãos (`app.exemplo.com` e `api.exemplo.com`) são "same-site" e não sofrem isso, mas ainda exigem
  CORS por serem origens diferentes. Se possível, prefira a topologia A.
- Nunca coloque `*` em `CORS_ORIGINS`; liste cada origem.
- Não reutilize `CORS_ORIGINS` para liberar origens que você não controla.

## Autenticação no cliente

- `src/api/cliente.ts` (`apiFetch`) é o único ponto de saída HTTP para o servidor: usa
  `credentials: 'include'`, trata o token CSRF e, em 401, dispara o evento de logout.
- O token de sessão fica em cookie `HttpOnly` e nunca é lido pelo JS; nada de token ou senha é
  gravado em `localStorage`/`sessionStorage`.
- A tela de login (`LoginView`) aparece sob demanda (`ExigeSessao`) ao abrir uma área do servidor.
  Sem servidor, essas áreas mostram um aviso e o restante do app continua funcionando offline.
- Endpoints usados (reais, em `server/src/routes/auth-routes.ts`): `POST /api/auth/login`,
  `GET /api/auth/me`, `POST /api/auth/logout`.
- Telas que ainda usam o modo legado de token Bearer colado à mão (Asaas, Pluggy, Telegram,
  notificações, vistoria etc.) não foram migradas para `apiFetch`; hoje apenas a tela de
  Permissões usa a sessão por cookie.
