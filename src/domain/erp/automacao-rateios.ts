/**
 * Automação de Rateios: Alocação Automática de Despesas Comuns
 * Documento (Fatura Condomínio) → Reconhecimento de Despesa → Rateio Automático por Fração/m²
 * Resultado: Despesa Rateada integrada ao aluguel do mês
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { registrarLancamentoContabil } from "./ledger";

/**
 * ACHADO (gravidade GRAVE, corrigido) — conta_id fictícios contra o schema real.
 *
 * Este módulo registrava lançamentos com `conta_id: 20`..`26` (ver `mapa_contas` e os
 * literais 25/26 mais abaixo). Nenhum desses ids existe em `contas_plano_contas`: o
 * plano do razão é semeado por `garantirPlanoDeContasErp()` (planoDeContasErp.ts) com
 * ids como 5210 (Condomínio), 4103 (Rateios e reembolsos) etc. `ledger_entries.conta_id`
 * é `NOT NULL REFERENCES contas_plano_contas(id)` e o schema roda com
 * `PRAGMA foreign_keys = ON` — toda chamada de `registrarLancamentoContabil` feita por
 * este módulo falhava com "FOREIGN KEY constraint failed" contra o banco real. Só não
 * aparecia porque nenhum teste deste módulo rodava contra `criarBancoDeTeste()` (schema
 * real) antes desta auditoria de execução — a leitura de código via grep não referencia
 * nenhuma tabela inexistente, então passava na auditoria anterior, só baseada em leitura.
 *
 * Reproduzido e coberto em automacao-rateios.test.ts (qualquer teste que chame
 * `processarDocumentoRateio` ou `integrarRateioAoAluguel` falharia antes desta correção).
 *
 * As contas abaixo mapeiam para o plano real (PLANO_DE_CONTAS_ERP em planoDeContasErp.ts).
 */
const CONTA_DESPESA_POR_TIPO_RATEIO: Record<string, number> = {
  condominio: 5210, // Condomínio
  agua: 5207, // Água
  energia: 5206, // Energia
  internet: 5212, // Internet e telecomunicações
  manutencao: 5205, // Manutenção
};

// Crédito do reembolso de custeio coletivo — grupo 'receita', mas deliberadamente NÃO
// é 4101 (Receita de aluguel, base tributável do Carnê-Leão): o próprio schema documenta
// em `contratos_locacao.percentual_aluguel_efetivo` que o rateio embutido no "valor único
// mensal" é reembolso não tributável, contabilmente distinto do aluguel efetivo. 4103
// ("Rateios e reembolsos") é a conta do plano real para esse trânsito — usada tanto para
// a "despesa rateada a receber" (processarDocumentoRateio, antigo id 25) quanto para o
// "componente de aluguel" (integrarRateioAoAluguel, antigo id 26): o plano real só tem
// uma conta para esse conceito, não duas.
const CONTA_RATEIO_RECEITA = 4103;

export interface RateioDocumento {
  documento_id: number;
  tipo: "condominio" | "agua" | "energia" | "internet" | "manutencao";
  valor_total: number;
  data_documento: string;
  cnpj_contraparte: string;
  rateios_por_imovel: Array<{
    imovel_id: number;
    criterio: "fracao_ideal" | "area_m2";
    percentual: number;
    valor_rateado: number;
  }>;
}

/** Obter imóveis para rateio (ativos, não pessoais) */
function obterImoveisParaRateio(
  db: Database,
  apenas_com_contrato: boolean = false,
): Array<{ id: number; fracao_ideal?: number; area_m2?: number }> {
  const query = apenas_com_contrato
    ? `SELECT DISTINCT i.id, i.fracao_ideal, i.area_m2
       FROM imoveis i
       INNER JOIN contratos_locacao c ON i.id = c.imovel_id
       WHERE i.uso_pessoal = 0 AND i.financiado = 0
         -- contrato vigente: contratos_locacao não tem status; data_fim nulo = em vigor
         AND (c.data_fim IS NULL OR c.data_fim >= DATE('now'))`
    : `SELECT id, fracao_ideal, area_m2
       FROM imoveis
       WHERE uso_pessoal = 0 AND financiado = 0`;

  return consultar<{ id: number; fracao_ideal?: number; area_m2?: number }>(
    db,
    query,
    [],
  );
}

/** Calcular percentual de rateio por imóvel (fração ideal ou m²) */
function calcularRateioPorImovel(
  imoveis: Array<{ id: number; fracao_ideal?: number; area_m2?: number }>,
): Array<{ imovel_id: number; criterio: string; percentual: number }> {
  // Escolher critério: tentar fração ideal, fallback para m²
  const tem_fracao = imoveis.some((i) => i.fracao_ideal);
  const criterio = tem_fracao ? "fracao_ideal" : "area_m2";

  const campo_rateio = criterio === "fracao_ideal" ? "fracao_ideal" : "area_m2";
  const total = imoveis.reduce((sum, i) => sum + (i[campo_rateio] || 0), 0);

  if (total <= 0) {
    // Fallback: rateio igual
    const percentual_igual = 100 / imoveis.length;
    return imoveis.map((i) => ({
      imovel_id: i.id,
      criterio: "igual",
      percentual: percentual_igual,
    }));
  }

  return imoveis.map((i) => ({
    imovel_id: i.id,
    criterio,
    percentual: ((i[campo_rateio] || 0) / total) * 100,
  }));
}

/** Processar documento e gerar rateios automáticos */
export function processarDocumentoRateio(
  db: Database,
  documento_id: number,
  entidade_id: number,
  periodo_id: number,
): RateioDocumento | null {
  // 1. Obter dados do documento
  const [documento] = consultar<{
    tipo: string;
    valor: number;
    data_documento: string;
    cnpj_cpf_contraparte: string;
  }>(
    db,
    `SELECT tipo, valor, data_documento, cnpj_cpf_contraparte
     FROM documentos WHERE id = ?`,
    [documento_id],
  );

  if (!documento || !documento.valor || documento.valor <= 0) {
    return null;
  }

  // 2. Mapear tipo de documento para categoria contábil
  const tipos_rateio: Record<string, string> = {
    boleto: "condominio", // Padrão: boleto de condomínio
    fatura: "condominio",
    nota_fiscal: "condominio",
  };

  const tipo_rateio = (tipos_rateio[documento.tipo] || "manutencao") as
    | "condominio"
    | "agua"
    | "energia"
    | "internet"
    | "manutencao";

  // 3. Obter imóveis e calcular rateio
  const imoveis = obterImoveisParaRateio(db, true);
  const rateio_percentuais = calcularRateioPorImovel(imoveis);

  const rateios_por_imovel = rateio_percentuais.map((r) => ({
    imovel_id: r.imovel_id,
    criterio: (r.criterio === "igual" ? "fracao_ideal" : r.criterio) as "fracao_ideal" | "area_m2",
    percentual: r.percentual,
    valor_rateado: (documento.valor * r.percentual) / 100,
  }));

  // 4. Registrar despesa total no ledger
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTA_DESPESA_POR_TIPO_RATEIO[tipo_rateio],
    data_lancamento: documento.data_documento || new Date().toISOString().split("T")[0],
    valor_debito: documento.valor,
    descricao: `Despesa comum ${tipo_rateio} - ${documento.cnpj_cpf_contraparte}`,
    origem_modulo: "rateios",
    origem_id: documento_id,
    referencia_documento: `DOC-${documento_id}-DESP`,
  });

  // 5. Registrar rateio por imóvel (crédito em receita esperada).
  //
  // ACHADO (gravidade GRAVE, corrigido): `origem_id` gravava `documento_id` — o MESMO
  // valor para todo imóvel rateado do mesmo documento. Como `idx_ledger_origem_unica`
  // (schema.sql) é UNIQUE(origem_modulo, origem_id, conta_id) para linhas vivas, e todo
  // imóvel aqui usa a mesma `conta_id` (CONTA_RATEIO_RECEITA), a partir do SEGUNDO imóvel
  // rateado do mesmo documento o INSERT falhava com "UNIQUE constraint failed" — ou seja,
  // `processarDocumentoRateio` nunca funcionou para o caso mais comum do próprio módulo
  // (uma fatura de condomínio rateada entre vários imóveis). Confirmado rodando contra
  // `criarBancoDeTeste()`: com 1 imóvel passava, com 2+ quebrava.
  //
  // A pista de que `origem_id` deveria ser o imóvel, não o documento, já estava no
  // PRÓPRIO arquivo: `relatorioRateiosRealizados()`, logo abaixo, já filtra
  // `origem_id = i.id` (o id do imóvel) para somar este mesmo tipo de lançamento — e
  // `alocarRateiosaoCentro()` (alocacao-centros-custo.ts, o módulo irmão que este rateio
  // deveria alimentar) já busca `WHERE origem_modulo = 'rateios' AND origem_id = ?
  // [imovel_id]`. Os dois módulos concordavam sobre a convenção; só o INSERT aqui
  // divergia. Corrigido para `origem_id: rateio.imovel_id` — a rastreabilidade até o
  // documento-fonte continua garantida por `referencia_documento`
  // (`DOC-${documento_id}-RAT-${imovel_id}`), que é único por (documento, imóvel).
  //
  // Limitação residual (NÃO corrigida — fora do escopo destes 2 arquivos): rodar
  // `processarDocumentoRateio` de novo para o MESMO imóvel num período diferente (ex:
  // condomínio do mês seguinte) ainda colide no mesmo índice, porque ele não inclui
  // `periodo_id` na chave de unicidade — a mesma limitação existente hoje em outros
  // módulos já em produção (ex: `contabilizarJurosMora` em integracao-inadimplencia.ts,
  // que também repete `origem_id: contrato_id` na mesma conta a cada chamada). Resolver
  // isso de vez exigiria mudar `idx_ledger_origem_unica` em schema.sql — uma decisão de
  // modelagem do razão inteiro, não uma correção isolada de automacao-rateios.ts.
  // Documentado e coberto por um teste `it.fails` em automacao-rateios.test.ts.
  rateios_por_imovel.forEach((rateio) => {
    registrarLancamentoContabil(db, {
      entidade_id,
      periodo_id,
      conta_id: CONTA_RATEIO_RECEITA, // Despesa Rateada Recebível
      data_lancamento:
        documento.data_documento || new Date().toISOString().split("T")[0],
      valor_credito: rateio.valor_rateado,
      descricao: `Rateio ${tipo_rateio} (${rateio.percentual.toFixed(2)}%) - Imóvel ${rateio.imovel_id}`,
      origem_modulo: "rateios",
      origem_id: rateio.imovel_id,
      referencia_documento: `DOC-${documento_id}-RAT-${rateio.imovel_id}`,
    });
  });

  return {
    documento_id,
    tipo: tipo_rateio,
    valor_total: documento.valor,
    data_documento: documento.data_documento || new Date().toISOString().split("T")[0],
    cnpj_contraparte: documento.cnpj_cpf_contraparte || "SN",
    rateios_por_imovel,
  };
}

interface CreditoRateioAtivo {
  id: number;
  entidade_id: number;
  periodo_id: number;
  conta_id: number;
  valor_credito: number | null;
  data_lancamento: string;
  descricao: string;
  referencia_documento: string;
}

/** O crédito "rateio a receber" (por imóvel) que `processarDocumentoRateio` já lançou
 * neste período para este imóvel, se ainda estiver vivo (não estornado por uma integração
 * ao aluguel anterior). É o que `integrarRateioAoAluguel` reclassifica — ver o comentário
 * dela para o desenho completo. `ORDER BY id DESC LIMIT 1` porque, dentro do período, só
 * pode haver um vivo por imóvel (a própria unicidade de `processarDocumentoRateio` — ver
 * comentário dela — garante isso; a limitação residual de repetir para o MESMO imóvel em
 * períodos diferentes não se aplica aqui porque já filtramos por `periodo_id`). */
function buscarCreditoRateioAtivoPorImovel(
  db: Database,
  periodo_id: number,
  imovel_id: number,
): CreditoRateioAtivo | null {
  return (
    consultar<CreditoRateioAtivo>(
      db,
      `SELECT id, entidade_id, periodo_id, conta_id, valor_credito, data_lancamento,
              descricao, referencia_documento
       FROM ledger_entries
       WHERE origem_modulo = 'rateios' AND origem_id = ? AND conta_id = ?
         AND periodo_id = ? AND estornado_por_id IS NULL
       ORDER BY id DESC LIMIT 1`,
      [imovel_id, CONTA_RATEIO_RECEITA, periodo_id],
    )[0] ?? null
  );
}

/**
 * Integrar rateio ao aluguel (reclassifica o rateio já lançado por imóvel para
 * "componente do aluguel" por contrato — não cria receita nova).
 *
 * ACHADO 1 (gravidade GRAVE, corrigido): `entidade_id`/`periodo_id` eram literais fixos
 * (1 e 1, "Padrão; em produção viria de contexto") em vez de parâmetros — qualquer chamada
 * para uma entidade ou período diferente de 1 gravava o lançamento na entidade/período
 * ERRADOS, silenciosamente (nenhum erro, nenhum aviso; o lançamento só aparece no razão
 * de outra entidade/período). `automatizarRateioPorDocumento` já recebe `entidade_id` e
 * `periodo_id` corretos do chamador — só não os repassava para esta função. Corrigido
 * recebendo os dois como parâmetros, coberto em automacao-rateios.test.ts.
 *
 * ACHADOS 2 e 3 (gravidade GRAVE, agora corrigidos JUNTOS — a raiz era a mesma desenho
 * errado, não dois defeitos independentes): a versão anterior desta função lançava um
 * CRÉDITO NOVO em CONTA_RATEIO_RECEITA (mesma conta que `processarDocumentoRateio` já
 * credita por imóvel), sem nenhuma perna de débito. Isso causava dois problemas ao mesmo
 * tempo: (2) colisão de `origem_id` em `idx_ledger_origem_unica` quando `contrato_id`
 * coincidia numericamente com algum `imovel_id` já usado (sequências autoincrement
 * independentes — reproduzido com um teste de 2 imóveis simples); e (3), mais grave: o
 * pipeline completo (`automatizarRateioPorDocumento`) credita o MESMO valor DUAS VEZES por
 * imóvel com contrato ativo — uma vez como "recebível" (`processarDocumentoRateio`), outra
 * como "componente de aluguel" (esta função) — sem débito de contrapartida na segunda,
 * desbalanceando o período no valor total rateado (SOMA(débito) ≠ SOMA(crédito), e
 * `encerrarPeriodo`/`validarBalanceamento` em ledger.ts nunca fecham esse período).
 *
 * DECISÃO DE DESIGN (esta tarefa): as duas funções não descrevem dois eventos econômicos
 * diferentes — descrevem o MESMO evento visto de dois ângulos. `processarDocumentoRateio`
 * já lança o par completo e balanceado (débito na despesa + crédito em
 * CONTA_RATEIO_RECEITA, por imóvel — ver comentário dela). "Integrar ao aluguel" não é
 * criar receita nova: é RECLASSIFICAR esse crédito já lançado, trocando o rótulo de
 * "rateio a receber (por imóvel)" para "componente do valor único do aluguel (por
 * contrato)" — o mesmo dinheiro, a mesma conta (o plano real só tem uma, CONTA_RATEIO_RECEITA
 * — ver comentário dela), outro recorte. Por isso `integrarRateioAoAluguel` passou a seguir
 * exatamente o desenho de `reclassificarTransacao.ts` (estorna a perna antiga, relança a
 * nova, nunca dá UPDATE): 1) busca o crédito vivo de `processarDocumentoRateio` para este
 * imóvel neste período (`buscarCreditoRateioAtivoPorImovel`); 2) estorna essa linha
 * (débito = o crédito original, mesma conta); 3) relança um crédito do MESMO valor,
 * marcado como componente do aluguel deste contrato. O par estorno+relançamento é sempre
 * balanceado por construção (débito X seguido de crédito X, mesmo valor) — não importa se
 * o valor absoluto é grande ou pequeno, a soma do período não se move. É o motivo de esta
 * função agora IGNORAR seu próprio parâmetro `valor_rateio_adicional` como o valor a
 * creditar: o valor que conta é sempre `credito.valor_credito` (o que já está lançado);
 * `valor_rateio_adicional` vira só uma validação — se não bater com o que está lançado
 * (dentro de 1 centavo), a chamada é recusada (`false`), para nunca reclassificar o valor
 * errado silenciosamente.
 *
 * Como o estorno e o relançamento usam `origem_modulo: 'manual'`, e `idx_ledger_origem_unica`
 * (schema.sql) exclui QUALQUER linha com `origem_modulo = 'manual'` da checagem de
 * unicidade, o ACHADO 2 (colisão `contrato_id`/`imovel_id`) desaparece por construção — não
 * precisa mais de `OFFSET_ORIGEM_ALUGUEL` (removido). Por não competir com a faixa de
 * `origem_id` de 'rateios', as duas pernas de reclassificação usam `origem_id: imovel_id`
 * (não `contrato_id`) — o contrato fica registrado em `descricao`/`referencia_documento`,
 * e isso é o que permite ao relatório (`relatorioRateiosRealizados`, ver comentário dela)
 * encontrar a perna de débito por imóvel para popular `valor_rateio_recebido` (ACHADO
 * daquela função, corrigido junto nesta tarefa).
 *
 * CONSEQUÊNCIA DO DESENHO: esta função deixou de poder criar um crédito "do nada" — só
 * reclassifica um crédito que `processarDocumentoRateio` já lançou. Chamá-la para um
 * imóvel/período sem esse crédito vivo (ex: antes de rodar `processarDocumentoRateio`, ou
 * depois de já ter reclassificado o mesmo crédito uma vez) retorna `false` sem gravar
 * nada — não é um evento novo por si só, então não há o que fazer sem o crédito de origem.
 * Coberto em automacao-rateios.test.ts, junto com a prova de balanceamento (antigo
 * `it.fails`, promovido a `it` nesta correção).
 */
export function integrarRateioAoAluguel(
  db: Database,
  entidade_id: number,
  periodo_id: number,
  contrato_id: number,
  imovel_id: number,
  valor_rateio_adicional: number,
  descricao_rateio: string,
): boolean {
  if (valor_rateio_adicional <= 0) return false;

  const [contrato] = consultar<{ valor_referencia: number }>(
    db,
    "SELECT valor_referencia FROM contratos_locacao WHERE id = ?",
    [contrato_id],
  );

  if (!contrato) return false;

  const credito = buscarCreditoRateioAtivoPorImovel(db, periodo_id, imovel_id);
  if (!credito) return false;

  const valorCreditado = credito.valor_credito ?? 0;
  if (Math.abs(valorCreditado - valor_rateio_adicional) > 0.01) return false;

  // 1) Estornar o crédito "rateio a receber" original (mesma conta, débito ↔ crédito
  //    invertidos) — mesmo padrão de reclassificarTransacao.ts: nunca UPDATE num
  //    lançamento existente.
  const estorno_id = registrarLancamentoContabil(db, {
    entidade_id: credito.entidade_id,
    periodo_id: credito.periodo_id,
    conta_id: credito.conta_id,
    data_lancamento: credito.data_lancamento,
    valor_debito: valorCreditado,
    descricao: `ESTORNO (reclassificação p/ componente de aluguel, contrato ${contrato_id}): ${credito.descricao}`,
    origem_modulo: "manual",
    origem_id: imovel_id,
    referencia_documento: `${credito.referencia_documento}-RECLASS-EST`,
  });
  executar(
    db,
    "UPDATE ledger_entries SET estornado_por_id = ?, motivo_estorno = ? WHERE id = ?",
    [
      estorno_id,
      `Reclassificado como componente do aluguel do contrato ${contrato_id}`,
      credito.id,
    ],
  );

  // 2) Relançar o MESMO valor como componente de aluguel do contrato — o par
  //    estorno+relançamento fecha balanceado por construção (débito X, crédito X).
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTA_RATEIO_RECEITA,
    data_lancamento: credito.data_lancamento,
    valor_credito: valorCreditado,
    descricao: `${descricao_rateio} - Contrato ${contrato_id}`,
    origem_modulo: "manual",
    origem_id: imovel_id,
    referencia_documento: `${credito.referencia_documento}-RECLASS-CT${contrato_id}`,
  });

  return true;
}

/**
 * Relatório: Rateios realizados vs esperados (reconciliação).
 *
 * ACHADO (gravidade GRAVE, corrigido nesta tarefa): o lado "esperado" referenciava
 * `conta_id IN (25, 26)`, os mesmos ids fictícios corrigidos no topo do arquivo — corrigido
 * para `CONTA_RATEIO_RECEITA` (4103), a mesma conta que `processarDocumentoRateio` e
 * `integrarRateioAoAluguel` gravam de fato — e ganhou o filtro `origem_modulo = 'rateios'`
 * (ver abaixo o motivo).
 *
 * O lado "recebido" (`valor_rateio_recebido`) buscava débito em `conta_id = 2` (também
 * fictícia) com `referencia_documento LIKE 'DOC-%RAT-%'` — um padrão que NENHUMA função
 * gravava: as únicas linhas com essa referência eram de CRÉDITO (processarDocumentoRateio),
 * então `valor_rateio_recebido` era sempre 0 e `divergencia` sempre igual a
 * `valor_rateio_esperado`. Faltava o próprio EVENTO "recebido", não só o id da conta —
 * ver ACHADO 3 do comentário de `integrarRateioAoAluguel`.
 *
 * Corrigido junto com aquele achado, pela mesma causa: agora que `integrarRateioAoAluguel`
 * reclassifica (estorna o crédito "a receber" por imóvel e relança como "componente de
 * aluguel", ambas as pernas com `origem_modulo: 'manual'` e `origem_id: imovel_id` — ver
 * comentário dela), a perna de ESTORNO é literalmente um débito em CONTA_RATEIO_RECEITA
 * marcado por imóvel: o evento "recebido" que faltava. `valor_rateio_recebido` passou a
 * somar esse débito (`origem_modulo = 'manual'`), e `valor_rateio_esperado` ganhou o filtro
 * `origem_modulo = 'rateios'` para não somar de volta o crédito de relançamento (que usa o
 * mesmo `origem_id` por construção, mas é 'manual', não 'rateios' — sem esse filtro,
 * `esperado` dobraria de valor depois de toda integração ao aluguel). Com isso:
 * `valor_rateio_esperado` = total historicamente rateado a este imóvel (não muda com a
 * reclassificação); `valor_rateio_recebido` = quanto desse total já foi absorvido no
 * aluguel do contrato; `divergencia` = o que ainda está "solto" como rateio a receber,
 * ainda não integrado a nenhum contrato. Antigo teste `it.fails` promovido a `it`.
 */
export function relatorioRateiosRealizados(
  db: Database,
  periodo_id: number,
): Array<{
  imovel_id: number;
  apelido: string;
  valor_rateio_esperado: number;
  valor_rateio_recebido: number;
  divergencia: number;
}> {
  return consultar<{
    imovel_id: number;
    apelido: string;
    valor_rateio_esperado: number;
    valor_rateio_recebido: number;
    divergencia: number;
  }>(
    db,
    `SELECT
      i.id as imovel_id,
      i.apelido,
      COALESCE((
        SELECT SUM(valor_credito)
        FROM ledger_entries
        WHERE periodo_id = ? AND conta_id = ${CONTA_RATEIO_RECEITA}
          AND origem_modulo = 'rateios' AND origem_id = i.id
      ), 0) as valor_rateio_esperado,
      COALESCE((
        SELECT SUM(valor_debito)
        FROM ledger_entries
        WHERE periodo_id = ? AND conta_id = ${CONTA_RATEIO_RECEITA}
          AND origem_modulo = 'manual' AND origem_id = i.id
      ), 0) as valor_rateio_recebido,
      (COALESCE((
        SELECT SUM(valor_credito)
        FROM ledger_entries
        WHERE periodo_id = ? AND conta_id = ${CONTA_RATEIO_RECEITA}
          AND origem_modulo = 'rateios' AND origem_id = i.id
      ), 0) - COALESCE((
        SELECT SUM(valor_debito)
        FROM ledger_entries
        WHERE periodo_id = ? AND conta_id = ${CONTA_RATEIO_RECEITA}
          AND origem_modulo = 'manual' AND origem_id = i.id
      ), 0)) as divergencia
     FROM imoveis i
     WHERE i.uso_pessoal = 0 AND i.financiado = 0
     ORDER BY i.apelido`,
    [periodo_id, periodo_id, periodo_id, periodo_id],
  );
}

/** Automatizar rateio completo: documento → alocação → integração ao contrato */
export function automatizarRateioPorDocumento(
  db: Database,
  documento_id: number,
  entidade_id: number,
  periodo_id: number,
): { sucesso: boolean; imoveis_alocados: number; valor_total: number } {
  const rateio_resultado = processarDocumentoRateio(
    db,
    documento_id,
    entidade_id,
    periodo_id,
  );

  if (!rateio_resultado) {
    return { sucesso: false, imoveis_alocados: 0, valor_total: 0 };
  }

  // Integrar aos contratos de cada imóvel rateado
  let imoveis_processados = 0;

  rateio_resultado.rateios_por_imovel.forEach((rateio) => {
    // Obter contrato ativo para este imóvel
    const [contrato] = consultar<{ id: number }>(
      db,
      `SELECT id FROM contratos_locacao
       -- contrato vigente: contratos_locacao não tem status; data_fim nulo = em vigor
       WHERE imovel_id = ? AND (data_fim IS NULL OR data_fim >= DATE('now'))
       LIMIT 1`,
      [rateio.imovel_id],
    );

    if (contrato) {
      integrarRateioAoAluguel(
        db,
        entidade_id,
        periodo_id,
        contrato.id,
        rateio.imovel_id,
        rateio.valor_rateado,
        `${rateio_resultado.tipo} (${rateio.percentual.toFixed(2)}%)`,
      );
      imoveis_processados++;
    }
  });

  return {
    sucesso: true,
    imoveis_alocados: imoveis_processados,
    valor_total: rateio_resultado.valor_total,
  };
}
