# Matriz de rotas e acesso (servidor)

Fonte da verdade executável: `server/src/routes/__tests__/matriz-rotas-acesso.test.ts`
(tabela `CLASSIFICACAO`). Este documento espelha essa tabela; os dois precisam mudar juntos.

## Regra geral

- Papéis **internos**: `titular`, `administrador`, `contador`, `perito`, `advogado`, `economista`.
- Papéis **externos**: `inquilino`, `prestador`.
- `criarMiddlewareAutenticacao(authService)` (padrão) nega papéis externos e papéis desconhecidos
  com **403**; sem token, **401**. Isso é o que torna uma rota "interna".
- Só rotas que declaram `{ permitirPapeisExternos: true }` aceitam externos, e mesmo assim
  somente nas classes `externa-propria` (opera só sobre o próprio usuário) ou `externa-posse`
  (exige ACL ativa em `acl_recursos` via `criarExigirPosse`; sem ACL, **404** para não revelar
  existência).

## Classes

| Classe | Significado | Comportamento garantido por teste |
|---|---|---|
| `interna` | Só papéis internos | sem token 401; inquilino/prestador/papel desconhecido 401/403/404 |
| `externa-propria` | Externo permitido, opera só sobre o próprio usuário | externo aceito (`/api/auth/me` 200) |
| `externa-posse` | Externo permitido só com ACL do recurso | externo sem ACL 404; com ACL, 200 (projeção mínima no PIX); revogado volta a 404 |
| `publica` | Sem sessão de usuário; autenticação própria (segredo do webhook, login) ou informativa | classificação apenas |
| `chave-api` | Protegida por `X-API-Key`, não por sessão de usuário | classificação apenas |

## Classificação por rota

### Auth (`/api/auth`)
| Rota | Classe | Observação |
|---|---|---|
| POST /login, POST /bootstrap | publica | rate limit próprio |
| GET /me, POST /logout | externa-propria | externos precisam ver/encerrar a própria sessão |
| GET /permissoes, PUT /permissoes, POST /usuarios | interna | gate adicional titular/administrador |

### Recursos por id
| Rota | Classe | Decisão |
|---|---|---|
| GET /api/asaas/cobrancas/:asaasChargeId | **externa-posse** (`cobranca`) | já tinha posse |
| GET /api/asaas/pagamentos-pix/:id | **externa-posse** (`pagamento_pix`) | **posse aplicada nesta entrega**: o prestador beneficiário consulta o próprio pagamento. Externo não dispara sincronização com a Asaas e recebe só `id, valor, descricao, status, criadoEm, atualizadoEm` + histórico de status (sem chave PIX, CPF/CNPJ, QR code, ids da Asaas) |
| PUT /api/asaas/cobrancas/:asaasChargeId | interna | altera cobrança; externo nunca |
| GET /api/asaas/cobrancas/:chargeId/reembolsos | interna | expõe erros/estado interno de reembolso; sem caso de uso externo hoje. Se surgir, aplicar `exigirPosse("cobranca", "chargeId")` e projeção mínima |
| POST /api/asaas/cobrancas/:chargeId/processar-devolucao | interna | operação financeira |
| POST /pagamentos-pix/:id/sincronizar, PUT/DELETE /pagamentos-pix/:id, POST /pagamentos-pix/criar, GET /pagamentos-pix (lista) | interna | mutações e listagem global |
| DELETE /api/acl/:id, POST/GET /api/acl | interna | concessão de ACL é decisão de titular/administrador |
| PUT /api/anomalias/:id, PATCH /api/anomalias/alertas/:id/revisar, POST /api/anomalias/analisar/:transacaoId | interna | análise financeira interna |
| POST /api/transacoes/:id/sugerir-categoria | interna | |
| POST /api/eventos-externos/:id/consumir, DELETE /api/eventos-externos/:id | interna | inbox consumida pelo cliente interno |
| POST /api/telegram/vinculos-externos-pendentes/:id/consumir | interna | |
| POST /api/:id/assinar (router em `/api`) | interna | assinatura de relatório |
| POST /api/backup/restaurar/:fileId | interna | |
| GET /api/relatorios/dre/:ano/:mes, GET /api/relatorios/executivo/download/:mes/:ano | interna | não são recursos por id de posse |

Tipos de ACL sem rota no servidor hoje (`contrato`, `imovel`, `chamado`, `ordem_servico`): não há
o que proteger; ao criar a rota, ela cai no teste de cobertura e precisa ser classificada.

### LGPD do titular (`/api/lgpd`)
`GET /meus-dados`, `GET /acessos`, `POST /deletar-conta`: **externa-propria** (operam sempre e só
sobre o usuário autenticado). As rotas administrativas de LGPD/assinatura (`/api/anonimizar-pessoa`,
`/api/exportar-dados`, `/api/log-lgpd`, `/api/desafio-2fa`, `/api/validar-2fa`) são **interna**.

### Públicas / chave de API
| Rota | Classe | Proteção |
|---|---|---|
| POST /api/asaas/webhooks/asaas | publica | header/segredo do webhook Asaas |
| POST /api/telegram/webhook | publica | `X-Telegram-Bot-Api-Secret-Token` |
| POST /api/webhooks/pluggy | publica | `?key=` com a chave de API |
| GET /api/health, GET /api-docs.json, GET /metrics | publica | informativas (revisar exposição de `/metrics` e `/api/health` completo em produção) |
| POST /api/connect-token, GET /api/accounts, GET /api/transactions | chave-api | `X-API-Key` |

### Todas as demais rotas: **interna**
`/api/eventos-externos/*`, `/api/carimbo-tempo`, `/api/asaas/{clientes,cobrancas,reconciliar-agora}`,
`/api/pluggy-meu/*`, `/api/telegram/{gerar-codigo-vinculo,vinculos-externos-pendentes}`,
`/api/notificacoes/disparar`, `/api/lembretes-agendados/*`, `/api/relatorios/dre*`,
`/api/relatorios/fluxo-caixa/projecao`, `/api/relatorios/executivo/*`, `/api/conciliacao/*`,
`/api/anomalias/*`, `/api/backup/*`.

## Como o teste protege contra rota nova sem classificação

1. Cada router é construído com dependências de teste e percorrido via `router.stack`; as rotas
   declaradas direto em `app` são lidas do `index.ts`.
2. O conjunto resultante tem de ser igual às chaves de `CLASSIFICACAO` (rota nova **ou**
   classificação obsoleta falha).
3. As fábricas `criarRotas*` e os prefixos de `app.use` de `index.ts` são comparados com a lista
   `MONTAGENS` do teste (router novo montado sem constar lá falha).
4. A lista de migrações do schema de teste é comparada com `database-init.ts`.

## Correção encontrada no caminho
`criarRotasRelatorioExecutivo` estava montado em `/api/relatorios`, então as URLs reais eram
`/api/relatorios/dashboard`, etc., enquanto cliente, documentação e testes usam
`/api/relatorios/executivo/dashboard`. O mount agora é `/api/relatorios/executivo`.

## Fora do escopo desta matriz
CORS, cookies/login e rotas `/api/portal` (tratados por outros agentes). Quando `/api/portal`
existir, suas rotas entram nesta matriz (o teste de cobertura falha até serem classificadas).
