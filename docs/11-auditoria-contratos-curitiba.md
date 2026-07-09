# Auditoria a partir de Três Contratos Reais de Curitiba

Você enviou três contratos assinados de imóveis de Curitiba: **Life Space Estação 509B** (residencial, apto studio em condomínio, locatário Lucas, 2024), **Sala Comercial 923B** (Edifício Inspira Business, comercial, locatário pessoa jurídica, 2023) e **Apto 503 Central Station** (residencial, condomínio, locatário Bergson + responsável financeira Maisa, 2023). Você havia avisado antes de eu ver qualquer um deles: "os contratos de Curitiba são diferentes, com realidade diferente." Esta auditoria confirma isso com evidência concreta e ajusta o schema.

## Confirmação mais importante: Curitiba não usa o modelo de rateio de custeio coletivo de Florianópolis

Nenhum dos três contratos tem qualquer coisa parecida com o "valor único mensal" de 9 rubricas do contrato de João Pottker (`docs/10-auditoria-contrato-real.md`). Isso confirma a hipótese que eu havia registrado ali como "a confirmar": prédios de Curitiba têm condomínio formal e convenção própria — a lógica de rateio entre unidades já é resolvida pelo próprio condomínio, não precisa ser recriada pelo locador. `categorias_rateio_coletivo` e `demonstrativos_rateio` continuam existindo no schema exclusivamente para o padrão de Florianópolis (kitnets em residencial sem condomínio formal) — nenhuma mudança neles.

Em vez de rateio coletivo, os três contratos de Curitiba compartilham um padrão diferente, mas consistente entre si: **um aluguel-base mais alguns componentes extras somados no boleto**.

## Confirmação independente: pró-rata de 30 dias fixos

O contrato do Apto 503 diz por extenso: "**considerando-se sempre o conjunto de 30 dias, independente do quantitativo de dias do mês em curso**". Isso confirma, de forma totalmente independente do contrato de João Pottker, a correção que já fiz em `server/financeiro/prorata.ts`. Não era peculiaridade de um contrato — é como a operação inteira calcula pró-rata. Nenhuma mudança de código necessária, só reforço de que a correção estava certa.

## O que muda no schema

### 1. Componentes mensais além do aluguel-base (`contrato_componentes_mensais`, nova tabela)

Os três contratos, cada um com uma combinação diferente:

| Componente | Life Space 509B | Sala Comercial 923B | Apto 503 |
|---|---|---|---|
| Comodato de bens móveis | 15% do aluguel, embutido | — (não tem) | R$350,00 fixo, à parte |
| Vaga de garagem | R$200,00 fixo | 10% do valor total do contrato | — (não tem) |
| IPTU | Repassado, parcelado 1/12 | Repassado, parcelado 1/12 | Repassado, variável |
| Condomínio | Repassado ao valor de face | Repassado ao valor de face | Repassado ao valor de face |
| Taxa de lixo / bombeiros | — | — | Repassados |

**Achado relevante por si só**: IPTU é repassado ao locatário nos **três** contratos de Curitiba — o oposto exato do contrato de Florianópolis, onde IPTU é despesa exclusiva do locador e dedutível do IRPF (`docs/10`, Cláusula Oitava). Isso não é uma suposição minha — é uma diferença real e consistente de operação entre as duas cidades, confirmada por 3 contratos independentes contra 1.

Modelagem: `contrato_componentes_mensais` é deliberadamente **separada** de `categorias_rateio_coletivo` — são conceitos diferentes, não uma generalização forçada de um no outro. O rateio de Florianópolis é uma decomposição fiscal granular do valor único (9 partes, com natureza tributável/não-tributável, para fins de IRPF). Os componentes de Curitiba são simplesmente itens somados a um aluguel que continua sendo só aluguel. Tratar os dois com a mesma tabela obrigaria um a se parecer com o outro, escondendo justamente a diferença que você apontou.

### 2. Índice de correção monetária por contrato (`contrato_politica_cobranca.indice_correcao_monetaria`)

Quarto contrato real, terceiro índice diferente: João Pottker usa IPCA, Sala Comercial 923B usa **IGPM** ("correção monetária calculada pelo IGPM da FGV"), os outros dois usam "correção monetária" sem nomear o índice. Campo adicionado para registrar qual índice cada contrato usa — sem isso, o sistema não saberia qual API do Bacen consultar para resolver a taxa acumulada (mesmo padrão de resolução externa já usado em `rendimentoCaucao.ts`).

### 3. Desconto de pontualidade (`contrato_politica_cobranca.desconto_pontualidade_valor`) — campo adicionado, cálculo ainda não

A Sala Comercial 923B tem uma mecânica que não existia em nenhum contrato anterior: valor "cheio" de R$1.360,00, com desconto de R$70,00 para pagamento em dia nos primeiros 12 meses — perdido (não somado a uma multa adicional) se o pagamento atrasar. Adicionei o campo para não perder o dado, mas **não alterei `server/financeiro/jurosMulta.ts`** para aplicar essa lógica — apareceu em só 1 dos 4 contratos analisados até aqui, e mudar o motor de cálculo por um único exemplo é o mesmo risco de generalizar cedo demais que já causou o erro do pró-rata. Fica documentado como pendência explícita, para implementar quando (se) aparecer em mais contratos ou quando você confirmar que é um padrão recorrente.

### 4. Finalidade da garantia (`garantias.finalidade`)

O Apto 503 tem **duas garantias somadas num único depósito**: 2 "aluguéis" para o contrato de locação + 1 "aluguel" para o contrato de comodato = 3 no total, R$4.950,00. Sem um campo indicando a qual sub-relação cada valor se refere, uma dedução parcial na saída (por exemplo, só o comodato sendo usado para cobrir dano em móvel) ficaria sem rastro claro de qual parte da garantia foi de fato consumida.

**Nuance descoberta ao testar com os números reais**: "1 aluguel" nas cláusulas de caução deste contrato não significa `contratos.valor_aluguel` sozinho (R$1.300,00) — significa o valor **mensal total empacotado** (aluguel + comodato = R$1.650,00). Confirmei isso batendo a conta: 2×1.650 + 1×1.650 = R$4.950,00, exatamente o valor do contrato. Isso é uma armadilha real para quem for gerar documentos ou calcular garantia default a partir de "X aluguéis" — a aplicação precisa decidir explicitamente se está somando `valor_aluguel` sozinho ou `valor_aluguel + componentes fixos`, contrato a contrato. Não é um problema de schema (os dois valores existem, separados, corretamente) — é um cuidado de implementação a manter na hora de gerar esse cálculo automaticamente.

## O que não mudou (e por quê)

- **`contratos.tipo`** continua só `locacao_padrao`/`temporada` — não adicionei uma distinção residencial/comercial. A Sala Comercial 923B já é identificável como comercial pelo `imoveis.tipo = 'sala_comercial'` do imóvel vinculado; duplicar essa informação em `contratos` criaria uma segunda fonte de verdade sem necessidade.
- **`reajustes_contrato`** não mudou — já é uma tabela de eventos com `indice` em texto livre, então reajustes em degraus (Sala Comercial: sem reajuste nos anos 1-2, +5% fixo no ano 3, IPCA a partir do ano 4) já cabem sem alteração, um evento por vez.
- **Regime de pagamento adiantado vs. "mês vencido"**: os contratos usam os dois termos de forma inconsistente até dentro do mesmo documento (o Apto 503 diz "sistema adiantado" numa cláusula e "sistema de mês vencido" duas frases depois, para a mesma cobrança) — isso parece um problema de redação do contrato-modelo, não uma regra de negócio real e coerente para eu codificar. O que importa na prática (dia de vencimento fixo, primeiro pagamento + caução cobrados antes da entrega das chaves) já é coberto pelo schema existente (`contratos.dia_vencimento`, `garantias`, `server/financeiro/prorata.ts`) sem precisar de um campo novo "regime_pagamento" que eu não teria confiança de definir corretamente a partir de um texto contraditório.

## Verificação

Populei o contrato do Apto 503 por completo (pessoas, imóvel, contrato, política de cobrança, as duas garantias com finalidade distinta, os cinco componentes mensais) num Postgres real, incluindo a reprodução exata do valor total de garantia (R$4.950,00). Testei a constraint de coerência de `contrato_componentes_mensais` (componente percentual sem percentual definido é rejeitado) e RLS (inquilino vê os próprios componentes mensais, não os de outro contrato). Reexecutei os testes de regressão já existentes (CPC 25, anti-overbooking, soma de percentual societário) sem alteração de resultado. 97 testes automatizados (74 unitários + 23 de integração), build/lint/typecheck limpos.
