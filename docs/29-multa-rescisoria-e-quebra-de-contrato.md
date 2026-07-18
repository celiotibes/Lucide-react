# Multa Rescisória e Solicitação de Quebra de Contrato

Item do pedido original do portal do inquilino que continuava "parcial" desde a primeira auditoria: "pedido de quebra de contrato com cálculo automático de multa rescisória para análise da gestão". A fórmula de Florianópolis já estava 100% evidenciada desde `docs/10` (cláusula 11.2 + bonificação de dezembro do Anexo I) — só faltava escrever o código. Curitiba continua sem fórmula própria (3 contratos reais, 3 fórmulas diferentes — `docs/11`).

## `server/financeiro/multaRescisoria.ts` (função pura)

Duas peças de evidência combinadas:

- **Multa proporcional (cláusula 11.2)**: teto de 3 meses do valor mensal vigente, reduzido na proporção dos meses restantes do prazo contratual — mesmo padrão da Lei 8.245/91, art. 4º, parágrafo único. Contagem de meses usa a mesma base de 30 dias fixos já confirmada por 4 contratos reais em `prorata.ts`, não dias corridos de calendário.
- **Bonificação decrescente de dezembro (Anexo I, item 6)**: desconto de 85% se notificação por e-mail até 22/11 e entrega das chaves até 22/12; 80% se notificação até 27/11 e entrega até 28/12; sem bonificação fora dessas janelas ou fora do mês de dezembro.

11 testes unitários cobrindo: saída no início vs. no fim do contrato, as duas faixas de bonificação, a transição entre elas (notificação dentro do prazo mas entrega fora do prazo de 22/12 ainda cabendo em 80%), ausência de bonificação fora de dezembro, e validação de entrada.

## `server/integracao/solicitarQuebraContrato.ts`

Abre um chamado (natureza `contratual`, categoria `quebra_contrato`) e calcula a multa quando a cidade do contrato tem fórmula codificada (hoje, só Florianópolis) — Curitiba abre o chamado do mesmo jeito, mas com `multa_calculada = null` e a descrição avisando explicitamente que não há cálculo automático, em vez de estimar um número sem base. Em nenhum dos dois casos a solicitação é decidida sozinha: `solicitacoes_quebra_contrato.status` sempre nasce `'em_analise'` — o cálculo é insumo para a gestão, não aprovação automática. Uma constraint do banco (`chk_quebra_parecer_quando_decidido`) impede gravar `'aprovada'`/`'rejeitada'` sem um `parecer_gestao` preenchido.

## `app/quebras-contrato`

Tela de revisão para a gestão: lista solicitações pendentes com o valor calculado (ou "sem cálculo automático" quando não há fórmula), botões Aprovar/Rejeitar exigindo parecer no próprio formulário — mesmo padrão de `app/conciliacao-bancaria` (Server Action com `revalidatePath`, sem sessão de usuário autenticado ainda, `analisado_por` fica em branco).

## Verificação

Schema aplicado do zero sem erro. 15 testes novos (11 unitários da fórmula + 4 de integração do fluxo completo, incluindo Florianópolis calculando e Curitiba não). Fluxo de aprovação verificado com navegador real: solicitação semeada via `solicitarQuebraContrato`, aparece na tela com o valor certo (R$ 587,96, faixa de 85%), aprovada pelo formulário com parecer obrigatório, some da lista de pendentes numa nova carga de página, e o Postgres confirma `status = 'aprovada'` com o parecer gravado. 276 testes totais, 3 execuções consecutivas limpas contra banco recriado, build/lint/typecheck limpos.
