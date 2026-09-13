# Auditoria de Geração Solar (ShinePhone/Growatt + Fatura Celesc GD)

Você descreveu o mecanismo de monetização da energia solar que ficava em aberto desde `docs/10` ("preciso que você descreva o mecanismo real"): geração fotovoltaica com créditos de compensação (net metering — Lei 14.300/2022, REN ANEEL 1.059/2023), monitorada pela API do app ShinePhone (Growatt) e cruzada com a fatura de Geração Distribuída (GD) da Celesc, para isolar quanto do consumo do prédio é de área comum — a parte que nenhum inquilino paga individualmente.

## Análise de custo-benefício (pesquisada, não suposta)

### Integração com a Growatt

Duas vias reais, ambas sem custo de licença:

| Via | Autenticação | Como obter | Estabilidade |
|---|---|---|---|
| **API Open V1** (recomendada pela própria Growatt) | Token | Só através do **instalador solar** — ele solicita o token pelo sistema OSS da Growatt em seu nome. Não é self-service. | Oficial, "melhor segurança, mais recursos, rate limit mais permissivo" (documentação da biblioteca `growattServer`) |
| **API legada (ShinePhone)** | Usuário/senha (mesma conta do app) | Self-service — você já tem essa conta hoje | Engenharia reversa não-oficial, mantida pela comunidade (base da integração popular do Home Assistant); o próprio projeto avisa "use por sua conta e risco" |

**Recomendação**: comece pela via legada (self-service, zero espera) para não travar o projeto num terceiro (instalador). Migrar para o token oficial depois é troca de um único client HTTP (`server/growatt/client.ts`), mesmo padrão já usado para isolar Asaas/Autentique — não é um redesenho.

**Resolvido**: você passou usuário, senha e app key reais do ShinePhone. Ficam só em `.env.growatt.local` (gitignorado — nunca commitado, nem em código, nem em doc, nem em teste) e são referenciados no resto do projeto só pelo nome da variável (`GROWATT_USERNAME`/`GROWATT_PASSWORD`/`GROWATT_APP_KEY`), mesmo tratamento de `ASAAS_API_KEY` em `09-credenciais-necessarias.md`. Ver "Segunda rodada" abaixo para o que isso destravou — e o que não destravou (bloqueio de rede deste ambiente específico).

### Fatura Celesc (Geração Distribuída)

**Não construí OCR/parser automático nesta rodada.** Sem uma fatura real de GD da Celesc em mãos, um parser seria adivinhar o layout do PDF — o mesmo erro que este projeto evita desde `docs/10`/`docs/11` (nunca codificar formato de documento sem ver o documento real). Em vez disso:

- **Agora**: lançamento manual dos 3 valores que a auditoria precisa (valor total, kWh injetado, kWh consumido da rede) — `server/integracao/registrarFaturaCelescGD.ts`, mesmo padrão de confirmação humana de `leituras_energia`/`geracao_solar`.
- **Depois**: assim que houver 2-3 faturas reais de GD, escrevo um parser de texto (a maioria das faturas de concessionária é PDF de texto, não imagem escaneada — mesmo padrão de `parsearOFX`) em vez de lançamento manual. OCR completo (mais caro) só entraria se a fatura vier como imagem escaneada.

**Resolvido**: você enviou a fatura real de GD da Celesc (a "geradora" da rua Pottker, a mesma unidade do Residencial João Pottker de `docs/10`). `server/relatorios/celescGD.ts#parsearFaturaCelescGD` já extrai competência, vencimento, valor total e as duas grandezas de energia — ver "Segunda rodada" abaixo. Continua valendo a cautela: confirmado contra **1 fatura só**, mesmo cuidado já registrado em `docs/11` para o desconto de pontualidade — layouts de faturas sem geração própria, ou com bandeira diferente da amarela, podem variar e ainda não foram vistos.

## Validação das fórmulas que você propôs

As duas fazem sentido contábil, com uma ressalva:

1. **Consumo Próprio Instantâneo = Gerado − Injetado** — correto. Um sistema solar sempre atende a carga local primeiro e só exporta o excedente; o que não foi injetado foi necessariamente consumido no local.
2. **Área Comum = (Consumo Próprio + Consumido da Rede) − Σ Cobrado dos Inquilinos** — correto, desde que os medidores individuais dos inquilinos meçam consumo real no ponto de uso (já é o caso, `leituras_energia`). A diferença entre "tudo que o prédio usou" e "o que foi cobrado unidade por unidade" só pode ser área comum ou perda de medição.

**Ressalva técnica**: "Energia Consumida da Rede Celesc" precisa ser o valor **físico bruto** importado da rede (linha própria na fatura, ex. "Energia Ativa Fornecida"), não o consumo já líquido de créditos compensados que vira a base do valor cobrado em R$ — os dois números são diferentes sob o regime de compensação. Faturas de GD normalmente discriminam os dois separadamente, mas só confirmo o rótulo exato quando eu vir uma fatura real.

## O que foi construído agora (sem depender de nenhuma credencial)

- **Schema** (seção 30): `leituras_geracao_solar_diaria` (granularidade diária, alimentada pela API quando existir), `faturas_celesc_gd` (lançamento manual + confirmação), `auditorias_energia_solar` (resultado mensal calculado).
- **`server/energia/auditoriaGeracaoSolar.ts`** (função pura) — implementa as 4 fórmulas (consumo próprio, total consumido, área comum, resultado financeiro), com uma proteção que você não pediu mas que a lógica exige: se o "cobrado dos inquilinos" superar o "total consumido" (erro de leitura/fatura em algum lugar), a função nunca devolve área comum negativa — sinaliza `inconsistente: true` e devolve zero, para nunca virar um crédito fantasma na conta de ninguém. 8 testes.
- **`server/integracao/calcularAuditoriaEnergiaSolar.ts`** (função `calcularAuditoriaEnergiaSolarDoResidencial`) — cruza geração solar confirmada + fatura Celesc GD confirmada + soma do que já foi cobrado dos inquilinos (mesmo pareamento leitura atual/anterior que `faturarEnergia.ts` já usa, agregado por residencial). Só calcula quando as duas fontes humanas já foram confirmadas — nunca estima a partir de dado pendente.
- **`server/integracao/registrarFaturaCelescGD.ts`** — lançamento manual + confirmação.

## Segunda rodada: dados reais (ShinePhone + fatura Celesc)

### `server/relatorios/celescGD.ts` — parser validado contra fatura real

`parsearFaturaCelescGD(texto)` extrai da fatura real (Unidade Consumidora 313.198.011-71, competência 07/2026): competência, vencimento, valor total e as duas grandezas do medidor bidirecional (5496999) — "Energia" (consumida da rede, bruta) e "Energia injetada" (exportada). Confirma o que a ressalva técnica da seção anterior previa: a fatura discrimina os dois valores separadamente, cada um como "Total Apurado" (já aplicada a constante do medidor — não é a diferença bruta de leituras). Números em formato brasileiro (`.` milhar, `,` decimal) — helper próprio de conversão. 5 testes, todos passando contra o texto real. Opera sobre texto já extraído do PDF (mesmo desenho de `ofx.ts`); a biblioteca de extração de texto do PDF em si (pdf-parse ou similar) fica para quando o upload de fatura for de fato conectado a um formulário — decisão de infraestrutura nova, mesma cautela já registrada para o Puppeteer em `docs/27`.

### `server/growatt/client.ts` — client construído, mas não testável neste ambiente

`GrowattClient` implementa login + listagem de plantas + geração diária pela API legada do ShinePhone, usando os endpoints documentados pela biblioteca comunitária `growattServer` (engenharia reversa do app, não documentação oficial da Growatt). 6 testes unitários com fetch mockado, incluindo reaproveitamento de sessão (login não se repete numa segunda chamada).

**Achado importante, e mais grave que "falta credencial"**: com a credencial real em mãos, tentei validar o client contra a API de verdade e a política de rede **deste ambiente sandbox específico** bloqueia o domínio da Growatt inteiro — `server.growatt.com` (API legada) e `openapi.growatt.com` (API oficial) devolvem `403`/"connect_rejected" no proxy de saída, confirmado com `curl` direto e com o endpoint de diagnóstico do próprio proxy. Isso **não é** falta de credencial válida (você forneceu usuário/senha reais) nem bug de código — é uma política de egress deste ambiente de execução, que persistiria mesmo com qualquer outra credencial Growatt. O código está pronto e tipado, mas **nunca rodou contra a API real**.

**O que fazer com isso**: validar o `GrowattClient` de verdade precisa acontecer fora deste sandbox — na sua máquina local, ou uma vez que este código seja implantado em produção/Vercel (ambientes sem essa política de bloqueio). Recomendo rodar um teste manual pontual (login + listar plantas) assim que o código estiver implantado, antes de confiar nele para o pipeline diário de `leituras_geracao_solar_diaria`.

### Segurança das credenciais

`.env.growatt.local` guarda as credenciais reais, cobre pelo padrão `.env*.local` do `.gitignore` já existente (mesmo tratamento de `.env.local` para `DATABASE_URL`/`ASAAS_API_KEY`) — nunca commitado, verificado explicitamente antes de qualquer commit desta rodada.

## O que ainda falta

- **Rodar `GrowattClient` contra a API real** — bloqueado neste ambiente por política de rede, não por credencial (ver acima).
- **Testar `parsearFaturaCelescGD` contra mais faturas reais** (2-3 no mínimo) antes de confiar nele em produção — hoje validado contra 1 amostra só.
- **Job diário chamando `GrowattClient`** para popular `leituras_geracao_solar_diaria` — só depois que o client estiver validado contra a API real (item acima). Sem ele, `geracao_solar` continua sendo alimentada manualmente.

**Resolvido na revisão de ponta a ponta seguinte (`docs/31`)**: telas de back-office (`app/energia-solar` — lançar/confirmar fatura Celesc GD, calcular auditoria sob demanda) e o cron mensal (`app/api/cron/calcular-auditoria-energia-solar`).

## Verificação

Schema aplicado do zero sem erro. 26 testes novos no total desta feature (8 unitários de `auditoriaGeracaoSolar.ts`; 6 de integração de `calcularAuditoriaEnergiaSolar.ts`+`registrarFaturaCelescGD.ts`; 5 de `celescGD.ts` contra a fatura real; 6 de `growatt/client.ts` com fetch mockado; 1 teste de integração adicional provando o caminho ponta a ponta fatura real → parser → `registrarFaturaCelescGD`). 302 testes totais, 3 execuções consecutivas limpas contra banco recriado do zero em cada rodada, build/lint/typecheck limpos.
