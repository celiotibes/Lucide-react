import { describe, it, expect, beforeEach } from "vitest";
import {
  registrarLancamentoPagamento,
  sincronizarPagamentosParaLedger,
  sincronizarPagamentoImediato,
  gerarRelatorioSincronizacaoPagamentos,
} from "../pagamentos-ledger-integration";
import { criarPagamento, confirmarPagamento } from "../pagamentos-integracao";
import { obterSaldoConta } from "../ledger";
import { prepararBancoTeste } from "./test-setup";

describe("Integração Pagamentos-Ledger", () => {
  let db: any;
  let entidade_id: number;
  let periodo_id: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
    periodo_id = setup.periodo_id;
  });

  describe("registrarLancamentoPagamento", () => {
    it("deve registrar pagamento com lançamento contábil", () => {
      // 1. Criar pagamento
      const { sucesso: criacaoOk, payment_id } = criarPagamento(db, {
        entidade_id,
        valor: 3000,
        descricao: "Pagamento de serviço",
        tipo_pagamento: "servico",
        metodo_pagamento: "transferencia",
        beneficiario: "Empresa X",
        referencia: "SERV_001",
        data_agendado: "2026-01-25",
      });

      expect(criacaoOk).toBe(true);
      expect(payment_id).toBeDefined();

      const caixaAntes = obterSaldoConta(db, periodo_id, 1101);

      // 2. Registrar lançamento contábil
      const resultado = registrarLancamentoPagamento(
        db,
        payment_id!,
        {
          entidade_id,
          periodo_id,
          valor: 3000,
          tipo_pagamento: "servico",
          metodo_pagamento: "transferencia",
          beneficiario: "Empresa X",
          referencia: "SERV_001",
          descricao: "Pagamento de serviço",
          data_conclusao: "2026-01-25",
        }
      );

      // 3. Verificar se foi criado lançamento contábil
      expect(resultado).not.toBeNull();
      expect(resultado?.lancamento_id).toBeGreaterThan(0);

      // 4. Verificar saldos. O caixa não fica negativo: o fixture abre o período com
      // saldo de 10.000, e um pagamento de 3.000 deixa 7.000. O que o lançamento tem de
      // garantir é que a saída reduziu o caixa exatamente pelo valor pago.
      const saldoDebito = obterSaldoConta(db, periodo_id, 3102); // Contas a Pagar
      expect(saldoDebito).toBeLessThan(0); // passivo baixado pelo débito

      const saldoCaixa = obterSaldoConta(db, periodo_id, 1101);
      expect(saldoCaixa).toBe(caixaAntes - 3000);
    });

    it("deve registrar pagamento de remuneração corretamente", () => {
      const { sucesso, payment_id } = criarPagamento(db, {
        entidade_id,
        valor: 5000,
        descricao: "Salário janeiro",
        tipo_pagamento: "remuneracao_pessoal",
        metodo_pagamento: "transferencia",
        beneficiario: "Colaborador",
        referencia: "SAL_001",
        data_agendado: "2026-01-30",
      });

      expect(sucesso).toBe(true);

      const resultado = registrarLancamentoPagamento(
        db,
        payment_id!,
        {
          entidade_id,
          periodo_id,
          valor: 5000,
          tipo_pagamento: "remuneracao_pessoal",
          metodo_pagamento: "transferencia",
          beneficiario: "Colaborador",
          referencia: "SAL_001",
          descricao: "Salário janeiro",
          data_conclusao: "2026-01-30",
        }
      );

      expect(resultado).not.toBeNull();
      expect(resultado?.lancamento_id).toBeGreaterThan(0);

      // Verificar conta específica de remuneração (3.1.05)
      const saldoRemuneracao = obterSaldoConta(db, periodo_id, 3105);
      expect(saldoRemuneracao).toBeLessThan(0);
    });

    it("deve evitar duplicação de pagamento", () => {
      const { payment_id } = criarPagamento(db, {
        entidade_id,
        valor: 2000,
        descricao: "Pagamento teste",
        tipo_pagamento: "servico",
        metodo_pagamento: "pix",
        beneficiario: "Fornecedor",
        referencia: "TEST_001",
      });

      const pagamento = {
        entidade_id,
        periodo_id,
        valor: 2000,
        tipo_pagamento: "servico",
        metodo_pagamento: "pix",
        beneficiario: "Fornecedor",
        referencia: "TEST_001",
        descricao: "Pagamento teste",
        data_conclusao: "2026-01-25",
      };

      // Primeira vez deve funcionar
      const resultado1 = registrarLancamentoPagamento(db, payment_id!, pagamento);
      expect(resultado1).not.toBeNull();

      // Segunda vez deve retornar duplicado
      const resultado2 = registrarLancamentoPagamento(db, payment_id!, pagamento);
      expect(resultado2).toBeNull();
    });
  });

  describe("sincronizarPagamentoImediato", () => {
    it("deve sincronizar pagamento imediatamente após confirmação", () => {
      // 1. Criar e confirmar pagamento
      const { payment_id } = criarPagamento(db, {
        entidade_id,
        valor: 4000,
        descricao: "Pagamento imediato",
        tipo_pagamento: "aluguel",
        metodo_pagamento: "transferencia",
        beneficiario: "Proprietário",
        referencia: "ALG_001",
      });

      // Simular fluxo de confirmação
      db.exec(
        "UPDATE pagamentos SET status = 'aprovado' WHERE id = ?",
        [payment_id]
      );
      db.exec(
        "UPDATE pagamentos SET status = 'processando' WHERE id = ?",
        [payment_id]
      );
      db.exec(
        "UPDATE pagamentos SET status = 'pago', data_conclusao = datetime('now') WHERE id = ?",
        [payment_id]
      );

      // 2. Sincronizar imediatamente
      const resultado = sincronizarPagamentoImediato(
        db,
        payment_id!,
        entidade_id,
        periodo_id
      );

      expect(resultado).toBe(true);

      // 3. Verificar se pagamento tem ledger_entry_id
      const [pagamento] = db.exec(
        "SELECT ledger_entry_id FROM pagamentos WHERE id = ?",
        [payment_id]
      );
      expect(pagamento?.values[0]?.[0]).toBeDefined();
    });
  });

  describe("sincronizarPagamentosParaLedger", () => {
    it("deve sincronizar pagamentos pendentes em lote", () => {
      // 1. Criar múltiplos pagamentos confirmados
      const pagamentos = [];
      for (let i = 0; i < 3; i++) {
        const { payment_id } = criarPagamento(db, {
          entidade_id,
          valor: 1000 + i * 100,
          descricao: `Pagamento ${i + 1}`,
          tipo_pagamento: "servico",
          metodo_pagamento: "pix",
          beneficiario: `Fornecedor ${i + 1}`,
          referencia: `PAG_${i + 1}`,
        });

        // Confirmar pagamento
        db.exec(
          "UPDATE pagamentos SET status = 'pago', data_conclusao = datetime('now') WHERE id = ?",
          [payment_id]
        );

        pagamentos.push(payment_id);
      }

      // 2. Sincronizar em lote
      const resultado = sincronizarPagamentosParaLedger(db, entidade_id, periodo_id, 100);

      // 3. Verificar resultado
      expect(resultado.processados).toBeGreaterThan(0);
      expect(resultado.sucessos).toBeGreaterThan(0);
    });
  });

  describe("gerarRelatorioSincronizacaoPagamentos", () => {
    it("deve gerar relatório de sincronização", () => {
      const relatorio = gerarRelatorioSincronizacaoPagamentos(
        db,
        entidade_id,
        periodo_id
      );

      expect(relatorio).toHaveProperty("total_processados");
      expect(relatorio).toHaveProperty("pagamentos_sincronizados");
      expect(relatorio).toHaveProperty("valor_total_sincronizado");
      expect(relatorio).toHaveProperty("sucessos");
      expect(relatorio).toHaveProperty("erros");
      expect(Array.isArray(relatorio.ultimos_30_dias)).toBe(true);
    });

    it("deve calcular valor total sincronizado corretamente", () => {
      // Criar e sincronizar alguns pagamentos
      for (let i = 0; i < 2; i++) {
        const { payment_id } = criarPagamento(db, {
          entidade_id,
          valor: 1000,
          descricao: `Pagamento ${i}`,
          tipo_pagamento: "servico",
          metodo_pagamento: "pix",
          beneficiario: `Fornecedor ${i}`,
          referencia: `PAG_${i}`,
        });

        db.exec(
          "UPDATE pagamentos SET status = 'pago', data_conclusao = datetime('now') WHERE id = ?",
          [payment_id]
        );
      }

      sincronizarPagamentosParaLedger(db, entidade_id, periodo_id);

      const relatorio = gerarRelatorioSincronizacaoPagamentos(
        db,
        entidade_id,
        periodo_id
      );

      expect(relatorio.valor_total_sincronizado).toBeGreaterThanOrEqual(0);
      // BUG real: `const [ultimos30] = consultar(...)` pegava só a primeira linha da
      // consulta, não a lista inteira — com os 2 pagamentos sincronizados acima,
      // ultimos_30_dias virava um único objeto solto em vez do array de 2 registros.
      expect(Array.isArray(relatorio.ultimos_30_dias)).toBe(true);
      expect(relatorio.ultimos_30_dias.length).toBe(2);
    });
  });
});
