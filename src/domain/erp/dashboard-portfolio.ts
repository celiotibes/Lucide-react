/**
 * Dashboard de Portfólio de Imóveis
 * Métricas e KPIs: NOI, Taxa Ocupação, ROI, Cashflow, Inadimplência
 * Integração com: imovel-gestao, integracao-contratos, integracao-rateios, ledger
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

export interface MetricaImove {
  imovel_id: number;
  endereco: string;
  valor_aquisicao: number;
  noi_mensal: number;
  noi_anual: number;
  taxa_ocupacao: number;
  roi_anual: number;
  cashflow_mensal: number;
  inadimplencia_valor: number;
  inadimplencia_percentual: number;
  dias_medio_inadimplencia: number;
}

export interface PortfolioMetrics {
  total_imoveis: number;
  valor_total: number;
  noi_mensal_total: number;
  noi_anual_total: number;
  roi_medio_anual: number;
  taxa_ocupacao_media: number;
  cashflow_mensal_total: number;
  inadimplencia_valor_total: number;
  inadimplencia_percentual_media: number;
  imoveis: MetricaImove[];
}

/**
 * Calcular NOI (Net Operating Income) de um imóvel
 * NOI = (Aluguel + Rateios) - (Condomínio + IPTU + Água + Energia + Manutenção)
 */
export function calcularNOI(db: Database, imovel_id: number, periodo_id: number): number {
  // Buscar valor de aluguel do contrato
  const contratos = consultar<{ valor_aluguel: number }>(
    db,
    `SELECT valor_aluguel FROM contratos_locacao
     WHERE imovel_id = ? AND status = 'ativo' LIMIT 1`,
    [imovel_id]
  );

  // Despesas operacionais agendadas (condomínio, água, energia, etc)
  const despesasOp = consultar<{ valor_mensal: number }>(
    db,
    `SELECT COALESCE(SUM(valor_mensal), 0) as valor_mensal
     FROM despesas_operacionais_agendadas
     WHERE imovel_id = ? AND status = 'ativa'`,
    [imovel_id]
  );

  const aluguelMensal = contratos.length > 0 ? contratos[0].valor_aluguel : 0;
  const totalDespesas = despesasOp.length > 0 ? despesasOp[0].valor_mensal : 0;

  return aluguelMensal - totalDespesas;
}

/**
 * Calcular Taxa de Ocupação
 * Taxa Ocupação = dias_ocupado / dias_mes * 100
 */
export function calcularTaxaOcupacao(db: Database, imovel_id: number, mes: number, ano: number): number {
  // Buscar contratos ativos do imóvel
  const contratos = consultar<{ id: number; data_inicio: string; data_fim?: string }>(
    db,
    `SELECT id, data_inicio, data_fim FROM contratos_locacao
     WHERE imovel_id = ? AND status IN ('ativo', 'pendente')`,
    [imovel_id]
  );

  if (!contratos || contratos.length === 0) {
    return 0;
  }

  const diasMes = new Date(ano, mes, 0).getDate();
  let diasOcupados = 0;

  for (const contrato of contratos) {
    const dataInicio = new Date(contrato.data_inicio);
    const dataFim = contrato.data_fim ? new Date(contrato.data_fim) : new Date(ano, mes, 0);

    // Ajustar datas para o mês em questão
    const mes_contrato_inicio = dataInicio.getMonth() + 1;
    const ano_contrato_inicio = dataInicio.getFullYear();

    if (mes_contrato_inicio === mes && ano_contrato_inicio === ano) {
      // Contrato começa neste mês
      diasOcupados += Math.min(
        diasMes - dataInicio.getDate() + 1,
        (dataFim.getTime() - dataInicio.getTime()) / (1000 * 60 * 60 * 24) + 1
      );
    } else if (mes_contrato_inicio < mes && dataFim) {
      // Contrato começou antes deste mês
      const mes_contrato_fim = dataFim.getMonth() + 1;
      const ano_contrato_fim = dataFim.getFullYear();

      if (ano_contrato_fim > ano || (ano_contrato_fim === ano && mes_contrato_fim >= mes)) {
        // Contrato termina neste mês ou depois
        const diaFim = mes_contrato_fim === mes && ano_contrato_fim === ano ? dataFim.getDate() : diasMes;
        diasOcupados += diaFim;
      }
    } else if (mes_contrato_inicio <= mes) {
      // Contrato sem fim definido ou termina depois deste mês
      diasOcupados += diasMes;
    }
  }

  return (diasOcupados / diasMes) * 100;
}

/**
 * Calcular ROI Anual
 * ROI = (NOI anual / valor_aquisicao) * 100
 */
export function calcularROIAnual(
  db: Database,
  imovel_id: number,
  ano: number
): number {
  // Buscar valor de aquisição do imóvel
  const imoveis = consultar<{ valor_aquisicao: number }>(
    db,
    `SELECT valor_aquisicao FROM imoveis WHERE id = ?`,
    [imovel_id]
  );

  if (!imoveis || imoveis.length === 0 || imoveis[0].valor_aquisicao <= 0) {
    return 0;
  }

  const valor_aquisicao = imoveis[0].valor_aquisicao;

  // Calcular NOI para cada período (mês) do ano
  let noiAnual = 0;
  for (let mes = 1; mes <= 12; mes++) {
    const periodos = consultar<{ id: number }>(
      db,
      `SELECT id FROM periodos_contabeis WHERE ano = ? AND mes = ? LIMIT 1`,
      [ano, mes]
    );

    if (periodos && periodos.length > 0) {
      noiAnual += calcularNOI(db, imovel_id, periodos[0].id);
    }
  }

  return (noiAnual / valor_aquisicao) * 100;
}

/**
 * Calcular Cashflow Mensal
 * Cashflow = Recebimentos - Desembolsos
 */
export function calcularCashflowMensal(db: Database, imovel_id: number, periodo_id: number): number {
  // Buscar contratos e despesas operacionais
  const contratos = consultar<{ valor_aluguel: number }>(
    db,
    `SELECT valor_aluguel FROM contratos_locacao
     WHERE imovel_id = ? AND status = 'ativo' LIMIT 1`,
    [imovel_id]
  );

  const despesasOp = consultar<{ valor_mensal: number }>(
    db,
    `SELECT COALESCE(SUM(valor_mensal), 0) as valor_mensal
     FROM despesas_operacionais_agendadas
     WHERE imovel_id = ? AND status = 'ativa'`,
    [imovel_id]
  );

  const recebimentos = contratos.length > 0 ? contratos[0].valor_aluguel : 0;
  const desembolsos = despesasOp.length > 0 ? despesasOp[0].valor_mensal : 0;

  return recebimentos - desembolsos;
}

/**
 * Calcular Inadimplência
 * Retorna valor total em atraso e percentual em relação ao aluguel
 *
 * Nota: Este é um cálculo simplificado. Em produção, deveria integrar com
 * dados de transações e recebimentos reais para calcular atrasos
 */
export function calcularInadimplencia(
  db: Database,
  imovel_id: number
): { valor_atraso: number; percentual: number; dias_medio: number } {
  // Para este MVP, retornamos 0 pois não temos informações de atraso
  // na estrutura atual de contratos. Em produção, isso seria calculado
  // comparando datas de vencimento com recebimentos efetivos.

  // Buscar contratos ativos do imóvel (apenas para validar que existem)
  const contratos = consultar<{
    id: number;
    valor_aluguel: number;
  }>(
    db,
    `SELECT id, valor_aluguel FROM contratos_locacao
     WHERE imovel_id = ? AND status = 'ativo'`,
    [imovel_id]
  );

  if (!contratos || contratos.length === 0) {
    return { valor_atraso: 0, percentual: 0, dias_medio: 0 };
  }

  // Retorno padrão: sem atrasos detectados
  // Isto será expandido quando integrar com módulo de integracao-inadimplencia
  return {
    valor_atraso: 0,
    percentual: 0,
    dias_medio: 0,
  };
}

/**
 * Obter Métrica Completa de um Imóvel
 */
export function obterMetricaImovel(
  db: Database,
  imovel_id: number,
  ano: number,
  mes: number
): MetricaImove | null {
  // Buscar dados do imóvel
  const imoveis = consultar<{ endereco: string; valor_aquisicao: number }>(
    db,
    `SELECT endereco, valor_aquisicao FROM imoveis WHERE id = ?`,
    [imovel_id]
  );

  if (!imoveis || imoveis.length === 0) {
    return null;
  }

  const imovel = imoveis[0];

  // Buscar período contábil para calcular NOI
  const periodos = consultar<{ id: number }>(
    db,
    `SELECT id FROM periodos_contabeis WHERE ano = ? AND mes = ? LIMIT 1`,
    [ano, mes]
  );

  const periodo_id = periodos && periodos.length > 0 ? periodos[0].id : 1;

  const noiMensal = calcularNOI(db, imovel_id, periodo_id);
  const noiAnual = noiMensal * 12;
  const taxaOcupacao = calcularTaxaOcupacao(db, imovel_id, mes, ano);
  const roiAnual = calcularROIAnual(db, imovel_id, ano);
  const cashflowMensal = calcularCashflowMensal(db, imovel_id, periodo_id);
  const inadimplencia = calcularInadimplencia(db, imovel_id);

  return {
    imovel_id,
    endereco: imovel.endereco,
    valor_aquisicao: imovel.valor_aquisicao,
    noi_mensal: Math.round(noiMensal * 100) / 100,
    noi_anual: Math.round(noiAnual * 100) / 100,
    taxa_ocupacao: Math.round(taxaOcupacao * 100) / 100,
    roi_anual: Math.round(roiAnual * 100) / 100,
    cashflow_mensal: Math.round(cashflowMensal * 100) / 100,
    inadimplencia_valor: Math.round(inadimplencia.valor_atraso * 100) / 100,
    inadimplencia_percentual: inadimplencia.percentual,
    dias_medio_inadimplencia: inadimplencia.dias_medio,
  };
}

/**
 * Obter Portfolio Completo com Agregações
 */
export function obterPortfolioCompleto(
  db: Database,
  entidade_id: number,
  ano: number,
  mes: number
): PortfolioMetrics {
  // Buscar todos os imóveis da entidade
  const imoveis = consultar<{ id: number }>(
    db,
    `SELECT id FROM imoveis WHERE entidade_id = ? ORDER BY id`,
    [entidade_id]
  );

  const metricas: MetricaImove[] = [];
  let totalImoveis = 0;
  let valorTotalPortfolio = 0;
  let noiMensalTotal = 0;
  let noiAnualTotal = 0;
  let taxaOcupacaoTotal = 0;
  let roiMedioAnual = 0;
  let cashflowMensalTotal = 0;
  let inadimplenciaValorTotal = 0;

  if (imoveis && imoveis.length > 0) {
    for (const imove of imoveis) {
      const metrica = obterMetricaImovel(db, imove.id, ano, mes);

      if (metrica) {
        metricas.push(metrica);
        totalImoveis++;
        valorTotalPortfolio += metrica.valor_aquisicao;
        noiMensalTotal += metrica.noi_mensal;
        noiAnualTotal += metrica.noi_anual;
        taxaOcupacaoTotal += metrica.taxa_ocupacao;
        roiMedioAnual += metrica.roi_anual;
        cashflowMensalTotal += metrica.cashflow_mensal;
        inadimplenciaValorTotal += metrica.inadimplencia_valor;
      }
    }
  }

  const roiMedio = totalImoveis > 0 ? roiMedioAnual / totalImoveis : 0;
  const taxaOcupacaoMedia = totalImoveis > 0 ? taxaOcupacaoTotal / totalImoveis : 0;

  // Calcular inadimplência percentual média
  let inadimplenciaPercentualMedia = 0;
  if (metricas.length > 0) {
    const somaPercentuais = metricas.reduce((acc, m) => acc + m.inadimplencia_percentual, 0);
    inadimplenciaPercentualMedia = somaPercentuais / metricas.length;
  }

  return {
    total_imoveis: totalImoveis,
    valor_total: Math.round(valorTotalPortfolio * 100) / 100,
    noi_mensal_total: Math.round(noiMensalTotal * 100) / 100,
    noi_anual_total: Math.round(noiAnualTotal * 100) / 100,
    roi_medio_anual: Math.round(roiMedio * 100) / 100,
    taxa_ocupacao_media: Math.round(taxaOcupacaoMedia * 100) / 100,
    cashflow_mensal_total: Math.round(cashflowMensalTotal * 100) / 100,
    inadimplencia_valor_total: Math.round(inadimplenciaValorTotal * 100) / 100,
    inadimplencia_percentual_media: Math.round(inadimplenciaPercentualMedia * 100) / 100,
    imoveis: metricas,
  };
}
