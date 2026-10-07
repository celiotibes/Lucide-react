/**
 * Ledger Service Tests
 *
 * Testa:
 * - Validação de entradas
 * - Registro de lançamentos simples
 * - Registro de double-entry
 * - Auditoria
 * - Integridade de dados
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  registrarLancamento,
  registrarDoubleEntry,
  obterLancamento,
  listarLancamentos,
  calcularSaldoPorCategoria,
  validarIntegridade,
} from '../ledger-service.js';
import type { LedgerEntry, DoubleEntryLancamento } from '../ledger-types.js';

// Test database path
const testDbPath = path.join(process.cwd(), 'test-ledger.db');

let db: Database.Database;

beforeEach(() => {
  // Remove test database if it exists
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  // Create fresh test database
  db = new Database(testDbPath);
  db.pragma('foreign_keys = ON');

  // Create ledger_entries table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ledger_entries (
      id TEXT PRIMARY KEY,
      data DATE NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('receita', 'despesa')),
      categoria TEXT NOT NULL CHECK(
        categoria IN (
          'receita',
          'aluguel',
          'honorario',
          'extraordinaria',
          'comissao',
          'imposto',
          'folha_pagamento',
          'condominio',
          'manutencao',
          'juros'
        )
      ),
      valor DECIMAL(12, 2) NOT NULL CHECK(valor > 0),
      descricao TEXT,
      referencia_externa TEXT,
      usuario_id TEXT,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id TEXT,
      tipo_acao TEXT,
      tabela TEXT,
      registro_id TEXT,
      valores_antigos TEXT,
      valores_novos TEXT,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_ledger_entries_data
      ON ledger_entries(data DESC);

    CREATE INDEX IF NOT EXISTS idx_ledger_entries_referencia
      ON ledger_entries(referencia_externa);
  `);
});

afterEach(() => {
  db.close();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

describe('Ledger Service', () => {
  describe('registrarLancamento', () => {
    it('deve registrar um lançamento de receita válido', () => {
      const lancamento: Omit<LedgerEntry, 'criado_em' | 'atualizado_em'> = {
        id: randomUUID(),
        data: '2024-10-04',
        tipo: 'receita',
        categoria: 'honorario',
        valor: 1500.00,
        descricao: 'Honorário de consultoria',
        usuario_id: 'user-123',
      };

      const resultado = registrarLancamento(db, lancamento);

      expect(resultado.sucesso).toBe(true);
      expect(resultado.lancamento_id).toBe(lancamento.id);
      expect(resultado.erro).toBeUndefined();

      // Verifica se foi registrado no banco
      const registrado = obterLancamento(db, lancamento.id);
      expect(registrado).not.toBeNull();
      expect(registrado?.valor).toBe(1500.00);
      expect(registrado?.categoria).toBe('honorario');
    });

    it('deve registrar um lançamento de despesa válido', () => {
      const lancamento: Omit<LedgerEntry, 'criado_em' | 'atualizado_em'> = {
        id: randomUUID(),
        data: '2024-10-04',
        tipo: 'despesa',
        categoria: 'folha_pagamento',
        valor: 5000.00,
        descricao: 'Folha de pagamento outubro',
        usuario_id: 'user-456',
      };

      const resultado = registrarLancamento(db, lancamento);

      expect(resultado.sucesso).toBe(true);
      expect(resultado.lancamento_id).toBe(lancamento.id);

      const registrado = obterLancamento(db, lancamento.id);
      expect(registrado?.tipo).toBe('despesa');
      expect(registrado?.categoria).toBe('folha_pagamento');
    });

    it('deve gerar ID automaticamente se não fornecido', () => {
      const lancamento: Omit<LedgerEntry, 'criado_em' | 'atualizado_em' | 'id'> = {
        data: '2024-10-04',
        tipo: 'receita',
        categoria: 'aluguel',
        valor: 2000.00,
        usuario_id: 'user-789',
      };

      const resultado = registrarLancamento(db, lancamento as unknown);

      expect(resultado.sucesso).toBe(true);
      expect(resultado.lancamento_id).toBeDefined();
      expect(typeof resultado.lancamento_id).toBe('string');
    });

    it('deve rejeitar lançamento com valor negativo', () => {
      const lancamento: Omit<LedgerEntry, 'criado_em' | 'atualizado_em'> = {
        id: randomUUID(),
        data: '2024-10-04',
        tipo: 'receita',
        categoria: 'receita',
        valor: -100.00,
        usuario_id: 'user-123',
      };

      const resultado = registrarLancamento(db, lancamento);

      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toBeDefined();
      expect(resultado.erro).toContain('maior que zero');
    });

    it('deve rejeitar lançamento com valor zero', () => {
      const lancamento: Omit<LedgerEntry, 'criado_em' | 'atualizado_em'> = {
        id: randomUUID(),
        data: '2024-10-04',
        tipo: 'receita',
        categoria: 'receita',
        valor: 0,
        usuario_id: 'user-123',
      };

      const resultado = registrarLancamento(db, lancamento);

      expect(resultado.sucesso).toBe(false);
    });

    it('deve rejeitar lançamento sem data', () => {
      const lancamento = {
        id: randomUUID(),
        tipo: 'receita',
        categoria: 'receita',
        valor: 100,
        usuario_id: 'user-123',
      };

      const resultado = registrarLancamento(db, lancamento as unknown);

      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain('Data');
    });

    it('deve rejeitar categoria inválida para tipo receita', () => {
      const lancamento: Omit<LedgerEntry, 'criado_em' | 'atualizado_em'> = {
        id: randomUUID(),
        data: '2024-10-04',
        tipo: 'receita',
        categoria: 'comissao', // comissao é despesa, não receita
        valor: 500.00,
        usuario_id: 'user-123',
      };

      const resultado = registrarLancamento(db, lancamento);

      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain('não é válida');
    });

    it('deve rejeitar categoria inválida para tipo despesa', () => {
      const lancamento: Omit<LedgerEntry, 'criado_em' | 'atualizado_em'> = {
        id: randomUUID(),
        data: '2024-10-04',
        tipo: 'despesa',
        categoria: 'aluguel', // aluguel é receita, não despesa
        valor: 500.00,
        usuario_id: 'user-123',
      };

      const resultado = registrarLancamento(db, lancamento);

      expect(resultado.sucesso).toBe(false);
    });

    it('deve rejeitar data em formato inválido', () => {
      const lancamento: Omit<LedgerEntry, 'criado_em' | 'atualizado_em'> = {
        id: randomUUID(),
        data: '04/10/2024', // formato inválido
        tipo: 'receita',
        categoria: 'receita',
        valor: 100,
        usuario_id: 'user-123',
      };

      const resultado = registrarLancamento(db, lancamento);

      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain('formato');
    });
  });

  describe('registrarDoubleEntry', () => {
    it('deve registrar double-entry válido', () => {
      const lancamento: DoubleEntryLancamento = {
        id: randomUUID(),
        data: '2024-10-04',
        descricao: 'Recebimento PIX',
        conta_debito: '1120', // Caixa PIX
        conta_credito: '4110', // Receita
        valor: 2500.00,
        tipo: 'receita',
        categoria: 'receita',
        usuario_id: 'user-123',
      };

      const resultado = registrarDoubleEntry(db, lancamento);

      expect(resultado.sucesso).toBe(true);
      expect(resultado.lancamento_id).toBe(lancamento.id);

      // Verifica se dois lançamentos foram criados
      const entradas = listarLancamentos(db, { usuarioId: 'user-123' });
      expect(entradas.length).toBeGreaterThanOrEqual(2);
    });

    it('deve rejeitar double-entry com contas iguais', () => {
      const lancamento: DoubleEntryLancamento = {
        id: randomUUID(),
        data: '2024-10-04',
        descricao: 'Auto-referência inválida',
        conta_debito: '1120',
        conta_credito: '1120', // Mesma conta
        valor: 1000.00,
        tipo: 'receita',
        categoria: 'receita',
        usuario_id: 'user-123',
      };

      const resultado = registrarDoubleEntry(db, lancamento);

      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain('não pode ser igual');
    });

    it('deve rejeitar se faltar conta de débito', () => {
      const lancamento = {
        id: randomUUID(),
        data: '2024-10-04',
        descricao: 'Falta débito',
        conta_credito: '4110',
        valor: 1000.00,
        tipo: 'receita',
        categoria: 'receita',
        usuario_id: 'user-123',
      };

      const resultado = registrarDoubleEntry(db, lancamento as unknown);

      expect(resultado.sucesso).toBe(false);
    });
  });

  describe('obterLancamento', () => {
    it('deve recuperar lançamento por ID', () => {
      const id = randomUUID();
      const lancamento: Omit<LedgerEntry, 'criado_em' | 'atualizado_em'> = {
        id,
        data: '2024-10-04',
        tipo: 'receita',
        categoria: 'honorario',
        valor: 1500.00,
        usuario_id: 'user-123',
      };

      registrarLancamento(db, lancamento);
      const recuperado = obterLancamento(db, id);

      expect(recuperado).not.toBeNull();
      expect(recuperado?.id).toBe(id);
      expect(recuperado?.valor).toBe(1500.00);
    });

    it('deve retornar null para ID inexistente', () => {
      const resultado = obterLancamento(db, randomUUID());

      expect(resultado).toBeNull();
    });
  });

  describe('listarLancamentos', () => {
    beforeEach(() => {
      // Registra alguns lançamentos para teste
      const lancamentos = [
        {
          id: randomUUID(),
          data: '2024-10-01',
          tipo: 'receita' as const,
          categoria: 'honorario' as const,
          valor: 1000.00,
          usuario_id: 'user-1',
        },
        {
          id: randomUUID(),
          data: '2024-10-02',
          tipo: 'receita' as const,
          categoria: 'aluguel' as const,
          valor: 2000.00,
          usuario_id: 'user-1',
        },
        {
          id: randomUUID(),
          data: '2024-10-03',
          tipo: 'despesa' as const,
          categoria: 'folha_pagamento' as const,
          valor: 5000.00,
          usuario_id: 'user-2',
        },
      ];

      lancamentos.forEach((l) => registrarLancamento(db, l));
    });

    it('deve listar todos os lançamentos', () => {
      const resultado = listarLancamentos(db);

      expect(resultado.length).toBe(3);
    });

    it('deve filtrar por período', () => {
      const resultado = listarLancamentos(db, {
        dataInicio: '2024-10-02',
        dataFim: '2024-10-02',
      });

      expect(resultado.length).toBe(1);
      expect(resultado[0].valor).toBe(2000.00);
    });

    it('deve filtrar por tipo', () => {
      const resultado = listarLancamentos(db, { tipo: 'despesa' });

      expect(resultado.length).toBe(1);
      expect(resultado[0].tipo).toBe('despesa');
    });

    it('deve filtrar por categoria', () => {
      const resultado = listarLancamentos(db, { categoria: 'honorario' });

      expect(resultado.length).toBe(1);
      expect(resultado[0].categoria).toBe('honorario');
    });

    it('deve filtrar por usuário', () => {
      const resultado = listarLancamentos(db, { usuarioId: 'user-1' });

      expect(resultado.length).toBe(2);
    });

    it('deve aplicar múltiplos filtros', () => {
      const resultado = listarLancamentos(db, {
        tipo: 'receita',
        dataInicio: '2024-10-01',
        dataFim: '2024-10-02',
        usuarioId: 'user-1',
      });

      expect(resultado.length).toBe(2);
    });
  });

  describe('calcularSaldoPorCategoria', () => {
    beforeEach(() => {
      const lancamentos = [
        {
          id: randomUUID(),
          data: '2024-10-04',
          tipo: 'receita' as const,
          categoria: 'honorario' as const,
          valor: 1000.00,
        },
        {
          id: randomUUID(),
          data: '2024-10-04',
          tipo: 'receita' as const,
          categoria: 'honorario' as const,
          valor: 500.00,
        },
        {
          id: randomUUID(),
          data: '2024-10-04',
          tipo: 'despesa' as const,
          categoria: 'folha_pagamento' as const,
          valor: 3000.00,
        },
      ];

      lancamentos.forEach((l) => registrarLancamento(db, l));
    });

    it('deve calcular saldo por categoria', () => {
      const resultado = calcularSaldoPorCategoria(db);

      expect(resultado['honorario']).toBe(1500.00); // receita é positiva
      expect(resultado['folha_pagamento']).toBe(-3000.00); // despesa é negativa
    });

    it('deve filtrar por período ao calcular', () => {
      const resultado = calcularSaldoPorCategoria(db, '2024-10-05', '2024-10-31');

      // Nenhum lançamento após 2024-10-04
      expect(Object.keys(resultado).length).toBe(0);
    });
  });

  describe('validarIntegridade', () => {
    it('deve validar double-entry correto', () => {
      const referencia = 'REF-001';

      // Registra débito e crédito
      registrarLancamento(db, {
        id: randomUUID(),
        data: '2024-10-04',
        tipo: 'receita',
        categoria: 'receita',
        valor: 1000.00,
        referencia_externa: referencia,
      });

      registrarLancamento(db, {
        id: randomUUID(),
        data: '2024-10-04',
        tipo: 'receita',
        categoria: 'receita',
        valor: 1000.00,
        referencia_externa: referencia,
      });

      const resultado = validarIntegridade(db, referencia);

      expect(resultado).toBe(true);
    });

    it('deve aceitar lançamento simples', () => {
      const referencia = 'REF-002';

      registrarLancamento(db, {
        id: randomUUID(),
        data: '2024-10-04',
        tipo: 'receita',
        categoria: 'receita',
        valor: 500.00,
        referencia_externa: referencia,
      });

      const resultado = validarIntegridade(db, referencia);

      expect(resultado).toBe(true);
    });

    it('deve retornar falso para referência inexistente', () => {
      const resultado = validarIntegridade(db, 'REF-INEXISTENTE');

      // Não deve encontrar nada — retorna false pois a integridade é questionável
      expect(resultado).toBe(false);
    });
  });

  describe('Integrações', () => {
    it('deve integrar com PIX/OFX reconciliação', () => {
      // Simula um recebimento PIX
      const pixId = randomUUID();
      const resultado = registrarDoubleEntry(db, {
        id: pixId,
        data: '2024-10-04',
        descricao: 'Recebimento PIX - Cliente ABC',
        conta_debito: '1120', // Caixa PIX
        conta_credito: '4110', // Receita
        valor: 2500.00,
        tipo: 'receita',
        categoria: 'receita',
        referencia_externa: `CHARGE-${pixId}`,
        usuario_id: 'sistema',
      });

      expect(resultado.sucesso).toBe(true);

      // Verifica se foi registrado corretamente
      const entradas = listarLancamentos(db, {
        dataInicio: '2024-10-04',
        dataFim: '2024-10-04',
      });

      expect(entradas.length).toBeGreaterThan(0);
      expect(entradas.some((e) => e.categoria === 'receita')).toBe(true);
    });

    it('deve integrar com ASAAS pagamentos', () => {
      // Simula um pagamento via ASAAS
      const pagamentoId = randomUUID();
      const resultado = registrarLancamento(db, {
        id: pagamentoId,
        data: '2024-10-04',
        tipo: 'despesa',
        categoria: 'comissao',
        valor: 250.00,
        descricao: 'Comissão ASAAS - Pagamento 123',
        referencia_externa: `ASAAS-PAG-123`,
        usuario_id: 'sistema',
      });

      expect(resultado.sucesso).toBe(true);

      const registrado = obterLancamento(db, pagamentoId);
      expect(registrado?.categoria).toBe('comissao');
      expect(registrado?.referencia_externa).toContain('ASAAS');
    });

    it('deve rastrear auditoria em registros', () => {
      const lancamentoId = randomUUID();
      const resultado = registrarLancamento(db, {
        id: lancamentoId,
        data: '2024-10-04',
        tipo: 'receita',
        categoria: 'honorario',
        valor: 1000.00,
        descricao: 'Auditoria - Teste',
        usuario_id: 'user-auditoria',
      });

      expect(resultado.sucesso).toBe(true);

      // Verifica se auditoria foi registrada
      const stmt = db.prepare(`
        SELECT * FROM auditoria
        WHERE registro_id = ? AND tabela = 'ledger_entries'
      `);
      const auditoria = stmt.get(lancamentoId);

      expect(auditoria).toBeDefined();
    });
  });
});
