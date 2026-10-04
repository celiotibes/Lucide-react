# Carimbo de Tempo RFC 3161 — Selo de Encerramento

## O que é

Carimbo de tempo (RFC 3161 — Time Stamp Protocol) é uma prova criptográfica, assinada por uma autoridade de carimbo (TSA), de que um documento (neste caso, o `hash_selo` do encerramento contábil) existia em uma data/hora específica.

## Por que

O `hash_selo` encadeado prova que nenhum lançamento do período foi alterado **após** o encerramento. O carimbo de tempo prova que o **próprio encerramento** foi feito em determinada data (e não "antedatado" depois).

## Serviço usado

Atualmente: **freetsa.org** (gratuito, sem validade jurídica ICP-Brasil). Adequado para auditoria interna.

Para validade jurídica com ICP-Brasil, será necessário trocar para uma ACT credenciada (ex: Serasa, Cartório Digital). O código está **desenhado para suportá-lo** sem alteração.

## Como adicionar outra autoridade

1. Defina a URL da nova TSA em `TSA_URLS` (variável de ambiente, separadas por vírgula):
   ```bash
   TSA_URLS=https://freetsa.org/tsr,https://nova-tsa.icp-brasil.gov.br
   ```

2. Nenhuma alteração de código é necessária. O sistema solicita carimbo a **cada** TSA configurada, em sequência (uma falha não impede as outras).

## Como verificar um carimbo offline

Com OpenSSL:

```bash
# token_base64 guarda a TimeStampResp completa devolvida pela TSA.
# Extrair da tabela ledger_selo_carimbos (coluna token_base64)
echo "BASE64_DO_TOKEN" | base64 -d > token.tsr

# Verificar (requer a CA da TSA; -digest recebe o hash em hexadecimal)
openssl ts -verify -digest SEU_HASH_HEX -in token.tsr \
  -CAfile /caminho/para/cadeia-tsa.pem
```

Para **freetsa.org**, a cadeia está em: http://freetsa.org/files/cacert.pem

## Implementação

- **Backend** (`server/src/services/tsa-service.ts`): Codifica TimeStampReq em DER, envia POST para TSA, valida resposta PKIStatus.
- **Rotas** (`server/src/routes/carimbo-routes.ts`): `POST /api/carimbo-tempo` com autenticação e rate limit.
- **Cliente** (`src/domain/erp/carimboTempo.ts`): `anexarCarimbosAoSelo()` e `listarCarimbos()`.
- **Schema** (`ledger_selo_carimbos`): Tabela append-only com índice por encerramento_id e UNIQUE(encerramento_id, tsa_url).

## Fluxo

1. Usuário encerra período → `encerrarPeriodo()` grava `hash_selo` em `ledger_encerramentos`.
2. Opcionalmente, chama `anexarCarimbosAoSelo()` → cliente HTTP POST em `/api/carimbo-tempo`.
3. Backend faz timeout de 10s, AbortController por TSA.
4. Respostas gravadas em `ledger_selo_carimbos` (idempotente por `tsa_url`).

## Notas

- Falha de uma TSA não bloqueia as outras.
- Se **todas** falharem, retorna 502 (Bad Gateway).
- Hash inválido → 400 (Bad Request).
- Autenticação obrigatória.
- Rate limit: 30 requisições / 15 min por IP.
- O pedido passa pelo servidor porque o navegador não alcança a TSA (CORS). Com `csurf` ativo, o cliente deve enviar o cabeçalho `X-XSRF-TOKEN` (parâmetro `cabecalhosExtras` de `criarClienteCarimboHttp`) e o cookie de sessão (`credentials: include`).
- **Complementar, não substitui ICP-Brasil**: freetsa.org não tem validade ICP-Brasil; para prova com presunção legal, acrescente uma ACT credenciada em `TSA_URLS`.
