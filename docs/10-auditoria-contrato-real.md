# Auditoria a partir de um Contrato Real (Kitnet 16, Residencial João Pottker)

Você enviou um contrato de locação assinado de verdade (Florianópolis, início 08/07/2026). Este documento audita o sistema construído até aqui contra esse contrato real, linha por linha, e registra o que foi corrigido, o que foi adicionado, e o que ainda fica em aberto — porque você mesmo apontou que **este não é o único formato**: há contratos diferentes em Curitiba, locação por temporada (Airbnb) é outra lógica, e energia solar é uma fonte de receita que ainda não existia no sistema.

## Achado mais grave: o cálculo de pró-rata estava errado, e agora tenho prova

A cláusula 6.4 do contrato mostra a conta por extenso: início 08/07/2026, valor mensal R$2.490,00, "proporcional aos 24 dias de ocupação efetiva no mês de julho de 2026 (**com base em um mês comercial de 30 dias**)" = **R$1.992,00**.

Verificação: 2490 ÷ 30 × 24 = 1.992,00 exato.

O `server/financeiro/prorata.ts` anterior usava **dias corridos do mês de calendário** (julho tem 31 dias) como denominador — para este mesmo contrato, ele calcularia 2490 ÷ 31 × 24 = R$1.928,06. **Diferença de R$63,94 no primeiro boleto de um único contrato.** Isso não é uma diferença de centavos de arredondamento — é um erro sistemático que, multiplicado por dezenas de contratos ao longo do tempo, representa uma divergência real e recorrente entre o que o sistema cobraria e o que o contrato manda cobrar.

Além disso, a data de vencimento da primeira fatura (10/08/2026) não seguia a regra que eu tinha implementado (que inventava um "dia 1 vs dia 10" a partir do dia de início do contrato) — a regra real é mais simples: o vencimento é sempre o `dia_vencimento` configurado no próprio contrato (aqui, dia 10), ocorrendo no mês seguinte ao de início, **mesmo que esse dia ainda não tivesse passado no mês de início**. Isso resolve, com evidência real, a pergunta que ficara em aberto desde `docs/01-auditoria-critica.md` (item 1).

**Corrigido** em `server/financeiro/prorata.ts`, com um teste de regressão que reproduz exatamente os R$1.992,00 do contrato real — ver `server/financeiro/prorata.test.ts`.

## Segundo achado grave: os parâmetros de juros/multa também não batiam

Os valores que o sistema usava (multa 10% fixa, juros 2% a.m., honorários automáticos aos 30 dias) vieram da descrição genérica que você deu no início do projeto — não de um contrato real. A cláusula 5.1 deste contrato assinado é diferente em quatro pontos:

| Item | O que o sistema tinha | O que o contrato real diz |
|---|---|---|
| Multa até o 5º dia | 10% fixa desde o 1º dia | **2%**, só até o 5º dia |
| Multa a partir do 6º dia | (mesma multa de 10%, cumulativa) | 2% **substituída** por 10%, incidindo sobre principal+juros+correção (não cumulativa) |
| Juros de mora | 2% a.m. | **1% a.m.** |
| Correção monetária | não existia | IPCA *pro rata die*, componente separado dos juros |
| Honorários (20%) | automático aos 30 dias de atraso | **só se houver necessidade de ação judicial** |

**Isso prova que estes números são termo de cada contrato, não uma constante do sistema.** Corrigido de duas formas:

1. `server/financeiro/jurosMulta.ts` agora **exige** uma `PoliticaCobranca` explícita como parâmetro — não decide mais sozinho qual multa/juros aplicar. Suporta multa em degraus, correção monetária como componente próprio (resolvida externamente, mesmo padrão já usado em `rendimentoCaucao.ts` — este módulo não inventa o índice do IPCA, recebe a taxa já apurada) e honorários condicionados a necessidade de ação judicial.
2. `database/schema.sql` ganhou a tabela `contrato_politica_cobranca` (um-para-um com `contratos`) para guardar esses termos por contrato. `server/integracao/reguaCobranca.ts` lê essa tabela e usa `POLITICA_COBRANCA_GENERICA` como fallback quando um contrato ainda não tiver política própria cadastrada — **e esse fallback está marcado explicitamente no código como "não confirmado contra nenhum contrato real"**, ao contrário dos valores deste contrato, que estão documentados como reais e testados.

Testado com 13 testes unitários (incluindo os graus da multa, a substituição não-cumulativa, e o gatilho condicional de honorários) e um teste de integração que popula a política real deste contrato específico no banco e confirma que a régua de cobrança usa exatamente esses números, não os genéricos.

**Pergunta em aberto para você**: os parâmetros genéricos que orientaram o sistema até aqui (10%/2%/20% automático) vieram da sua descrição inicial do negócio — mas este contrato real diz outra coisa. Os outros contratos (Curitiba, outros residenciais em Floripa) seguem a régua deste contrato (2%/10%/1%/honorários-só-se-judicial), ou cada um tem a sua própria? Isso decide se `POLITICA_COBRANCA_GENERICA` deve ser ajustada para bater com este padrão ou se realmente cada contrato precisa da própria linha em `contrato_politica_cobranca` desde o cadastro.

## Terceiro achado: "valor único mensal" é uma estrutura contábil própria, não uma fatura genérica

Este é o achado mais rico do contrato e o que mais expande o schema. O contrato não cobra "aluguel" — cobra um **valor único mensal** (R$2.490,00) que é uma composição rígida de duas rubricas de natureza jurídica diferente:

- **55% = Aluguel Efetivo** — base de cálculo do IRPF Carnê-Leão do locador.
- **45% = Rateio de Custeio Coletivo e Fundos** — reembolso, explicitamente **não tributável** (cláusula 7.2, fundamentada na IN RFB 1.500/2014), dividido em 8 sub-rubricas: manutenção de mobiliário de áreas comuns (4%), pequenos reparos de áreas comuns (8%), limpeza/zeladoria terceirizada (8%), limpeza de áreas hidráulicas comuns (6%), água/esgoto coletivo (6%), lavanderia coletiva (5%), internet/wi-fi coletivo (4%), segurança/monitoramento (4%).

Isso não é o "Módulo de Rateio Multidimensional" que a proposta original do Gemini descrevia de forma vaga — é uma estrutura contábil real, com peso jurídico e fiscal específico, que o sistema **precisa** saber separar para gerar DIRPF/DRE corretos. Faturar isso como uma linha genérica "aluguel" (o que o schema fazia até aqui) esconderia a parte não-tributável dentro da parte tributável, distorcendo a apuração do Carnê-Leão do locador.

**Adicionado ao schema:**
- `contratos.percentual_aluguel_efetivo` — a fração tributável do valor único mensal (aqui, 0,55). Varia por contrato.
- `categorias_rateio_coletivo` — tabela de referência com as 9 rubricas (aluguel efetivo + 8 de rateio), cada uma com `natureza_fiscal` (`aluguel_tributavel` ou `reembolso_nao_tributavel`).
- `fatura_itens.categoria_rateio_id` — liga cada linha da fatura à rubrica correspondente.

**Também confirma uma decisão já tomada**: a cláusula 1.4 do contrato ("Segregação Absoluta de Outras Atividades Operacionais") proíbe expressamente misturar custos de temporada/Airbnb no rateio dos locatários de longa duração — exatamente a separação que `contratos.tipo` já impõe no schema. Nenhuma mudança necessária aqui, só confirmação de que o design estava certo.

## Quarto achado: Demonstrativo Semestral Simplificado (DSS) é uma obrigação contratual recorrente, não um relatório opcional

Cláusula 3.1.1.2: o locador **deve** enviar, a cada semestre, um demonstrativo com o arrecadado/gasto por rubrica. O locatário tem **10 dias corridos** para impugnar por escrito; silêncio = "concordância tácita absoluta", que vira prova documental de regularidade de gestão.

**Adicionado ao schema**: `demonstrativos_rateio`, `demonstrativo_rateio_itens`, `impugnacoes_demonstrativo`, com um trigger (`fn_check_prazo_impugnacao`) que **bloqueia no próprio banco** qualquer tentativa de registrar impugnação fora do prazo — testado com um cenário que deveria passar (impugnação 3 dias após envio, prazo de 10) e um que deveria falhar (impugnação 20 dias após envio). Sem essa trava no banco, "concordância tácita" seria só uma regra de aplicação — fácil de furar por um bug de UI que aceitasse uma impugnação atrasada.

**Não implementado nesta rodada** (documentado como pendente): a geração automática do DSS a partir dos dados de fatura/transações — hoje só existe a estrutura de dados e a trava de prazo, não o job que monta o demonstrativo. Fica para quando o Módulo 11 (Tesouraria) tiver dado real suficiente para popular.

## Quinto achado: água não é medida por unidade — energia é

Cláusula Nona: "diante da impossibilidade física e técnica de individualização de hidrômetros por unidade autônoma", o consumo de água é rateado por uma **franquia hídrica por número de ocupantes** (m³ por pessoa), com rateio extraordinário do excedente quando o consumo real do prédio ultrapassa a soma das franquias — mecanismo estruturalmente diferente do de energia (que já é medido e faturado por unidade, `leituras_energia`).

**Adicionado ao schema**: `franquia_hidrica_ocupacao` (m³ de franquia por número de ocupantes, por residencial) e `leituras_hidricas_coletivas` (consumo total mensal do prédio, com o mesmo padrão `pendente_confirmacao`/`confirmada` já usado em energia).

**Não implementado nesta rodada**: o cálculo de rateio de excedente hídrico entre as unidades (equivalente ao `calcularFaturaEnergia.ts`, mas para água) — a estrutura de dados está pronta, a função de cálculo ainda não existe.

### Confirmação: energia é por medidor individual, com tarifa por bandeira
Você confirmou explicitamente: "a energia é cobrada dos moradores por medidor individual nos imóveis. A leitura segue a cobrança de valor de kWh, bandeiras verde, amarela e vermelha 1 e 2." Isso bate exatamente com o que `tarifas_energia.bandeira` já modelava desde a primeira versão do schema (`'verde','amarela','vermelha_1','vermelha_2'`) — nenhuma mudança de schema foi necessária aqui.

O que **faltava** era o elo entre a leitura confirmada e a fatura de verdade — só existia a função pura de cálculo (`calcularFaturaEnergia.ts`), sem nada lendo `leituras_energia` do banco e gerando a fatura. Implementado agora: `server/integracao/faturarEnergia.ts` busca a leitura anterior confirmada do mesmo imóvel, resolve a tarifa vigente pela distribuidora (nova coluna `cidades.distribuidora_energia` — Curitiba/COPEL, Florianópolis/CELESC), e grava a fatura `tipo = 'energia'` com os itens discriminados. Testado com 6 cenários contra Postgres real: cálculo correto, franquia mínima respeitada, e três casos de dado insuficiente (sem leitura anterior, sem tarifa cadastrada, sem contrato vinculado) que **pulam a leitura em vez de faturar errado** — consistente com a regra já estabelecida de que leitura nunca é fonte de verdade sozinha.

## Sexto achado: responsável financeiro solidário não é fiador

O contrato tem 2 locatários (estudantes) e 2 "Responsáveis Financeiros Solidários" (pais/mães) — uma figura jurídica distinta de fiador (responsabilidade solidária do art. 275 do Código Civil, não fiança da Lei 8.245/91). O schema só tinha `locatario_principal`, `locatario_adicional` e `fiador` em `contrato_partes.papel`. **Adicionado `responsavel_solidario`.**

## O que o cliente apontou e ainda não está no contrato-modelo, mas é realidade real

Você mencionou duas coisas que não aparecem neste contrato específico mas que precisam entrar no sistema:

### Locações por temporada (Airbnb) são outra lógica — já estava certo
O próprio contrato reforça isso (cláusula 1.4, 12.7: veda expressamente sublocação via Airbnb/Booking e proíbe misturar custos de temporada no rateio dos locatários de longa duração). A separação `contratos.tipo IN ('locacao_padrao', 'temporada')` com motores de regra distintos (já decidida em `docs/01`) continua sendo a modelagem certa — este contrato só confirma isso.

### Energia solar como fonte de receita, com leitura mensal obrigatória
Isso não está em nenhum contrato analisado até aqui — é uma informação nova sua. Adicionei a **estrutura de dados** (`geracao_solar`: leitura mensal de energia gerada, por imóvel ou por residencial, com o mesmo padrão de confirmação humana das outras leituras), mas **não implementei a fórmula de cobrança**, porque não tenho como adivinhar corretamente:

- A energia solar gerada é vendida à distribuidora (créditos de compensação, sistema de "net metering" da ANEEL) e o crédito abate a conta de luz do prédio, **ou**
- É uma cobrança adicional direta aos locatários (um "aluguel de infraestrutura solar"), **ou**
- É uma mistura das duas (parte abate custo operacional, parte vira receita adicional repassada)?

Preciso que você descreva o mecanismo real (mesmo que informalmente) antes de eu implementar o cálculo — errar essa fórmula tem o mesmo risco que o erro de pró-rata que acabei de corrigir, só que sem um contrato real para eu conferir contra. **Ainda em aberto** — sua última mensagem esclareceu o mecanismo de energia por medidor individual (achado acima), mas não especificou o mecanismo de monetização da geração solar especificamente.

### Curitiba é diferente de Florianópolis — confirmado
Você confirmou: "os contratos de Curitiba são diferentes, com realidade diferente. Florianópolis são mais homogêneos." Isso reforça (não muda) uma decisão de design já tomada: `contrato_politica_cobranca` e a estrutura de rateio (`percentual_aluguel_efetivo`, `categorias_rateio_coletivo`) são **por contrato**, não uma regra fixa do sistema — exatamente para acomodar essa heterogeneidade sem exigir uma segunda modelagem separada para Curitiba. Minha leitura provável (a confirmar com um contrato real de Curitiba, quando disponível): unidades de Curitiba são apartamentos/salas individuais (não kitnets em residencial compartilhado como João Pottker), então provavelmente **não usam o modelo de "valor único mensal" com rateio de custeio coletivo** — seriam contratos de aluguel mais tradicionais, com `percentual_aluguel_efetivo` nulo (100% aluguel, sem parcela de rateio) e sem as 8 sub-rubricas de área comum, que só fazem sentido onde há infraestrutura compartilhada entre várias unidades. O schema já suporta essa diferença sem alteração (os campos de rateio são opcionais/nulos por contrato) — só falta um contrato real de Curitiba para confirmar isso da mesma forma que confirmei o de Florianópolis.

## O que fica deliberadamente fora desta rodada (documentado, não esquecido)

- **Multa rescisória proporcional** (cláusula 11.2: teto de 3 meses, proporcional aos meses restantes) e a **bonificação decrescente de dezembro** (cláusula 11.3, remetida ao Anexo I que não foi enviado) — não implementado; precisaria do Anexo I para os critérios exatos da bonificação.
- **Negativação (SPC/Serasa) e protesto extrajudicial aos 30 dias**, distintos da ação judicial aos 40 dias (cláusula 13.1) — o schema já tem `processos_judiciais` e `dossies_inadimplencia`, mas não uma tabela específica para rastrear negativação/protesto como eventos próprios antes da via judicial. Fica para quando o Módulo 14 (Jurídico) avançar.
- **Composição prévia obrigatória** (cláusula 12.8: 5 dias úteis de negociação antes de qualquer ação judicial) — não modelado como campo/prazo específico ainda.
- **Parcelamento excepcional da caução em até 2 parcelas** (cláusula 4.5) — a tabela `garantias` guarda o valor total; parcelamento ficaria em uma tabela filha não criada ainda, baixa prioridade frente ao resto.

## Verificação

Todo o contrato real (locadores, procurador-administrador, locatários, responsáveis solidários, imóvel, contrato com os valores exatos, política de cobrança, garantia) foi inserido de ponta a ponta num Postgres real sem erro. A trava de prazo de impugnação do DSS foi testada com um caso que deveria passar e um que deveria falhar, ambos confirmados. RLS das 8 tabelas novas testado (inquilino vê o DSS e a franquia hídrica do próprio residencial; investidor vê a geração solar do próprio imóvel; admin tem acesso total). 74 testes unitários + 17 de integração, build/lint/typecheck limpos.
