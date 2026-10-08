/**
 * Rotas HTTP para PDF Reports — Phase 22.20.2
 *
 * Endpoints para geração de relatórios em PDF e exportação em múltiplos formatos:
 *
 * POST /api/reports/balance-sheet — Gera Balanço Patrimonial (PDF)
 * POST /api/reports/income-statement — Gera DRE (PDF)
 * POST /api/reports/cash-flow — Gera Fluxo de Caixa (PDF)
 * POST /api/reports/real-estate — Gera Relatório de Propriedades (PDF)
 * POST /api/reports/export — Exporta relatório em múltiplos formatos
 * GET /api/reports/:id/download — Download de relatório gerado
 * GET /api/reports/stats — Estatísticas de exportação
 */

import express from 'express';
import type Database from 'better-sqlite3';
import { logger } from '../services/logger-service.js';
import { criarMiddlewareAutenticacao } from './auth-routes.js';
import type { AuthServiceDB } from '../domain/auth/auth-service-db.js';
import ReportService, {
  type BalanceSheetData,
  type IncomeStatementData,
  type CashFlowData,
  type RealEstateData,
  type ReportPeriod,
} from '../services/report-service.js';
import ExportService, { type TabularData, type ExportFormat } from '../services/export-service.js';
import { z } from 'zod';

export interface ReportRoutesDeps {
  db: Database.Database;
  authService: AuthServiceDB;
}

/**
 * Validation schemas
 */
const PeriodSchema = z.object({
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const BalanceSheetSchema = z.object({
  ativo: z.record(z.number()),
  passivo: z.record(z.number()),
  patrimonio: z.record(z.number()),
  dataReferencia: z.string().optional(),
});

const ExportRequestSchema = z.object({
  reportId: z.number(),
  formatos: z.array(z.enum(['csv', 'xlsx', 'xml', 'pdf'])),
});

export function criarRotasReportsPDF({ db, authService }: ReportRoutesDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);
  const reportService = new ReportService(db);
  const exportService = new ExportService(db);

  /**
   * POST /api/reports/balance-sheet
   *
   * Gera Balanço Patrimonial em PDF
   *
   * Body:
   * {
   *   ativo: { "Caixa": 10000, "Aplicações": 50000, ... },
   *   passivo: { "Contas a Pagar": 5000, ... },
   *   patrimonio: { "Capital": 100000, ... },
   *   dataReferencia?: "2024-12-31"
   * }
   */
  router.post('/balance-sheet', exigirAutenticacao, async (req, res) => {
    try {
      // Validar entrada
      const validacao = BalanceSheetSchema.safeParse(req.body);
      if (!validacao.success) {
        res.status(400).json({
          erro: 'Dados inválidos',
          detalhes: validacao.error.errors,
        });
        return;
      }

      const { ativo, passivo, patrimonio, dataReferencia } = validacao.data;

      const data: BalanceSheetData = {
        ativo,
        passivo,
        patrimonio,
        dataReferencia: dataReferencia ? new Date(dataReferencia) : new Date(),
      };

      // Gerar relatório
      const report = await reportService.generateBalanceSheet(data);

      // Cachear no banco
      const usuarioId = (req as any).usuarioId || 1;
      const ipCliente = req.ip || '';
      const reportId = reportService.cacheReport(
        report,
        {
          dataInicio: data.dataReferencia,
          dataFim: data.dataReferencia,
        },
        usuarioId,
        ipCliente
      );

      // Registrar auditoria
      auditarAcesso(db, reportId, 'gerado', 'balance_sheet', usuarioId, ipCliente);

      // Response
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="balanco-patrimonial.pdf"');
      res.send(report.pdf);
    } catch (error) {
      logger.error('[ReportRoutes] Erro ao gerar balanço patrimonial', error);
      res.status(500).json({ erro: 'Erro ao gerar relatório' });
    }
  });

  /**
   * POST /api/reports/income-statement
   *
   * Gera Demonstração de Resultados (DRE) em PDF
   *
   * Body:
   * {
   *   dataInicio: "2024-01-01",
   *   dataFim: "2024-12-31",
   *   receitas: { "Vendas": 100000, ... },
   *   despesas: { "Salários": 30000, ... },
   *   impostos: { "ICMS": 5000, ... }
   * }
   */
  router.post('/income-statement', exigirAutenticacao, async (req, res) => {
    try {
      const { dataInicio, dataFim, receitas, despesas, impostos } = req.body;

      // Validação
      if (!dataInicio || !dataFim || !receitas || !despesas) {
        res.status(400).json({
          erro: 'Campos obrigatórios: dataInicio, dataFim, receitas, despesas',
        });
        return;
      }

      const data: IncomeStatementData = {
        receitas,
        despesas,
        impostos: impostos || {},
        periodo: { dataInicio, dataFim },
      };

      const report = await reportService.generateIncomeStatement(data);

      const usuarioId = (req as any).usuarioId || 1;
      const ipCliente = req.ip || '';
      const reportId = reportService.cacheReport(
        report,
        { dataInicio, dataFim },
        usuarioId,
        ipCliente
      );

      auditarAcesso(db, reportId, 'gerado', 'income_statement', usuarioId, ipCliente);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="dre.pdf"');
      res.send(report.pdf);
    } catch (error) {
      logger.error('[ReportRoutes] Erro ao gerar DRE', error);
      res.status(500).json({ erro: 'Erro ao gerar relatório' });
    }
  });

  /**
   * POST /api/reports/cash-flow
   *
   * Gera Fluxo de Caixa em PDF
   *
   * Body:
   * {
   *   dataInicio: "2024-01-01",
   *   dataFim: "2024-12-31",
   *   operacional: 50000,
   *   investimentos: -20000,
   *   financiamento: -10000,
   *   movimentacoes: [
   *     { data: "2024-01-01", descricao: "Venda", valor: 5000, tipo: "entrada" },
   *     ...
   *   ]
   * }
   */
  router.post('/cash-flow', exigirAutenticacao, async (req, res) => {
    try {
      const {
        dataInicio,
        dataFim,
        operacional,
        investimentos,
        financiamento,
        movimentacoes,
      } = req.body;

      if (!dataInicio || !dataFim || operacional === undefined || !movimentacoes) {
        res.status(400).json({
          erro: 'Campos obrigatórios: dataInicio, dataFim, operacional, movimentacoes',
        });
        return;
      }

      const data: CashFlowData = {
        operacional,
        investimentos: investimentos || 0,
        financiamento: financiamento || 0,
        periodo: { dataInicio, dataFim },
        movimentacoes,
      };

      const report = await reportService.generateCashFlow(data);

      const usuarioId = (req as any).usuarioId || 1;
      const ipCliente = req.ip || '';
      const reportId = reportService.cacheReport(
        report,
        { dataInicio, dataFim },
        usuarioId,
        ipCliente
      );

      auditarAcesso(db, reportId, 'gerado', 'cash_flow', usuarioId, ipCliente);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="fluxo-caixa.pdf"');
      res.send(report.pdf);
    } catch (error) {
      logger.error('[ReportRoutes] Erro ao gerar fluxo de caixa', error);
      res.status(500).json({ erro: 'Erro ao gerar relatório' });
    }
  });

  /**
   * POST /api/reports/real-estate
   *
   * Gera Relatório de Propriedades em PDF
   *
   * Body:
   * {
   *   propriedades: [
   *     {
   *       id: 1,
   *       nome: "Apto A",
   *       endereco: "Rua X",
   *       areaM2: 100,
   *       valorizacao: 50000,
   *       receitas: 12000,
   *       despesas: 3000,
   *       margemLiquida: 75
   *     }
   *   ]
   * }
   */
  router.post('/real-estate', exigirAutenticacao, async (req, res) => {
    try {
      const { propriedades } = req.body;

      if (!propriedades || !Array.isArray(propriedades)) {
        res.status(400).json({
          erro: 'Campo obrigatório: propriedades (array)',
        });
        return;
      }

      const data: RealEstateData = {
        propriedades,
        totalPropriedades: propriedades.length,
        totalValorizacao: propriedades.reduce((sum, p) => sum + (p.valorizacao || 0), 0),
      };

      const report = await reportService.generateRealEstateReport(data);

      const usuarioId = (req as any).usuarioId || 1;
      const ipCliente = req.ip || '';
      const reportId = reportService.cacheReport(
        report,
        { dataInicio: new Date(), dataFim: new Date() },
        usuarioId,
        ipCliente
      );

      auditarAcesso(db, reportId, 'gerado', 'real_estate', usuarioId, ipCliente);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="relatorio-propriedades.pdf"');
      res.send(report.pdf);
    } catch (error) {
      logger.error('[ReportRoutes] Erro ao gerar relatório de propriedades', error);
      res.status(500).json({ erro: 'Erro ao gerar relatório' });
    }
  });

  /**
   * POST /api/reports/export
   *
   * Exporta dados em múltiplos formatos (CSV, XLSX, XML, PDF)
   *
   * Body:
   * {
   *   reportId: 123,
   *   formatos: ["csv", "xlsx", "xml"],
   *   tabularData: {
   *     cabecalhos: ["Nome", "Valor"],
   *     linhas: [{ "Nome": "Item A", "Valor": 100 }]
   *   }
   * }
   */
  router.post('/export', exigirAutenticacao, async (req, res) => {
    try {
      const { reportId, formatos, tabularData } = req.body;

      if (!reportId || !formatos || !Array.isArray(formatos)) {
        res.status(400).json({
          erro: 'Campos obrigatórios: reportId, formatos (array)',
        });
        return;
      }

      const usuarioId = (req as any).usuarioId || 1;
      const ipCliente = req.ip || '';

      // Recuperar relatório do banco se for PDF
      let pdfBuffer: Buffer | undefined;
      if (formatos.includes('pdf')) {
        const stmt = db.prepare(`
          SELECT conteudo_pdf FROM relatorios WHERE id = ?
        `);
        const relatorio = stmt.get(reportId) as any;
        if (relatorio) {
          pdfBuffer = relatorio.conteudo_pdf;
        }
      }

      const resultados = new Map<string, Buffer>();

      // Exportar em cada formato
      for (const formato of formatos) {
        try {
          if (formato === 'pdf' && pdfBuffer) {
            const result = await exportService.exportPdf(
              pdfBuffer,
              `relatorio-${reportId}.pdf`
            );
            resultados.set(formato, result.conteudo);
            exportService.saveExportRecord(reportId, result, usuarioId, ipCliente);
          } else if (formato !== 'pdf' && tabularData) {
            const result = await exportService.export(tabularData, {
              formato: formato as ExportFormat,
              nomeArquivo: `relatorio-${reportId}.${formato}`,
              incluirCabecalho: true,
            });
            resultados.set(formato, result.conteudo);
            exportService.saveExportRecord(reportId, result, usuarioId, ipCliente);
          }
        } catch (error) {
          logger.warn(`[ReportRoutes] Falha ao exportar em ${formato}`, error);
        }
      }

      auditarAcesso(db, reportId, 'exportado', 'multi', usuarioId, ipCliente);

      // Se um único formato, retornar direto
      if (formatos.length === 1) {
        const formato = formatos[0];
        const buffer = resultados.get(formato);
        if (buffer) {
          const mimeTypes: Record<string, string> = {
            csv: 'text/csv',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            xml: 'application/xml',
            pdf: 'application/pdf',
          };
          res.setHeader('Content-Type', mimeTypes[formato] || 'application/octet-stream');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="relatorio-${reportId}.${formato}"`
          );
          res.send(buffer);
          return;
        }
      }

      // Múltiplos formatos: retornar JSON com informações
      const info = Array.from(resultados.entries()).map(([fmt, buf]) => ({
        formato: fmt,
        tamanho: buf.length,
        mimeType: ['csv', 'xlsx', 'xml', 'pdf'][['csv', 'xlsx', 'xml', 'pdf'].indexOf(fmt)],
      }));

      res.json({
        reportId,
        formatos: info,
        totalArquivos: resultados.size,
      });
    } catch (error) {
      logger.error('[ReportRoutes] Erro ao exportar', error);
      res.status(500).json({ erro: 'Erro ao exportar' });
    }
  });

  /**
   * GET /api/reports/stats
   *
   * Retorna estatísticas de exportação
   */
  router.get('/stats', exigirAutenticacao, (req, res) => {
    try {
      const stats = exportService.getExportStats();
      res.json(stats);
    } catch (error) {
      logger.error('[ReportRoutes] Erro ao obter estatísticas', error);
      res.status(500).json({ erro: 'Erro ao obter estatísticas' });
    }
  });

  return router;
}

/**
 * Helper: Registrar acesso em auditoria
 */
function auditarAcesso(
  db: Database.Database,
  reportId: number,
  acao: string,
  tipoRelatorio: string,
  usuarioId: number,
  ipCliente: string
): void {
  try {
    const stmt = db.prepare(`
      INSERT INTO relatorios_auditar (
        relatorio_id, acao, tipo_relatorio, usuario_id, ip_cliente
      ) VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(reportId, acao, tipoRelatorio, usuarioId, ipCliente);
  } catch (error) {
    logger.warn('[ReportRoutes] Falha ao registrar auditoria', error);
  }
}

export default criarRotasReportsPDF;
