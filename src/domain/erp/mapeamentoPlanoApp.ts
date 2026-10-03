/** Tradução do plano de contas do app (`plano_de_contas`) para o do razão (`contas_plano_contas`).
 *
 * Os dois planos coexistem e têm propósitos diferentes:
 *   - PLANO_DE_CONTAS (src/domain/planoDeContas.ts) classifica FLUXO DE CAIXA:
 *     1 = receita, 2 = despesa, 9 = transferência. Não tem conta patrimonial nenhuma.
 *   - PLANO_DE_CONTAS_ERP (planoDeContasErp.ts) é um plano contábil de verdade:
 *     1 = ativo, 2 = PL, 3 = passivo, 4 = receita, 5 e 6 = despesa.
 *
 * O MESMO CÓDIGO significa coisas diferentes nos dois. "1.1.01" é "Aluguéis — contratos
 * residenciais" (receita) no plano do app e "Caixa" (ativo) no do razão; "2.1.01" é
 * "Condomínio e IPTU" (despesa) num e "Capital social" (PL) no outro. A migração antiga
 * casava os dois POR STRING de código (`ON c.codigo = p.codigo`), o que produzia um razão
 * onde receita de aluguel virava caixa e despesa de condomínio virava capital social —
 * e, quando nem isso casava, caía num fallback `codigo LIKE '1.%'` que pegava
 * literalmente a primeira conta da faixa. Por isso a tradução é explícita, conta a conta,
 * e é auditável linha a linha aqui.
 *
 * Três traduções não são óbvias e valem justificativa:
 *   - 2.1.03 "Obra / capex" → 1.2.05 Imóveis (ativo imobilizado). Capex não é despesa do
 *     período: capitaliza no imóvel e sai depois como depreciação. Tratar como despesa
 *     subestimaria o patrimônio e inflaria o resultado do mês da obra.
 *   - 2.1.06 "Financiamento — amortização" → 3.2.01 Empréstimos de longo prazo. Amortizar
 *     não é gasto, é reduzir passivo. Só a parcela de JUROS (2.1.05) é despesa.
 *   - 9.0.02 "Depósito caução" → 3.3.01 Depósitos caução recebidos. Caução é dinheiro de
 *     terceiro em poder do locador: passivo, nunca receita. Na devolução o mesmo
 *     mapeamento debita o passivo e zera a obrigação.
 */

/** Conta de caixa/banco do razão. Toda transação bancária tem uma perna aqui — é o mesmo
 * id que os demais módulos do ERP já usam como caixa (pagamentos-ledger-integration.ts,
 * imovel-gestao-ledger-integration.ts), para o saldo de caixa não ficar repartido entre
 * duas contas conforme o módulo que lançou. */
export const CONTA_CAIXA_ERP = 1101;

/** Conta transitória para transação sem classificação — ver planoDeContasErp.ts. */
export const CONTA_CLASSIFICACAO_PENDENTE = 1999;

/** "Lucros acumulados" (2.1.02), grupo patrimônio_líquido — planoDeContasErp.ts. Destino
 * do lançamento de encerramento (ledger.ts::encerrarPeriodo): é para cá que o resultado
 * do período (receita líquida − despesa líquida) é transferido quando um período fecha,
 * a "closing entry" clássica de contabilidade que faz o PL do Balanço se mover com o
 * resultado da DRE. */
export const CONTA_LUCROS_ACUMULADOS_ERP = 2102;

/** código do plano do app → id da conta de contrapartida no plano do razão. */
export const MAPA_APP_PARA_ERP: Readonly<Record<string, number>> = {
  // Receitas (app grupo "receita") → faixa 4 do razão
  "1.1.01": 4101, // Aluguéis residenciais            → Receita de aluguel
  "1.1.02": 4103, // Reembolso de consumo sem margem  → Rateios e reembolsos
  "1.2.01": 4104, // Airbnb / temporada               → Airbnb e temporada
  "1.3.01": 4201, // Multas e juros de atraso         → Juros recebidos
  "1.4.01": 4301, // Créditos jurídicos               → Outras receitas
  "1.9.01": 4401, // Salário — servidor federal       → Salário e rendimentos pessoais

  // Despesas (app grupo "despesa") → faixas 5 e 6 do razão, exceto as duas patrimoniais
  "2.1.01": 5210, // Condomínio e IPTU                → Condomínio
  "2.1.02": 5205, // Manutenção corrente              → Manutenção
  "2.1.03": 1205, // Obra / capex                     → Imóveis (CAPITALIZA, não é despesa)
  "2.1.04": 6201, // Prestadores de serviço           → Despesas operacionais
  "2.1.05": 5501, // Financiamento — juros            → Financiamento imobiliário — juros
  "2.1.06": 3201, // Financiamento — amortização      → Empréstimos LP (REDUZ PASSIVO)
  "2.1.07": 6201, // Taxas de plataforma              → Despesas operacionais
  "2.1.08": 5502, // Inadimplência / perdas           → Inadimplência e perdas com locatário
  "2.1.09": 6201, // Tarifas bancárias                → Despesas operacionais
  "2.1.10": 6201, // Despesas administrativas         → Despesas operacionais
  "2.1.11": 6301, // Advocacia                        → Honorários advocatícios
  "2.2.01": 6501, // Despesas pessoais                → Despesas pessoais (fora da atividade)

  // Transferências (app grupo "transferencia") — não podem tocar o resultado
  "9.0.01": 1109, // Transferência entre contas próprias → Transferências em trânsito
  "9.0.02": 3301, // Depósito caução                     → Depósitos caução recebidos
};

/** Conta de contrapartida para um código do plano do app. Retorna a conta transitória de
 * classificação pendente quando o código é vazio, desconhecido ou não mapeado — nunca
 * chuta uma conta "parecida", que era o que o fallback `codigo LIKE '1.%'` fazia. */
export function contaContrapartida(codigo_app: string | null | undefined): {
  conta_id: number;
  classificada: boolean;
} {
  if (!codigo_app) return { conta_id: CONTA_CLASSIFICACAO_PENDENTE, classificada: false };
  const conta_id = MAPA_APP_PARA_ERP[codigo_app];
  if (!conta_id) return { conta_id: CONTA_CLASSIFICACAO_PENDENTE, classificada: false };
  return { conta_id, classificada: true };
}
