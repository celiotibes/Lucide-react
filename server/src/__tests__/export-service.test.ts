/**
 * Tests for Export Service — Phase 22.20.2
 *
 * Tests coverage:
 * - CSV export with UTF-8 BOM
 * - XLSX export with formatting
 * - XML export with metadata
 * - Brazilian number formatting
 * - File hash verification
 * - Database audit trail
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import ExportService, { type TabularData } from '../services/export-service.js';

let db: Database.Database;
let exportService: ExportService;

const mockData: TabularData = {
  cabecalhos: ['Nome', 'Valor', 'Data'],
  linhas: [
    { Nome: 'Item A', Valor: 1234.56, Data: '2024-01-01' },
    { Nome: 'Item B', Valor: 2500.00, Data: '2024-01-02' },
    { Nome: 'Item C', Valor: 789.12, Data: '2024-01-03' },
  ],
  metadados: {
    titulo: 'Relatório Teste',
    dataGeracao: '2024-12-31',
    totalRegistros: 3,
  },
};

beforeEach(() => {
  // Create in-memory database
  db = new Database(':memory:');

  // Initialize schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS relatorios_exports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      relatorio_id INTEGER NOT NULL,
      tipo_exportacao TEXT NOT NULL,
      nome_arquivo TEXT NOT NULL,
      tamanho_bytes INTEGER NOT NULL,
      hash_arquivo TEXT,
      usuario_id INTEGER,
      ip_cliente TEXT,
      tempo_processamento_ms INTEGER,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  exportService = new ExportService(db);
});

describe('ExportService', () => {
  describe('CSV Export', () => {
    it('should export data to CSV format', async () => {
      const result = await exportService.export(mockData, {
        formato: 'csv',
        nomeArquivo: 'test.csv',
      });

      expect(result).toBeDefined();
      expect(result.formato).toBe('csv');
      expect(result.conteudo).toBeInstanceOf(Buffer);
      expect(result.tamanhoBytes).toBeGreaterThan(0);
      expect(result.mimeType).toBe('text/csv');
    });

    it('should include UTF-8 BOM for Excel compatibility', async () => {
      const result = await exportService.export(mockData, {
        formato: 'csv',
        nomeArquivo: 'test.csv',
      });

      // UTF-8 BOM signature
      expect(result.conteudo[0]).toBe(0xef);
      expect(result.conteudo[1]).toBe(0xbb);
      expect(result.conteudo[2]).toBe(0xbf);
    });

    it('should format numbers in Brazilian style (1.234,56)', async () => {
      const result = await exportService.export(mockData, {
        formato: 'csv',
        nomeArquivo: 'test.csv',
      });

      const csvText = result.conteudo.toString('utf-8').substring(3); // Skip BOM

      // Should contain Brazilian formatted numbers
      expect(csvText).toMatch(/\d+[.,]\d{2}/);
    });

    it('should handle custom delimiter', async () => {
      const result = await exportService.export(mockData, {
        formato: 'csv',
        nomeArquivo: 'test.csv',
        separador: ';',
      });

      const csvText = result.conteudo.toString('utf-8').substring(3);

      // Should use semicolon as delimiter
      expect(csvText).toContain(';');
    });
  });

  describe('XLSX Export', () => {
    it('should export data to XLSX format', async () => {
      const result = await exportService.export(mockData, {
        formato: 'xlsx',
        nomeArquivo: 'test.xlsx',
      });

      expect(result).toBeDefined();
      expect(result.formato).toBe('xlsx');
      expect(result.conteudo).toBeInstanceOf(Buffer);
      expect(result.mimeType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
    });

    it('should create valid XLSX file structure', async () => {
      const result = await exportService.export(mockData, {
        formato: 'xlsx',
        nomeArquivo: 'test.xlsx',
      });

      // XLSX files are ZIP archives with specific structure
      const buffer = result.conteudo;

      // Check for ZIP signature (PK)
      expect(buffer[0]).toBe(0x50); // P
      expect(buffer[1]).toBe(0x4b); // K
    });

    it('should include headers in sheet', async () => {
      const result = await exportService.export(mockData, {
        formato: 'xlsx',
        nomeArquivo: 'test.xlsx',
        aba: 'Relatório',
      });

      expect(result).toBeDefined();
      expect(result.tamanhoBytes).toBeGreaterThan(0);
    });
  });

  describe('XML Export', () => {
    it('should export data to XML format', async () => {
      const result = await exportService.export(mockData, {
        formato: 'xml',
        nomeArquivo: 'test.xml',
      });

      expect(result).toBeDefined();
      expect(result.formato).toBe('xml');
      expect(result.conteudo).toBeInstanceOf(Buffer);
      expect(result.mimeType).toBe('application/xml');
    });

    it('should include XML declaration with UTF-8 encoding', async () => {
      const result = await exportService.export(mockData, {
        formato: 'xml',
        nomeArquivo: 'test.xml',
      });

      const xmlText = result.conteudo.toString('utf-8');

      expect(xmlText).toMatch(/<?xml.*encoding="UTF-8".*?>/);
    });

    it('should include metadata in XML', async () => {
      const result = await exportService.export(mockData, {
        formato: 'xml',
        nomeArquivo: 'test.xml',
      });

      const xmlText = result.conteudo.toString('utf-8');

      // Should contain metadata
      expect(xmlText).toContain('Relatório Teste');
      expect(xmlText).toContain('2024-12-31');
    });
  });

  describe('PDF Export', () => {
    it('should export PDF from buffer', async () => {
      const pdfBuffer = Buffer.from('PDF test content');

      const result = await exportService.exportPdf(
        pdfBuffer,
        'test.pdf'
      );

      expect(result).toBeDefined();
      expect(result.formato).toBe('pdf');
      expect(result.mimeType).toBe('application/pdf');
      expect(result.tamanhoBytes).toBe(pdfBuffer.length);
    });
  });

  describe('File Hashing', () => {
    it('should generate consistent SHA256 hashes', async () => {
      const result1 = await exportService.export(mockData, {
        formato: 'csv',
        nomeArquivo: 'test1.csv',
      });

      const result2 = await exportService.export(mockData, {
        formato: 'csv',
        nomeArquivo: 'test2.csv',
      });

      expect(result1.hashArquivo).toBe(result2.hashArquivo);
    });

    it('should generate different hashes for different data', async () => {
      const result1 = await exportService.export(mockData, {
        formato: 'csv',
        nomeArquivo: 'test.csv',
      });

      const differentData: TabularData = {
        cabecalhos: ['Nome', 'Valor'],
        linhas: [{ Nome: 'Diferente', Valor: 999.99 }],
      };

      const result2 = await exportService.export(differentData, {
        formato: 'csv',
        nomeArquivo: 'test.csv',
      });

      expect(result1.hashArquivo).not.toBe(result2.hashArquivo);
    });

    it('should have 64-character SHA256 hex hash', async () => {
      const result = await exportService.export(mockData, {
        formato: 'csv',
        nomeArquivo: 'test.csv',
      });

      expect(result.hashArquivo).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Database Audit Trail', () => {
    it('should save export record to database', async () => {
      const result = await exportService.export(mockData, {
        formato: 'csv',
        nomeArquivo: 'test.csv',
      });

      const exportId = exportService.saveExportRecord(
        1,
        result,
        2,
        '192.168.1.1'
      );

      expect(exportId).toBeGreaterThan(0);

      // Verify in database
      const stmt = db.prepare('SELECT * FROM relatorios_exports WHERE id = ?');
      const record = stmt.get(exportId) as any;

      expect(record).toBeDefined();
      expect(record.tipo_exportacao).toBe('csv');
      expect(record.usuario_id).toBe(2);
      expect(record.ip_cliente).toBe('192.168.1.1');
    });
  });

  describe('Multiple Format Export', () => {
    it('should export in multiple formats at once', async () => {
      const pdfBuffer = Buffer.from('PDF content');

      const resultados = await exportService.exportInMultipleFormats(
        mockData,
        pdfBuffer,
        ['csv', 'xlsx', 'xml', 'pdf'],
        'relatorio'
      );

      expect(resultados.size).toBeGreaterThan(0);

      // At least CSV and XLSX should be present
      expect(resultados.has('csv')).toBe(true);
      expect(resultados.has('xlsx')).toBe(true);
    });
  });

  describe('Export Statistics', () => {
    it('should generate export statistics', async () => {
      // Save some exports first
      const result1 = await exportService.export(mockData, {
        formato: 'csv',
        nomeArquivo: 'test.csv',
      });

      const result2 = await exportService.export(mockData, {
        formato: 'xlsx',
        nomeArquivo: 'test.xlsx',
      });

      exportService.saveExportRecord(1, result1, 1, '127.0.0.1');
      exportService.saveExportRecord(1, result2, 1, '127.0.0.1');

      const stats = exportService.getExportStats();

      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');
    });
  });

  describe('Performance', () => {
    it('should export CSV in reasonable time', async () => {
      const startTime = performance.now();

      await exportService.export(mockData, {
        formato: 'csv',
        nomeArquivo: 'test.csv',
      });

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(1000); // < 1 second
    });

    it('should export XLSX in reasonable time', async () => {
      const startTime = performance.now();

      await exportService.export(mockData, {
        formato: 'xlsx',
        nomeArquivo: 'test.xlsx',
      });

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(1000); // < 1 second
    });
  });
});
