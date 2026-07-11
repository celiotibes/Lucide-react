# Auditoria de Geração Solar (ShinePhone/Growatt + Fatura Celesc GD)

Você descreveu o mecanismo de monetização da energia solar que ficava em aberto desde `docs/10` ("preciso que você descreva o mecanismo real"): geração fotovoltaica com créditos de compensação (net metering — Lei 14.300/2022, REN ANEEL 1.059/2023), monitorada pela API do app ShinePhone (Growatt) e cruzada com a fatura de Geração Distribuída (GD) da Celesc, para isolar quanto do consumo do prédio é de área comum — a parte que nenhum inquilino paga individualmente.

## Análise de custo-benefício (pesquisada, não suposta)

### Integração com a Growatt

Duas vias reais, ambas sem custo de licença:

| Via | Autenticação | Como obter | Estabilidade |
|---|---|---|---|
| **API Open V1** (recomendada pela própria Growatt) | Token | Só através do **instalador solar** — ele solicita o token pelo sistema OSS da Growatt em seu nome. Não é self-service. | Oficial, "melhor segurança, mais recursos, rate limit mais permissivo" (documentação da biblioteca `growattServer`) |
| **API legada (ShinePhone)** | Usuário/senha (mesma conta do app) | Self-service — você já tem essa conta hoje | Engenharia reversa não-oficial, mantida pela comunidade (base da integração popular do Home Assistant); o próprio projeto avisa "use por sua conta e risco" |

**Recomendação**: comece pela via legada (self-service, zero espera) para não travar o projeto num terceiro (instalador). Migrar para o token oficial depois é troca de um único client HTTP (`server/growatt/client.ts`, ainda não escrito), mesmo padrão já usado para isolar Asaas/Autentique — não é um redesenho.

**Pendente de você**: as credenciais do app ShinePhone (e-mail/senha) para eu escrever e testar o client de verdade — só depois disso o pipeline de leitura diária (`leituras_geracao_solar_diaria`, schema já pronto) passa a ser alimentado de fato. Sem a credencial, a tabela existe mas fica vazia.

### Fatura Celesc (Geração Distribuída)

**Não construí OCR/parser automático nesta rodada.** Sem uma fatura real de GD da Celesc em mãos, um parser seria adivinhar o layout do PDF — o mesmo erro que este projeto evita desde `docs/10`/`docs/11` (nunca codificar formato de documento sem ver o documento real). Em vez disso:

- **Agora**: lançamento manual dos 3 valores que a auditoria precisa (valor total, kWh injetado, kWh consumido da rede) — `server/integracao/registrarFaturaCelescGD.ts`, mesmo padrão de confirmação humana de `leituras_energia`/`geracao_solar`.
- **Depois**: assim que houver 2-3 faturas reais de GD, escrevo um parser de texto (a maioria das faturas de concessionária é PDF de texto, não imagem escaneada — mesmo padrão de `parsearOFX`) em vez de lançamento manual. OCR completo (mais caro) só entraria se a fatura vier como imagem escaneada.

**Pendente de você**: uma fatura real de GD da Celesc (pode cobrir/borrar dados sensíveis — só preciso ver os rótulos e o layout dos campos de energia injetada/consumida).

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

## O que ainda falta

- **`server/growatt/client.ts`** (não escrito) — depende das credenciais do ShinePhone.
- **Parser de texto da fatura Celesc GD** — depende de ver 2-3 faturas reais.
- **Telas de back-office** — cadastro de fatura Celesc GD, visualização da auditoria mensal, dashboard (métricas ShinePhone/Celesc/interna/área comum pedidas no requisito) — nenhuma ainda, backend pronto primeiro.
- **Cron mensal** disparando o cálculo automaticamente — mesmo padrão dos outros 4 crons já existentes, fácil de adicionar depois que o resto estiver validado com dado real.

## Verificação

Schema aplicado do zero sem erro. 14 testes novos (8 unitários da função pura, incluindo o caso de inconsistência; 6 de integração cobrindo cálculo completo e os dois motivos de "ainda não calculável"). 290 testes totais, 3 execuções consecutivas limpas contra banco recriado, build/lint/typecheck limpos.
