import db from '@db/connection';
import { logger } from '@utils/logger';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  ReportRequest,
  ReportType,
  ReportFormat,
  ReportMetadata,
  CaseSummaryReport,
  FinancialSummaryReport,
  DeadlineReport,
  PerformanceMetricsReport,
  TimeTrackingReport,
  ReportGenerationError,
} from '@types/reporting';

export class ReportGenerationService {
  private reportsDir = path.join(process.env.DATA_DIR || './data', 'reports');

  constructor() {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  async generateReport(
    userId: string,
    request: ReportRequest,
  ): Promise<ReportMetadata> {
    try {
      logger.info(
        `Gerando relatório ${request.reportType} em formato ${request.format}`,
      );

      const reportData = await this.getReportData(
        userId,
        request.reportType,
        request.filters,
      );

      if (!reportData) {
        throw new ReportGenerationError(
          `Não foi possível obter dados para relatório ${request.reportType}`,
        );
      }

      const fileName = await this.formatAndSaveReport(
        reportData,
        request.format,
        request.options,
      );

      const fileSize = fs.statSync(fileName).size;
      const reportId = crypto.randomUUID();

      const metadata: ReportMetadata = {
        id: reportId,
        userId,
        reportType: request.reportType,
        format: request.format,
        title: reportData.title,
        description: reportData.description,
        generatedAt: new Date(),
        filePath: fileName,
        fileSize,
        status: 'generated',
      };

      this.storeReportMetadata(metadata);

      logger.info(
        `✓ Relatório ${reportId} gerado com sucesso (${fileSize} bytes)`,
      );

      return metadata;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao gerar relatório');
      throw error;
    }
  }

  private async getReportData(
    userId: string,
    reportType: ReportType,
    filters?: any,
  ): Promise<any> {
    switch (reportType) {
      case 'case_summary':
        return this.generateCaseSummary(userId, filters);
      case 'financial_summary':
        return this.generateFinancialSummary(userId, filters);
      case 'deadline_report':
        return this.generateDeadlineReport(userId, filters);
      case 'performance_metrics':
        return this.generatePerformanceMetrics(userId, filters);
      case 'time_tracking':
        return this.generateTimeTrackingReport(userId, filters);
      default:
        throw new ReportGenerationError(`Tipo de relatório desconhecido: ${reportType}`);
    }
  }

  private async generateCaseSummary(
    userId: string,
    filters?: any,
  ): Promise<CaseSummaryReport> {
    try {
      let query = `
        SELECT * FROM cases
        WHERE created_by = ? OR assigned_to LIKE ?
      `;

      const params: any[] = [userId, `%${userId}%`];

      if (filters?.dateRange) {
        query += ` AND created_at >= ? AND created_at <= ?`;
        params.push(
          filters.dateRange.from.toISOString(),
          filters.dateRange.to.toISOString(),
        );
      }

      if (filters?.status && filters.status.length > 0) {
        const statuses = filters.status.map(() => '?').join(',');
        query += ` AND status IN (${statuses})`;
        params.push(...filters.status);
      }

      const stmt = db.prepare(query);
      const cases = stmt.all(...params) as any[];

      const statusDistribution: Record<string, number> = {};
      const priorityDistribution: Record<string, number> = {};

      cases.forEach((c) => {
        statusDistribution[c.status] = (statusDistribution[c.status] || 0) + 1;
        priorityDistribution[c.priority] =
          (priorityDistribution[c.priority] || 0) + 1;
      });

      return {
        title: 'Relatório de Resumo de Casos',
        description: 'Resumo consolidado de todos os casos',
        generatedAt: new Date(),
        generatedBy: userId,
        reportPeriod: filters?.dateRange,
        summary: {
          totalCases: cases.length,
          activeCases: cases.filter((c) => c.status === 'active').length,
          concludedCases: cases.filter((c) => c.status === 'concluded').length,
        },
        caseDetails: cases.map((c) => ({
          caseNumber: c.case_number,
          processNumber: c.process_number,
          clientName: c.client_name,
          status: c.status,
          priority: c.priority,
          openDate: new Date(c.created_at),
          daysOpen: Math.floor(
            (Date.now() - new Date(c.created_at).getTime()) /
              (1000 * 60 * 60 * 24),
          ),
          nextDeadline: undefined,
          lastUpdate: new Date(c.last_updated),
          totalCost: 0,
          totalRevenue: 0,
          profit: 0,
        })),
        totalCases: cases.length,
        activeCases: cases.filter((c) => c.status === 'active').length,
        concludedCases: cases.filter((c) => c.status === 'concluded').length,
        statusDistribution,
        priorityDistribution,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao gerar resumo de casos');
      throw error;
    }
  }

  private async generateFinancialSummary(
    userId: string,
    filters?: any,
  ): Promise<FinancialSummaryReport> {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const yearStart = new Date(now.getFullYear(), 0, 1);

      const periodRevenue = 0;
      const periodCosts = 0;

      return {
        title: 'Relatório de Resumo Financeiro',
        description: 'Análise consolidada de finanças',
        generatedAt: new Date(),
        generatedBy: userId,
        reportPeriod: filters?.dateRange,
        summary: {
          periodRevenue,
          periodCosts,
          periodProfit: periodRevenue - periodCosts,
        },
        periodRevenue,
        periodCosts,
        periodProfit: periodRevenue - periodCosts,
        profitMargin:
          periodRevenue > 0
            ? Math.round(
                ((periodRevenue - periodCosts) / periodRevenue) * 100,
              )
            : 0,
        topClients: [],
        topCases: [],
        expensesByCategory: {},
        revenueBySource: {},
        invoiceMetrics: {
          totalInvoices: 0,
          totalAmount: 0,
          paidAmount: 0,
          outstandingAmount: 0,
          averagePaymentTime: 0,
          overdueCount: 0,
        },
        cashFlowProjection: [],
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao gerar resumo financeiro');
      throw error;
    }
  }

  private async generateDeadlineReport(
    userId: string,
    filters?: any,
  ): Promise<DeadlineReport> {
    try {
      const stmt = db.prepare(`
        SELECT d.*, c.case_number
        FROM deadlines d
        JOIN cases c ON d.case_id = c.id
        WHERE c.created_by = ? OR c.assigned_to LIKE ?
        ORDER BY d.due_date ASC
      `);

      const deadlines = stmt.all(userId, `%${userId}%`) as any[];

      const now = new Date();
      const urgentDeadlines = deadlines.filter(
        (d) => new Date(d.due_date) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) &&
               new Date(d.due_date) > now &&
               !d.completed,
      );
      const overdueDeadlines = deadlines.filter(
        (d) => new Date(d.due_date) < now && !d.completed,
      );
      const completedDeadlines = deadlines.filter((d) => d.completed);

      return {
        title: 'Relatório de Prazos',
        description: 'Resumo de todos os prazos e suas situações',
        generatedAt: new Date(),
        generatedBy: userId,
        summary: {
          total: deadlines.length,
          urgent: urgentDeadlines.length,
          overdue: overdueDeadlines.length,
          completed: completedDeadlines.length,
        },
        urgentDeadlines: urgentDeadlines.map((d) => ({
          id: d.id,
          caseNumber: d.case_number,
          title: d.title,
          dueDate: new Date(d.due_date),
          daysUntil: Math.ceil(
            (new Date(d.due_date).getTime() - now.getTime()) /
              (1000 * 60 * 60 * 24),
          ),
          priority: d.priority,
          status: 'urgent',
          assignedTo: d.assigned_to || '',
        })),
        upcomingDeadlines: [],
        overdueDeadlines: overdueDeadlines.map((d) => ({
          id: d.id,
          caseNumber: d.case_number,
          title: d.title,
          dueDate: new Date(d.due_date),
          daysUntil: Math.ceil(
            (new Date(d.due_date).getTime() - now.getTime()) /
              (1000 * 60 * 60 * 24),
          ),
          priority: d.priority,
          status: 'overdue',
          assignedTo: d.assigned_to || '',
        })),
        completedDeadlines: completedDeadlines.slice(0, 20),
        deadlineMetrics: {
          totalDeadlines: deadlines.length,
          overdue: overdueDeadlines.length,
          onTime: deadlines.filter((d) => d.completed && new Date(d.completed_at) <= new Date(d.due_date))
            .length,
          completionRate:
            deadlines.length > 0
              ? Math.round((completedDeadlines.length / deadlines.length) * 100)
              : 0,
        },
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao gerar relatório de prazos');
      throw error;
    }
  }

  private async generatePerformanceMetrics(
    userId: string,
    filters?: any,
  ): Promise<PerformanceMetricsReport> {
    return {
      title: 'Relatório de Métricas de Performance',
      description: 'Análise de performance e produtividade',
      generatedAt: new Date(),
      generatedBy: userId,
      summary: {},
      userMetrics: [],
      teamMetrics: {
        totalCases: 0,
        casesCompleted: 0,
        avgCompletionTime: 0,
        teamUtilization: 0,
        totalRevenue: 0,
        totalCosts: 0,
        profitMargin: 0,
      },
      caseMetrics: {
        avgCaseDuration: 0,
        medianCaseDuration: 0,
        casesOnTime: 0,
        casesMissedDeadline: 0,
        casesEscalated: 0,
      },
      timeMetrics: {
        totalHoursLogged: 0,
        billableHours: 0,
        nonBillableHours: 0,
        utilizationRate: 0,
        avgHoursPerCase: 0,
      },
      qualityMetrics: {
        casesWithIssues: 0,
        appealsWon: 0,
        appealsLost: 0,
        clientSatisfaction: 0,
        revisionsRequired: 0,
      },
    };
  }

  private async generateTimeTrackingReport(
    userId: string,
    filters?: any,
  ): Promise<TimeTrackingReport> {
    return {
      title: 'Relatório de Rastreamento de Tempo',
      description: 'Análise de horas trabalhadas e faturáveis',
      generatedAt: new Date(),
      generatedBy: userId,
      summary: {},
      timeEntries: [],
      summaryByUser: [],
      summaryByCase: [],
      totalHours: 0,
      totalBillableHours: 0,
      utilizationPercentage: 0,
      billing: [],
    };
  }

  private async formatAndSaveReport(
    reportData: any,
    format: ReportFormat,
    options?: any,
  ): Promise<string> {
    try {
      const fileName = path.join(
        this.reportsDir,
        `${crypto.randomUUID()}.${this.getFileExtension(format)}`,
      );

      switch (format) {
        case 'pdf':
          return await this.generatePDF(reportData, fileName, options);
        case 'excel':
          return await this.generateExcel(reportData, fileName, options);
        case 'csv':
          return await this.generateCSV(reportData, fileName, options);
        case 'html':
          return await this.generateHTML(reportData, fileName, options);
        default:
          throw new ReportGenerationError(`Formato desconhecido: ${format}`);
      }
    } catch (error) {
      logger.error({ err: error }, 'Erro ao formatar e salvar relatório');
      throw error;
    }
  }

  private async generatePDF(
    reportData: any,
    fileName: string,
    options?: any,
  ): Promise<string> {
    // Simplified PDF generation - in production would use PDFKit
    const html = this.generateHTMLContent(reportData, options);
    fs.writeFileSync(fileName, Buffer.from(html));
    return fileName;
  }

  private async generateExcel(
    reportData: any,
    fileName: string,
    options?: any,
  ): Promise<string> {
    // Simplified Excel generation - in production would use ExcelJS
    const csv = this.convertToCSV(reportData);
    fs.writeFileSync(fileName, csv);
    return fileName;
  }

  private async generateCSV(
    reportData: any,
    fileName: string,
    options?: any,
  ): Promise<string> {
    const csv = this.convertToCSV(reportData);
    fs.writeFileSync(fileName, csv);
    return fileName;
  }

  private async generateHTML(
    reportData: any,
    fileName: string,
    options?: any,
  ): Promise<string> {
    const html = this.generateHTMLContent(reportData, options);
    fs.writeFileSync(fileName, html);
    return fileName;
  }

  private generateHTMLContent(reportData: any, options?: any): string {
    return `
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${reportData.title}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .title { font-size: 24px; font-weight: bold; }
            .summary { background-color: #f5f5f5; padding: 10px; margin: 10px 0; }
            .table { border-collapse: collapse; width: 100%; margin: 20px 0; }
            .table th, .table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            .table th { background-color: #4CAF50; color: white; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">${reportData.title}</div>
            <p>Gerado em: ${new Date().toLocaleDateString('pt-BR')}</p>
          </div>
          <div class="summary">
            <h2>Resumo</h2>
            <pre>${JSON.stringify(reportData.summary, null, 2)}</pre>
          </div>
        </body>
      </html>
    `;
  }

  private convertToCSV(reportData: any): string {
    let csv = `${reportData.title}\n`;
    csv += `Gerado em: ${new Date().toLocaleDateString('pt-BR')}\n\n`;

    if (reportData.summary) {
      csv += 'Resumo\n';
      Object.entries(reportData.summary).forEach(([key, value]) => {
        csv += `${key},${value}\n`;
      });
    }

    return csv;
  }

  private getFileExtension(format: ReportFormat): string {
    switch (format) {
      case 'pdf':
        return 'pdf';
      case 'excel':
        return 'xlsx';
      case 'csv':
        return 'csv';
      case 'html':
        return 'html';
      default:
        return 'txt';
    }
  }

  private storeReportMetadata(metadata: ReportMetadata): void {
    try {
      const stmt = db.prepare(`
        INSERT INTO report_metadata
        (id, user_id, report_type, format, title, description, generated_at, file_path, file_size, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        metadata.id,
        metadata.userId,
        metadata.reportType,
        metadata.format,
        metadata.title,
        metadata.description || '',
        metadata.generatedAt.toISOString(),
        metadata.filePath,
        metadata.fileSize,
        metadata.status,
      );
    } catch (error) {
      logger.error({ err: error }, 'Erro ao armazenar metadados do relatório');
    }
  }

  async getReportFile(reportId: string): Promise<Buffer | null> {
    try {
      const stmt = db.prepare('SELECT file_path FROM report_metadata WHERE id = ?');
      const result = stmt.get(reportId) as any;

      if (!result || !fs.existsSync(result.file_path)) {
        return null;
      }

      return fs.readFileSync(result.file_path);
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter arquivo de relatório');
      return null;
    }
  }
}

export default new ReportGenerationService();
