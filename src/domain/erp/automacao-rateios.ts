/**
 * Automação de Rateios: Alocação Automática de Despesas Comuns
 * Documento (Fatura Condomínio) → Reconhecimento de Despesa → Rateio Automático por Fração/m²
 * Resultado: Despesa Rateada integrada ao aluguel do mês
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
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

// Ver ACHADO 2 no comentário de integrarRateioAoAluguel: deslocamento para manter
// `origem_id` desse evento (por contrato) fora do espaço de `origem_id` usado pelo
// crédito de processarDocumentoRateio (por imóvel), evitando colisão em
// idx_ledger_origem_unica quando as duas sequências de id coincidem numericamente.
const OFFSET_ORIGEM_ALUGUEL = 900_000_000;

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

/**
 * Integrar rateio ao aluguel esperado (aumenta receita esperada).
 *
 * ACHADO 1 (gravidade GRAVE, corrigido): `entidade_id`/`periodo_id` eram literais fixos
 * (1 e 1, "Padrão; em produção viria de contexto") em vez de parâmetros — qualquer chamada
 * para uma entidade ou período diferente de 1 gravava o lançamento na entidade/período
 * ERRADOS, silenciosamente (nenhum erro, nenhum aviso; o lançamento só aparece no razão
 * de outra entidade/período). `automatizarRateioPorDocumento` já recebe `entidade_id` e
 * `periodo_id` corretos do chamador — só não os repassava para esta função. Corrigido
 * recebendo os dois como parâmetros, coberto em automacao-rateios.test.ts.
 *
 * ACHADO 2 (gravidade GRAVE, corrigido): `origem_id` gravava `imovel_id` — o MESMO valor
 * que `processarDocumentoRateio` já grava para o crédito de "despesa rateada a receber"
 * NA MESMA CONTA (CONTA_RATEIO_RECEITA). Como `automatizarRateioPorDocumento` chama as
 * duas funções em sequência para o mesmo imóvel, a segunda sempre colidia em
 * `idx_ledger_origem_unica` (mesmo `origem_modulo`+`origem_id`+`conta_id` de uma linha já
 * viva) — o pipeline completo (rateio → alocação → integração ao contrato, a função que dá
 * nome a este achado) nunca terminava para nenhum imóvel com contrato ativo.
 *
 * Tentativa 1 (insuficiente): trocar para `origem_id: contrato_id`, já que este evento é
 * sobre o CONTRATO, não o imóvel isolado. Continua colidindo na prática: `imoveis` e
 * `contratos_locacao` são sequências autoincrement INDEPENDENTES, e num sistema onde a
 * maioria dos imóveis tem um único contrato (o caso típico deste produto), `contrato_id`
 * e `imovel_id` coincidem numericamente com frequência (ex: os dois primeiros registros
 * de cada tabela são ambos id=1) — reproduzido com um teste de 2 imóveis simples.
 *
 * Correção efetiva: somar um deslocamento fixo (`OFFSET_ORIGEM_ALUGUEL`) bem acima de
 * qualquer id real que este sistema de uso pessoal chegue a ter, criando um espaço de
 * `origem_id` disjunto do usado por `processarDocumentoRateio`. `origem_id` não tem FK
 * (é convenção, não `REFERENCES` — ver comentário de `ledger_entries` em schema.sql: "PK
 * da tabela de origem", sem constraint), então isso não quebra nenhuma leitura que já
 * existe; e este é o único lugar do arquivo que credita nesta conta a partir de um
 * contrato (em vez de um imóvel), então o deslocamento não precisa ser desfeito em
 * nenhuma outra query. É um contorno, não uma modelagem definitiva — a solução correta
 * seria dar a este evento sua própria conta no plano compartilhado ou incluir
 * `periodo_id`/um discriminador na chave do índice, mudança fora do escopo isolado
 * destes 2 arquivos (ver ACHADO 3).
 *
 * ACHADO 3 (gravidade GRAVE, NÃO corrigido — decisão de produto fora deste escopo): esta
 * função grava só a perna de CRÉDITO (`valor_credito`), sem nenhuma perna de débito
 * correspondente. `validarBalanceamento`/`encerrarPeriodo` (ledger.ts) exigem SOMA(débito)
 * = SOMA(crédito) do período inteiro para fechar — todo período com uma integração de
 * rateio ao aluguel fica desbalanceado por este valor e nunca fecha. Pior: como
 * `automatizarRateioPorDocumento` chama esta função LOGO DEPOIS de
 * `processarDocumentoRateio` já ter creditado o mesmo `rateio.valor_rateado` (na conta de
 * "despesa rateada a receber", por imóvel), o pipeline completo credita o MESMO valor
 * DUAS VEZES por imóvel com contrato ativo — uma vez como "recebível" (origem_id=imóvel),
 * outra como "componente de aluguel" (origem_id=contrato) — sem nenhum débito ou reversão
 * ligando as duas. Corrigir de verdade exige decidir: (a) se a segunda perna deveria
 * RECLASSIFICAR/reverter a primeira em vez de somar um crédito novo, e (b) qual conta de
 * contrapartida (débito) fecha o par — nos dois casos, uma decisão de modelagem contábil
 * que toca o plano de contas COMPARTILHADO (contas_plano_contas/planoDeContasErp.ts, em
 * edição por outros agentes agora), não uma correção isolada destes 2 arquivos.
 * Documentado e coberto por um teste `it.fails` em automacao-rateios.test.ts que prova o
 * desbalanceamento e a duplicidade, para não regredir silenciosamente se alguém "corrigir"
 * só a superfície.
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

  // Registrar crédito adicional ao aluguel (rateio como componente do valor único mensal)
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: CONTA_RATEIO_RECEITA, // Despesa Rateada Componente de Aluguel
    data_lancamento: new Date().toISOString().split("T")[0],
    valor_credito: valor_rateio_adicional,
    descricao: `${descricao_rateio} - Contrato ${contrato_id}`,
    origem_modulo: "rateios",
    origem_id: OFFSET_ORIGEM_ALUGUEL + contrato_id,
    referencia_documento: `CT-${contrato_id}-RAT-ADD`,
  });

  return true;
}

/**
 * Relatório: Rateios realizados vs esperados (reconciliação).
 *
 * ACHADO (gravidade GRAVE, parcialmente corrigido): o lado "esperado" referenciava
 * `conta_id IN (25, 26)`, os mesmos ids fictícios corrigidos no topo do arquivo — corrigido
 * aqui para `CONTA_RATEIO_RECEITA` (4103), a mesma conta que `processarDocumentoRateio`
 * e `integrarRateioAoAluguel` agora gravam de fato.
 *
 * O lado "recebido" (`valor_rateio_recebido`) permanece NÃO corrigido: buscava débito em
 * `conta_id = 2`, que também não existe em `contas_plano_contas` — mas trocar o id sozinho
 * não teria efeito real, porque NENHUMA função deste módulo (nem de nenhum outro, hoje)
 * grava uma perna de DÉBITO com `referencia_documento LIKE 'DOC-%RAT-%'`: as duas únicas
 * gravações com esse padrão de referência são de CRÉDITO (passo 5 de
 * processarDocumentoRateio). Ou seja, `valor_rateio_recebido` é sempre 0 e `divergencia`
 * sempre igual a `valor_rateio_esperado`, qualquer que seja a conta usada — não é só um id
 * errado, é uma metade do relatório sem nenhum evento real que a alimente (precisaria de
 * uma decisão de produto: qual evento — conciliação bancária? confirmação de pagamento? —
 * conta como "rateio efetivamente recebido"). Documentado e coberto por um teste
 * `it.fails` em automacao-rateios.test.ts.
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
          AND origem_id = i.id
      ), 0) as valor_rateio_esperado,
      COALESCE((
        SELECT SUM(valor_debito)
        FROM ledger_entries
        WHERE periodo_id = ? AND conta_id = 2
          AND referencia_documento LIKE 'DOC-%RAT-%'
      ), 0) as valor_rateio_recebido,
      (COALESCE((
        SELECT SUM(valor_credito)
        FROM ledger_entries
        WHERE periodo_id = ? AND conta_id = ${CONTA_RATEIO_RECEITA}
          AND origem_id = i.id
      ), 0) - COALESCE((
        SELECT SUM(valor_debito)
        FROM ledger_entries
        WHERE periodo_id = ? AND conta_id = 2
          AND referencia_documento LIKE 'DOC-%RAT-%'
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
