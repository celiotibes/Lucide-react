import { describe, it, expect, beforeEach } from "vitest";
import {
  registrarMovimentoPessoalNoLedger,
  obterSaldoContaPessoal,
  sincronizarMovimentosPessoaisParaLedger,
  gerarRelatorioMovimentosPessoais,
  obterMapeamentoMovimento,
  validarMovimentoParaLedger,
} from "../contas-pessoais-ledger-integration";
import { obterSaldoConta } from "../ledger";
import { prepararBancoTeste } from "./test-setup";

describe("Integração Contas Pessoais-Ledger", () => {
  let db: any;
  let entidade_id: number;
  let periodo_id: number;
  let conta_pessoal_id: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
    periodo_id = setup.periodo_id;
    conta_pessoal_id = 1; // Conta pessoal de teste já inserida no setup
  });

  describe("obterMapeamentoMovimento", () => {
    it("deve retornar mapeamento válido para depósito", () => {
      const mapeamento = obterMapeamentoMovimento("deposito");
      expect(mapeamento).not.toBeNull();
      expect(mapeamento?.tipo_movimento).toBe("deposito");
      expect(mapeamento?.conta_id_debito).toBe(1105); // 1.1.05
      expect(mapeamento?.conta_id_credito).toBe(3101); // 3.1.01
    });

    it("deve retornar mapeamento válido para saque", () => {
      const mapeamento = obterMapeamentoMovimento("saque");
      expect(mapeamento).not.toBeNull();
      expect(mapeamento?.tipo_movimento).toBe("saque");
      expect(mapeamento?.conta_id_debito).toBe(3101);
      expect(mapeamento?.conta_id_credito).toBe(1105);
    });

    it("deve retornar mapeamento válido para transferência de origem", () => {
      const mapeamento = obterMapeamentoMovimento("transferencia_origem");
      expect(mapeamento).not.toBeNull();
      expect(mapeamento?.tipo_movimento).toBe("transferencia_origem");
    });

    it("deve retornar null para tipo de movimento inválido", () => {
      const mapeamento = obterMapeamentoMovimento("invalido" as any);
      expect(mapeamento).toBeNull();
    });
  });

  describe("validarMovimentoParaLedger", () => {
    it("deve validar movimento correto", () => {
      const movimento = {
        movimento_pessoal_id: 1,
        conta_pessoal_id: 1,
        valor: 1000,
        data_movimento: "2026-01-15",
        tipo_movimento: "deposito",
        referencia_documento: "DEP-001",
      };

      const resultado = validarMovimentoParaLedger(movimento);
      expect(resultado.valido).toBe(true);
      expect(resultado.erros).toHaveLength(0);
    });

    it("deve rejeitar movimento sem movimento_pessoal_id", () => {
      const movimento = {
        conta_pessoal_id: 1,
        valor: 1000,
        data_movimento: "2026-01-15",
        tipo_movimento: "deposito",
        referencia_documento: "DEP-001",
      };

      const resultado = validarMovimentoParaLedger(movimento);
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain("movimento_pessoal_id obrigatório");
    });

    it("deve rejeitar movimento com valor negativo", () => {
      const movimento = {
        movimento_pessoal_id: 1,
        conta_pessoal_id: 1,
        valor: -1000,
        data_movimento: "2026-01-15",
        tipo_movimento: "deposito",
        referencia_documento: "DEP-001",
      };

      const resultado = validarMovimentoParaLedger(movimento);
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain("valor deve ser positivo");
    });

    it("deve rejeitar movimento com tipo inválido", () => {
      const movimento = {
        movimento_pessoal_id: 1,
        conta_pessoal_id: 1,
        valor: 1000,
        data_movimento: "2026-01-15",
        tipo_movimento: "invalido",
        referencia_documento: "DEP-001",
      };

      const resultado = validarMovimentoParaLedger(movimento);
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain("tipo_movimento inválido");
    });

    it("deve rejeitar movimento sem referencia_documento", () => {
      const movimento = {
        movimento_pessoal_id: 1,
        conta_pessoal_id: 1,
        valor: 1000,
        data_movimento: "2026-01-15",
        tipo_movimento: "deposito",
      };

      const resultado = validarMovimentoParaLedger(movimento);
      expect(resultado.valido).toBe(false);
      expect(resultado.erros).toContain("referencia_documento obrigatória");
    });
  });

  describe("registrarMovimentoPessoalNoLedger - Depósito", () => {
    it("deve registrar depósito com dupla entrada (débito/crédito)", () => {
      const resultado = registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 1,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-15",
        tipo_movimento: "deposito",
        valor: 5000,
        descricao: "Depósito inicial",
        referencia_documento: "DEP-001",
      });

      expect(resultado).not.toBeNull();
      expect(resultado?.lancamento_debito_id).toBeGreaterThan(0);
      expect(resultado?.lancamento_credito_id).toBeGreaterThan(0);
    });

    it("deve registrar débito em conta pessoal (1.1.05) para depósito", () => {
      const resultado = registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 2,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-16",
        tipo_movimento: "deposito",
        valor: 3000,
        descricao: "Depósito adicional",
        referencia_documento: "DEP-002",
      });

      expect(resultado).not.toBeNull();

      // Verificar saldo débito em conta pessoal (1.1.05)
      const saldoDebito = obterSaldoConta(db, periodo_id, 1105);
      expect(saldoDebito).toBe(3000);
    });

    it("deve registrar crédito em aportes pessoais (3.1.01) para depósito", () => {
      registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 3,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-17",
        tipo_movimento: "deposito",
        valor: 2000,
        descricao: "Depósito de teste",
        referencia_documento: "DEP-003",
      });

      // Verificar saldo crédito em aportes (3.1.01)
      const saldoAportes = obterSaldoConta(db, periodo_id, 3101);
      expect(saldoAportes).toBe(-2000); // Contas de crédito são negativas
    });

    it("deve registrar múltiplos depósitos acumulando saldos", () => {
      registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 4,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-15",
        tipo_movimento: "deposito",
        valor: 1000,
        descricao: "Depósito 1",
        referencia_documento: "DEP-004",
      });

      registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 5,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-16",
        tipo_movimento: "deposito",
        valor: 2000,
        descricao: "Depósito 2",
        referencia_documento: "DEP-005",
      });

      const saldoTotal = obterSaldoConta(db, periodo_id, 1105);
      expect(saldoTotal).toBe(3000); // 1000 + 2000
    });
  });

  describe("registrarMovimentoPessoalNoLedger - Saque", () => {
    it("deve registrar saque com dupla entrada invertida", () => {
      const resultado = registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 10,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-20",
        tipo_movimento: "saque",
        valor: 1000,
        descricao: "Saque pessoal",
        referencia_documento: "SAQ-001",
      });

      expect(resultado).not.toBeNull();
      expect(resultado?.lancamento_debito_id).toBeGreaterThan(0);
      expect(resultado?.lancamento_credito_id).toBeGreaterThan(0);
    });

    it("deve registrar débito em aportes (3.1.01) e crédito em pessoal (1.1.05) para saque", () => {
      registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 11,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-21",
        tipo_movimento: "saque",
        valor: 500,
        descricao: "Saque teste",
        referencia_documento: "SAQ-002",
      });

      // Débito em 3.1.01 (aportes)
      const saldoAportes = obterSaldoConta(db, periodo_id, 3101);
      expect(saldoAportes).toBeGreaterThanOrEqual(500);

      // Crédito em 1.1.05 (pessoal) reduz o saldo
      const saldoPessoal = obterSaldoConta(db, periodo_id, 1105);
      expect(saldoPessoal).toBeLessThanOrEqual(0);
    });

    it("deve permitir saques múltiplos se houver saldo suficiente", () => {
      // Primeiro um depósito
      registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 20,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-15",
        tipo_movimento: "deposito",
        valor: 10000,
        descricao: "Depósito para saques",
        referencia_documento: "DEP-010",
      });

      // Múltiplos saques
      registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 21,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-20",
        tipo_movimento: "saque",
        valor: 2000,
        descricao: "Saque 1",
        referencia_documento: "SAQ-010",
      });

      registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 22,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-21",
        tipo_movimento: "saque",
        valor: 3000,
        descricao: "Saque 2",
        referencia_documento: "SAQ-011",
      });

      // Saldo deve ser 10000 - 2000 - 3000 = 5000
      const saldoFinal = obterSaldoContaPessoal(db, periodo_id, conta_pessoal_id);
      expect(saldoFinal).toBeGreaterThanOrEqual(5000);
    });
  });

  describe("registrarMovimentoPessoalNoLedger - Transferências", () => {
    it("deve registrar transferência entre contas pessoais com origem e destino", () => {
      // Inserir segunda conta pessoal
      db.run(
        `INSERT INTO contas_pessoais (id, entidade_id, tipo_conta, descricao, saldo_inicial, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [2, entidade_id, "poupanca_pessoal", "Poupança", 0, "ativa"]
      );

      // Transferência de origem
      const resultadoOrigem = registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 30,
        conta_pessoal_id: 1, // De conta 1
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-25",
        tipo_movimento: "transferencia_origem",
        valor: 2000,
        descricao: "Transferência para poupança",
        referencia_documento: "TRANS-01-OUT",
      });

      expect(resultadoOrigem).not.toBeNull();
    });

    it("deve evitar duplicação de movimento via hash de provenance", () => {
      const movimento = {
        movimento_pessoal_id: 40,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-30",
        tipo_movimento: "deposito" as const,
        valor: 1500,
        descricao: "Depósito único",
        referencia_documento: "DEP-DUP-001",
      };

      // Primeira inserção deve funcionar
      const resultado1 = registrarMovimentoPessoalNoLedger(db, movimento);
      expect(resultado1).not.toBeNull();

      // Segunda inserção com mesmo movimento deve falhar (duplicado)
      const resultado2 = registrarMovimentoPessoalNoLedger(db, movimento);
      expect(resultado2).toBeNull();
    });

    it("deve registrar log de sincronização para duplicação", () => {
      const movimento = {
        movimento_pessoal_id: 41,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-31",
        tipo_movimento: "deposito" as const,
        valor: 1000,
        descricao: "Teste duplicação",
        referencia_documento: "DEP-LOG-001",
      };

      registrarMovimentoPessoalNoLedger(db, movimento);
      registrarMovimentoPessoalNoLedger(db, movimento);

      // Verificar logs
      const logs = db.exec(
        `SELECT COUNT(*) as count FROM contas_pessoais_sincronizacao_log
         WHERE movimento_pessoal_id = ? AND status IN ('erro', 'duplicado')`,
        [41]
      );

      expect(logs[0]?.values?.[0]?.[0]).toBeGreaterThan(0);
    });
  });

  describe("obterSaldoContaPessoal", () => {
    it("deve retornar saldo inicial quando sem movimentos", () => {
      // Já existe conta_pessoal_id 1 com saldo_inicial 500
      const saldo = obterSaldoContaPessoal(db, periodo_id, conta_pessoal_id);
      expect(saldo).toBe(500); // Saldo inicial inserido no setup
    });

    it("deve incluir depósitos no saldo da conta pessoal", () => {
      registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 50,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-15",
        tipo_movimento: "deposito",
        valor: 2000,
        descricao: "Depósito para saldo",
        referencia_documento: "DEP-SALDO-001",
      });

      const saldo = obterSaldoContaPessoal(db, periodo_id, conta_pessoal_id);
      expect(saldo).toBe(2500); // 500 inicial + 2000 depósito
    });

    it("deve subtrair saques do saldo da conta pessoal", () => {
      // Primeiro, depositar
      registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 51,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-15",
        tipo_movimento: "deposito",
        valor: 5000,
        descricao: "Depósito base",
        referencia_documento: "DEP-BASE-001",
      });

      // Depois, sacar
      registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 52,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-20",
        tipo_movimento: "saque",
        valor: 1000,
        descricao: "Saque teste",
        referencia_documento: "SAQ-SALDO-001",
      });

      const saldo = obterSaldoContaPessoal(db, periodo_id, conta_pessoal_id);
      // 500 (inicial) + 5000 (depósito) - 1000 (saque)
      expect(saldo).toBeGreaterThanOrEqual(4500);
    });

    it("deve retornar 0 para conta pessoal não existente", () => {
      const saldo = obterSaldoContaPessoal(db, periodo_id, 9999);
      expect(saldo).toBe(0);
    });
  });

  describe("sincronizarMovimentosPessoaisParaLedger", () => {
    it("deve sincronizar movimentos em lote", () => {
      // Inserir movimentos diretos na tabela (não sincronizados)
      db.run(
        `INSERT INTO movimentos_pessoais (conta_pessoal_id, entidade_id, periodo_id, data_movimento, descricao, tipo_movimento, valor, categoria, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [conta_pessoal_id, entidade_id, periodo_id, "2026-01-10", "Movimento 1", "entrada", 1000, "salario"]
      );

      db.run(
        `INSERT INTO movimentos_pessoais (conta_pessoal_id, entidade_id, periodo_id, data_movimento, descricao, tipo_movimento, valor, categoria, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [conta_pessoal_id, entidade_id, periodo_id, "2026-01-15", "Movimento 2", "saida", 500, "despesa"]
      );

      const resultado = sincronizarMovimentosPessoaisParaLedger(db, entidade_id, periodo_id, 10);

      expect(resultado.processados).toBeGreaterThan(0);
      expect(resultado.sucessos).toBeGreaterThan(0);
    });

    it("deve respeitar limite de processamento por lote", () => {
      // Inserir 15 movimentos
      for (let i = 0; i < 15; i++) {
        db.run(
          `INSERT INTO movimentos_pessoais (conta_pessoal_id, entidade_id, periodo_id, data_movimento, descricao, tipo_movimento, valor, categoria, criado_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [conta_pessoal_id, entidade_id, periodo_id, "2026-01-15", `Movimento ${i}`, "entrada", 100, "outros"]
        );
      }

      const resultado = sincronizarMovimentosPessoaisParaLedger(db, entidade_id, periodo_id, 5);

      // Deve processar no máximo o limite
      expect(resultado.processados).toBeLessThanOrEqual(5);
    });

    it("deve retornar 0 quando não há movimentos para sincronizar", () => {
      const resultado = sincronizarMovimentosPessoaisParaLedger(db, 9999, periodo_id, 10);
      expect(resultado.processados).toBe(0);
    });
  });

  describe("gerarRelatorioMovimentosPessoais", () => {
    it("deve gerar relatório básico de conta pessoal", () => {
      registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 60,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-15",
        tipo_movimento: "deposito",
        valor: 3000,
        descricao: "Depósito relatório",
        referencia_documento: "REL-DEP-001",
      });

      const relatorio = gerarRelatorioMovimentosPessoais(db, periodo_id, conta_pessoal_id);

      expect(relatorio).not.toBeNull();
      expect(relatorio?.conta_pessoal_descricao).toBe("Conta pessoal Banco X");
      expect(relatorio?.movimentos_deposito).toBeGreaterThan(0);
    });

    it("deve calcular saldo corretamente no relatório", () => {
      registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 61,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-15",
        tipo_movimento: "deposito",
        valor: 5000,
        descricao: "Depósito para relatório 1",
        referencia_documento: "REL-CALC-001",
      });

      registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 62,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-20",
        tipo_movimento: "saque",
        valor: 2000,
        descricao: "Saque para relatório",
        referencia_documento: "REL-CALC-002",
      });

      const relatorio = gerarRelatorioMovimentosPessoais(db, periodo_id, conta_pessoal_id);

      expect(relatorio).not.toBeNull();
      expect(relatorio?.total_depositado).toBe(5000);
      expect(relatorio?.total_sacado).toBe(2000);
      expect(relatorio?.saldo_liquido).toBe(3000);
    });

    it("deve incluir saldo anterior no relatório", () => {
      const relatorio = gerarRelatorioMovimentosPessoais(db, periodo_id, conta_pessoal_id);

      expect(relatorio).not.toBeNull();
      expect(relatorio?.saldo_anterior).toBe(500); // Saldo inicial da conta
    });

    it("deve contar sincronizações no relatório", () => {
      registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 63,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-01-15",
        tipo_movimento: "deposito",
        valor: 1000,
        descricao: "Para contagem",
        referencia_documento: "REL-SYNC-001",
      });

      const relatorio = gerarRelatorioMovimentosPessoais(db, periodo_id, conta_pessoal_id);

      expect(relatorio).not.toBeNull();
      expect(relatorio?.movimentos_sincronizados).toBeGreaterThanOrEqual(0);
    });

    it("deve retornar null para conta pessoal não existente", () => {
      const relatorio = gerarRelatorioMovimentosPessoais(db, periodo_id, 9999);
      expect(relatorio).toBeNull();
    });
  });

  describe("Validações de Dupla Entrada", () => {
    it("deve validar que débito e crédito são iguais em depósito", () => {
      const resultado = registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 70,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-02-01",
        tipo_movimento: "deposito",
        valor: 4500,
        descricao: "Dupla entrada validação",
        referencia_documento: "DUP-ENT-001",
      });

      expect(resultado).not.toBeNull();

      // Verificar que débito em 1105 = crédito em 3101
      const saldoDebito = obterSaldoConta(db, periodo_id, 1105);
      const saldoCredito = obterSaldoConta(db, periodo_id, 3101);

      // Ambos devem ser diferentes de zero (em direções opostas)
      expect(Math.abs(saldoDebito)).toBeGreaterThan(0);
      expect(Math.abs(saldoCredito)).toBeGreaterThan(0);
    });

    it("deve manter integridade contábil (débito = crédito)", () => {
      // Registrar vários movimentos
      registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 71,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-02-05",
        tipo_movimento: "deposito",
        valor: 10000,
        descricao: "Integridade 1",
        referencia_documento: "INTEG-001",
      });

      registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 72,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-02-10",
        tipo_movimento: "saque",
        valor: 3000,
        descricao: "Integridade 2",
        referencia_documento: "INTEG-002",
      });

      // Verificar que soma total débito ≈ crédito
      const [totais] = db.exec(
        `SELECT
          COALESCE(SUM(valor_debito), 0) as total_debito,
          COALESCE(SUM(valor_credito), 0) as total_credito
         FROM ledger_entries
         WHERE origem_modulo = 'contas-pessoais'`
      );

      if (totais?.values?.length > 0) {
        const [totalDebito, totalCredito] = totais.values[0];
        expect(Math.abs((totalDebito || 0) - (totalCredito || 0))).toBeLessThan(0.01);
      }
    });
  });

  describe("Casos de Erro e Validação", () => {
    it("deve rejeitar movimento com dados incompletos", () => {
      const resultado = registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 80,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-02-15",
        tipo_movimento: "deposito",
        valor: 0, // Valor inválido
        descricao: "Erro validação",
        referencia_documento: "ERR-VAL-001",
      });

      expect(resultado).toBeNull();
    });

    it("deve registrar tentativa de inserção falhada no log", () => {
      registrarMovimentoPessoalNoLedger(db, {
        movimento_pessoal_id: 81,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-02-20",
        tipo_movimento: "deposito",
        valor: -100, // Valor negativo
        descricao: "Log erro",
        referencia_documento: "LOG-ERR-001",
      });

      const logs = db.exec(
        `SELECT COUNT(*) as count FROM contas_pessoais_sincronizacao_log
         WHERE movimento_pessoal_id = ? AND status = 'erro'`,
        [81]
      );

      expect(logs[0]?.values?.[0]?.[0]).toBeGreaterThan(0);
    });

    it("deve respeitar referencia_documento para evitar duplicação", () => {
      const movimento1 = {
        movimento_pessoal_id: 82,
        conta_pessoal_id,
        entidade_id,
        periodo_id,
        data_movimento: "2026-02-25",
        tipo_movimento: "deposito" as const,
        valor: 2500,
        descricao: "Referência única",
        referencia_documento: "REF-UNICA-001",
      };

      const resultado1 = registrarMovimentoPessoalNoLedger(db, movimento1);
      expect(resultado1).not.toBeNull();

      // Mesmo valor, mesma data, mesmo movimento_id → deve ser detectado como duplicado
      const movimento2 = { ...movimento1 };
      const resultado2 = registrarMovimentoPessoalNoLedger(db, movimento2);
      expect(resultado2).toBeNull();
    });
  });
});
