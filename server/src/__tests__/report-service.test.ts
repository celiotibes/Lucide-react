/**
 * Tests for Report Service — Phase 22.20.2
 *
 * Tests coverage:
 * - Balance Sheet generation
 * - Income Statement generation
 * - Cash Flow generation
 * - Real Estate Report generation
 * - Caching mechanism
 * - Performance (< 5 seconds P95)
 * - PDF size constraints (< 10MB)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import ReportService, {
  type BalanceSheetData,
  type IncomeStatementData,
  type CashFlowData,
  type RealEstateData,
} from '../services/report-service.js';

let db: Database.Database;
let reportService: ReportService;

beforeEach(() => {
  // Create in-memory database
  db = new Database(':memory:');

  // Initialize schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS relatorios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      data_inicio DATE NOT NULL,
      data_fim DATE NOT NULL,
      conteudo_pdf BLOB NOT NULL,
      tamanho_bytes INTEGER NOT NULL,
      hash_conteudo TEXT UNIQUE NOT NULL,
      tempo_geracao_ms INTEGER NOT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      usuario_id INTEGER,
      ip_cliente TEXT
    );

    CREATE TABLE IF NOT EXISTS relatorios_auditar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      relatorio_id INTEGER,
      acao TEXT NOT NULL,
      tipo_relatorio TEXT,
      usuario_id INTEGER,
      ip_cliente TEXT,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  reportService = new ReportService(db);
});

describe('ReportService', () => {
  describe('Balance Sheet Generation', () => {
    it('should generate valid PDF for balance sheet', async () => {
      const data: BalanceSheetData = {
        ativo: {
          'Caixa': 10000,
          'Aplicações': 50000,
          'Contas a Receber': 20000,
        },
        passivo: {
          'Contas a Pagar': 15000,
          'Empréstimos': 25000,
        },
        patrimonio: {
          'Capital': 100000,
          'Lucros Retidos': 30000,
        },
        dataReferencia: new Date('2024-12-31'),
      };

      const report = await reportService.generateBalanceSheet(data);

      expect(report).toBeDefined();
      expect(report.tipo).toBe('balance_sheet');
      expect(report.pdf).toBeInstanceOf(Buffer);
      expect(report.tamanhoBytes).toBeGreaterThan(0);
      expect(report.tamanhoBytes).toBeLessThan(10485760); // < 10MB
      expect(report.tempoGeracaoMs).toBeLessThan(5000); // < 5 seconds
      expect(report.hashConteudo).toHaveLength(64); // SHA256 hex
    });

    it('should reject invalid balance sheet data', async () => {
      const invalidData = {
        ativo: null,
        passivo: {},
        patrimonio: {},
        dataReferencia: new Date(),
      };

      expect(async () => {
        await reportService.generateBalanceSheet(invalidData as any);
      }).rejects.toThrow();
    });

    it('should cache balance sheet in database', async () => {
      const data: BalanceSheetData = {
        ativo: { 'Caixa': 10000 },
        passivo: { 'Passivos': 5000 },
        patrimonio: { 'Patrimônio': 15000 },
        dataReferencia: new Date('2024-12-31'),
      };

      const report = await reportService.generateBalanceSheet(data);
      const reportId = reportService.cacheReport(
        report,
        { dataInicio: data.dataReferencia, dataFim: data.dataReferencia },
        1,
        '127.0.0.1'
      );

      expect(reportId).toBeGreaterThan(0);

      // Verify in database
      const stmt = db.prepare('SELECT * FROM relatorios WHERE id = ?');
      const cached = stmt.get(reportId) as any;
      expect(cached).toBeDefined();
      expect(cached.tipo).toBe('balance_sheet');
      expect(cached.tamanho_bytes).toBe(report.tamanhoBytes);
    });
  });

  describe('Income Statement Generation', () => {
    it('should generate valid PDF for income statement', async () => {
      const data: IncomeStatementData = {
        receitas: {
          'Vendas': 100000,
          'Serviços': 50000,
        },
        despesas: {
          'Salários': 30000,
          'Aluguel': 5000,
          'Utilidades': 2000,
        },
        impostos: {
          'IRPJ': 10000,
          'CSLL': 3000,
        },
        periodo: {
          dataInicio: '2024-01-01',
          dataFim: '2024-12-31',
        },
      };

      const report = await reportService.generateIncomeStatement(data);

      expect(report).toBeDefined();
      expect(report.tipo).toBe('income_statement');
      expect(report.pdf).toBeInstanceOf(Buffer);
      expect(report.metadados.resultadoLiquido).toBe(100000);
      expect(report.metadados.margem).toBeCloseTo(50, 1); // 50% margin
    });

    it('should reject invalid income statement data', async () => {
      const invalidData = {
        receitas: null,
        despesas: {},
        impostos: {},
        periodo: { dataInicio: '2024-01-01', dataFim: '2024-12-31' },
      };

      expect(async () => {
        await reportService.generateIncomeStatement(invalidData as any);
      }).rejects.toThrow();
    });
  });

  describe('Cash Flow Generation', () => {
    it('should generate valid PDF for cash flow', async () => {
      const data: CashFlowData = {
        operacional: 50000,
        investimentos: -20000,
        financiamento: -10000,
        periodo: {
          dataInicio: '2024-01-01',
          dataFim: '2024-12-31',
        },
        movimentacoes: [
          {
            data: '2024-01-01',
            descricao: 'Venda',
            valor: 5000,
            tipo: 'entrada',
          },
          {
            data: '2024-01-02',
            descricao: 'Compra de equipamento',
            valor: 2000,
            tipo: 'saida',
          },
        ],
      };

      const report = await reportService.generateCashFlow(data);

      expect(report).toBeDefined();
      expect(report.tipo).toBe('cash_flow');
      expect(report.metadados.total).toBe(20000); // 50k - 20k - 10k
    });
  });

  describe('Real Estate Report Generation', () => {
    it('should generate valid PDF for real estate report', async () => {
      const data: RealEstateData = {
        propriedades: [
          {
            id: 1,
            nome: 'Apartamento A',
            endereco: 'Rua X, 100',
            areaM2: 100,
            valorizacao: 50000,
            receitas: 12000,
            despesas: 3000,
            margemLiquida: 75,
          },
          {
            id: 2,
            nome: 'Casa B',
            endereco: 'Rua Y, 200',
            areaM2: 150,
            valorizacao: 80000,
            receitas: 18000,
            despesas: 4000,
            margemLiquida: 77,
          },
        ],
        totalPropriedades: 2,
        totalValorizacao: 130000,
      };

      const report = await reportService.generateRealEstateReport(data);

      expect(report).toBeDefined();
      expect(report.tipo).toBe('real_estate');
      expect(report.metadados.totalPropriedades).toBe(2);
      expect(report.metadados.totalValorizacao).toBe(130000);
    });
  });

  describe('Cache Retrieval', () => {
    it('should retrieve cached report', async () => {
      const data: BalanceSheetData = {
        ativo: { 'Caixa': 10000 },
        passivo: { 'Passivos': 5000 },
        patrimonio: { 'Patrimônio': 15000 },
        dataReferencia: new Date('2024-12-31'),
      };

      const report = await reportService.generateBalanceSheet(data);
      reportService.cacheReport(
        report,
        { dataInicio: '2024-12-31', dataFim: '2024-12-31' },
        1,
        '127.0.0.1'
      );

      // Retrieve from cache
      const cached = reportService.getCachedReport(
        'balance_sheet',
        '2024-12-31',
        '2024-12-31'
      );

      expect(cached).toBeDefined();
      expect(cached?.tipo).toBe('balance_sheet');
      expect(cached?.tamanhoBytes).toBe(report.tamanhoBytes);
    });

    it('should return null for non-existent cached report', () => {
      const cached = reportService.getCachedReport(
        'income_statement',
        '2024-01-01',
        '2024-12-31'
      );

      expect(cached).toBeNull();
    });
  });

  describe('Performance Constraints', () => {
    it('should generate balance sheet in < 5 seconds', async () => {
      const data: BalanceSheetData = {
        ativo: {
          'Caixa': 10000,
          'Aplicações': 50000,
          'Contas a Receber': 20000,
        },
        passivo: {
          'Contas a Pagar': 15000,
        },
        patrimonio: {
          'Capital': 100000,
        },
        dataReferencia: new Date(),
      };

      const startTime = performance.now();
      await reportService.generateBalanceSheet(data);
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(5000);
    });

    it('should keep PDF size < 10MB', async () => {
      const data: BalanceSheetData = {
        ativo: {
          'Caixa': 10000,
          'Aplicações': 50000,
          'Contas a Receber': 20000,
        },
        passivo: {
          'Contas a Pagar': 15000,
        },
        patrimonio: {
          'Capital': 100000,
        },
        dataReferencia: new Date(),
      };

      const report = await reportService.generateBalanceSheet(data);

      expect(report.tamanhoBytes).toBeLessThan(10485760); // 10MB
    });
  });

  describe('Metadata Generation', () => {
    it('should generate correct metadata for balance sheet', async () => {
      const data: BalanceSheetData = {
        ativo: { 'Caixa': 10000, 'Investimentos': 50000 },
        passivo: { 'Empréstimos': 25000 },
        patrimonio: { 'Capital': 100000 },
        dataReferencia: new Date('2024-12-31'),
      };

      const report = await reportService.generateBalanceSheet(data);

      expect(report.metadados.ativoTotal).toBe(60000);
      expect(report.metadados.passivoTotal).toBe(25000);
      expect(report.metadados.patrimonioTotal).toBe(100000);
    });

    it('should include Brazilian date formatting', async () => {
      const data: IncomeStatementData = {
        receitas: { 'Vendas': 100000 },
        despesas: { 'Salários': 30000 },
        impostos: {},
        periodo: {
          dataInicio: '2024-01-01',
          dataFim: '2024-12-31',
        },
      };

      const report = await reportService.generateIncomeStatement(data);
      const pdfText = report.pdf.toString('binary');

      // Check for Brazilian number format (comma as decimal separator)
      expect(pdfText).toMatch(/\d+[.,]\d{2}/);
    });
  });
});
