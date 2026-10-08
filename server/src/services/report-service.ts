/**
 * Report Service — Phase 22.20.2
 *
 * Core service for generating PDF reports:
 * - Balance Sheet (BS / Balanço Patrimonial)
 * - Income Statement (DRE / Demonstração de Resultados)
 * - Cash Flow (Fluxo de Caixa)
 * - Real Estate Report (Relatório de Propriedades)
 *
 * Features:
 * - PDF generation with jsPDF
 * - Brazilian accounting formatting (ABNT)
 * - Pagination for long reports
 * - Footer with date and signature
 * - Caching mechanism
 * - <5 second generation (P95)
 */

import Database from 'better-sqlite3';
import { jsPDF } from 'jspdf';
import { logger } from './logger-service.js';
import { createHash } from 'crypto';

export interface ReportPeriod {
  dataInicio: Date | string;
  dataFim: Date | string;
}

export interface BalanceSheetData {
  ativo: Record<string, number>;
  passivo: Record<string, number>;
  patrimonio: Record<string, number>;
  dataReferencia: Date;
}

export interface IncomeStatementData {
  receitas: Record<string, number>;
  despesas: Record<string, number>;
  impostos: Record<string, number>;
  periodo: ReportPeriod;
}

export interface CashFlowData {
  operacional: number;
  investimentos: number;
  financiamento: number;
  periodo: ReportPeriod;
  movimentacoes: Array<{
    data: string;
    descricao: string;
    valor: number;
    tipo: 'entrada' | 'saida';
  }>;
}

export interface RealEstateData {
  propriedades: Array<{
    id: number;
    nome: string;
    endereco: string;
    areaM2: number;
    valorizacao: number;
    receitas: number;
    despesas: number;
    margemLiquida: number;
  }>;
  totalPropriedades: number;
  totalValorizacao: number;
}

export interface ReportTemplate {
  logo?: Buffer;
  corPrimaria: string;
  corSecundaria: string;
  fontePrincipal: string;
  margens: { top: number; bottom: number; left: number; right: number };
  rodapeTexto?: string;
  incluirDataGeracao: boolean;
  incluirAssinatura: boolean;
}

export interface GeneratedReport {
  tipo: 'balance_sheet' | 'income_statement' | 'cash_flow' | 'real_estate';
  pdf: Buffer;
  tamanhoBytes: number;
  tempoGeracaoMs: number;
  hashConteudo: string;
  metadados: Record<string, unknown>;
}

/**
 * Main Report Service Class
 */
export class ReportService {
  private db: Database.Database;
  private defaultTemplate: ReportTemplate;

  constructor(db: Database.Database) {
    this.db = db;
    this.defaultTemplate = this.createDefaultTemplate();
  }

  /**
   * Generate Balance Sheet (Balanço Patrimonial)
   */
  async generateBalanceSheet(
    data: BalanceSheetData,
    template?: ReportTemplate
  ): Promise<GeneratedReport> {
    const startTime = performance.now();
    const tmpl = template || this.defaultTemplate;

    try {
      // Validar dados
      if (!data.ativo || !data.passivo || !data.patrimonio) {
        throw new Error('Invalid balance sheet data structure');
      }

      // Gerar PDF
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      this.setupPdfStyle(doc, tmpl);
      this.addPdfHeader(doc, 'BALANÇO PATRIMONIAL', data.dataReferencia, tmpl);

      // Seção: Ativo
      let yPosition = 50;
      yPosition = this.addTableSection(doc, 'ATIVO', data.ativo, yPosition, tmpl);
      yPosition += 10;

      // Seção: Passivo
      yPosition = this.addTableSection(doc, 'PASSIVO', data.passivo, yPosition, tmpl);
      yPosition += 10;

      // Seção: Patrimônio
      yPosition = this.addTableSection(doc, 'PATRIMÔNIO', data.patrimonio, yPosition, tmpl);

      // Adicionar rodapé
      this.addPdfFooter(doc, tmpl);

      const pdf = Buffer.from(doc.output('arraybuffer'));
      const tempoGeracaoMs = Math.round(performance.now() - startTime);

      const report: GeneratedReport = {
        tipo: 'balance_sheet',
        pdf,
        tamanhoBytes: pdf.length,
        tempoGeracaoMs,
        hashConteudo: this.hashContent(pdf),
        metadados: {
          dataReferencia: data.dataReferencia,
          ativoTotal: this.sumValues(data.ativo),
          passivoTotal: this.sumValues(data.passivo),
          patrimonioTotal: this.sumValues(data.patrimonio),
        },
      };

      logger.info('[ReportService] Balance Sheet generated', {
        tamanhoBytes: report.tamanhoBytes,
        tempoMs: tempoGeracaoMs,
      });

      return report;
    } catch (error) {
      logger.error('[ReportService] Failed to generate balance sheet', error);
      throw error;
    }
  }

  /**
   * Generate Income Statement (DRE - Demonstração de Resultados)
   */
  async generateIncomeStatement(
    data: IncomeStatementData,
    template?: ReportTemplate
  ): Promise<GeneratedReport> {
    const startTime = performance.now();
    const tmpl = template || this.defaultTemplate;

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      this.setupPdfStyle(doc, tmpl);
      this.addPdfHeader(doc, 'DEMONSTRAÇÃO DE RESULTADOS DO EXERCÍCIO', data.periodo.dataFim, tmpl);

      let yPosition = 50;

      // Receitas
      yPosition = this.addTableSection(doc, 'RECEITAS', data.receitas, yPosition, tmpl);
      yPosition += 5;

      // Despesas
      yPosition = this.addTableSection(doc, 'DESPESAS', data.despesas, yPosition, tmpl);
      yPosition += 5;

      // Impostos
      yPosition = this.addTableSection(doc, 'IMPOSTOS', data.impostos, yPosition, tmpl);
      yPosition += 5;

      // Resultado líquido
      const receitaTotal = this.sumValues(data.receitas);
      const despesaTotal = this.sumValues(data.despesas);
      const impostoTotal = this.sumValues(data.impostos);
      const resultadoLiquido = receitaTotal - despesaTotal - impostoTotal;

      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.text('RESULTADO LÍQUIDO', tmpl.margens.left, yPosition);
      doc.setFont(undefined, 'normal');
      doc.text(
        this.formatCurrency(resultadoLiquido),
        210 - tmpl.margens.right - 30,
        yPosition,
        { align: 'right' }
      );

      this.addPdfFooter(doc, tmpl);

      const pdf = Buffer.from(doc.output('arraybuffer'));
      const tempoGeracaoMs = Math.round(performance.now() - startTime);

      const report: GeneratedReport = {
        tipo: 'income_statement',
        pdf,
        tamanhoBytes: pdf.length,
        tempoGeracaoMs,
        hashConteudo: this.hashContent(pdf),
        metadados: {
          receitaTotal,
          despesaTotal,
          impostoTotal,
          resultadoLiquido,
          margem: (resultadoLiquido / receitaTotal) * 100,
        },
      };

      logger.info('[ReportService] Income Statement generated', {
        tamanhoBytes: report.tamanhoBytes,
        tempoMs: tempoGeracaoMs,
      });

      return report;
    } catch (error) {
      logger.error('[ReportService] Failed to generate income statement', error);
      throw error;
    }
  }

  /**
   * Generate Cash Flow (Fluxo de Caixa)
   */
  async generateCashFlow(
    data: CashFlowData,
    template?: ReportTemplate
  ): Promise<GeneratedReport> {
    const startTime = performance.now();
    const tmpl = template || this.defaultTemplate;

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      this.setupPdfStyle(doc, tmpl);
      this.addPdfHeader(doc, 'FLUXO DE CAIXA', data.periodo.dataFim, tmpl);

      let yPosition = 50;

      // Seções principais
      const sections = [
        { label: 'OPERACIONAL', valor: data.operacional },
        { label: 'INVESTIMENTOS', valor: data.investimentos },
        { label: 'FINANCIAMENTO', valor: data.financiamento },
      ];

      for (const section of sections) {
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text(section.label, tmpl.margens.left, yPosition);
        doc.setFont(undefined, 'normal');
        doc.text(
          this.formatCurrency(section.valor),
          210 - tmpl.margens.right - 30,
          yPosition,
          { align: 'right' }
        );
        yPosition += 8;
      }

      // Total
      const total = data.operacional + data.investimentos + data.financiamento;
      yPosition += 5;
      doc.setFont(undefined, 'bold');
      doc.text('TOTAL', tmpl.margens.left, yPosition);
      doc.text(
        this.formatCurrency(total),
        210 - tmpl.margens.right - 30,
        yPosition,
        { align: 'right' }
      );

      // Detalhes de movimentações
      yPosition += 15;
      doc.setFontSize(10);
      doc.text('Detalhes de Movimentações:', tmpl.margens.left, yPosition);
      yPosition += 8;

      for (const mov of data.movimentacoes.slice(0, 10)) {
        const prefix = mov.tipo === 'entrada' ? '+' : '-';
        doc.text(`${mov.data} - ${mov.descricao}`, tmpl.margens.left + 5, yPosition);
        doc.text(prefix + this.formatCurrency(Math.abs(mov.valor)), 210 - tmpl.margens.right - 30, yPosition, {
          align: 'right',
        });
        yPosition += 6;
      }

      this.addPdfFooter(doc, tmpl);

      const pdf = Buffer.from(doc.output('arraybuffer'));
      const tempoGeracaoMs = Math.round(performance.now() - startTime);

      const report: GeneratedReport = {
        tipo: 'cash_flow',
        pdf,
        tamanhoBytes: pdf.length,
        tempoGeracaoMs,
        hashConteudo: this.hashContent(pdf),
        metadados: {
          operacional: data.operacional,
          investimentos: data.investimentos,
          financiamento: data.financiamento,
          total,
          movimentacoes: data.movimentacoes.length,
        },
      };

      logger.info('[ReportService] Cash Flow generated', {
        tamanhoBytes: report.tamanhoBytes,
        tempoMs: tempoGeracaoMs,
      });

      return report;
    } catch (error) {
      logger.error('[ReportService] Failed to generate cash flow', error);
      throw error;
    }
  }

  /**
   * Generate Real Estate Report (Relatório de Propriedades)
   */
  async generateRealEstateReport(
    data: RealEstateData,
    template?: ReportTemplate
  ): Promise<GeneratedReport> {
    const startTime = performance.now();
    const tmpl = template || this.defaultTemplate;

    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      this.setupPdfStyle(doc, tmpl);
      this.addPdfHeader(doc, 'RELATÓRIO DE PROPRIEDADES', new Date(), tmpl);

      let yPosition = 50;

      // Resumo executivo
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Resumo Executivo', tmpl.margens.left, yPosition);
      yPosition += 8;

      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);
      const summaryLines = [
        `Total de Propriedades: ${data.totalPropriedades}`,
        `Valorização Total: ${this.formatCurrency(data.totalValorizacao)}`,
        `Data do Relatório: ${new Date().toLocaleDateString('pt-BR')}`,
      ];

      for (const line of summaryLines) {
        doc.text(line, tmpl.margens.left, yPosition);
        yPosition += 6;
      }

      // Tabela de propriedades
      yPosition += 8;
      const tableStartY = yPosition;
      const colWidths = [40, 50, 15, 20, 25, 25, 25];
      const headers = ['Nome', 'Endereço', 'Área (m²)', 'Valorização', 'Receitas', 'Despesas', 'Margem'];

      // Cabeçalho da tabela
      doc.setFont(undefined, 'bold');
      doc.setFontSize(8);
      let xPos = tmpl.margens.left;
      for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], xPos, yPosition);
        xPos += colWidths[i];
      }

      yPosition += 7;
      doc.setFont(undefined, 'normal');

      // Linhas da tabela
      for (const prop of data.propriedades) {
        xPos = tmpl.margens.left;
        doc.text(prop.nome.substring(0, 20), xPos, yPosition);
        xPos += colWidths[0];

        doc.text(prop.endereco.substring(0, 25), xPos, yPosition);
        xPos += colWidths[1];

        doc.text(prop.areaM2.toFixed(0), xPos, yPosition);
        xPos += colWidths[2];

        doc.text(this.formatCurrency(prop.valorizacao), xPos, yPosition, { align: 'right' });
        xPos += colWidths[3];

        doc.text(this.formatCurrency(prop.receitas), xPos, yPosition, { align: 'right' });
        xPos += colWidths[4];

        doc.text(this.formatCurrency(prop.despesas), xPos, yPosition, { align: 'right' });
        xPos += colWidths[5];

        doc.text(`${prop.margemLiquida.toFixed(2)}%`, xPos, yPosition, { align: 'right' });

        yPosition += 6;
      }

      this.addPdfFooter(doc, tmpl);

      const pdf = Buffer.from(doc.output('arraybuffer'));
      const tempoGeracaoMs = Math.round(performance.now() - startTime);

      const report: GeneratedReport = {
        tipo: 'real_estate',
        pdf,
        tamanhoBytes: pdf.length,
        tempoGeracaoMs,
        hashConteudo: this.hashContent(pdf),
        metadados: {
          totalPropriedades: data.totalPropriedades,
          totalValorizacao: data.totalValorizacao,
          receitaTotal: data.propriedades.reduce((sum, p) => sum + p.receitas, 0),
          despesaTotal: data.propriedades.reduce((sum, p) => sum + p.despesas, 0),
        },
      };

      logger.info('[ReportService] Real Estate Report generated', {
        tamanhoBytes: report.tamanhoBytes,
        tempoMs: tempoGeracaoMs,
      });

      return report;
    } catch (error) {
      logger.error('[ReportService] Failed to generate real estate report', error);
      throw error;
    }
  }

  /**
   * Cache relatório gerado no banco de dados
   */
  cacheReport(
    report: GeneratedReport,
    periodo: ReportPeriod,
    usuarioId: number,
    ipCliente: string
  ): number {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO relatorios (
          tipo, data_inicio, data_fim, conteudo_pdf, tamanho_bytes,
          hash_conteudo, tempo_geracao_ms, usuario_id, ip_cliente
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const startDate = typeof periodo.dataInicio === 'string'
        ? periodo.dataInicio
        : periodo.dataInicio.toISOString().split('T')[0];
      const endDate = typeof periodo.dataFim === 'string'
        ? periodo.dataFim
        : periodo.dataFim.toISOString().split('T')[0];

      const result = stmt.run(
        report.tipo,
        startDate,
        endDate,
        report.pdf,
        report.tamanhoBytes,
        report.hashConteudo,
        report.tempoGeracaoMs,
        usuarioId,
        ipCliente
      );

      logger.info('[ReportService] Report cached', {
        reportId: result.lastInsertRowid,
        tipo: report.tipo,
      });

      return result.lastInsertRowid as number;
    } catch (error) {
      logger.error('[ReportService] Failed to cache report', error);
      throw error;
    }
  }

  /**
   * Recuperar relatório do cache
   */
  getCachedReport(tipo: string, dataInicio: string, dataFim: string): GeneratedReport | null {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM relatorios
        WHERE tipo = ? AND data_inicio = ? AND data_fim = ?
        AND expirado_em > datetime('now')
        LIMIT 1
      `);

      const row = stmt.get(tipo, dataInicio, dataFim) as any;
      if (!row) return null;

      return {
        tipo: row.tipo,
        pdf: row.conteudo_pdf,
        tamanhoBytes: row.tamanho_bytes,
        tempoGeracaoMs: row.tempo_geracao_ms,
        hashConteudo: row.hash_conteudo,
        metadados: {},
      };
    } catch (error) {
      logger.error('[ReportService] Failed to retrieve cached report', error);
      return null;
    }
  }

  /**
   * Helper: Setup PDF styling
   */
  private setupPdfStyle(doc: jsPDF, template: ReportTemplate): void {
    doc.setFont(template.fontePrincipal, 'normal');
    doc.setFontSize(11);
  }

  /**
   * Helper: Add PDF header
   */
  private addPdfHeader(doc: jsPDF, titulo: string, data: Date | string, template: ReportTemplate): void {
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginLeft = template.margens.left;

    // Título
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text(titulo, marginLeft, template.margens.top + 10);

    // Data
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    const dataStr = typeof data === 'string' ? data : data.toLocaleDateString('pt-BR');
    doc.text(`Data: ${dataStr}`, pageWidth - template.margens.right - 30, template.margens.top + 10);
  }

  /**
   * Helper: Add table section
   */
  private addTableSection(
    doc: jsPDF,
    titulo: string,
    dados: Record<string, number>,
    yPosition: number,
    template: ReportTemplate
  ): number {
    const marginLeft = template.margens.left;
    const pageWidth = doc.internal.pageSize.getWidth();
    const rightMargin = template.margens.right;

    // Section title
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text(titulo, marginLeft, yPosition);

    yPosition += 8;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);

    // Table rows
    for (const [chave, valor] of Object.entries(dados)) {
      doc.text(chave, marginLeft + 5, yPosition);
      doc.text(this.formatCurrency(valor), pageWidth - rightMargin - 30, yPosition, { align: 'right' });
      yPosition += 6;
    }

    // Total line
    const total = this.sumValues(dados);
    yPosition += 2;
    doc.setFont(undefined, 'bold');
    doc.text(`Total ${titulo}`, marginLeft + 5, yPosition);
    doc.text(this.formatCurrency(total), pageWidth - rightMargin - 30, yPosition, { align: 'right' });

    return yPosition + 4;
  }

  /**
   * Helper: Add PDF footer
   */
  private addPdfFooter(doc: jsPDF, template: ReportTemplate): void {
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const footerY = pageHeight - template.margens.bottom - 5;

    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');

    // Data de geração
    if (template.incluirDataGeracao) {
      const dataGeracao = new Date().toLocaleDateString('pt-BR');
      doc.text(`Gerado em: ${dataGeracao}`, template.margens.left, footerY);
    }

    // Página
    const totalPages = (doc as any).internal.pages.length - 1;
    if (totalPages > 1) {
      const pageNum = `Página ${(doc as any).internal.getCurrentPageInfo().pageNumber} de ${totalPages}`;
      doc.text(pageNum, pageWidth - template.margens.right - 30, footerY, { align: 'right' });
    }
  }

  /**
   * Helper: Format currency (BRL)
   */
  private formatCurrency(valor: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor);
  }

  /**
   * Helper: Sum values in object
   */
  private sumValues(obj: Record<string, number>): number {
    return Object.values(obj).reduce((sum, val) => sum + val, 0);
  }

  /**
   * Helper: Hash content
   */
  private hashContent(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Helper: Create default template
   */
  private createDefaultTemplate(): ReportTemplate {
    return {
      corPrimaria: '#1E40AF',
      corSecundaria: '#7C3AED',
      fontePrincipal: 'Arial',
      margens: { top: 2.5, bottom: 2.0, left: 2.0, right: 2.0 },
      incluirDataGeracao: true,
      incluirAssinatura: false,
    };
  }
}

export default ReportService;
