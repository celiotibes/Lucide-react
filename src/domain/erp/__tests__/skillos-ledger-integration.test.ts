/**
 * Testes: Skillos Habilidades → Ledger Integration
 * Valida persistência, rastreamento e ROI de desenvolvimento de habilidades
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Database } from "sql.js";
import initSqlJs from "sql.js";
import { consultar, executar } from "../../../db/connection";
import {
  registrarHabilidadeParaAquisicao,
  registrarHabilidadeAdquirida,
  registrarManutenacaoHabilidade,
  registrarDepreciacaoHabilidade,
  obterSaldoHabilidades,
  sincronizarHabilidadesParaLedger,
  gerarRelatorioInvestimentoHabilidades,
  obterRastreamentoHabilidade,
  marcarHabilidadeObsoleta,
  reverterHabilidadeNoLedger,
  SkillsLedgerEntry,
  RelatorioROIHabilidades,
} from "../skillos-ledger-integration";
import { registrarLancamentoContabil } from "../ledger";

let db: Database;

/**
 * Setup: Criar banco de dados em memória com schema completo
 */
beforeEach(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();

  // ============================================================================
  // SCHEMA BÁSICO
  // ============================================================================

  // Tabela: Plano de contas
  executar(
    db,
    `CREATE TABLE contas_plano_contas (
      id INTEGER PRIMARY KEY,
      codigo VARCHAR(20),
      descricao TEXT,
      natureza VARCHAR(10),
      ativo INTEGER,
      analisavel INTEGER
    )`
  );

  // Inserir contas utilizadas para skillos
  const contas = [
    [45, "5.3.05", "Despesa de Desenvolvimento", "debito", 1, 1],
    [46, "5.3.06", "Despesa Manutenção Habilidades", "debito", 1, 1],
    [47, "5.3.07", "Depreciação Habilidades", "debito", 1, 1],
    [20, "1.2.10", "Ativos Intangíveis", "debito", 1, 1],
    [13, "3.1.02", "Contas a Pagar", "credito", 1, 1],
  ];

  contas.forEach((conta) => {
    executar(
      db,
      `INSERT INTO contas_plano_contas (id, codigo, descricao, natureza, ativo, analisavel) VALUES (?, ?, ?, ?, ?, ?)`,
      conta
    );
  });

  // Tabela: Períodos contábeis
  executar(
    db,
    `CREATE TABLE periodos_contabeis (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER,
      ano INTEGER,
      mes INTEGER,
      status VARCHAR(20),
      data_fechamento DATETIME,
      encerrado_por INTEGER
    )`
  );

  // Inserir período de teste
  executar(
    db,
    `INSERT INTO periodos_contabeis (id, entidade_id, ano, mes, status) VALUES (1, 1, 2025, 1, 'aberto')`
  );

  // Tabela: Ledger entries (central)
  executar(
    db,
    `CREATE TABLE ledger_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entidade_id INTEGER,
      periodo_id INTEGER,
      centro_custo_id INTEGER,
      conta_id INTEGER,
      data_lancamento TEXT,
      valor_debito DECIMAL(12,2),
      valor_credito DECIMAL(12,2),
      descricao TEXT,
      origem_modulo TEXT,
      origem_id INTEGER,
      referencia_documento TEXT,
      criado_por INTEGER,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );

  // Tabela: skillos_ledger_entries
  executar(
    db,
    `CREATE TABLE skillos_ledger_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habilidade_id INTEGER,
      tipo_habilidade VARCHAR(20),
      ledger_entry_id INTEGER,
      ledger_entry_id_contrapartida INTEGER,
      pessoa_id INTEGER,
      entidade_id INTEGER,
      periodo_id INTEGER,
      valor DECIMAL(12,2),
      conta_debito_id INTEGER,
      conta_credito_id INTEGER,
      descricao TEXT,
      status_ciclo_vida VARCHAR(20) DEFAULT 'ativa',
      data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );

  // Tabela: pessoas
  executar(
    db,
    `CREATE TABLE pessoas (
      id INTEGER PRIMARY KEY,
      nome TEXT,
      tipo VARCHAR(20)
    )`
  );

  // Inserir pessoas de teste
  executar(
    db,
    `INSERT INTO pessoas (id, nome, tipo) VALUES (1, 'João Silva', 'pessoa')`
  );
  executar(
    db,
    `INSERT INTO pessoas (id, nome, tipo) VALUES (2, 'Maria Santos', 'pessoa')`
  );

  // Tabela: habilidades_aquisicoes
  executar(
    db,
    `CREATE TABLE habilidades_aquisicoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pessoa_id INTEGER,
      entidade_id INTEGER,
      descricao TEXT,
      tipo VARCHAR(20),
      valor_investimento DECIMAL(12,2),
      data_evento DATE,
      status VARCHAR(20) DEFAULT 'pendente',
      status_persistencia VARCHAR(20) DEFAULT 'pendente',
      motivo_obsoleto TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );
});

afterEach(() => {
  // Cleanup
});

// ============================================================================
// TESTES: Registro de Habilidades
// ============================================================================

describe("Skillos Ledger Integration", () => {
  describe("Aquisição de Habilidade", () => {
    it("T1: Registrar habilidade para aquisição (treinamento)", () => {
      const resultado = registrarHabilidadeParaAquisicao(
        db,
        1, // habilidade_id
        1, // pessoa_id (João)
        1, // entidade_id
        1, // periodo_id
        500.0, // valor_treinamento
        "JavaScript Avançado",
        "2025-01-15"
      );

      expect(resultado).toBeDefined();
      expect(resultado.tipo_habilidade).toBe("aquisicao");
      expect(resultado.valor).toBe(500.0);
      expect(resultado.pessoa_id).toBe(1);
      expect(resultado.status_ciclo_vida).toBe("ativa");
      expect(resultado.ledger_entry_id).toBeGreaterThan(0);
      expect(resultado.ledger_entry_id_contrapartida).toBeGreaterThan(0);
    });

    it("T2: Lançamentos contábeis duplos estão balanceados para aquisição", () => {
      registrarHabilidadeParaAquisicao(
        db,
        1,
        1,
        1,
        1,
        500.0,
        "JavaScript Avançado",
        "2025-01-15"
      );

      const [lancamentos] = consultar<{
        total_debito: number;
        total_credito: number;
      }>(
        db,
        `SELECT
          SUM(valor_debito) as total_debito,
          SUM(valor_credito) as total_credito
        FROM ledger_entries
        WHERE origem_modulo = 'skillos' AND origem_id = 1`
      );

      expect(lancamentos?.total_debito).toBe(500.0);
      expect(lancamentos?.total_credito).toBe(500.0);
    });

    it("T3: Validação rejeita valor negativo na aquisição", () => {
      expect(() => {
        registrarHabilidadeParaAquisicao(
          db,
          1,
          1,
          1,
          1,
          -100.0, // Valor negativo
          "JavaScript Avançado",
          "2025-01-15"
        );
      }).toThrow("valor_treinamento deve ser positivo");
    });

    it("T4: Validação rejeita falta de parâmetros obrigatórios", () => {
      expect(() => {
        registrarHabilidadeParaAquisicao(
          db,
          0, // habilidade_id inválido
          1,
          1,
          1,
          500.0,
          "JavaScript Avançado",
          "2025-01-15"
        );
      }).toThrow("parâmetros obrigatórios ausentes");
    });
  });

  describe("Certificação de Habilidade", () => {
    it("T5: Registrar habilidade adquirida (certificação capitalizada)", () => {
      const resultado = registrarHabilidadeAdquirida(
        db,
        2, // habilidade_id
        1, // pessoa_id
        1, // entidade_id
        1, // periodo_id
        2000.0, // valor_certificacao
        "AWS Solutions Architect",
        "2025-02-01"
      );

      expect(resultado).toBeDefined();
      expect(resultado.tipo_habilidade).toBe("certificacao");
      expect(resultado.valor).toBe(2000.0);
      expect(resultado.conta_debito_id).toBe(20); // Ativos Intangíveis
      expect(resultado.conta_credito_id).toBe(13); // Contas a Pagar
    });

    it("T6: Certificação capitaliza como ativo intangível (débito em conta certa)", () => {
      registrarHabilidadeAdquirida(
        db,
        2,
        1,
        1,
        1,
        2000.0,
        "AWS Solutions Architect",
        "2025-02-01"
      );

      const [lancamento_debito] = consultar<{
        conta_id: number;
        valor_debito: number;
      }>(
        db,
        `SELECT conta_id, valor_debito FROM ledger_entries
        WHERE origem_modulo = 'skillos' AND origem_id = 2 AND valor_debito IS NOT NULL`
      );

      expect(lancamento_debito?.conta_id).toBe(20); // Ativos Intangíveis
      expect(lancamento_debito?.valor_debito).toBe(2000.0);
    });

    it("T7: Validação rejeita valor zero em certificação", () => {
      expect(() => {
        registrarHabilidadeAdquirida(
          db,
          2,
          1,
          1,
          1,
          0, // Valor zero
          "AWS Solutions Architect",
          "2025-02-01"
        );
      }).toThrow("valor_certificacao deve ser positivo");
    });
  });

  describe("Manutenção de Habilidade", () => {
    it("T8: Registrar manutenção anual de habilidade", () => {
      const resultado = registrarManutenacaoHabilidade(
        db,
        3, // habilidade_id
        1, // pessoa_id
        1, // entidade_id
        1, // periodo_id
        150.0, // valor_manutencao
        "JavaScript - Atualização Anual",
        "2025-03-01"
      );

      expect(resultado).toBeDefined();
      expect(resultado.tipo_habilidade).toBe("manutencao");
      expect(resultado.valor).toBe(150.0);
      expect(resultado.conta_debito_id).toBe(46); // Despesa Manutenção Habilidades
    });

    it("T9: Manutenção se reflete como despesa operacional recorrente", () => {
      registrarManutenacaoHabilidade(
        db,
        3,
        1,
        1,
        1,
        150.0,
        "JavaScript - Atualização Anual",
        "2025-03-01"
      );

      const [lancamento] = consultar<{ valor_debito: number }>(
        db,
        `SELECT valor_debito FROM ledger_entries
        WHERE origem_modulo = 'skillos' AND origem_id = 3 AND valor_debito IS NOT NULL`
      );

      expect(lancamento?.valor_debito).toBe(150.0);
    });
  });

  describe("Depreciação de Habilidade", () => {
    it("T10: Registrar depreciação mensal de habilidade capitalizada", () => {
      const resultado = registrarDepreciacaoHabilidade(
        db,
        4, // habilidade_id
        1, // pessoa_id
        1, // entidade_id
        1, // periodo_id
        166.67, // valor_depreciacao_mensal (2000 / 12 meses)
        "AWS Solutions Architect - Depreciação",
        "2025-03-01"
      );

      expect(resultado).toBeDefined();
      expect(resultado.tipo_habilidade).toBe("manutencao");
      expect(resultado.valor).toBe(166.67);
      expect(resultado.conta_debito_id).toBe(47); // Depreciação Habilidades
      expect(resultado.conta_credito_id).toBe(20); // Redução em Ativos
    });

    it("T11: Depreciação reduz valor de ativos intangíveis", () => {
      registrarDepreciacaoHabilidade(
        db,
        4,
        1,
        1,
        1,
        166.67,
        "AWS Solutions Architect - Depreciação",
        "2025-03-01"
      );

      const [lancamento_credito] = consultar<{ conta_id: number; valor_credito: number }>(
        db,
        `SELECT conta_id, valor_credito FROM ledger_entries
        WHERE origem_modulo = 'skillos' AND origem_id = 4 AND valor_credito IS NOT NULL`
      );

      expect(lancamento_credito?.conta_id).toBe(20); // Ativos Intangíveis
      expect(lancamento_credito?.valor_credito).toBe(166.67);
    });
  });

  describe("Rastreamento e Auditoria", () => {
    it("T12: Rastreamento bidirecional registra relação habilidade-ledger", () => {
      registrarHabilidadeParaAquisicao(
        db,
        5,
        2, // Maria
        1,
        1,
        750.0,
        "Python Avançado",
        "2025-01-20"
      );

      const rastreamentos = obterRastreamentoHabilidade(db, 5);

      expect(rastreamentos.length).toBeGreaterThan(0);
      expect(rastreamentos[0].habilidade_id).toBe(5);
      expect(rastreamentos[0].pessoa_id).toBe(2);
      expect(rastreamentos[0].ledger_entry_id).toBeGreaterThan(0);
    });

    it("T13: Reversão de lançamentos cria estornos duplos", () => {
      registrarHabilidadeParaAquisicao(
        db,
        6,
        1,
        1,
        1,
        600.0,
        "React Avançado",
        "2025-01-25"
      );

      const resultado = reverterHabilidadeNoLedger(
        db,
        6,
        "Erro de entrada - reprocessar"
      );

      expect(resultado.sucesso).toBe(true);
      expect(resultado.lançamentos_revertidos).toBeGreaterThan(0);

      // Verificar que há lançamentos com "ESTORNO" na descrição
      const [estorno] = consultar<{ descricao: string }>(
        db,
        `SELECT descricao FROM ledger_entries
        WHERE descricao LIKE '%ESTORNO%' AND origem_id = 6`
      );

      expect(estorno?.descricao).toContain("ESTORNO");
    });

    it("T14: Marcar habilidade como obsoleta muda ciclo de vida", () => {
      registrarHabilidadeParaAquisicao(
        db,
        7,
        1,
        1,
        1,
        500.0,
        "COBOL - Legacy",
        "2024-01-01"
      );

      const resultado = marcarHabilidadeObsoleta(
        db,
        7,
        "Tecnologia descontinuada"
      );

      expect(resultado.sucesso).toBe(true);

      const [skill] = consultar<{ status_ciclo_vida: string }>(
        db,
        `SELECT status_ciclo_vida FROM skillos_ledger_entries WHERE habilidade_id = 7`
      );

      expect(skill?.status_ciclo_vida).toBe("obsoleta");
    });
  });

  describe("Aggregação e Relatórios", () => {
    it("T15: Obter saldo total de investimento em habilidades", () => {
      registrarHabilidadeParaAquisicao(
        db,
        8,
        1,
        1,
        1,
        500.0,
        "Skill 1",
        "2025-01-10"
      );

      registrarHabilidadeParaAquisicao(
        db,
        9,
        1,
        1,
        1,
        750.0,
        "Skill 2",
        "2025-01-15"
      );

      registrarManutenacaoHabilidade(
        db,
        10,
        1,
        1,
        1,
        200.0,
        "Skill 3",
        "2025-01-20"
      );

      const saldo = obterSaldoHabilidades(db, 1, 1);

      expect(saldo.total_investimento).toBe(1450.0);
      expect(saldo.por_tipo.length).toBeGreaterThan(0);
    });

    it("T16: Gerar relatório de ROI por pessoa", () => {
      registrarHabilidadeParaAquisicao(
        db,
        11,
        1,
        1,
        1,
        1000.0,
        "Investimento em Dev",
        "2025-01-05"
      );

      registrarHabilidadeAdquirida(
        db,
        12,
        1,
        1,
        1,
        5000.0,
        "Certificação Premium",
        "2025-02-01"
      );

      const relatorio = gerarRelatorioInvestimentoHabilidades(db, 1, 1, 1);

      expect(relatorio.length).toBeGreaterThan(0);
      expect(relatorio[0].pessoa_id).toBe(1);
      expect(relatorio[0].pessoa_nome).toBe("João Silva");
      expect(relatorio[0].total_investimento).toBeGreaterThan(0);
      expect(relatorio[0].valor_assets_intangibles).toBeGreaterThan(0);
      expect(relatorio[0].por_habilidade.length).toBeGreaterThan(0);
    });

    it("T17: Relatório agrupa corretamente por múltiplas pessoas", () => {
      // João
      registrarHabilidadeParaAquisicao(
        db,
        13,
        1,
        1,
        1,
        500.0,
        "JS para João",
        "2025-01-10"
      );

      // Maria
      registrarHabilidadeParaAquisicao(
        db,
        14,
        2,
        1,
        1,
        800.0,
        "Python para Maria",
        "2025-01-12"
      );

      const relatorio = gerarRelatorioInvestimentoHabilidades(db, 1, 1);

      expect(relatorio.length).toBe(2);

      const joao = relatorio.find((r) => r.pessoa_id === 1);
      const maria = relatorio.find((r) => r.pessoa_id === 2);

      expect(joao?.total_investimento).toBe(500.0);
      expect(maria?.total_investimento).toBe(800.0);
    });

    it("T18: ROI calculado corretamente (assets / investimento)", () => {
      // Aquisição (expensed): 1000
      registrarHabilidadeParaAquisicao(
        db,
        15,
        1,
        1,
        1,
        1000.0,
        "Treinamento",
        "2025-01-05"
      );

      // Certificação (capitalized asset): 3000
      registrarHabilidadeAdquirida(
        db,
        16,
        1,
        1,
        1,
        3000.0,
        "Certificado",
        "2025-02-01"
      );

      const relatorio = gerarRelatorioInvestimentoHabilidades(db, 1, 1, 1);

      expect(relatorio.length).toBeGreaterThan(0);
      // ROI = (3000 - 4000) / 4000 = -25%
      // (Assets - Total Investment) / Total Investment
      const roi = relatorio[0].roi_percentual;
      expect(roi).toBeLessThan(0); // Negativo pois há mais despesa que asset
    });
  });

  describe("Sincronização em Lote", () => {
    it("T19: Sincronizar múltiplas habilidades para ledger (batch)", () => {
      // Insere habilidades na tabela de aquisições
      executar(
        db,
        `INSERT INTO habilidades_aquisicoes
        (pessoa_id, entidade_id, descricao, tipo, valor_investimento, data_evento, status_persistencia)
        VALUES (1, 1, 'Skill A', 'aquisicao', 500.0, '2025-01-15', 'pendente')`
      );

      executar(
        db,
        `INSERT INTO habilidades_aquisicoes
        (pessoa_id, entidade_id, descricao, tipo, valor_investimento, data_evento, status_persistencia)
        VALUES (1, 1, 'Skill B', 'certificacao', 2000.0, '2025-02-01', 'pendente')`
      );

      const resultado = sincronizarHabilidadesParaLedger(db, 1, 1, 100);

      expect(resultado.processadas).toBeGreaterThan(0);
      expect(resultado.sucessos).toBeGreaterThan(0);
      expect(resultado.detalhes.length).toBeGreaterThan(0);
    });

    it("T20: Sincronização marca habilidades como sincronizadas", () => {
      executar(
        db,
        `INSERT INTO habilidades_aquisicoes
        (pessoa_id, entidade_id, descricao, tipo, valor_investimento, data_evento, status_persistencia)
        VALUES (1, 1, 'Skill Sync Test', 'aquisicao', 300.0, '2025-01-18', 'pendente')`
      );

      sincronizarHabilidadesParaLedger(db, 1, 1, 100);

      const [status] = consultar<{ status_persistencia: string }>(
        db,
        `SELECT status_persistencia FROM habilidades_aquisicoes
        WHERE descricao = 'Skill Sync Test'`
      );

      expect(status?.status_persistencia).toBe("sincronizado");
    });
  });

  describe("Edge Cases e Validações", () => {
    it("T21: Múltiplas operações no mesmo período mantêm balanceamento", () => {
      registrarHabilidadeParaAquisicao(
        db,
        20,
        1,
        1,
        1,
        500.0,
        "Skill 1",
        "2025-01-10"
      );

      registrarHabilidadeAdquirida(
        db,
        21,
        1,
        1,
        1,
        2000.0,
        "Skill 2",
        "2025-01-15"
      );

      registrarManutenacaoHabilidade(
        db,
        22,
        1,
        1,
        1,
        150.0,
        "Skill 3",
        "2025-01-20"
      );

      const [totais] = consultar<{
        total_debito: number;
        total_credito: number;
      }>(
        db,
        `SELECT
          SUM(valor_debito) as total_debito,
          SUM(valor_credito) as total_credito
        FROM ledger_entries
        WHERE origem_modulo = 'skillos'`
      );

      expect(totais?.total_debito).toBe(totais?.total_credito);
      expect(totais?.total_debito).toBe(2650.0);
    });

    it("T22: Lançamentos preservam rastreabilidade bidirecional", () => {
      const resultado = registrarHabilidadeParaAquisicao(
        db,
        25,
        1,
        1,
        1,
        600.0,
        "TypeScript",
        "2025-01-16"
      );

      // Obter via ledger_entry_id
      const [lancamento] = consultar<{ referencia_documento: string }>(
        db,
        `SELECT referencia_documento FROM ledger_entries WHERE id = ?`,
        [resultado.ledger_entry_id]
      );

      expect(lancamento?.referencia_documento).toContain("SKL-ACQ-25");

      // Obter via skillos_ledger_entries
      const rastreamento = obterRastreamentoHabilidade(db, 25);
      expect(rastreamento[0].ledger_entry_id).toBe(resultado.ledger_entry_id);
    });
  });
});
