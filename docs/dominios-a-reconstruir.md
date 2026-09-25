# Domínios a reconstruir (ex-Balde B)

Este documento resume o que foi apagado em `src/domain/erp` porque nunca funcionou contra o
schema real (tabelas fictícias ou escrita via `core.ts` depreciado), mas cujo **modelo de dados**
vale preservar como referência para reconstrução futura. Fonte completa: `remocao-orfaos.md`
(seção "Balde B"), na raiz do repo no momento da remoção — se já tiver sido apagado, este
documento é o resumo que ficou.

Critério geral: nenhum destes módulos tinha teste rodando contra o schema real
(`fixtureDb.ts`/sql.js). Os testes que existiam usavam `test-setup.ts`, que cria tabelas
inventadas — "verde" não provava nada. Reconstrução = desenhar a tabela real primeiro, escrever
teste contra `criarBancoDeTeste()`, só then portar a lógica.

## 1. Advocacia (despesa jurídica + processo)

Módulos apagados: `advocacia.ts`, `advocacia-ledger-integration.ts`, `relatorios-advocacia.ts`,
`migracao-advocacia-pagamentos-ledger.ts`.

**Por que vale a pena**: é o domínio central de perícia contábil/jurídica que o produto quer
cobrir — despesa legal vinculada a processo, com rateio ao razão contábil.

**Tabelas que precisariam existir no schema real**: `processos_legais` (número, parte, vara,
status, valor da causa), `partes_processo` (papel — autor/réu/terceiro), `despesas_legais`
(processo_id, categoria, valor, data, rateio para ledger).

**Reaproveitar**: o recorte conceitual (processo → despesa → lançamento), não o código — a
escrita ia toda para tabelas que não existem.

## 2. Contas Pessoais (segregação PF x sociedade de fato)

Módulos apagados: `contas-pessoais.ts`, `contas-pessoais-ledger-integration.ts`,
`relatorios-contas-pessoais.ts`.

**Por que vale a pena**: é literalmente o tema de "segregação patrimonial PF vs. sociedade de
fato" que perícia contábil cobra — hoje o app não distingue conta pessoal de conta da entidade.

**Tabelas que precisariam existir**: `pessoas` (cadastro), `contas_pessoais` (pessoa_id, tipo),
`movimentos_pessoais` (conta_id, data, valor, contrapartida — inclusive transferências
entidade↔pessoa, que é o ponto sensível de segregação).

**Reaproveitar**: o recorte de relatório (movimentos, depósitos/saques, transferências,
aportes x resgates, saldo por pessoa) — a estrutura de relatório em si é razoável, só a fonte
de dados era fictícia.

## 3. Imóvel — gestão operacional

Módulos apagados: `imovel-gestao.ts`, `imovel-gestao-ledger-integration.ts`,
`relatorios-imovel.ts`. (`dashboard-portfolio.ts` **não** foi apagado — é balde D, investigação.)

**Por que vale a pena**: parcialmente real — `contratos_locacao`, `imoveis`, `vistorias` já
existem no schema. O gap é justamente gestão operacional: o app hoje só concilia financeiro do
imóvel, não tem cadastro de inquilino nem agenda de manutenção.

**Tabelas que faltam**: `inquilinos` (imóvel_id, dados, contrato vigente), `manutencoes`
(imóvel_id, tipo, data agendada, custo, status), `imovel_documentos`,
`despesas_operacionais_agendadas`.

**Reaproveitar**: o modelo de cadastro de inquilino e a agenda de manutenção — é a peça que falta
para o produto ir além de conciliação financeira pura no módulo de imóveis.

## 4. Open Banking / Gateway de pagamento

Módulos apagados: `integracao-open-banking.ts`, `integracao-gateway-pagamento.ts`,
`pagamentos-integracao.ts`, `pagamentos-ledger-integration.ts`.

**Por que vale a pena, com ressalva**: modela conciliação de pagamento eletrônico (PIX/TED/DOC,
chargeback, reembolso) — hoje o app só importa extrato via OFX/Pluggy, não inicia pagamento.
**Só vale reconstruir se o produto for de fato iniciar pagamentos**, não apenas reconciliar
extrato — decisão de produto, não técnica.

**Tabelas que precisariam existir**: `pagamentos_pix`/`pagamentos_ted`/`pagamentos_doc`,
`confirmacoes_pagamento`, `pagamentos_gateway`, `chargebacks`, `reembolsos`.

**Reaproveitar**: o modelo de status de pagamento (solicitado → confirmado → conciliado) e o
cálculo de tarifas por meio de pagamento.

## 5. Cascata `core.ts` reescrita — o cluster mais barato de reconstruir

Módulos apagados: `integracao-contratos.ts`, `integracao-patrimonio.ts`,
`integracao-rateios.ts`, `integracao-contratos-imovel.ts`, `integracao-patrimonio-imovel.ts`.

**Por que é o mais barato do balde todo**: estes módulos **leem tabela real** (contratos,
patrimônio, rateios já existem no schema) — só a **escrita** ia para `core.ts`, que está
depreciado no próprio código-fonte. Ou seja, metade do trabalho de reconstrução (a leitura
contra o schema real) já estava correta.

**O que fazer ao reconstruir**: pegar a lógica de leitura como está e trocar toda chamada de
escrita para `ledger.ts:registrarLancamentoContabil()` (o caminho real e ativo hoje, usado por
`integracao-inadimplencia.ts` e `integracao-vistorias.ts`, que continuam vivos no balde C). Não
é preciso redesenhar tabela nenhuma — é troca de função de escrita.

## 6. LGPD e criptografia

Módulos apagados: `compliance-lgpd.ts`, `encriptacao.ts`.

**Por que vale a pena**: sem tabela, sem teste contra nada real — mas LGPD é obrigação legal de
verdade para um sistema com dados financeiros pessoais (nomes, CPF, endereço).

**Reaproveitar como referência de requisito, não como código**: os tipos de direito do titular
(acesso, portabilidade, exclusão, correção) e o modelo de rotação de chave de encriptação — útil
como checklist de requisito quando o produto decidir tratar isso a sério, não como implementação
pronta.

## 7. Payment processor (idempotência de pagamento)

Módulo apagado: `payment-processor.ts`.

**Por que vale a pena**: sem tabela, lógica de retry/idempotência de pagamento isolada — hoje é
código solto sem nada que o chame.

**Reaproveitar**: se o produto vier a pagar prestadores via PIX (ligado ao cluster de Open
Banking acima), a lógica de idempotência (evitar pagamento duplicado em retry) é reaproveitável
como referência de desenho, não para colar direto.

## 8. `relatorios-apontamento.ts` (client)

**Por que vale a pena**: 7 de 9 tabelas eram fictícias (`apontamentos_airbnb`,
`apontamentos_combustivel`, `apontamentos_horas`, `apontamentos_urgencia`,
`emprestimos_parcelas`, `memorias_reajuste`, `reembolsos`), mas o domínio já tem tela viva
(`PainelConferencia`) e dado real (`apontamentos_diarios` no schema do servidor).

**Reaproveitar**: o layout e a composição do relatório (resumo de apontamentos, despesas de
remuneração, comparativo de provedor, reembolsos) — refeito contra as tabelas reais que já
existem, não as fictícias.

## Como usar este documento

Ao decidir reconstruir qualquer um destes domínios: (1) desenhar a tabela real no schema — ver
seção "Tabelas: o que existe de verdade" do `remocao-orfaos.md` original para o que já existe e
evitar duplicar; (2) escrever teste contra `src/test/fixtureDb.ts` (`criarBancoDeTeste()`) antes
de portar lógica; (3) para os clusters 4, 5 e 6, a escrita deve ir sempre por
`ledger.ts:registrarLancamentoContabil()`, nunca reintroduzir `core.ts`.

Ordem sugerida por custo/benefício: cluster 5 (cascata `core.ts`) primeiro — é só trocar a
escrita, a leitura já está certa; depois cluster 3 (imóvel operacional) e cluster 8
(apontamento), que têm tela viva esperando dado real; clusters 1, 2, 4, 6 e 7 dependem de
decisão de produto (o dono quer cobrir advocacia? PF separado? iniciar pagamento? LGPD como
prioridade?) antes de desenhar tabela.
