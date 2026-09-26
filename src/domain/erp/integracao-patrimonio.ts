/**
 * Integração: Ciclo de Patrimônio (aquisição financiada e depreciação de imóvel)
 *
 * Reconstrução do módulo apagado em "Remove 23 módulos órfãos do balde B" (ver
 * docs/dominios-a-reconstruir.md, seção 5) — a LEITURA (imóveis, financiamentos) já era
 * contra tabelas reais; a ESCRITA ia para `core.ts`/`registrarTransacaoIntegrada`
 * (depreciado, tabela `transacoes_integradas` fictícia) e usava ids de conta que nunca
 * existiram em `contas_plano_contas` (10, 11, 12, 13, 14, 15, 16, 17). Trocada aqui por
 * `ledger.ts:registrarLancamentoContabil()`, com as contas reais de planoDeContasErp.ts.
 *
 * ACHADO DE DUPLICAÇÃO (investigação obrigatória desta tarefa — a razão do desenho abaixo
 * ser mais ENXUTO que o módulo original):
 *
 * `migracao-ledger.ts` já lança TODA transação bancária (`transacoes`) no razão, com a
 * contrapartida traduzida por `mapeamentoPlanoApp.ts::contaContrapartida()`. Essa tradução
 * já cobre dois dos quatro eventos que o módulo original tentava lançar "na mão":
 *
 *   - "2.1.03" (Obra/capex) → 1205 (Imóveis, CAPITALIZA). Ou seja: a PARTE DA AQUISIÇÃO
 *     PAGA COM RECURSOS PRÓPRIOS, quando entra como transação bancária de saída
 *     classificada com esse código, já vira Débito Imóveis / Crédito Caixa pela migração —
 *     nenhuma ação deste módulo. O `contabilizarAquisicaoImovel` original lançava de novo
 *     um Débito Imóveis (mais Crédito Patrimônio Líquido ou Financiamento) para a MESMA
 *     aquisição — se a parte própria também tivesse sido paga por uma transação bancária
 *     (o caminho normal), o ativo Imóveis seria debitado DUAS VEZES para o mesmo evento.
 *   - "2.1.05"/"2.1.06" (Financiamento — juros/amortização) → 5501/3201. Ou seja: CADA
 *     PARCELA de financiamento paga via transação bancária já é lançada pela migração
 *     (Débito Juros/Amortização, Crédito Caixa). O `contabilizarParcelasFinanciamento`
 *     original duplicaria exatamente esse lançamento — por isso NÃO foi reconstruído (ver
 *     nota no fim do arquivo).
 *
 * Sobra como lançamento puramente contábil, sem contrapartida nenhuma em `transacoes` (e
 * por isso o desenho conservador pedido pela tarefa — "só lançar o que a transação não
 * cobre" — se aplica em cheio):
 *
 *   1. `contabilizarAquisicaoImovelFinanciada`: a PARTE FINANCIADA da aquisição. O valor
 *      contratado do financiamento nunca passa pela conta bancária rastreada da entidade
 *      (o banco libera direto ao vendedor/incorporadora) — não existe transação para a
 *      migração pegar. É preciso reconhecer o ativo (Débito Imóveis) contra o passivo
 *      (Crédito Empréstimos de Longo Prazo) manualmente, uma única vez.
 *   2. `contabilizarDepreciacaoImovel`: depreciação nunca move caixa — não há, nem nunca
 *      haverá, uma transação bancária correspondente. Puramente contábil por natureza.
 *
 * O que NÃO foi reconstruído, e por quê (ver nota completa no fim do arquivo):
 *   - `contabilizarRecebimentoAluguel`/`contabilizarDevolucaoCaucao` (do extinto
 *     integracao-contratos.ts) e `contabilizarParcelasFinanciamento` (deste arquivo, na
 *     versão original): duplicariam migracao-ledger.ts.
 *   - `contabilizarReavaliacaoImovel`: sem conta de "ganho/perda não realizado" no plano
 *     real (planoDeContasErp.ts) — decisão de política contábil (valor justo vs. custo
 *     histórico) fora do escopo desta tarefa, mesmo padrão de outros achados NÃO corrigidos
 *     deste ERP (ex.: `provisarJurosInadimplencia`, integracao-inadimplencia.ts).
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import { registrarLancamentoContabil } from "./ledger";

/** Contas reais de planoDeContasErp.ts — nunca os ids fictícios (10-17) do módulo original. */
const CONTA_IMOVEIS_ERP = 1205; // Imóveis (ativo imobilizado)
const CONTA_EMPRESTIMOS_LP_ERP = 3201; // Empréstimos de longo prazo
const CONTA_DEPRECIACAO_ERP = 5301; // Depreciação (despesa)

/** Taxa de depreciação linear padrão (5% ao ano ≈ 0,4167% ao mês) — mesma taxa do módulo
 * original, mantida como default parametrizável (o módulo original não permitia parametrizar
 * por tipo de imóvel; manter o comportamento observável é o que a tarefa pede, só trocando a
 * escrita). */
const TAXA_DEPRECIACAO_ANUAL_PADRAO = 0.05;

export interface ResultadoLancamentoPatrimonio {
  sucesso: boolean;
  mensagem: string;
}

/**
 * Contabiliza a AQUISIÇÃO FINANCIADA de um imóvel: Débito em Imóveis (ativo imobilizado),
 * Crédito em Empréstimos de Longo Prazo — apenas a parte coberta por financiamento (ver
 * ACHADO DE DUPLICAÇÃO no topo do arquivo para a parte própria, que não é lançada aqui).
 *
 * Idempotente: usa `origem_modulo: 'financiamento'` + `origem_id: financiamento.id` na
 * perna de crédito, que colide em `idx_ledger_origem_unica` (schema.sql) numa segunda
 * chamada para o mesmo financiamento — a mesma proteção que qualquer outro lançamento único
 * por entidade usa neste ERP (ex.: a perna de Caixa de `baixarCompetencia`, aluguel-
 * competencias.ts, é igualmente protegida pela unicidade de `transacao_id`). Verificado
 * explicitamente antes do INSERT (em vez de deixar a violação de índice subir como exceção
 * genérica) para devolver `false` de forma previsível.
 */
export function contabilizarAquisicaoImovelFinanciada(
  db: Database,
  imovel_id: number,
  entidade_id: number,
  periodo_id: number,
): boolean {
  const [imovel] = consultar<{ apelido: string }>(
    db,
    "SELECT apelido FROM imoveis WHERE id = ?",
    [imovel_id],
  );
  if (!imovel) return false;

  const [financiamento] = consultar<{ id: number; valor_contratado: number }>(
    db,
    "SELECT id, valor_contratado FROM financiamentos WHERE imovel_id = ? ORDER BY id ASC LIMIT 1",
    [imovel_id],
  );
  if (!financiamento || !(financiamento.valor_contratado > 0)) return false;

  const [jaLancado] = consultar<{ id: number }>(
    db,
    `SELECT id FROM ledger_entries
     WHERE origem_modulo = 'financiamento' AND origem_id = ? AND conta_id = ?
       AND estornado_por_id IS NULL`,
    [financiamento.id, CONTA_EMPRESTIMOS_LP_ERP],
  );
  if (jaLancado) return false; // já contabilizado — chamada repetida não duplica

  const data_lancamento = new Date().toISOString().slice(0, 10);
  const referencia = `IMOVEL-${imovel_id}-FINANC-${financiamento.id}`;

  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTA_IMOVEIS_ERP,
    data_lancamento,
    valor_debito: financiamento.valor_contratado,
    descricao: `Aquisição financiada — ${imovel.apelido}`,
    origem_modulo: "patrimonio",
    origem_id: imovel_id,
    referencia_documento: referencia,
  });

  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTA_EMPRESTIMOS_LP_ERP,
    data_lancamento,
    valor_credito: financiamento.valor_contratado,
    descricao: `Financiamento contratado — ${imovel.apelido}`,
    origem_modulo: "financiamento",
    origem_id: financiamento.id,
    referencia_documento: referencia,
  });

  return true;
}

/**
 * Depreciação mensal de um imóvel (método linear direto: reduz Imóveis diretamente, sem
 * conta de "Depreciação Acumulada" separada — o plano real, planoDeContasErp.ts, não tem
 * essa conta contra-ativo; criá-la é uma decisão de plano de contas fora do escopo de uma
 * tarefa que só troca a função de escrita, mesma limitação documentada em
 * integracao-inadimplencia.ts para "Receita de Multa Contratual").
 *
 * IDEMPOTÊNCIA E POR QUE `origem_modulo: 'manual'`: depreciação é lançada uma vez por
 * (imóvel, período) — mas `idx_ledger_origem_unica` (schema.sql) é único por
 * (origem_modulo, origem_id, conta_id) SEM `periodo_id` na chave. Usar
 * `origem_modulo: 'patrimonio'` (o rótulo semanticamente certo) faria a SEGUNDA chamada
 * desta função para o MESMO imóvel — no mês seguinte — colidir no índice, porque
 * (patrimonio, imovel_id, 1205) já estaria em uso pelo mês anterior. Esta é a MESMA
 * limitação estrutural já documentada (e aceita) em `automacao-rateios.ts`
 * (`processarDocumentoRateio`) e em `contabilizarJurosMora`
 * (integracao-inadimplencia.ts) para o mesmo índice — resolvê-la de vez exigiria mudar o
 * índice em schema.sql, decisão de modelagem do razão inteiro, fora do escopo deste
 * módulo. Em vez de herdar o mesmo defeito (que quebraria a depreciação já no segundo
 * mês), este módulo usa a mesma saída já adotada por
 * `automacao-rateios.ts::integrarRateioAoAluguel`: `origem_modulo: 'manual'` (fora da
 * checagem de unicidade do índice — ver o `WHERE origem_modulo != 'manual'` do índice) e
 * idempotência PRÓPRIA por `referencia_documento` (que incorpora o período), verificada
 * explicitamente abaixo antes do INSERT.
 */
export function contabilizarDepreciacaoImovel(
  db: Database,
  imovel_id: number,
  entidade_id: number,
  periodo_id: number,
  taxa_anual: number = TAXA_DEPRECIACAO_ANUAL_PADRAO,
): boolean {
  const [imovel] = consultar<{ valor_aquisicao: number | null; apelido: string }>(
    db,
    "SELECT valor_aquisicao, apelido FROM imoveis WHERE id = ?",
    [imovel_id],
  );
  if (!imovel || !imovel.valor_aquisicao || imovel.valor_aquisicao <= 0) return false;

  const [periodo] = consultar<{ ano: number; mes: number }>(
    db,
    "SELECT ano, mes FROM periodos_contabeis WHERE id = ?",
    [periodo_id],
  );
  if (!periodo) return false;

  const referencia = `DEPR-${imovel_id}-${periodo.ano}${String(periodo.mes).padStart(2, "0")}`;

  const [jaLancado] = consultar<{ id: number }>(
    db,
    `SELECT id FROM ledger_entries
     WHERE referencia_documento = ? AND origem_modulo = 'manual' AND estornado_por_id IS NULL
     LIMIT 1`,
    [referencia],
  );
  if (jaLancado) return false; // já depreciado neste período — chamada repetida não duplica

  const valor_mensal = (imovel.valor_aquisicao * taxa_anual) / 12;
  if (valor_mensal <= 0) return false;

  const data_lancamento = new Date().toISOString().slice(0, 10);
  const descricaoPeriodo = `${String(periodo.mes).padStart(2, "0")}/${periodo.ano}`;

  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTA_DEPRECIACAO_ERP,
    data_lancamento,
    valor_debito: valor_mensal,
    descricao: `Depreciação ${descricaoPeriodo} — ${imovel.apelido}`,
    origem_modulo: "manual",
    origem_id: imovel_id,
    referencia_documento: referencia,
  });

  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTA_IMOVEIS_ERP,
    data_lancamento,
    valor_credito: valor_mensal,
    descricao: `Depreciação ${descricaoPeriodo} — ${imovel.apelido} (redução direta do ativo)`,
    origem_modulo: "manual",
    origem_id: imovel_id,
    referencia_documento: referencia,
  });

  return true;
}

/**
 * Deprecia todos os imóveis elegíveis (com `valor_aquisicao` cadastrado, não de uso
 * pessoal) num período — o equivalente direto ao `processarDepreciacoesPendentes` do
 * extinto `integracao-patrimonio-imovel.ts`, mas SEM a tabela fictícia
 * `ciclo_vida_imovel_contabil` daquele orquestrador (nunca existiu em schema.sql — ver
 * nota no fim do arquivo): lê `imoveis` diretamente, e a idempotência já vem de
 * `contabilizarDepreciacaoImovel` (por referencia_documento), não de um cadastro de ciclo
 * de vida separado.
 */
export function depreciarTodosImoveisElegiveis(
  db: Database,
  entidade_id: number,
  periodo_id: number,
): { processados: number; depreciados: number } {
  const imoveis = consultar<{ id: number }>(
    db,
    `SELECT id FROM imoveis WHERE uso_pessoal = 0 AND valor_aquisicao IS NOT NULL AND valor_aquisicao > 0`,
    [],
  );

  let depreciados = 0;
  for (const imovel of imoveis) {
    if (contabilizarDepreciacaoImovel(db, imovel.id, entidade_id, periodo_id)) {
      depreciados++;
    }
  }

  return { processados: imoveis.length, depreciados };
}

/**
 * NOTA — funções do módulo original (integracao-patrimonio.ts) e do orquestrador
 * (integracao-patrimonio-imovel.ts) deliberadamente NÃO reconstruídas:
 *
 * - `contabilizarParcelasFinanciamento`: debitava Financiamento a Pagar + Despesa de Juros
 *   e creditava Caixa a cada parcela paga. Isso é EXATAMENTE o que `migracao-ledger.ts` já
 *   lança quando a transação bancária da parcela é migrada, via
 *   `mapeamentoPlanoApp.ts` ("2.1.05" → 5501 juros, "2.1.06" → 3201 amortização,
 *   ambos contra Caixa). Reconstruir duplicaria todo pagamento de financiamento.
 *
 * - `contabilizarReavaliacaoImovel`: não há, no plano real (planoDeContasErp.ts), conta de
 *   "Ganho/Perda Patrimonial não realizado" — e reavaliar imóvel a valor de mercado (em vez
 *   de manter a custo histórico) é decisão de política contábil, não uma correção de
 *   contas mágicas. Fora do escopo desta tarefa (mesmo padrão de outros achados NÃO
 *   corrigidos deste ERP, ex. `provisarJurosInadimplencia`).
 *
 * - `integracao-patrimonio-imovel.ts` (o orquestrador inteiro): sincronizava contra
 *   `ciclo_vida_imovel_contabil` e `sincronizacoes_patrimonio_imovel` — DUAS tabelas que
 *   NUNCA existiram em `contabilidade-reconstituicao/schema.sql` (confirmado por busca no
 *   schema real nesta investigação), ao contrário do que a premissa de
 *   docs/dominios-a-reconstruir.md ("leem tabela real") sugeria para este arquivo
 *   especificamente. Reconstruí-lo exigiria desenhar 2 tabelas novas — fora do escopo de
 *   "trocar a função de escrita" desta tarefa. A única parte de valor real do orquestrador
 *   (depreciar todos os imóveis de uma vez, ao fechar período) foi preservada acima em
 *   `depreciarTodosImoveisElegiveis`, direto contra `imoveis` (tabela real).
 */
