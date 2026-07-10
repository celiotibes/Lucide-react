# Pipeline de Recebimento: Emissão de Cobrança, Webhook e Repasse ao Proprietário

Ao responder "o que falta?" (pergunta direta do cliente), a auditoria revelou uma lacuna maior do que qualquer item já documentado: `server/asaas/client.ts` e `server/asaas/webhook.ts` existiam desde as primeiras fases, testados isoladamente contra mocks, mas **nada os ligava ao banco**. Nenhuma fatura tinha uma cobrança emitida de verdade, nenhum webhook atualizava nada, e `investidor_ledger` — a tabela que registra quanto cada proprietário tem a receber — nunca recebia uma linha. Este documento fecha essa cadeia inteira: emitir → receber webhook → distribuir.

## Por que isso não apareceu antes na lista de pendências

Cada peça isolada (cliente Asaas, parser de webhook, `investidor_ledger`, `imovel_propriedade`) já existia e parecia "pronta" — só ao perguntar "quem chama isso?" ficou claro que não havia ninguém. É o mesmo tipo de lacuna silenciosa que motivou auditar antes de construir em toda esta sessão: código testado isoladamente pode dar falsa sensação de completude.

## 1. `server/asaas/client.ts` ganha criação de cliente

`criarCobranca` sempre exigiu um `customerId` do Asaas — mas não havia nenhum jeito de obter um. Dois métodos novos, mesmo padrão do resto do cliente (`fetchImpl` injetável, nunca testado contra o sandbox real):

- `criarCliente`: `POST /customers`.
- `buscarClientePorCpfCnpj`: `GET /customers?cpfCnpj=...`, evita duplicar cadastro no Asaas a cada nova cobrança.

## 2. `server/integracao/emitirCobranca.ts` (novo)

Para cada fatura `status = 'aberta'` sem cobrança ainda: resolve o cliente Asaas do locatário (usa `pessoas.asaas_customer_id` se já existir; senão busca por CPF/CNPJ; senão cria), emite o boleto/PIX, grava `cobrancas_asaas`. Fatura sem locatário vinculado ou locatário sem CPF/CNPJ cadastrado é pulada, não trava o lote — mesmo princípio de `faturarEnergia.ts`/`gerarFaturaMensal.ts`. Um erro da API do Asaas numa fatura específica também não derruba as demais.

## 3. `app/api/webhooks/asaas/route.ts` (novo)

Primeira vez que `interpretarWebhook`/`verificarTokenWebhook` são chamados de verdade. `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` marcam `cobrancas_asaas.status = 'pago'` e `faturas.status = 'paga'` — casando pelo `asaas_id` da cobrança (não pela `externalReference`, embora ela também exista, apontando para o id da fatura). Idempotente: reenvio do mesmo evento (retry do Asaas) não reprocessa.

**Dois casos tratados com a mesma cautela de sempre — não inventar regra sem confirmação**:
- `PAYMENT_OVERDUE` (atraso): reconhecido (200), mas sem ação — a régua de cobrança (`server/integracao/reguaCobranca.ts`) já detecta atraso varrendo `faturas.vencimento`, não depende do Asaas avisar.
- `PAYMENT_REFUNDED`/`PAYMENT_CHARGEBACK_REQUESTED` (estorno): a cobrança é marcada `cancelado`, mas **a fatura não é tocada** — o enum de `faturas.status` (`aberta/paga/atrasada/cancelada/renegociada`) não tem um valor "estornada", e inventar um sem saber como a operação de fato trata estorno seria a mesma classe de erro do pró-rata original (`docs/10`) — supor a regra em vez de perguntar. Fica sinalizado na resposta do webhook para revisão manual.

## 4. `server/integracao/distribuirRecebimento.ts` (novo) — o proprietário finalmente recebe

Para cada fatura `tipo = 'aluguel'` e `status = 'paga'` ainda não distribuída: lê os proprietários ativos do imóvel (`imovel_propriedade`), divide o valor líquido por `calcularSplitPagamento` (já testado com 300 combinações aleatórias — `server/financeiro/splitPagamento.ts`, nunca tinha um chamador até agora), deduz a taxa de administração de cada proprietário individualmente, e grava `investidor_ledger` com saldo corrido por pessoa.

**Escopo deliberado**: só faturas de aluguel. Energia é passthrough de custo (a taxa administrativa de 25% já é a margem do CRMT ali, itemizada separadamente); não há confirmação de que a mesma regra de rateio societário valeria para ela.

**A matemática do "resto implícito"**: um imóvel pode ter proprietários registrados somando menos de 100% (ex.: um proprietário com 60%, sem linha para os outros 40% — o resto fica implicitamente com o CRMT, sem registro). Para o split de centavos fechar exatamente contra o valor da fatura, um participante sintético (`__crmt__`) representa essa fração na chamada a `calcularSplitPagamento` — mas nunca vira linha de `investidor_ledger`. Se não há nenhum proprietário externo registrado (ou só uma linha explícita com `proprietario_pessoa_id = null`, ou seja, CRMT 100%), a fatura fica em `semDistribuicao`, sem erro.

### Bug real pego pela própria suíte (mesma classe já corrigida duas vezes nesta sessão)

Assim como `gerarFaturaMensal.ts` e `faturarEnergia.ts` (docs/12), este job varre o portfólio inteiro e roda pontualmente — duas execuções concorrentes (dois crons sobrepostos, ou testes em paralelo) poderiam ler o mesmo `saldo_apos` "anterior" de um proprietário antes de qualquer uma comitar, corrompendo o saldo corrido (lost update — um bug financeiro real, não cosmético). Desta vez a proteção foi construída **antes** de a suíte pegar o problema, aplicando a lição das duas vezes anteriores: `pg_advisory_xact_lock` por pessoa serializa a leitura+escrita do saldo, e o índice único parcial `uq_investidor_ledger_credito_repasse_por_fatura` garante que nenhuma fatura gere dois créditos para o mesmo proprietário mesmo sob corrida.

## 5. Três novas rotas de cron, mesmo padrão de `docs/13`

`app/api/cron/emitir-cobrancas` e `app/api/cron/distribuir-recebimentos`, autenticadas por `CRON_SECRET`, somadas a `vercel.json` (horários sequenciais: fatura mensal dia 1 às 06h, emissão de cobrança diária às 07h, distribuição diária às 08h — dá margem para o webhook do Asaas confirmar pagamentos entre uma etapa e outra). `emitir-cobrancas` também exige `ASAAS_API_KEY` — sem ela, 500 em vez de fingir que emitiu algo.

## O que ainda depende de credencial (sem mudança em relação a `docs/09`)

Todo este pipeline foi testado com o `fetchImpl` do `AsaasClient` mockado — nunca contra o sandbox real do Asaas. Continua exatamente como já documentado: falta a chave de API sandbox para validar de ponta a ponta (criar cobrança de verdade, simular pagamento no painel deles, confirmar que o webhook — configurado para apontar para `/api/webhooks/asaas`, com um token gerado no painel Asaas — bate certo com o que este código espera).

## Verificação

Schema aplicado do zero em Postgres real, com a suíte de integração completa rodada em **8 execuções consecutivas** contra bancos recriados do zero, todas limpas — validação de estabilidade deliberadamente mais rigorosa que o padrão anterior desta sessão (`docs/12`-`docs/16` validaram com 3 a 5 rodadas), porque duas rodadas de depuração de flakiness real aconteceram durante esta rodada e mereciam confirmação extra: (1) uma corrida genuína evitada pelo advisory lock, e (2) dois testes próprios (relatório de cobranças OFX e emissão de cobrança via cron) que assumiam estar sozinhos no banco quando na verdade dividem o portfólio com todos os outros arquivos de teste — corrigidos para não assumir isolamento que a arquitetura (varredura de portfólio inteiro, de propósito) nunca prometeu.

109 testes unitários + 98 de integração (207 no total), build/lint/typecheck limpos.
