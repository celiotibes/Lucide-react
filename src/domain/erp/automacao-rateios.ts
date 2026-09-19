/**
 * Automação de Rateios: Alocação Automática de Despesas Comuns
 * Documento (Fatura Condomínio) → Reconhecimento de Despesa → Rateio Automático por Fração/m²
 * Resultado: Despesa Rateada integrada ao aluguel do mês
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import { registrarLancamentoContabil } from "./ledger";

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
  const mapa_contas: Record<string, number> = {
    condominio: 20,
    agua: 21,
    energia: 22,
    internet: 23,
    manutencao: 24,
  };

  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    conta_id: mapa_contas[tipo_rateio],
    data_lancamento: documento.data_documento || new Date().toISOString().split("T")[0],
    valor_debito: documento.valor,
    descricao: `Despesa comum ${tipo_rateio} - ${documento.cnpj_cpf_contraparte}`,
    origem_modulo: "rateios",
    origem_id: documento_id,
    referencia_documento: `DOC-${documento_id}-DESP`,
  });

  // 5. Registrar rateio por imóvel (crédito em receita esperada)
  rateios_por_imovel.forEach((rateio) => {
    registrarLancamentoContabil(db, {
      entidade_id,
      periodo_id,
      conta_id: 25, // Despesa Rateada Recebível
      data_lancamento:
        documento.data_documento || new Date().toISOString().split("T")[0],
      valor_credito: rateio.valor_rateado,
      descricao: `Rateio ${tipo_rateio} (${rateio.percentual.toFixed(2)}%) - Imóvel ${rateio.imovel_id}`,
      origem_modulo: "rateios",
      origem_id: documento_id,
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

/** Integrar rateio ao aluguel esperado (aumenta receita esperada) */
export function integrarRateioAoAluguel(
  db: Database,
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

  // Registrar crédito adicional ao aluguel (Conta 26 - Rateio como componente)
  registrarLancamentoContabil(db, {
    entidade_id: 1, // Padrão; em produção viria de contexto
    periodo_id: 1, // Padrão; em produção viria de contexto
    conta_id: 26, // Despesa Rateada Componente de Aluguel
    data_lancamento: new Date().toISOString().split("T")[0],
    valor_credito: valor_rateio_adicional,
    descricao: `${descricao_rateio} - Contrato ${contrato_id}`,
    origem_modulo: "rateios",
    origem_id: imovel_id,
    referencia_documento: `CT-${contrato_id}-RAT-ADD`,
  });

  return true;
}

/** Relatório: Rateios realizados vs esperados (reconciliação) */
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
        WHERE periodo_id = ? AND conta_id IN (25, 26)
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
        WHERE periodo_id = ? AND conta_id IN (25, 26)
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
