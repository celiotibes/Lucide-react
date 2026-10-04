# PWA e apontamento offline do prestador

## Visão geral

O app já era um PWA instalável gerado pelo `vite-plugin-pwa` (`vite.config.ts`): o build produz
`manifest.webmanifest`, `sw.js` (Workbox, versionado por hash do precache) e usa os ícones de
`public/icons/`. Por isso **não há `public/sw.js` nem `public/manifest.webmanifest` escritos à
mão**: um segundo service worker/manifest conflitaria com os gerados no build. O que faltava era
o **registro** do SW (a config usa `injectRegister: null`); ele agora é feito em
`src/pwa/registrarServiceWorker.ts`, chamado em `src/main.tsx`, **apenas em produção**, com
suporte do navegador e contexto seguro (HTTPS ou localhost). Falha de registro só gera `console.warn`.

Estratégia de cache:

- **Shell estático** (JS/CSS/HTML/ícones/`sql-wasm.wasm`): precache (cache-first) com versionamento
  por hash. `registerType: 'prompt'`: nova versão só assume quando as abas são fechadas.
- **`/tesseract/`**: cache-first em runtime, só após o primeiro uso.
- **`/api/*`**: sem precache, sem `runtimeCaching` e fora do fallback de navegação
  (`navigateFallbackDenylist`) — sempre rede; respostas autenticadas nunca são cacheadas pelo SW.

## Fila offline (`src/domain/apontamentos/filaOffline.ts`)

- Armazenamento injetável (`ArmazenamentoFila`): IndexedDB (`criarArmazenamentoIdb`) ou memória
  (`criarArmazenamentoMemoria`, usada em testes e como fallback).
- Cada item tem `uuid` gerado no cliente (idempotência), estado `pendente | enviando | enviado | erro`,
  tentativas, próxima tentativa e anexos (Blob). Reenfileirar o mesmo `uuid` não duplica.
- Reenvio com backoff exponencial (base 2 s, teto 15 min, 8 tentativas; configurável), depois vira `erro`
  e só volta por ação do usuário ("Tentar novamente").
- Limites de anexo: 5 MB por arquivo e 15 MB por registro (`ErroAnexoGrande`).
- Blobs só são liberados após confirmação do servidor; itens "enviado" ficam listados até "Limpar enviados".
- Retomada: ao sincronizar, itens `enviando` órfãos (app fechado no meio do envio) voltam a `pendente`.

### Contrato do `enviar(item)` (a implementar na integração)

Não existe endpoint neste repositório; a função é injetada em `<PrestadorMobileView enviar={...} />`.

- Enviar `item.payload` + anexos com `item.uuid` como chave de idempotência (`Idempotency-Key`
  ou `uuid_cliente`). O servidor deve responder sucesso também para `uuid` repetido (409 → `{ confirmado: true }`).
- `{ confirmado: true }` — gravado; `{ confirmado: false, permanente: true, mensagem }` — rejeição
  definitiva (400/422); `{ confirmado: false }` ou exceção — falha transitória (rede, 5xx, 401).
- A identidade do prestador deve vir da autenticação do servidor, não do payload (login está fora deste escopo).

Enquanto `enviar` não for fornecido, a tela mostra aviso, mantém os registros no aparelho e desabilita
"Sincronizar agora".

## Tela (`src/components/PrestadorMobileView.tsx`)

Menu: "Apontamento em campo (celular)". Formulário curto (imóvel, tipo serviço/vistoria, serviço,
horas, valor, observações, foto opcional via `<input type="file" capture="environment">`), indicador
online/offline, contagem da fila e sincronização automática ao voltar a rede e por backoff.
Alvos de toque ≥ 44 px, `aria-live` no status, erros com `role="alert"`. Lógica pura em
`src/domain/apontamentos/prestadorMobile.ts`.

## Limites conhecidos

- A tela lê os imóveis do banco local (sql.js); o apontamento da fila **não** é gravado nas tabelas
  locais de apontamento — ele existe só para ser enviado ao servidor.
- Fotos ficam no IndexedDB do aparelho; limpar dados do site apaga itens ainda não enviados.
- Safari/iOS pode limpar IndexedDB após ~7 dias sem uso do site; sincronize com frequência.
- Não há Background Sync: o reenvio ocorre com a tela aberta (evento `online` + temporizador).
- Sem `crypto.randomUUID` (HTTP sem TLS) usa-se fallback com `Math.random`.

## Como testar no Chromium

1. `npm run build && npx vite preview` e abrir `http://localhost:4173`.
2. DevTools → Application → Service Workers: confirmar `sw.js` ativado; Manifest: sem erros e instalável.
3. Menu → "Apontamento em campo". Network → "Offline"; registrar um item com foto: aparece "Pendente", pílula "Offline".
4. Application → IndexedDB → `prestador-fila-offline` → `itens`: o registro com `uuid` e anexo.
5. Recarregar offline: o app abre (shell em cache) e o item continua na lista.
6. Voltar "Online" com um `enviar` de teste injetado: o item passa a "Enviado" e o anexo é liberado.
7. Emulação de celular (Toggle device toolbar) para conferir alvos de toque e a câmera (`capture`).
8. Testes automatizados: `npx vitest run src/domain/apontamentos`.
