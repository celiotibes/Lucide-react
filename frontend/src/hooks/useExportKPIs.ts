/**
 * Export KPIs to Multiple Formats
 * Supports CSV, JSON, and formatted text
 */

import { FinancialKPIs } from '../types/bi';

interface ExportOptions {
  includeMetadata?: boolean;
  includeTrend?: boolean;
  format?: 'csv' | 'json' | 'tsv';
}

/**
 * Hook para exportar KPIs em diferentes formatos
 */
export const useExportKPIs = () => {
  /**
   * Exportar KPIs para CSV
   */
  const exportToCSV = (
    kpis: FinancialKPIs,
    filters: { startDate: Date; endDate: Date; categories: string[] },
    filename: string = 'kpis-export.csv'
  ) => {
    const rows: string[] = [];

    // Header com metadados
    rows.push('# KPI Export Report');
    rows.push(`# Generated: ${new Date().toISOString()}`);
    rows.push(`# Date Range: ${filters.startDate.toLocaleDateString()} to ${filters.endDate.toLocaleDateString()}`);
    rows.push(`# Categories: ${filters.categories.join(', ') || 'All'}`);
    rows.push('');

    // Cabeçalhos da tabela
    rows.push(
      'KPI Name,Current Value,Previous Value,Unit,Trend,Trend %,Status,Last Updated'
    );

    // Dados dos KPIs
    const kpiEntries = Object.entries(kpis);
    kpiEntries.forEach(([_, kpi]) => {
      const row = [
        `"${kpi.name}"`,
        kpi.value.toLocaleString('pt-BR'),
        kpi.previousValue.toLocaleString('pt-BR'),
        kpi.unit === 'currency' ? 'R$' : kpi.unit,
        kpi.trend.toUpperCase(),
        `${kpi.trendPercentage.toFixed(2)}%`,
        kpi.status.toUpperCase(),
        new Date(kpi.lastUpdated).toLocaleDateString('pt-BR'),
      ].join(',');
      rows.push(row);
    });

    // Salvar arquivo
    const csv = rows.join('\n');
    downloadFile(csv, filename, 'text/csv;charset=utf-8;');
  };

  /**
   * Exportar KPIs para JSON
   */
  const exportToJSON = (
    kpis: FinancialKPIs,
    filters: { startDate: Date; endDate: Date; categories: string[] },
    filename: string = 'kpis-export.json'
  ) => {
    const data = {
      exportedAt: new Date().toISOString(),
      filters: {
        dateRange: {
          start: filters.startDate.toISOString(),
          end: filters.endDate.toISOString(),
        },
        categories: filters.categories,
      },
      kpis,
    };

    const json = JSON.stringify(data, null, 2);
    downloadFile(json, filename, 'application/json;charset=utf-8;');
  };

  /**
   * Exportar KPIs para TSV (Tab-Separated Values)
   */
  const exportToTSV = (
    kpis: FinancialKPIs,
    filters: { startDate: Date; endDate: Date; categories: string[] },
    filename: string = 'kpis-export.tsv'
  ) => {
    const rows: string[] = [];

    // Headers
    rows.push(
      'KPI Name\tCurrent Value\tPrevious Value\tUnit\tTrend\tTrend %\tStatus\tLast Updated'
    );

    // Data
    const kpiEntries = Object.entries(kpis);
    kpiEntries.forEach(([_, kpi]) => {
      const row = [
        kpi.name,
        kpi.value.toLocaleString('pt-BR'),
        kpi.previousValue.toLocaleString('pt-BR'),
        kpi.unit === 'currency' ? 'R$' : kpi.unit,
        kpi.trend.toUpperCase(),
        `${kpi.trendPercentage.toFixed(2)}%`,
        kpi.status.toUpperCase(),
        new Date(kpi.lastUpdated).toLocaleDateString('pt-BR'),
      ].join('\t');
      rows.push(row);
    });

    const tsv = rows.join('\n');
    downloadFile(tsv, filename, 'text/tab-separated-values;charset=utf-8;');
  };

  /**
   * Gerar relatório formatado em texto
   */
  const exportToText = (
    kpis: FinancialKPIs,
    filters: { startDate: Date; endDate: Date; categories: string[] }
  ): string => {
    const lines: string[] = [];

    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('                     RELATÓRIO DE KPIs');
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`Data de Geração: ${new Date().toLocaleString('pt-BR')}`);
    lines.push(
      `Período: ${filters.startDate.toLocaleDateString('pt-BR')} a ${filters.endDate.toLocaleDateString('pt-BR')}`
    );
    lines.push(`Categorias: ${filters.categories.join(', ') || 'Todas'}`);
    lines.push('');
    lines.push('───────────────────────────────────────────────────────────');

    const kpiEntries = Object.entries(kpis);
    kpiEntries.forEach(([_, kpi]) => {
      lines.push('');
      lines.push(`📊 ${kpi.name}`);
      lines.push(`   Valor Atual:      R$ ${kpi.value.toLocaleString('pt-BR')}`);
      lines.push(`   Valor Anterior:   R$ ${kpi.previousValue.toLocaleString('pt-BR')}`);
      lines.push(`   Tendência:        ${kpi.trend === 'up' ? '📈 Crescimento' : kpi.trend === 'down' ? '📉 Queda' : '➡️ Estável'} (${kpi.trendPercentage.toFixed(2)}%)`);
      lines.push(`   Status:           ${getStatusLabel(kpi.status)}`);
      lines.push(`   Última Atualização: ${new Date(kpi.lastUpdated).toLocaleString('pt-BR')}`);
    });

    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════');

    return lines.join('\n');
  };

  /**
   * Copiar relatório para clipboard
   */
  const copyToClipboard = async (
    kpis: FinancialKPIs,
    filters: { startDate: Date; endDate: Date; categories: string[] }
  ) => {
    const text = exportToText(kpis, filters);
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.error('Erro ao copiar para clipboard:', error);
      return false;
    }
  };

  return {
    exportToCSV,
    exportToJSON,
    exportToTSV,
    exportToText,
    copyToClipboard,
  };
};

// Helper function
const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    success: '✅ Excelente',
    warning: '⚠️ Atenção',
    error: '❌ Crítico',
    danger: '❌ Perigoso',
    neutral: '➖ Neutral',
  };
  return labels[status] || status;
};

export default useExportKPIs;
