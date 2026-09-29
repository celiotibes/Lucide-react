# Viabilidade: backend real para iniciar pagamento PIX (e login/multiusuário)

> **Status: Fase 1 (auth real) implementada.** Ver `server/README.md` seção
> "Autenticação de usuário" para os endpoints, e a nota ao final deste
> documento (seção 9) para decisões técnicas, o que ficou de fora de
> propósito e pontos que pedem decisão humana antes da Fase 2. Fases 2 e 3
> continuam não implementadas.

> Documento de análise arquitetural, não uma especificação pronta para implementar. Nenhum
> código deste documento move dinheiro real. Ver `server/src/domain/pagamentos/payment-provider.ts`
> para um stub de **interface** (contrato de código) que ilustra o desenho sem falar com rede
> nenhuma — ver seção 8.

## 1. Resumo executivo

**Viável, sob três condições que não são negociáveis:**

1. O app **continua 100% client-side e instalável/usável offline** para tudo que já faz hoje
   (importação de extrato, reconciliação, DRE, laudo pericial, PWA instalável no Mac). O
   backend de pagamento é **aditivo e opcional** — nunca uma dependência para abrir o app.
2. Login/multiusuário real **precede** iniciação de pagamento, não o contrário. Não existe
   "iniciar PIX" sem primeiro existir "saber quem está autorizando o PIX" — e isso já foi
   analisado e descartado uma vez neste projeto (commit `926e8cf`, ver seção 3) precisamente
   por faltar backend. Tentar pagamento real sem resolver login primeiro repete o mesmo erro
   com dinheiro em vez de dado.
3. **Nenhuma credencial de produção de PSP é configurada por um agente automatizado.** Fases 1
   e 2 (auth real + sandbox de pagamento) são trabalho de engenharia normal. Fase 3
   (produção, dinheiro de verdade) exige decisão e configuração humana explícita, fora do
   escopo de qualquer sessão de IA — está detalhado na seção 7.

Sob essas condições, o esforço é significativo mas bem delimitado: o proxy Pluggy em
`server/` já prova que o time sabe operar um backend fino ao lado do app client-side, e a
infraestrutura de autenticação/auditoria já existe, testada, em
`server/src/domain/auth/*` — só nunca foi exposta por rota HTTP. O trabalho novo real é
**"soldar" essas duas coisas prontas juntas + a integração com um PSP**, não reinventar
autenticação ou modelo de pagamento do zero.

**Recomendação de por onde começar:** Fase 1 (auth real, sem nenhum pagamento) — ver seção 8.

## 2. O que muda arquiteturalmente

Hoje: **cliente único, sem servidor de aplicação.** SQLite (sql.js/WASM) no navegador,
persistência em IndexedDB, PWA instalável, e um único proxy fino (`server/`) que existe só
porque o Client Secret da Pluggy não pode ir para o navegador (ver `server/src/pluggy.ts`).
Sem esse proxy, o app inteiro continua funcionando — Open Finance é a única feature que
depende dele, e é opcional (o app também aceita OFX/CSV/PDF/foto importados manualmente).

Proposto: o mesmo modelo, estendido com uma **segunda razão** para o proxy existir — iniciar
pagamento exige um segredo (credencial do PSP) que também não pode ir para o navegador, pelo
mesmo argumento que já vale para a Pluggy. Arquiteturalmente isso é o **mesmo padrão que já
existe**, não um paradigma novo:

- O app continua sendo "client-side-first": todo o domínio contábil/pericial continua rodando
  no SQLite do navegador, sem servidor.
- O backend continua sendo "fino": guarda segredo, fala com API externa, confirma via
  webhook, e devolve ao app só o que o app precisa gravar no seu próprio banco local (o
  registro do pagamento, como já modelado em `src/domain/pagamentos/pagamentosIniciados.ts`).
- **O que muda de fato**: hoje o backend é **stateless em relação ao usuário** (qualquer
  requisição com a `X-API-Key` certa é atendida — ver `exigirChaveApi` em
  `server/src/index.ts`). Autorizar pagamento exige saber **quem** está pedindo, com que
  papel, e registrar isso de forma auditável — ou seja, o backend passa a ter **sessão de
  usuário real** pela primeira vez. É essa peça (login) que já foi construída uma vez no
  cliente, auditada, e corretamente descartada por não ser segurança real sem servidor
  (commit `926e8cf`) — agora ela tem, finalmente, um servidor para morar.
- `pagamentosIniciados.ts` já é o desenho certo do lado do cliente: ele modela **status**
  (solicitado → confirmado/falhou → conciliado), não uma chamada de rede. `confirmarPagamento()`
  já está documentada como "o ponto de entrada para quando um webhook real existir" — o
  módulo já foi escrito prevendo este exato passo, sem precisar ser reescrito.

## 3. Restrição do usuário — instalável em Mac e usável como está

Isto é uma restrição de desenho, não uma aspiração — qualquer código futuro decorrente desta
análise precisa respeitá-la:

- **PWA continua instalável.** `vite.config.ts` já configura `vite-plugin-pwa` com manifest,
  ícones e service worker via Workbox — isso não depende de nenhum backend e não muda. No
  macOS, Chrome/Edge continuam oferecendo "Instalar app" a partir da mesma URL/arquivo local
  de sempre. Nenhuma mudança proposta aqui toca `vite.config.ts` nem o manifest.
- **App continua funcionando 100% offline sem backend nenhum.** Todo o domínio contábil já
  roda contra SQLite local; isso não muda em nenhuma fase. Quem nunca configurar o backend de
  pagamento continua com o app exatamente como está hoje — importação de extrato, DRE,
  reconciliação, laudo pericial, tudo local.
- **O backend de pagamento é opcional e feature-detectado, nunca obrigatório.** Regra de
  desenho: se `VITE_PAGAMENTOS_BACKEND_URL` (nome ilustrativo) não estiver configurado, os
  botões de "iniciar pagamento PIX" **não aparecem** — a tela cai para o fluxo manual atual
  (registrar pagamento como dado já feito fora do sistema, do jeito que
  `solicitarPagamento()`/`confirmarPagamento()` já permitem hoje, manualmente ou por teste).
  Isso é o mesmo padrão já usado para a classificação por IA (`VITE_ANTHROPIC_API_KEY`
  opcional, ver README seção "Fallback para IA") e para o Open Finance via Pluggy — o app já
  tem o hábito de "funciona sem, funciona melhor com". A mesma regra vale para login: sem
  backend configurado, o app continua **single-user sem login**, exatamente como hoje.
- **Consequência prática**: o app publicado/distribuído sem nenhuma configuração de servidor
  continua sendo o mesmo artefato de sempre — mesmo instalador (`iniciar-mac-linux.command`),
  mesmo `npm run build`, mesmo comportamento. O backend de pagamento é uma peça a mais que
  **algumas** instalações vão optar por rodar ao lado, não uma reescrita do que já existe.

## 4. O que precisaria existir no backend

Tudo abaixo é sobre o `server/` existente (Express + better-sqlite3), estendido — não um
segundo backend novo.

- **Rotas de autenticação real**, reaproveitando `server/src/domain/auth/auth-service-db.ts` e
  `server/src/domain/auth/audit-trail-db.ts` — hoje testados
  (`server/src/domain/auth/__tests__/*.test.ts`) mas nunca expostos em `server/src/index.ts`.
  Precisaria: `POST /api/auth/login`, `POST /api/auth/logout`, middleware de sessão (token →
  `ContextoAutenticacao`) equivalente a `exigirChaveApi`, mas por usuário em vez de por chave
  compartilhada. **Ponto de atenção real**: `AuthServiceDB.autenticar()` hoje valida senha
  contra a constante `"senha123"` (comentário `FIXME: Em produção, usar bcrypt.compare`) — isso
  precisa ser resolvido (hash real) antes de expor a rota, não depois.
- **Rota de iniciação de pagamento**: `POST /api/pagamentos/pix`, que recebe o que já está
  modelado em `NovoPagamentoIniciado` (`src/domain/pagamentos/pagamentosIniciados.ts`) e chama
  o PSP configurado. O papel do backend aqui é só tradução + custódia de credencial — a lógica
  de status continua no cliente, como já está desenhada.
- **Webhook de confirmação assíncrona**: `POST /api/webhooks/pagamentos`, no mesmo padrão de
  `POST /api/webhooks/pluggy` que já existe (autenticado por chave/segredo na própria URL, já
  que quem chama não é o navegador do usuário). Ele é o que efetivamente chama, do lado do
  servidor, o equivalente de `confirmarPagamento()`/`registrarFalhaPagamento()` — via
  sincronização de volta para o cliente (o servidor não tem o SQLite do usuário; precisa expor
  o resultado para o app buscar, não empurrar direto no banco do cliente).
- **Guarda de idempotência**: evitar iniciar o mesmo pagamento duas vezes num retry de rede —
  `docs/dominios-a-reconstruir.md` §7 já registra que a lógica do antigo `payment-processor.ts`
  é reaproveitável "como referência de desenho, não para colar direto". Na prática: uma chave
  de idempotência (ex. hash de entidade+valor+destinatário+timestamp de solicitação, ou um
  UUID gerado no cliente ao chamar `solicitarPagamento()`) que o backend usa para recusar
  reenvio do mesmo pedido — mesmo padrão de `UNIQUE constraint` que
  `DuplicatePaymentGuardDB` já usa para pagamento de prestador (`server/src/domain/erp/duplicate-payment-guard-db.ts`),
  aplicável aqui por analogia direta.

## 5. Segurança/compliance

- **Custódia de credencial do PSP**: nunca no navegador — o mesmo argumento que já se aplica
  ao `CLIENT_SECRET` da Pluggy (`server/src/pluggy.ts`) e que já matou a cascata de login
  client-side (commit `926e8cf`: "JWT validado dentro do bundle do navegador não é segurança
  real sem backend"). Credencial de PSP fica só em variável de ambiente do servidor, nunca
  serializada para o cliente, nunca logada por inteiro (mesmo cuidado que `mensagemErro()` já
  toma em `server/src/index.ts` para não vazar segredo em log de erro do Axios).
- **Sandbox vs. produção**: PSPs de mercado (ex. Pluggy Payments, ou um PSP direto via API
  PIX) oferecem ambiente de sandbox com credenciais próprias, sem mover dinheiro real e sem
  KYC pesado para testar. Produção normalmente exige: pessoa jurídica cadastrada no PSP,
  processo de KYC/compliance do próprio PSP, e frequentemente aprovação/homologação antes de
  liberar volume. Isso é fora do controle do código — é processo comercial/regulatório.
- **Quem pode autorizar um pagamento**: precisa de papel explícito (equivalente a
  `podeAprovarPagamento()`, que já existe em `AuthServiceDB` para o fluxo de prestadores) —
  não basta estar logado, precisa ter o papel certo. Para valores acima de um limite, 2FA ou
  dupla aprovação é razoável (o schema de auditoria já registra `usuario_aprovacao_id`
  separado de quem submeteu, ver `duplicate-payment-guard-db.ts` — o padrão de "quem pediu ≠
  quem aprovou" já existe no código, só nunca foi ligado a dinheiro saindo de fato).
- **Trilha de auditoria**: `AuditTrailServiceDB` já registra ação, usuário, resultado
  (sucesso/falha/negado), IP e user-agent — precisa só ganhar os tipos de ação
  (`iniciar_pagamento_pix`, `confirmar_pagamento_pix`, `falha_pagamento_pix`) ao lado dos que
  já existem em `TipoAcao`. Não é infraestrutura nova, é extensão de enum + chamadas nos
  pontos certos.
- **LGPD/dado sensível**: dado bancário e de pagamento já é tratado como sensível pelo projeto
  (é o motivo do app ser client-side desde o início — ver README). Um backend com sessão de
  usuário e histórico de pagamento passa a guardar dado pessoal identificável de forma
  centralizada, o que muda o raciocínio de "nada sai do navegador do dono" para "existe um
  servidor com dado de mais de uma pessoa" — isso é precisamente o gatilho que torna
  login/multiusuário uma decisão de produto, não só técnica (mesma ressalva já registrada em
  `docs/dominios-a-reconstruir.md` §4: "decisão de produto, não técnica").

## 6. Tabelas novas que seriam necessárias (desenho, não criação)

Apenas o desenho — nenhum arquivo de schema é tocado nesta análise. Propostas, em
`server/` (o app client-side em `contabilidade-reconstituicao/schema.sql` não muda: pagamento
continua sendo dado local do usuário, o servidor só guarda o que é dele: sessão, segredo e log
de chamada ao PSP):

- **`usuarios`** *(já existe em `server/src/migrations-phase2-auth.sql`, reaproveitável)*:
  `id, nome, email, senha_hash, role, ativo, data_criacao, ultimo_login`. Precisaria só trocar
  `role` de `admin/gestor/prestador` (papéis do módulo de prestadores) para os papéis reais do
  produto — o mesmo ponto que o commit `926e8cf` já apontou como problema da cascata antiga
  ("papéis errados... não Contador/Perito/Advogado/titular que o produto usa").
- **`sessoes`** *(já existe, reaproveitável)*: `token, usuario_id, data_expiracao, ativo`.
- **`auditoria`** *(já existe, reaproveitável)*: só estender `TipoAcao` com os eventos de
  pagamento.
- **`pagamentos_pix_solicitados`** *(nova, no servidor — espelha `pagamentos_iniciados` do
  cliente, mas do lado que fala com o PSP)*: `id, usuario_id, chave_idempotencia (UNIQUE),
  valor, destinatario_chave_pix, destinatario_documento, psp_id_externo, status
  (enviado/confirmado/falhou), data_envio, data_confirmacao, payload_resposta_psp`.
- **`webhooks_pagamento_recebidos`** *(nova — log bruto de toda notificação do PSP, para
  auditoria e replay em caso de falha de processamento)*: `id, recebido_em, assinatura_valida,
  payload_bruto, processado, erro_processamento`.
- **`autorizacoes_pagamento`** *(nova, só se 2FA/dupla aprovação for exigida acima de um
  limite)*: `id, pagamento_id, usuario_solicitante_id, usuario_aprovador_id, data_aprovacao,
  metodo_confirmacao`.

## 7. Plano faseado

**Fase 1 — Auth real (sem pagamento nenhum)**
Expor `server/src/domain/auth/auth-service-db.ts` e `audit-trail-db.ts` por rota HTTP.
Corrigir a senha hardcoded (`"senha123"`) para hash real (bcrypt, já era o `FIXME` documentado
no próprio código). Ajustar papéis de `admin/gestor/prestador` para os papéis reais do produto
(ponto que a decisão anterior já identificou como errado). Login vira **opcional**: sem
backend configurado, app continua single-user como hoje. Entregável: consegue logar, ver quem
fez o quê na auditoria — zero relação com dinheiro ainda.

**Fase 2 — Sandbox de pagamento (mock/teste, sem credencial real)**
Construir a interface `PaymentProvider` (ver seção 8, já prototipada) e uma implementação
contra o **ambiente sandbox** do PSP escolhido (nunca produção). Rota de iniciação, guarda de
idempotência, endpoint de webhook — tudo funcional, mas contra dinheiro de teste do PSP.
Entregável: fluxo ponta a ponta demonstrável (solicitar → sandbox confirma via webhook →
cliente concilia), sem nenhum real saindo de conta nenhuma.

**Fase 3 — Produção (fora do escopo de qualquer agente automatizado)**
Troca da credencial sandbox por credencial de produção do PSP — isso exige: cadastro de
pessoa jurídica no PSP, processo de KYC/compliance do próprio PSP, revisão humana explícita de
quem vai poder aprovar pagamento real e com que limite, e decisão consciente do dono do
produto sobre guardar segredo de produção em ambiente de hospedagem real (não mais
`localhost`). Nenhuma sessão de IA deve configurar isso sozinha — é o mesmo tipo de linha que
separou "cascata de login descartada" de "login de verdade... construído depois", só que agora
com dinheiro.

## 8. Estimativa de esforço/risco por fase e recomendação

| Fase | Esforço aproximado | Risco | Reaproveita |
|---|---|---|---|
| 1 — Auth real | Médio (dias, não semanas) — a lógica já existe e está testada; o trabalho é rota HTTP + corrigir hash de senha + ajustar papéis | Baixo — nenhuma superfície nova de dado sensível além do que já é tratado (dado bancário já é sensível no projeto) | `auth-service-db.ts`, `audit-trail-db.ts`, `migrations-phase2-auth.sql` |
| 2 — Sandbox de pagamento | Médio-alto — integração real com API de terceiro, mesmo em sandbox, tem curva de aprendizado (formato de webhook, assinatura, retries) | Médio — sandbox não move dinheiro, mas erro de desenho aqui (ex. idempotência mal feita) vira bug caro em produção se não for revisto | `pagamentosIniciados.ts` (modelo de status), `duplicate-payment-guard-db.ts` (padrão de guarda por constraint única), `docs/dominios-a-reconstruir.md` §7 |
| 3 — Produção | Alto, mas majoritariamente **não-técnico** (compliance, KYC, decisão humana) | Alto — dinheiro real, credencial real, superfície de ataque real | — (decisão humana, não código) |

**Recomendação — o que fazer primeiro dado o estado atual do projeto**: **Fase 1, sozinha,
sem prometer Fase 2 ainda.** Três razões:

1. É o gargalo real: pagamento sem saber quem autoriza não é uma feature mais simples, é a
   mesma decisão já tomada e descartada uma vez (commit `926e8cf`) refeita sem aprender a
   lição. Login precede pagamento por necessidade, não por ordem arbitrária.
2. É o trecho de menor risco e maior reaproveitamento — a lógica já existe, testada, só falta
   fio até uma rota HTTP. Dá para entregar e validar (inclusive com o usuário decidindo os
   papéis certos do produto) sem tocar em nenhum segredo de pagamento.
3. Só depois de Fase 1 estável faz sentido decidir *se* vale seguir para Fase 2 — a resposta
   pode legitimamente ser "não agora": `docs/dominios-a-reconstruir.md` §4 já registra que
   iniciar pagamento "só vale reconstruir se o produto for de fato iniciar pagamentos, não
   apenas reconciliar extrato — decisão de produto, não técnica". Essa decisão fica mais fácil
   de tomar com login real já funcionando do que especulando sobre as duas coisas juntas.

## 9. Fase 1 — o que foi implementado e o que ficou de propósito de fora

Implementado em `server/` (nada em `src/` foi tocado — o app client-side
continua 100% funcional sem backend nenhum, como a seção 3 exige):

- **Hash de senha**: `crypto.scrypt` (nativo do Node, não bcrypt — evita
  dependência com compilação nativa via node-gyp). Salt aleatório por senha,
  comparação em tempo constante, parâmetros de custo documentados e
  autodescritos no próprio hash armazenado. Ver `server/src/domain/auth/password.ts`.
- **Token de sessão**: o desenho pré-existente (tabela `sessoes`, validado a
  cada requisição) já era um session token opaco, não um JWT stateless — o
  comentário antigo `FIXME: usar JWT` presumia um desenho que o código nunca
  teve. Mantido esse desenho (evita reescrever revogação/expiração já
  testadas), mas com `Math.random()` trocado por `crypto.randomBytes` e uma
  assinatura HMAC-SHA256 sobre a parte aleatória, chave em `SESSION_SECRET`
  (ou `JWT_SECRET`) — sem isso configurado, gera um segredo aleatório por
  processo com aviso alto no boot. Ver `server/src/domain/auth/token.ts`.
- **Papéis**: `admin/gestor/prestador` (do módulo interno de pagamento a
  prestadores) trocados por `titular/contador/perito/advogado` (papéis reais
  do produto) em `UserRole`. RBAC granular entre os 4 continua raso de
  propósito — nenhuma tela real consome diferenciação ainda; só gestão de
  usuários e leitura de auditoria ficam reservadas a `titular`. **Decisão
  que merece revisão humana**: o módulo de pagamento a prestadores
  (`duplicate-payment-guard-db.ts`) tinha autorização amarrada ao papel
  `"prestador"` (self-service, só vê o próprio registro) — como esse papel
  não existe mais, a restrição foi desacoplada do nome do papel e passou a
  depender só da presença de `Usuario.prestador_id` (qualquer um dos 4
  papéis pode ou não estar vinculado a um prestador). Isso preserva o
  comportamento testado antes, mas é uma reinterpretação minha de como
  esse módulo (que não foi pedido nesta fase, só precisou compilar) deveria
  funcionar sob os novos papéis — vale confirmar com quem decide o produto
  se esse módulo de pagamento a prestadores ainda é relevante, e se sim, se
  esse desenho faz sentido.
- **Rotas**: `POST /api/auth/login`, `GET /api/auth/me`,
  `POST /api/auth/logout` (invalida sessão de verdade no servidor — o
  desenho é stateful, não client-side-only) e `POST /api/auth/bootstrap`
  (cria o primeiro `titular`; trava depois). Rate limit dedicado e mais
  agressivo no login (8/15min/IP) e no bootstrap (5/hora/IP), separado do
  rate limit geral já existente. Timing de "e-mail inexistente" e "senha
  errada" igualado (scrypt sempre roda, real ou contra hash dummy). CORS
  herdado do já configurado em `index.ts` — nenhuma política nova. Toda
  tentativa de login e o bootstrap geram evento em `auditoria`, com
  `usuario_id` real quando a conta existe (mesmo em falha) e `null` (nunca
  uma string inventada) quando não — a resposta HTTP nunca carrega esse
  detalhe. Ver `server/src/routes/auth-routes.ts` e `server/README.md`.
- **Seed inseguro removido**: a migration e `database-init.ts` seedavam,
  em TODA instalação nova (inclusive produção), usuários demo com senha
  fixa conhecida (`"senha123"`, nunca de fato validada contra hash antes
  desta fase). Removido — o primeiro usuário agora só nasce via bootstrap,
  com senha escolhida por quem instala.
- **Código morto removido**: a classe `AuthService` em memória (com o
  singleton `authService`), que tinha a senha hardcoded e o token sem
  assinatura, nunca foi importada por nenhuma rota nem teste — removida em
  vez de corrigida, para não deixar uma segunda implementação insegura ao
  lado da corrigida (`AuthServiceDB`).

**Ficou de fora de propósito (Fase 1 não pediu, não inventei)**:

- **Convidar/criar usuário por HTTP**: `AuthServiceDB.criarUsuario` existe,
  hashea senha de verdade, mas só é chamável de dentro do processo Node —
  não há rota. Depois do bootstrap, um `titular` não tem hoje como criar
  conta para um `contador`/`perito`/`advogado` sem acesso direto ao banco.
  Fica para quando isso for pedido.
- **RBAC granular por papel profissional**: ver acima — os 4 papéis são
  hoje equivalentes, exceto gestão de usuários/auditoria (reservada a
  `titular`). Não inventei diferenciação sem tela real para validar.
- **Contador em memória de força bruta é por processo**: `tentativasFalhas`
  (bloqueio após 5 tentativas por e-mail) vive em `Map` na instância de
  `AuthServiceDB` — reinicia a zero a cada restart do servidor, e não é
  compartilhado entre réplicas se este backend algum dia rodar em mais de
  um processo. O rate limit por IP (`express-rate-limit`, na rota) é
  independente disso e não tem essa limitação. Comportamento herdado de
  antes desta fase, não é novo, mas vale registrar.
- **Timing do caminho "bloqueado por tentativas"**: esse caminho retorna
  antes de qualquer hash (nem real, nem dummy), então é mensuravelmente
  mais rápido que os outros dois (e-mail inexistente / senha errada, que
  levam o mesmo tempo entre si). Isso só revela "esta conta já levou 5
  tentativas recentes", não qual e-mail existe no sistema em geral — risco
  residual baixo, mas não foi eliminado.
- **`SESSION_SECRET` por processo, sem rotação nem fallback multi-réplica**:
  suficiente para um backend de instância única (o desenho atual do
  projeto); se este servidor algum dia rodar em mais de uma réplica atrás
  de um load balancer, cada uma precisa do MESMO `SESSION_SECRET` (variável
  de ambiente compartilhada) — não é algo que o código resolve sozinho.
