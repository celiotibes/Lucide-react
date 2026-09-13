# Relatórios Exportáveis (CSV/OFX, foco em sistemas contábeis)

Pedido do cliente: relatórios do sistema em geral, exportáveis em vários formatos, especialmente pensados para importação em sistemas contábeis. Três relatórios cobrem os dois regimes contábeis que o schema já distingue (comentário da tabela `faturas`: competência vs. caixa):

| Relatório | Formato | Regime | Fonte |
|---|---|---|---|
| Faturas | CSV | Competência — o que foi faturado, pago ou não | `faturas` |
| Despesas de prestadores | CSV | Competência — custo incorrido (folha + custo de OS) | `lancamentos_prestador` + `ordem_servico_custos` |
| Extrato de cobranças pagas | OFX | Caixa — dinheiro que efetivamente entrou | `cobrancas_asaas` |

## Por que CSV *e* OFX, não só um formato

CSV é o mínimo denominador comum — qualquer sistema contábil brasileiro (Domínio, Alterdata, SAGE, ContaAzul, ou uma planilha manual do próprio contador) consegue importar CSV com mapeamento de colunas. Mas para **conciliação bancária** especificamente, o formato que esses mesmos sistemas esperam de verdade é OFX (Open Financial Exchange) — é o que qualquer extrato de banco/gateway de pagamento exporta, e importar OFX evita ter que mapear colunas manualmente toda vez. Por isso o extrato de cobranças pagas (o relatório mais próximo de um "extrato bancário" real, porque é regime de caixa) sai em OFX, e os outros dois (que são listas de lançamentos, não movimentação de conta) saem em CSV.

## `server/relatorios/csv.ts` e `server/relatorios/ofx.ts` (novos, funções puras)

`gerarCSV` é genérico — qualquer relatório futuro reaproveita, só muda a lista de colunas. Formato PT-BR por padrão: delimitador `;`, decimal `,` (evita o problema clássico de Excel interpretando "1.234,56" como três campos separados por vírgula quando o delimitador também é vírgula), com `adicionarBOM` para o Excel não confundir acentuação UTF-8 com Latin-1. Escapa campo com aspas quando contém o delimitador, aspas ou quebra de linha (RFC 4180).

`gerarOFX` monta um extrato OFX 1.0 SGML válido (cabeçalho `OFXHEADER:100`/`VERSION:102`, `BANKTRANLIST` com um `STMTTRN` por transação, `TRNTYPE` CREDIT/DEBIT conforme o sinal do valor). Escapa `&`/`<`/`>` no memo (SGML não tolera isso solto) e normaliza quebras de linha.

14 testes unitários entre os dois, incluindo escaping RFC 4180, formatação PT-BR vs. internacional, e a estrutura OFX completa.

## `server/integracao/relatorios.ts` (novo)

Liga os dois serializadores ao banco. Um cuidado deliberado no relatório de despesas: `lancamentos_prestador` tem `valor_base`, `adicional_pct` (0.25 combustível veículo próprio, 0.20 noturno/feriado — comentário original do schema) e `km`, mas **nenhum contrato ou especificação confirma a fórmula exata de como esses três campos viram o valor final pago ao prestador**. Em vez de inventar `valor_base * (1 + adicional_pct)` só para ter uma coluna "Valor" única e bonita, o relatório exporta os campos crus separados — quem importa (ou audita) decide a soma, com a mesma cautela já aplicada ao longo de todo o projeto de não inventar cálculo sem evidência (mesma classe de erro que o pró-rata original, `docs/10`, mas pega antes desta vez).

`ordem_servico_custos` não tinha nenhuma coluna de data — adicionado `criado_em` (schema, seção 22.5), porque sem isso o relatório teria que usar a data da OS (criado_em/checkout_at), que não é a mesma coisa: uma nota fiscal de material pode ser lançada dias depois da execução do serviço.

## Rotas e página de download

`app/api/relatorios/{faturas,despesas,cobrancas}/route.ts` — cada uma aceita `?inicio=YYYY-MM-DD&fim=YYYY-MM-DD` (sem os dois, usa o mês corrente) e devolve o arquivo pronto para download (`Content-Disposition: attachment`). `app/relatorios/page.tsx` lista os três com link direto — mesmo nível de acesso das outras páginas do back-office hoje (nenhuma delas tem login ainda, ver `docs/14` para o porquê disso ser uma pendência conhecida, não esquecida).

## Verificação

5 testes de integração contra Postgres real (`relatorios.integration.test.ts`), incluindo o filtro de período, a junção de duas fontes no relatório de despesas, e o filtro de `status = 'pago'` no extrato OFX (cobrança pendente não aparece). Testado também de ponta a ponta via HTTP contra um `next start` real: download de CSV com BOM correto, OFX bem formado, e a rota de cron (`docs/13`) gerando fatura de verdade via `curl` autenticado.
