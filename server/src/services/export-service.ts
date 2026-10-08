/**
 * Export Service — Phase 22.20.2
 *
 * Service for exporting reports in multiple formats:
 * - CSV (tabular data with UTF-8 BOM)
 * - XLSX (Excel format with formatting)
 * - XML (for external integration)
 * - PDF (from jsPDF output)
 *
 * Features:
 * - Brazilian number formatting
 * - Proper charset handling
 * - File metadata tracking
 * - Hash verification
 */

import Database from 'better-sqlite3';
import XLSX from 'xlsx';
import Papa from 'papaparse';
import { convert } from 'xml2js';
import { createHash } from 'crypto';
import { logger } from './logger-service.js';

export type ExportFormat = 'csv' | 'xlsx' | 'xml' | 'pdf';

export interface ExportOptions {
  formato: ExportFormat;
  nomeArquivo: string;
  incluirCabecalho?: boolean;
  incluirMetadados?: boolean;
  separador?: string; // Para CSV
  aba?: string; // Para XLSX
}

export interface ExportResult {
  formato: ExportFormat;
  nomeArquivo: string;
  conteudo: Buffer;
  tamanhoBytes: number;
  mimeType: string;
  hashArquivo: string;
  tempoProcessamentoMs: number;
}

/**
 * Dados tabulares genéricos para exportação
 */
export interface TabularData {
  cabecalhos: string[];
  linhas: Array<Record<string, unknown>>;
  metadados?: {
    titulo: string;
    dataGeracao: string;
    periodo?: string;
    totalRegistros: number;
    [key: string]: unknown;
  };
}

/**
 * Export Service Class
 */
export class ExportService {
  private db: Database.Database;
  private mimeTypes = {
    csv: 'text/csv',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xml: 'application/xml',
    pdf: 'application/pdf',
  };

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Export data to specified format
   */
  async export(data: TabularData, options: ExportOptions): Promise<ExportResult> {
    const startTime = performance.now();

    try {
      let conteudo: Buffer;

      switch (options.formato) {
        case 'csv':
          conteudo = this.exportToCSV(data, options);
          break;
        case 'xlsx':
          conteudo = this.exportToXLSX(data, options);
          break;
        case 'xml':
          conteudo = this.exportToXML(data, options);
          break;
        case 'pdf':
          // PDF deve ser passado como buffer na função exportPdf()
          throw new Error('Use exportPdf() for PDF export');
        default:
          throw new Error(`Unsupported format: ${options.formato}`);
      }

      const tempoProcessamentoMs = Math.round(performance.now() - startTime);

      const result: ExportResult = {
        formato: options.formato,
        nomeArquivo: options.nomeArquivo,
        conteudo,
        tamanhoBytes: conteudo.length,
        mimeType: this.mimeTypes[options.formato],
        hashArquivo: this.hashContent(conteudo),
        tempoProcessamentoMs,
      };

      logger.info('[ExportService] Data exported', {
        formato: options.formato,
        tamanhoBytes: result.tamanhoBytes,
        tempoMs: tempoProcessamentoMs,
      });

      return result;
    } catch (error) {
      logger.error('[ExportService] Export failed', error);
      throw error;
    }
  }

  /**
   * Export PDF buffer as export result (wrapper)
   */
  async exportPdf(
    pdfBuffer: Buffer,
    nomeArquivo: string,
    metadados?: Record<string, unknown>
  ): Promise<ExportResult> {
    const startTime = performance.now();

    try {
      const tempoProcessamentoMs = Math.round(performance.now() - startTime);

      const result: ExportResult = {
        formato: 'pdf',
        nomeArquivo,
        conteudo: pdfBuffer,
        tamanhoBytes: pdfBuffer.length,
        mimeType: this.mimeTypes.pdf,
        hashArquivo: this.hashContent(pdfBuffer),
        tempoProcessamentoMs,
      };

      logger.info('[ExportService] PDF exported', {
        tamanhoBytes: result.tamanhoBytes,
        metadados,
      });

      return result;
    } catch (error) {
      logger.error('[ExportService] PDF export failed', error);
      throw error;
    }
  }

  /**
   * Save export to database audit trail
   */
  saveExportRecord(
    reportId: number,
    resultado: ExportResult,
    usuarioId: number,
    ipCliente: string
  ): number {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO relatorios_exports (
          relatorio_id, tipo_exportacao, nome_arquivo,
          tamanho_bytes, hash_arquivo, usuario_id, ip_cliente,
          tempo_processamento_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        reportId,
        resultado.formato,
        resultado.nomeArquivo,
        resultado.tamanhoBytes,
        resultado.hashArquivo,
        usuarioId,
        ipCliente,
        resultado.tempoProcessamentoMs
      );

      return result.lastInsertRowid as number;
    } catch (error) {
      logger.error('[ExportService] Failed to save export record', error);
      throw error;
    }
  }

  /**
   * ===== INTERNAL EXPORT METHODS =====
   */

  /**
   * Export to CSV (with UTF-8 BOM for Excel compatibility)
   */
  private exportToCSV(data: TabularData, options: ExportOptions): Buffer {
    const separador = options.separador || ',';
    const incluirCabecalho = options.incluirCabecalho !== false;

    // Montar array de arrays para Papa
    const dadosParaCSV: (string | number)[][] = [];

    // Cabeçalho
    if (incluirCabecalho) {
      dadosParaCSV.push(data.cabecalhos);
    }

    // Linhas
    for (const linha of data.linhas) {
      const row = data.cabecalhos.map((col) => {
        const valor = linha[col];
        // Formato brasileiro para números
        if (typeof valor === 'number') {
          return this.formatBrNumber(valor);
        }
        return String(valor || '');
      });
      dadosParaCSV.push(row);
    }

    // Usar Papa Parse para gerar CSV
    const csv = Papa.unparse(dadosParaCSV, {
      delimiter: separador,
      header: false,
      newline: '\n',
      quoteFields: true,
    });

    // Adicionar BOM UTF-8 para compatibilidade com Excel
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const csvBuffer = Buffer.from(csv, 'utf-8');
    return Buffer.concat([bom, csvBuffer]);
  }

  /**
   * Export to XLSX (Excel format)
   */
  private exportToXLSX(data: TabularData, options: ExportOptions): Buffer {
    const worksheet = XLSX.utils.json_to_sheet(data.linhas, {
      header: data.cabecalhos,
    });

    // Ajustar largura das colunas
    const colWidths = data.cabecalhos.map((header) => ({
      wch: Math.min(header.length + 2, 30),
    }));
    worksheet['!cols'] = colWidths;

    // Criar workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, options.aba || 'Dados');

    // Gerar buffer
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    return buffer as Buffer;
  }

  /**
   * Export to XML
   */
  private async exportToXML(data: TabularData, options: ExportOptions): Promise<Buffer> {
    // Montar estrutura XML
    const xmlObj = {
      relatorio: {
        metadados: data.metadados || {},
        dados: {
          registro: data.linhas.map((linha) => ({
            $: linha,
          })),
        },
      },
    };

    // Converter para string XML
    const xmlString = convert(xmlObj, {
      rootName: 'relatorio',
      xmldec: { version: '1.0', encoding: 'UTF-8' },
    }) as string;

    return Buffer.from(xmlString, 'utf-8');
  }

  /**
   * Helper: Format number in Brazilian style (1.234,56)
   */
  private formatBrNumber(valor: number): string {
    if (Number.isInteger(valor)) {
      return new Intl.NumberFormat('pt-BR').format(valor);
    }
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor);
  }

  /**
   * Helper: Hash content
   */
  private hashContent(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Bulk export method - export report in multiple formats
   */
  async exportInMultipleFormats(
    data: TabularData,
    pdfBuffer: Buffer,
    formatos: ExportFormat[],
    nomeBase: string
  ): Promise<Map<ExportFormat, ExportResult>> {
    const resultados = new Map<ExportFormat, ExportResult>();

    for (const formato of formatos) {
      try {
        if (formato === 'pdf') {
          const pdfResult = await this.exportPdf(pdfBuffer, `${nomeBase}.pdf`);
          resultados.set(formato, pdfResult);
        } else {
          const result = await this.export(data, {
            formato,
            nomeArquivo: `${nomeBase}.${formato}`,
            incluirCabecalho: true,
            incluirMetadados: true,
          });
          resultados.set(formato, result);
        }
      } catch (error) {
        logger.warn(`[ExportService] Failed to export in ${formato} format`, error);
        // Continuar com próximo formato se um falhar
      }
    }

    return resultados;
  }

  /**
   * Get export statistics from database
   */
  getExportStats(): Record<string, unknown> {
    try {
      const stmt = this.db.prepare(`
        SELECT
          tipo_exportacao,
          COUNT(*) as total,
          SUM(tamanho_bytes) as tamanho_total_bytes,
          AVG(tempo_processamento_ms) as tempo_medio_ms,
          MAX(criado_em) as ultima_exportacao
        FROM relatorios_exports
        WHERE expirado_em > datetime('now')
        GROUP BY tipo_exportacao
      `);

      const stats = stmt.all() as any[];
      const resultado: Record<string, unknown> = {};

      for (const stat of stats) {
        resultado[stat.tipo_exportacao] = {
          total: stat.total,
          tamanho_total_mb: (stat.tamanho_total_bytes / 1024 / 1024).toFixed(2),
          tempo_medio_ms: stat.tempo_medio_ms?.toFixed(0),
          ultima_exportacao: stat.ultima_exportacao,
        };
      }

      return resultado;
    } catch (error) {
      logger.error('[ExportService] Failed to get export stats', error);
      return {};
    }
  }
}

export default ExportService;
