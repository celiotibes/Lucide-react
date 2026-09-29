/**
 * Integração: Ciclo de Inadimplência com Juros e Multa Contábil
 * Contrato com atraso → Juros/Multa calculados → Provisão Contábil
 *
 * Os números de conta citados no cabeçalho original (17/18) nunca existiram no plano de
 * contas real do ERP — ver os comentários "ACHADO" abaixo em cada função, que documentam
 * o que foi corrigido (contabilizarJurosMora/contabilizarMultaPorAtraso, remapeadas para
 * contas reais).
 *
 * `provisarJurosInadimplencia` (o defeito CRÍTICO original: ids de conta inexistentes E
 * partida dobrada errada — creditava uma conta de RECEITA achando que isso a "reduzia",
 * quando crédito aumenta receita) foi RESCRITA como `provisarJurosMora` +
 * `reverterProvisaoJurosMora`, abaixo, a partir de uma decisão de política contábil do
 * usuário (2026-09-29): ver o comentário de `provisarJurosMora` para a decisão completa
 * (CPC 25/IFRS 9 — reconhecer o crédito de juros/multa por competência E provisionar perda
 * esperada sobre ele, simultaneamente). Nenhum caller de produção referenciava o nome antigo
 * (confirmado por busca no repo — só comentários de prosa em outros arquivos citavam o
 * defeito como exemplo de achado fora de escopo), então não há alias `@deprecated` a manter.
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { registrarLancamentoContabil, estornarLancamento } from "./ledger";
import { CONTA_CAIXA_ERP } from "./mapeamentoPlanoApp";
import { calcularInadimplencia } from "../reconcile/inadimplencia";
import type { Excecao } from "../reconcile/contratos";
import { formatarMoeda } from "../formatarMoeda";

// ACHADO (gravidade CRÍTICA, corrigido em contabilizarJurosMora/contabilizarMultaPorAtraso):
// as contas abaixo eram números mágicos (2, 29, 30) que não correspondem a NENHUMA conta
// de `contas_plano_contas` — o plano real do ERP (PLANO_DE_CONTAS_ERP, em
// planoDeContasErp.ts) é a "fonte única" desde que o próprio arquivo documenta este exato
// padrão de defeito ("antes existiam três versões divergentes do mesmo plano... os ids
// fixos embutidos nos módulos"). Como `ledger_entries.conta_id` tem
// `REFERENCES contas_plano_contas(id)` com FK ativa, todo lançamento gravado com esses ids
// inexistentes quebrava com "FOREIGN KEY constraint failed" contra o schema real. Corrigido
// remapeando para contas que já existem no plano: Caixa → CONTA_CAIXA_ERP (1101, a mesma
// constante que contasAPagar.ts usa) e Receita de Juros → 4201 ("Juros recebidos", já no
// plano). Não existe hoje uma conta dedicada a "Receita de Multa Contratual"; usa-se 4301
// ("Outras receitas") como a mais próxima já existente — criar uma conta específica é
// decisão de plano de contas fora do escopo deste achado.
const CONTA_RECEITA_JUROS_ERP = 4201;
const CONTA_RECEITA_OUTRAS_ERP = 4301;

// Par de contas criado no plano (planoDeContasErp.ts) especificamente para
// provisarJurosMora/reverterProvisaoJurosMora — ver o comentário lá (linhas junto a 1104/1106)
// e o comentário de `provisarJurosMora` abaixo para a decisão de política contábil que as
// motivou.
const CONTA_JUROS_MULTA_MORA_A_RECEBER_ERP = 1104; // "Contas a receber — juros e multa de mora" (ativo, débito)
const CONTA_PROVISAO_DEVEDORES_DUVIDOSOS_ERP = 1106; // "(-) Provisão para devedores duvidosos" (ativo, crédito — contra-ativo)
const CONTA_INADIMPLENCIA_PERDAS_LOCATARIO_ERP = 5502; // "Inadimplência e perdas com locatário" (despesa, débito) — já existe e já é usada por integracao-vistorias.ts::provisarDanosVistoria para outro tipo de perda com locatário.

/** Percentual de perda esperada aplicado por padrão em `provisarJurosMora` quando quem chama
 * não informa um valor próprio — EXEMPLO ajustável, não uma verdade contábil absoluta (mesmo
 * padrão de documentação de `LIMITE_APROVACAO_DUPLA`, em
 * src/domain/operacoes/ordensServico.ts): 60% de perda esperada (equivalente a assumir 40%
 * de taxa de recuperação histórica) é uma premissa de exemplo para uma carteira de locação
 * residencial com histórico de recuperação mediano — tribunal, perícia ou auditoria que
 * revisar este número deve overridar via o parâmetro `percentualPerdaEsperada`, não presumir
 * que 60% é uma norma contábil. Fração (0 a 1), não percentual (0 a 100) — a tela
 * (ContratosInadimplenciaView.tsx) converte o input do usuário em % para fração antes de
 * chamar. */
export const PERCENTUAL_PERDA_ESPERADA_PADRAO = 0.6;

export interface InadimplenciaCalculada {
  contrato_id: number;
  imovel_id: number;
  locatario: string;
  dias_atraso: number;
  valor_aluguel_vencido: number;
  multa_valor: number;
  juros_valor: number;
  juros_acumulado: number;
  valor_total_devido: number;
  status: "normal" | "com_atraso" | "em_cobranca" | "litigioso";
}

/** Calcular dias de atraso para um contrato, em relação a uma data de referência
 * explícita.
 *
 * ACHADO (gravidade ALTA, corrigido): antes esta função ignorava por completo a data de
 * referência de quem chamava e usava sempre `new Date()` (o relógio real) para "hoje" —
 * `apurarInadimplenciaContrato(db, id, data_referencia)` recebia `data_referencia` e a
 * usava só para escolher MÊS/ANO do vencimento, mas a contagem de dias de atraso em si
 * comparava esse vencimento contra a data real do sistema, não contra `data_referencia`.
 * Ou seja: pedir a inadimplência "como estava em 2020-01-15" na prática calculava os dias
 * de atraso até HOJE (2026), um número absurdamente maior — a função não tinha como ser
 * testada de forma determinística nem usada para reconstituir uma posição histórica.
 * Corrigido para receber e usar a mesma referência em toda a função. */
function calcularDiasAtraso(data_vencimento: string, hoje_referencia: Date): number {
  const vencimento = new Date(data_vencimento);
  const hoje = new Date(hoje_referencia);
  hoje.setHours(0, 0, 0, 0);
  vencimento.setHours(0, 0, 0, 0);

  const diferenca = hoje.getTime() - vencimento.getTime();
  return Math.max(0, Math.floor(diferenca / (1000 * 60 * 60 * 24)));
}

/** Calcular multa por inadimplência (estrutura em duas faixas) */
function calcularMulta(
  dias_atraso: number,
  valor_aluguel: number,
  multa_percentual: number,
  multa_ate_dias: number,
  multa_percentual_substitutiva: number,
): number {
  if (dias_atraso === 0) return 0;

  if (dias_atraso <= multa_ate_dias) {
    // Primeira faixa: multa_percentual até multa_ate_dias
    return (valor_aluguel * multa_percentual) / 100;
  } else {
    // Segunda faixa: multa_percentual_substitutiva substitui a anterior
    return (valor_aluguel * multa_percentual_substitutiva) / 100;
  }
}

/** Calcular juros de mora (pro-rata) */
function calcularJurosMora(
  dias_atraso: number,
  valor_aluguel: number,
  juros_mensal_percentual: number,
): number {
  if (dias_atraso === 0) return 0;

  // Juros pro-rata: (dias_atraso / 30) * (valor * taxa_mensal)
  const taxa_diaria = juros_mensal_percentual / 30 / 100;
  return valor_aluguel * taxa_diaria * dias_atraso;
}

/** Apurar inadimplência de um contrato com cálculos completos.
 *
 * ACHADO 1 (gravidade CRÍTICA, corrigido): a query selecionava uma coluna `status` de
 * `contratos_locacao` — a tabela real (contabilidade-reconstituicao/schema.sql) NÃO TEM
 * essa coluna (a vigência do contrato é `data_fim IS NULL`, nunca um campo `status`; ver o
 * mesmo achado, já documentado e corrigido, em
 * src/domain/erp/__auditoria__/sincronizacao-integridade.test.ts para
 * sincronizacao-integridade.ts). Contra o schema real, TODA chamada a esta função lançava
 * "no such column: status" — o módulo inteiro (apurarInadimplenciaContrato,
 * relatorioInadimplenciaDetalhado, resumoInadimplenciaTotal, provisarJurosInadimplencia)
 * quebrava incondicionalmente, mesmo com um contrato válido. O campo nunca era lido no
 * corpo da função (só figurava no tipo), então a correção é apenas removê-lo da consulta.
 *
 * ACHADO 2 (gravidade ALTA, corrigido): a função nunca verificava se o aluguel do mês já
 * tinha sido efetivamente recebido — calculava dias_atraso comparando só a data de
 * vencimento do mês corrente contra hoje, sem olhar `transacoes` (onde um recebimento
 * PIX/boleto do inquilino, já vinculado ao contrato via `transacoes.contrato_id`, fica
 * registrado). Resultado: TODO contrato ativo com dia_vencimento anterior ao dia de hoje
 * era classificado como inadimplente, mesmo que o locatário tivesse pago em dia — um
 * falso-positivo permanente e universal, o oposto do que um módulo de "contas a receber"
 * existe para fazer. Corrigido: quando há atraso aparente, soma-se os recebimentos já
 * lançados para este contrato dentro da janela do vencimento até a data de referência;
 * se cobrirem o valor do aluguel (com tolerância de 1 centavo por arredondamento), o
 * contrato é tratado como em dia, sem multa/juros. Deliberadamente mais simples que o
 * motor de conciliação de src/domain/reconcile/contratos.ts (que casa competência a
 * competência com tolerância de valor/data e desduplica transações entre meses vizinhos —
 * ver `conciliar()`); usar aquele motor aqui, ou decidir a tolerância de valor para
 * pagamento PARCIAL, é decisão de produto fora do escopo deste achado.
 *
 * @deprecated para contratos com competências geradas (ver `gerarCompetenciasPendentes` em
 * `aluguel-competencias.ts`), use `apurarInadimplenciaContratoPorCompetencia` — esta função
 * segue com o defeito estrutural documentado no teste `it.fails` "status evolui por faixa
 * de atraso..." (`__tests__/integracao-inadimplencia.test.ts`): o vencimento usado no
 * cálculo é sempre recalculado a partir do MÊS DA PRÓPRIA data de referência, nunca fica
 * preso ao mês em que a inadimplência de fato começou, e por isso `dias_atraso` nunca
 * ultrapassa ~30 dias — `em_cobranca`/`litigioso` são estados impossíveis de alcançar por
 * esta função, para qualquer entrada. Mantida (não removida, não reescrita) porque
 * `relatorioInadimplenciaDetalhado`/`resumoInadimplenciaTotal`/`provisarJurosInadimplencia`
 * ainda a chamam e não foram adaptados/testados contra o modelo de competência — ver o
 * comentário no topo de `aluguel-competencias.ts` para o raciocínio completo desta escolha. */
export function apurarInadimplenciaContrato(
  db: Database,
  contrato_id: number,
  data_referencia?: string,
): InadimplenciaCalculada | null {
  const [contrato] = consultar<{
    imovel_id: number;
    locatario: string;
    dia_vencimento: number;
    valor_referencia: number;
    multa_percentual: number;
    multa_ate_dias: number;
    multa_percentual_substitutiva: number;
    juros_mensal_percentual: number;
  }>(
    db,
    `SELECT
      imovel_id, locatario, dia_vencimento, valor_referencia,
      multa_percentual, multa_ate_dias, multa_percentual_substitutiva,
      juros_mensal_percentual
     FROM contratos_locacao WHERE id = ?`,
    [contrato_id],
  );

  if (!contrato) return null;

  // Construir data de vencimento do mês, sempre em relação à MESMA data de referência
  // usada depois para contar dias de atraso (ver ACHADO 1 acima).
  const hoje = new Date(`${data_referencia || new Date().toISOString().split("T")[0]}T00:00:00`);
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  const data_vencimento_str = `${ano}-${String(mes).padStart(2, "0")}-${String(contrato.dia_vencimento).padStart(2, "0")}`;
  const data_vencimento = new Date(`${data_vencimento_str}T00:00:00`).toISOString();

  let dias_atraso = calcularDiasAtraso(data_vencimento, hoje);

  // ACHADO 2: só vale a pena checar recebimento quando há atraso aparente — evita uma
  // consulta desnecessária quando o vencimento ainda nem chegou.
  if (dias_atraso > 0) {
    const inicio_mes = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const hoje_str = hoje.toISOString().slice(0, 10);
    const [{ total_recebido }] = consultar<{ total_recebido: number | null }>(
      db,
      `SELECT SUM(valor) AS total_recebido FROM transacoes
       WHERE contrato_id = ? AND valor > 0 AND data BETWEEN ? AND ?`,
      [contrato_id, inicio_mes, hoje_str],
    );

    if ((total_recebido ?? 0) >= contrato.valor_referencia - 0.01) {
      dias_atraso = 0;
    }
  }

  // Calcular componentes
  const multa = calcularMulta(
    dias_atraso,
    contrato.valor_referencia,
    contrato.multa_percentual,
    contrato.multa_ate_dias,
    contrato.multa_percentual_substitutiva,
  );

  const juros = calcularJurosMora(
    dias_atraso,
    contrato.valor_referencia,
    contrato.juros_mensal_percentual,
  );

  // Determinar status
  let status: InadimplenciaCalculada["status"] = "normal";
  if (dias_atraso > 0 && dias_atraso <= 30) status = "com_atraso";
  else if (dias_atraso > 30 && dias_atraso <= 90) status = "em_cobranca";
  else if (dias_atraso > 90) status = "litigioso";

  return {
    contrato_id,
    imovel_id: contrato.imovel_id,
    locatario: contrato.locatario,
    dias_atraso,
    valor_aluguel_vencido: contrato.valor_referencia,
    multa_valor: multa,
    juros_valor: juros,
    juros_acumulado: juros, // Simplificado; em produção seria acumulativo mensal
    valor_total_devido: dias_atraso > 0 ? contrato.valor_referencia + multa + juros : 0,
    status,
  };
}

/** Contabilizar juros de mora quando já houve atraso e recebimento posterior */
export function contabilizarJurosMora(
  db: Database,
  contrato_id: number,
  entidade_id: number,
  periodo_id: number,
  valor_juros: number,
): boolean {
  if (valor_juros <= 0) return false;

  // Débito: Caixa
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTA_CAIXA_ERP, // Caixa (1101)
    data_lancamento: new Date().toISOString().split("T")[0],
    valor_debito: valor_juros,
    descricao: `Recebimento juros de mora - Contrato ${contrato_id}`,
    origem_modulo: "contratos",
    origem_id: contrato_id,
    referencia_documento: `CT-${contrato_id}-JUR`,
  });

  // Crédito: Receita de Juros
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTA_RECEITA_JUROS_ERP, // Juros recebidos (4201)
    data_lancamento: new Date().toISOString().split("T")[0],
    valor_credito: valor_juros,
    descricao: `Receita de juros de mora - Contrato ${contrato_id}`,
    origem_modulo: "contratos",
    origem_id: contrato_id,
    referencia_documento: `CT-${contrato_id}-JUR-REC`,
  });

  return true;
}

/** Contabilizar multa por atraso */
export function contabilizarMultaPorAtraso(
  db: Database,
  contrato_id: number,
  entidade_id: number,
  periodo_id: number,
  valor_multa: number,
): boolean {
  if (valor_multa <= 0) return false;

  // Débito: Caixa
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTA_CAIXA_ERP, // Caixa (1101)
    data_lancamento: new Date().toISOString().split("T")[0],
    valor_debito: valor_multa,
    descricao: `Recebimento multa contratual - Contrato ${contrato_id}`,
    origem_modulo: "contratos",
    origem_id: contrato_id,
    referencia_documento: `CT-${contrato_id}-MULT`,
  });

  // Crédito: Receita Diversa / Receita de Multa (sem conta dedicada no plano — ver ACHADO acima)
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTA_RECEITA_OUTRAS_ERP, // Outras receitas (4301)
    data_lancamento: new Date().toISOString().split("T")[0],
    valor_credito: valor_multa,
    descricao: `Receita de multa contratual - Contrato ${contrato_id}`,
    origem_modulo: "contratos",
    origem_id: contrato_id,
    referencia_documento: `CT-${contrato_id}-MULT-REC`,
  });

  return true;
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Arredonda para centavos — evita gravar no razão um ruído de ponto flutuante (ex.:
 * 12.499999999998) que faria duas execuções do mesmo cálculo "parecerem" divergir. */
function arredondarCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Lançamentos ainda VIVOS (não estornados) desta provisão para uma competência —
 * `origem_modulo='inadimplencia_juros'` é exclusivo deste par de funções (ver comentário em
 * `LancamentoContabil.origem_modulo`, ledger.ts), então filtrar só por `origem_id` já basta
 * para identificar os lançamentos desta competência especificamente, sem risco de pegar
 * lançamento de outro módulo. "Vivo" aqui é a MESMA condição do índice parcial
 * `idx_ledger_origem_unica` (schema.sql): `estorno_de_id IS NULL AND estornado_por_id IS
 * NULL` — depois de um estorno, a linha original (estornado_por_id preenchido) e o
 * lançamento reverso (estorno_de_id preenchido) saem os dois desta lista, e uma nova chamada
 * a `provisarJurosMora` para a mesma competência não colide mais no índice único (o mesmo
 * comportamento que permite reprovisionar depois de reverter). */
function lancamentosVivosDaProvisao(db: Database, competencia_id: number): Array<{ id: number; conta_id: number }> {
  return consultar<{ id: number; conta_id: number }>(
    db,
    `SELECT id, conta_id FROM ledger_entries
     WHERE origem_modulo = 'inadimplencia_juros' AND origem_id = ?
       AND estorno_de_id IS NULL AND estornado_por_id IS NULL`,
    [competencia_id],
  );
}

/** Período contábil (entidade, ano/mês da data informada), criando-o aberto se ainda não
 * existir — duplicado de `aluguel-competencias.ts::resolverPeriodoParaData` em vez de
 * importado de lá (mesmo raciocínio que o próprio arquivo já usa para não expandir a
 * superfície pública dele por uma dependência de um módulo diferente: ver o comentário de
 * `calcularDiasAtraso` logo abaixo do topo daquele arquivo). */
function resolverPeriodoParaData(db: Database, entidade_id: number, data: string): { id: number } {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(data);
  if (!partes) throw new Error(`Data de referência inválida: "${data}".`);
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);

  const buscar = () =>
    consultar<{ id: number }>(
      db,
      "SELECT id FROM periodos_contabeis WHERE entidade_id = ? AND ano = ? AND mes = ?",
      [entidade_id, ano, mes],
    )[0];

  let periodo = buscar();
  if (!periodo) {
    executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, ?, ?, 'aberto')", [
      entidade_id,
      ano,
      mes,
    ]);
    periodo = buscar();
  }
  if (!periodo) throw new Error(`Não foi possível abrir o período contábil ${mes}/${ano}.`);
  return periodo;
}

export interface ResultadoProvisaoJurosMora {
  sucesso: boolean;
  mensagem: string;
  /** true quando já havia provisão viva lançada para esta competência — nada novo foi
   * gravado agora (nem erro, nem duplicata: idempotência por construção). */
  jaProvisionado: boolean;
  diasAtraso: number;
  /** Valor de juros/multa/correção reconhecido (débito 1104 / crédito 4201) — 0 quando não
   * havia nada a provisionar. */
  valorJurosMulta: number;
  /** Valor da provisão para perda esperada (débito 5502 / crédito 1106) — sempre
   * `valorJurosMulta * percentualPerdaEsperada`. */
  valorProvisao: number;
  ledgerEntryIdJuros?: number;
  ledgerEntryIdProvisao?: number;
}

/** Provisiona juros/multa de mora de uma competência de aluguel em atraso
 * (`aluguel_competencias`, ver aluguel-competencias.ts — o modelo de competência ativo hoje)
 * e, SIMULTANEAMENTE, a perda esperada sobre esse crédito específico.
 *
 * DECISÃO DE POLÍTICA CONTÁBIL (usuário, 2026-09-29): entre reconhecer juros/multa de mora só
 * no recebimento efetivo (regime de caixa) ou reconhecer por competência com provisão de
 * perda esperada simultânea, adotada a SEGUNDA opção — equivalente a CPC 25/IFRS 9
 * (impairment): o crédito de juros/multa é reconhecido assim que existe (mora + regras do
 * próprio contrato o geram), e a incerteza de recebê-lo de fato é carregada, desde já, como
 * uma provisão para perda esperada sobre ESSE crédito, não como uma negação do crédito em si.
 * A alternativa (regime de caixa puro) foi descartada porque some com o rastro do que é
 * efetivamente devido por mora até o dia em que o locatário paga (ou nunca) — pior para
 * reconstituição pericial, que é o propósito deste sistema.
 *
 * CÁLCULO (reaproveitado, não duplicado): `calcularInadimplencia` (src/domain/reconcile/
 * inadimplencia.ts), já testado em inadimplencia.test.ts, aplica exatamente as regras do
 * contrato citadas na decisão — multa em duas faixas (`multa_percentual` até
 * `multa_ate_dias`, substituída por `multa_percentual_substitutiva` depois), juros pro-rata
 * die (`juros_mensal_percentual`) e correção monetária composta mês a mês pelo índice do
 * contrato (`indice_correcao_mora`, via `indices_economicos`). O valor reconhecido aqui como
 * "juros e multa de mora" é `multa + juros + correcaoMonetaria` — não inclui `honorarios`
 * (gatilho de execução judicial): honorários advocatícios são um evento econômico distinto
 * (custeio de processo, não mora em si) e já têm contas próprias (6301-6304) fora do escopo
 * desta decisão.
 *
 * LANÇAMENTO (o que estava quebrado em `provisarJurosInadimplencia`, agora corrigido):
 *   1) Débito 1104 (Contas a receber — juros e multa de mora) / Crédito 4201 (Juros
 *      recebidos), pelo valor calculado acima — reconhece o crédito por competência.
 *   2) Débito 5502 (Inadimplência e perdas com locatário) / Crédito 1106 ((-) Provisão para
 *      devedores duvidosos), pelo valor de (1) × `percentualPerdaEsperada` — a perda esperada
 *      sobre ESSE crédito específico, lançada na mesma chamada (nunca uma das duas pernas sem
 *      a outra).
 *
 * `percentualPerdaEsperada` é fração (0 a 1), não percentual (0 a 100); default
 * `PERCENTUAL_PERDA_ESPERADA_PADRAO` — ver o comentário dessa constante: é um EXEMPLO
 * ajustável, não uma verdade contábil fixa.
 *
 * Idempotente: se já houver lançamento vivo para esta competência (`origem_modulo =
 * 'inadimplencia_juros'`, `origem_id = competencia_id`), não duplica — nem por checagem
 * prévia, nem deixando o `UNIQUE constraint failed` de `idx_ledger_origem_unica` vazar cru
 * numa corrida rara entre duas chamadas concorrentes (mesmo padrão de
 * `gerarCompetenciasPendentes`, aluguel-competencias.ts). Sem atraso (ou dentro da carência
 * da 1ª faixa de multa com juros ainda em zero — ex.: `dias_atraso = 0`): não lança nada,
 * retorna `jaProvisionado: false` e `valorJurosMulta: 0` — não é erro. */
export function provisarJurosMora(
  db: Database,
  competencia_id: number,
  entidade_id: number,
  opcoes: { percentualPerdaEsperada?: number; data_referencia?: string } = {},
): ResultadoProvisaoJurosMora {
  const percentualPerdaEsperada = opcoes.percentualPerdaEsperada ?? PERCENTUAL_PERDA_ESPERADA_PADRAO;
  if (!(percentualPerdaEsperada >= 0) || percentualPerdaEsperada > 1) {
    throw new Error(
      `percentualPerdaEsperada deve ser uma fração entre 0 e 1 (ex.: 0.6 = 60%) — recebido: ${percentualPerdaEsperada}.`,
    );
  }

  const [competencia] = consultar<{
    id: number;
    contrato_id: number;
    imovel_id: number;
    ano: number;
    mes: number;
    valor_devido: number;
  }>(
    db,
    "SELECT id, contrato_id, imovel_id, ano, mes, valor_devido FROM aluguel_competencias WHERE id = ?",
    [competencia_id],
  );
  if (!competencia) {
    return {
      sucesso: false,
      mensagem: `Competência ${competencia_id} não encontrada.`,
      jaProvisionado: false,
      diasAtraso: 0,
      valorJurosMulta: 0,
      valorProvisao: 0,
    };
  }

  const [contrato] = consultar<{
    locatario: string;
    multa_percentual: number;
    multa_ate_dias: number;
  }>(
    db,
    "SELECT locatario, multa_percentual, multa_ate_dias FROM contratos_locacao WHERE id = ?",
    [competencia.contrato_id],
  );
  if (!contrato) {
    return {
      sucesso: false,
      mensagem: `Contrato ${competencia.contrato_id} (da competência ${competencia_id}) não encontrado.`,
      jaProvisionado: false,
      diasAtraso: 0,
      valorJurosMulta: 0,
      valorProvisao: 0,
    };
  }

  const data_referencia = opcoes.data_referencia || hoje();
  const mes_referencia = `${competencia.ano}-${String(competencia.mes).padStart(2, "0")}-01`;
  const excecao: Excecao = {
    competencia: {
      contrato_id: competencia.contrato_id,
      imovel_id: competencia.imovel_id,
      mes_referencia,
      valor_esperado: competencia.valor_devido,
    },
    motivo: "provisão de juros/multa de mora (provisarJurosMora)",
  };
  const [status] = calcularInadimplencia(db, [excecao], data_referencia);

  const valorJurosMulta = arredondarCentavos(status.multa + status.juros + status.correcaoMonetaria);

  if (valorJurosMulta <= 0) {
    return {
      sucesso: true,
      mensagem: `Competência #${competencia_id}: sem juros/multa de mora a provisionar (${status.diasAtraso} dia(s) de atraso — dentro do prazo ou sem atraso).`,
      jaProvisionado: false,
      diasAtraso: status.diasAtraso,
      valorJurosMulta: 0,
      valorProvisao: 0,
    };
  }

  const valorProvisao = arredondarCentavos(valorJurosMulta * percentualPerdaEsperada);

  const vivos = lancamentosVivosDaProvisao(db, competencia_id);
  if (vivos.length > 0) {
    return {
      sucesso: true,
      mensagem: `Competência #${competencia_id} já tinha provisão de juros/multa de mora lançada — nada duplicado.`,
      jaProvisionado: true,
      diasAtraso: status.diasAtraso,
      valorJurosMulta,
      valorProvisao,
    };
  }

  const percentualMultaAplicado = status.diasAtraso <= contrato.multa_ate_dias ? contrato.multa_percentual : undefined;
  const competenciaRotulo = `${String(competencia.mes).padStart(2, "0")}/${competencia.ano}`;
  const descricaoJuros =
    `Juros e multa de mora — contrato #${competencia.contrato_id} (${contrato.locatario}), competência ${competenciaRotulo}: ` +
    `${status.diasAtraso} dia(s) de atraso; multa ${formatarMoeda(status.multa)}` +
    (percentualMultaAplicado !== undefined ? ` (${percentualMultaAplicado}%)` : "") +
    `; juros pro-rata ${formatarMoeda(status.juros)}; correção monetária ${formatarMoeda(status.correcaoMonetaria)}. ` +
    `Total reconhecido: ${formatarMoeda(valorJurosMulta)}.`;
  const descricaoProvisao =
    `Provisão para devedores duvidosos — ${(percentualPerdaEsperada * 100).toFixed(0)}% de perda esperada sobre juros/multa ` +
    `de mora da competência #${competencia_id} (contrato #${competencia.contrato_id}, ${competenciaRotulo}), taxa de recuperação ` +
    `histórica assumida: ${((1 - percentualPerdaEsperada) * 100).toFixed(0)}%. Base: ${formatarMoeda(valorJurosMulta)} × ` +
    `${(percentualPerdaEsperada * 100).toFixed(0)}% = ${formatarMoeda(valorProvisao)}. Política contábil: CPC 25/IFRS 9 ` +
    `(impairment), decisão do usuário 2026-09-29.`;

  let ledgerEntryIdJuros: number;
  let ledgerEntryIdProvisao: number;

  db.run("BEGIN");
  try {
    const periodo_id = resolverPeriodoParaData(db, entidade_id, data_referencia).id;
    ledgerEntryIdJuros = registrarLancamentoContabil(db, {
      entidade_id,
      periodo_id,
      conta_id: CONTA_JUROS_MULTA_MORA_A_RECEBER_ERP,
      data_lancamento: data_referencia,
      valor_debito: valorJurosMulta,
      descricao: descricaoJuros,
      origem_modulo: "inadimplencia_juros",
      origem_id: competencia_id,
      referencia_documento: `COMP-${competencia_id}-JUR`,
    });
    registrarLancamentoContabil(db, {
      entidade_id,
      periodo_id,
      conta_id: CONTA_RECEITA_JUROS_ERP,
      data_lancamento: data_referencia,
      valor_credito: valorJurosMulta,
      descricao: descricaoJuros,
      origem_modulo: "inadimplencia_juros",
      origem_id: competencia_id,
      referencia_documento: `COMP-${competencia_id}-JUR-REC`,
    });
    ledgerEntryIdProvisao = registrarLancamentoContabil(db, {
      entidade_id,
      periodo_id,
      conta_id: CONTA_INADIMPLENCIA_PERDAS_LOCATARIO_ERP,
      data_lancamento: data_referencia,
      valor_debito: valorProvisao,
      descricao: descricaoProvisao,
      origem_modulo: "inadimplencia_juros",
      origem_id: competencia_id,
      referencia_documento: `COMP-${competencia_id}-PROV`,
    });
    registrarLancamentoContabil(db, {
      entidade_id,
      periodo_id,
      conta_id: CONTA_PROVISAO_DEVEDORES_DUVIDOSOS_ERP,
      data_lancamento: data_referencia,
      valor_credito: valorProvisao,
      descricao: descricaoProvisao,
      origem_modulo: "inadimplencia_juros",
      origem_id: competencia_id,
      referencia_documento: `COMP-${competencia_id}-PROV-CRED`,
    });
    db.run("COMMIT");
  } catch (erro) {
    try {
      db.run("ROLLBACK");
    } catch {
      /* já fora de transação */
    }
    const mensagemErro = erro instanceof Error ? erro.message : String(erro);
    // Corrida rara entre a checagem `lancamentosVivosDaProvisao` acima e este INSERT (outra
    // chamada concorrente já provisionou esta competência nesse intervalo) — mesmo padrão de
    // idempotência por construção de `gerarCompetenciasPendentes`
    // (aluguel-competencias.ts): não deixa a exceção crua do banco vazar, trata como
    // "já provisionado".
    if (/UNIQUE constraint failed/i.test(mensagemErro)) {
      return {
        sucesso: true,
        mensagem: `Competência #${competencia_id} já tinha provisão de juros/multa de mora lançada (corrida concorrente detectada) — nada duplicado.`,
        jaProvisionado: true,
        diasAtraso: status.diasAtraso,
        valorJurosMulta,
        valorProvisao,
      };
    }
    throw erro;
  }

  return {
    sucesso: true,
    mensagem: `Competência #${competencia_id}: ${formatarMoeda(valorJurosMulta)} de juros/multa de mora reconhecidos (lançamento #${ledgerEntryIdJuros}), com ${formatarMoeda(valorProvisao)} provisionados para perda esperada (lançamento #${ledgerEntryIdProvisao}).`,
    jaProvisionado: false,
    diasAtraso: status.diasAtraso,
    valorJurosMulta,
    valorProvisao,
    ledgerEntryIdJuros,
    ledgerEntryIdProvisao,
  };
}

export interface ResultadoReversaoProvisaoJurosMora {
  sucesso: boolean;
  mensagem: string;
  lancamentosEstornados: number;
  ledgerEntryIdsEstorno: number[];
}

// Nenhuma tela deste app ainda captura "usuário logado" (não há autenticação — mesmo estado
// documentado em AuditoriaView.tsx, que só exibe `usuario_id` quando algum outro fluxo já o
// gravou). `estornarLancamento` exige um `estornado_por: number` não nulo; até existir sessão
// de usuário de verdade, usa-se o mesmo placeholder que ledger-estorno.test.ts usa nos casos
// simples (id 1) — trocar por um usuário de sessão real quando a autenticação existir.
const USUARIO_SISTEMA_PADRAO = 1;

/** Reverte (estorna) a provisão de juros/multa de mora de uma competência — os dois pares de
 * lançamentos que `provisarJurosMora` gravou para ela (`origem_modulo = 'inadimplencia_juros'`,
 * `origem_id = competencia_id`), via `estornarLancamento` (ledger.ts — nunca apaga a linha
 * original, grava o reverso com trilha de auditoria). Uso típico: os juros efetivamente
 * pagos, o contrato foi renegociado, ou a ação judicial se resolveu — a inadimplência que
 * motivou a provisão deixou de existir.
 *
 * Idempotente: se não houver nenhum lançamento vivo para esta competência (nunca provisionado,
 * ou já revertido antes), não é erro — apenas não faz nada e informa isso no retorno. */
export function reverterProvisaoJurosMora(
  db: Database,
  competencia_id: number,
  motivo: string,
  estornado_por: number = USUARIO_SISTEMA_PADRAO,
): ResultadoReversaoProvisaoJurosMora {
  const vivos = lancamentosVivosDaProvisao(db, competencia_id);
  if (vivos.length === 0) {
    return {
      sucesso: true,
      mensagem: `Nenhuma provisão de juros/multa de mora lançada para a competência #${competencia_id} — nada a reverter.`,
      lancamentosEstornados: 0,
      ledgerEntryIdsEstorno: [],
    };
  }

  const motivoLimpo = motivo?.trim();
  if (!motivoLimpo) {
    throw new Error("Informe o motivo da reversão da provisão de juros/multa de mora.");
  }

  const idsEstorno: number[] = [];
  db.run("BEGIN");
  try {
    for (const lancamento of vivos) {
      idsEstorno.push(estornarLancamento(db, lancamento.id, motivoLimpo, estornado_por));
    }
    db.run("COMMIT");
  } catch (erro) {
    try {
      db.run("ROLLBACK");
    } catch {
      /* já fora de transação */
    }
    throw erro;
  }

  return {
    sucesso: true,
    mensagem: `${vivos.length} lançamento(s) da provisão de juros/multa de mora estornado(s) para a competência #${competencia_id}: ${motivoLimpo}.`,
    lancamentosEstornados: vivos.length,
    ledgerEntryIdsEstorno: idsEstorno,
  };
}

/** Relatório: Contratos em inadimplência com cálculos de juros/multa */
export function relatorioInadimplenciaDetalhado(
  db: Database,
): InadimplenciaCalculada[] {
  const contratos = consultar<{ id: number }>(
    db,
    `SELECT id FROM contratos_locacao
     -- contrato vigente: não há coluna status; data_fim nulo = em vigor
     WHERE data_fim IS NULL OR data_fim >= DATE('now')`,
    [],
  );

  return contratos
    .map((c) => apurarInadimplenciaContrato(db, c.id))
    .filter((c) => c !== null && c.dias_atraso > 0) as InadimplenciaCalculada[];
}

/** Resumo executivo: Inadimplência total em risco */
export function resumoInadimplenciaTotal(
  db: Database,
): {
  contratos_inadimplentes: number;
  valor_aluguel_em_atraso: number;
  multa_acumulada: number;
  juros_acumulado: number;
  valor_total_em_risco: number;
} {
  const relatorio = relatorioInadimplenciaDetalhado(db);

  return {
    contratos_inadimplentes: relatorio.length,
    valor_aluguel_em_atraso: relatorio.reduce((sum, r) => sum + r.valor_aluguel_vencido, 0),
    multa_acumulada: relatorio.reduce((sum, r) => sum + r.multa_valor, 0),
    juros_acumulado: relatorio.reduce((sum, r) => sum + r.juros_acumulado, 0),
    valor_total_em_risco: relatorio.reduce((sum, r) => sum + r.valor_total_devido, 0),
  };
}
