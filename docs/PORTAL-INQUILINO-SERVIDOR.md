# Portal do inquilino — base servidor

O banco contábil (contratos, competências, razão) vive no navegador do dono (sql.js). O portal do inquilino
precisa de dados no servidor, **sem** criar uma segunda verdade contábil. Solução: um **espelho de leitura**
publicado pelo dono. O servidor nunca devolve nada ao razão; o espelho só serve para o inquilino consultar.

## Tabelas (`server/src/migrations-phase14-portal-inquilino.sql`)

- `portal_inquilino_contratos`: `usuario_id` (inquilino), `contrato_ref` (id local, único), `imovel_apelido`,
  `valor_aluguel_centavos`, `dia_vencimento`, `data_inicio`, `data_fim`, `versao`, `conteudo_hash`,
  `publicado_em`.
- `portal_inquilino_cobrancas`: `contrato_ref`, `cobranca_ref` (id local da competência), `competencia`
  (YYYY-MM), `vencimento`, `valor_centavos`, `status` (pendente/paga/vencida/cancelada), `data_pagamento`.

Minimização (LGPD): sem CPF/CNPJ, e-mail, telefone, endereço, nome de terceiros, caução, multa/juros.
PIX/linha digitável **não** são copiados: na leitura vêm de `asaas_cobrancas` (por `aluguel_id =
cobranca_ref`, só cobranças em aberto), se a tabela existir.

## Rotas (`server/src/routes/portal-routes.ts`, montadas em `/api/portal`)

| Rota | Quem | Comportamento |
|---|---|---|
| `POST /publicar` | papéis internos | valida com zod (`.strict`, centavos inteiros); 201 cria, 200 atualiza; idempotente por `contratoRef`+`versao` (mesmo conteúdo = `idempotente:true`; mesma versão com conteúdo diferente ou versão menor = 409); substitui as cobranças da versão nova numa transação; audita (`portal_publicacao`) |
| `GET /meus-contratos` | inquilino | paginado (`limite` 1–100, `offset`) |
| `GET /minhas-cobrancas` | inquilino | paginado; `?contratoRef=` opcional |

Posse: só aparece o que tem `usuario_id` do usuário logado **e** concessão ativa em `acl_recursos`
(`tipo_recurso='contrato'`, `recurso_id = contrato_ref`). Sem concessão/posse (incluindo `contratoRef` de
outro inquilino ou inexistente): **404** idêntico, nunca 403. Prestador e papéis internos nas rotas GET e
prestador/inquilino em `/publicar` recebem 403 por **papel** (não revela recurso).

## Fluxo operacional

1. Criar o usuário inquilino (`POST /api/auth/usuarios`, role `inquilino`).
2. Conceder posse: `POST /api/acl` com `tipoRecurso:"contrato"`, `recursoId:<contratoRef>`. A publicação
   **não** concede acesso sozinha (menor privilégio; a concessão segue exclusiva de titular/administrador).
3. App do dono: `lerContratoParaPortal(db, contratoId, {usuarioId, versao, hoje})` e
   `publicarContratoNoPortal(apiFetch, payload)` (`src/domain/portal/publicarPortal.ts`). `apiFetch` é o
   cliente autenticado do app (injetado; este módulo não faz login). `versao` é um inteiro crescente por
   contrato (ex.: epoch em segundos); repetir a mesma versão com o mesmo conteúdo é seguro (retry de rede).
4. Revogar a ACL esconde o contrato do inquilino imediatamente (404).

## Limites conhecidos

- O inquilino só vê o que o dono publicou: o espelho fica defasado até a próxima publicação.
- `contrato_ref` é o id numérico local do dono; um único dono por servidor é o modelo atual.
- `/api/auth/usuarios` e o fluxo de convite do inquilino não foram alterados aqui.
