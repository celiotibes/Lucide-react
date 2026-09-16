import { describe, it, expect, beforeEach } from "vitest";
import {
  registrarDespesaImovelNoLedger,
  registrarReceitaAluguelNoLedger,
  registrarArrecadacaoTaxaNoLedger,
  obterSaldoImoveisParaLedger,
  sincronizarMovimentosImoveisParaLedger,
  gerarRelatorioImoveisParaLedger,
  validarDespesaParaLedger,
} from "../imovel-gestao-ledger-integration";
import { registrarLancamentoContabil, obterSaldoConta } from "../ledger";
import { prepararBancoTeste } from "./test-setup";

describe("Integração Imovel Gestao-Ledger", () => {
  let db: any;
  let entidade_id: number;
  let periodo_id: number;
  let imovel_id: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
    periodo_id = setup.periodo_id;

    // Criar um imóvel para testes
    const [imovelId] = db.exec(
      `INSERT INTO imoveis (entidade_id, endereco, tipo_imovel, uso_pessoal, financiado, valor_aquisicao, criado_em)
       VALUES (?, 'Rua Principal 123', 'apartamento', 0, 0, 500000, datetime('now'))`,
      [entidade_id]
    );

    const [imId] = db.exec("SELECT last_insert_rowid() as id");
    imovel_id = imId?.values[0]?.[0];
  });

  describe("validarDespesaParaLedger", () => {
    it("deve validar despesa com todos os campos", () => {
      const despesa = {
        imovel_id: 1,
        valor_mensal: 500,
        data_lancamento: "2026-01-15",
        tipo_despesa: "condominio",
      };

      const resultado = validarDespesaParaLedger(despesa);
      expect(resultado.valido).toBe(true);
      expect(resultado.erros).toHaveLength(0);
    });

    it("deve rejeitar despesa sem imovel_id", () => {
      const despesa = {
        imovel_id: 0,
        valor_mensal: 500,
        data_lancamento: "2026-01-15",
        tipo_despesa: "condominio",
      };

      const resultado = validarDespesaParaLedger(despesa);
      expect(resultado.valido).toBe(false);
      expect(resultado.erros.length).toBeGreaterThan(0);
    });

    it("deve rejeitar despesa com valor negativo", () => {
      const despesa = {
        imovel_id: 1,
        valor_mensal: -100,
        data_lancamento: "2026-01-15",
        tipo_despesa: "condominio",
      };

      const resultado = validarDespesaParaLedger(despesa);
      expect(resultado.valido).toBe(false);
      expect(resultado.erros.length).toBeGreaterThan(0);
    });

    it("deve rejeitar tipo de despesa inválido", () => {
      const despesa = {
        imovel_id: 1,
        valor_mensal: 500,
        data_lancamento: "2026-01-15",
        tipo_despesa: "tipo_inexistente",
      };

      const resultado = validarDespesaParaLedger(despesa);
      expect(resultado.valido).toBe(false);
      expect(resultado.erros.length).toBeGreaterThan(0);
    });
  });

  describe("registrarDespesaImovelNoLedger - Despesa Condominial", () => {
    it("deve registrar despesa condominial com lançamento contábil duplo", () => {
      const resultado = registrarDespesaImovelNoLedger(
        db,
        1,
        {
          imovel_id,
          entidade_id,
          periodo_id,
          data_lancamento: "2026-01-15",
          tipo_despesa: "condominio",
          valor_mensal: 800,
          descricao: "Condomínio - janeiro/2026",
        }
      );

      expect(resultado).not.toBeNull();
      expect(resultado?.lancamento_id).toBeGreaterThan(0);
      expect(resultado?.sincronizacao_id).toBeGreaterThan(0);

      // Verificar débito em conta de despesa (5.2.10)
      const saldoDebito = obterSaldoConta(db, periodo_id, 5210);
      expect(saldoDebito).toBe(800);

      // Verificar crédito em contas a pagar (3.1.02)
      const saldoCredito = obterSaldoConta(db, periodo_id, 3102);
      expect(saldoCredito).toBe(-800);
    });

    it("deve evitar duplicação de despesa condominial", () => {
      const despesa = {
        imovel_id,
        entidade_id,
        periodo_id,
        data_lancamento: "2026-01-20",
        tipo_despesa: "condominio",
        valor_mensal: 750,
        descricao: "Condomínio fevereiro",
      };

      const resultado1 = registrarDespesaImovelNoLedger(db, 1, despesa);
      expect(resultado1).not.toBeNull();

      const resultado2 = registrarDespesaImovelNoLedger(db, 2, despesa);
      expect(resultado2).toBeNull();
    });
  });

  describe("registrarDespesaImovelNoLedger - Despesa de Manutenção", () => {
    it("deve registrar despesa de manutenção", () => {
      const resultado = registrarDespesaImovelNoLedger(
        db,
        2,
        {
          imovel_id,
          entidade_id,
          periodo_id,
          data_lancamento: "2026-01-10",
          tipo_despesa: "manutencao",
          valor_mensal: 2500,
          descricao: "Reparo no encanamento",
        }
      );

      expect(resultado).not.toBeNull();
      expect(resultado?.lancamento_id).toBeGreaterThan(0);

      // Verificar débito em conta de manutenção (5.2.05)
      const saldoDebito = obterSaldoConta(db, periodo_id, 5205);
      expect(saldoDebito).toBe(2500);

      // Verificar crédito em contas a pagar (3.1.02)
      const saldoCredito = obterSaldoConta(db, periodo_id, 3102);
      expect(saldoCredito).toBeLessThan(0);
    });
  });

  describe("registrarDespesaImovelNoLedger - Despesa de Reforma", () => {
    it("deve registrar despesa de reforma (imobilizado)", () => {
      const resultado = registrarDespesaImovelNoLedger(
        db,
        3,
        {
          imovel_id,
          entidade_id,
          periodo_id,
          data_lancamento: "2026-01-05",
          tipo_despesa: "reforma",
          valor_mensal: 15000,
          descricao: "Reforma da cozinha",
        }
      );

      expect(resultado).not.toBeNull();
      expect(resultado?.lancamento_id).toBeGreaterThan(0);

      // Verificar débito em conta de imóvel (1.2.05)
      const saldoDebito = obterSaldoConta(db, periodo_id, 1205);
      expect(saldoDebito).toBe(15000);

      // Verificar crédito em contas a pagar (3.1.02)
      const saldoCredito = obterSaldoConta(db, periodo_id, 3102);
      expect(saldoCredito).toBeLessThan(0);
    });
  });

  describe("registrarDespesaImovelNoLedger - Outros tipos de despesa", () => {
    it("deve registrar despesa com água", () => {
      const resultado = registrarDespesaImovelNoLedger(
        db,
        4,
        {
          imovel_id,
          entidade_id,
          periodo_id,
          data_lancamento: "2026-01-12",
          tipo_despesa: "agua",
          valor_mensal: 150,
          descricao: "Conta de água",
        }
      );

      expect(resultado).not.toBeNull();
      const saldoDebito = obterSaldoConta(db, periodo_id, 5207);
      expect(saldoDebito).toBe(150);
    });

    it("deve registrar despesa com energia", () => {
      const resultado = registrarDespesaImovelNoLedger(
        db,
        5,
        {
          imovel_id,
          entidade_id,
          periodo_id,
          data_lancamento: "2026-01-12",
          tipo_despesa: "energia",
          valor_mensal: 320,
          descricao: "Conta de energia",
        }
      );

      expect(resultado).not.toBeNull();
      const saldoDebito = obterSaldoConta(db, periodo_id, 5206);
      expect(saldoDebito).toBe(320);
    });

    it("deve registrar despesa com internet", () => {
      const resultado = registrarDespesaImovelNoLedger(
        db,
        6,
        {
          imovel_id,
          entidade_id,
          periodo_id,
          data_lancamento: "2026-01-12",
          tipo_despesa: "internet",
          valor_mensal: 99,
          descricao: "Serviço de internet",
        }
      );

      expect(resultado).not.toBeNull();
      const saldoDebito = obterSaldoConta(db, periodo_id, 5212);
      expect(saldoDebito).toBe(99);
    });

    it("deve registrar despesa com seguros", () => {
      const resultado = registrarDespesaImovelNoLedger(
        db,
        7,
        {
          imovel_id,
          entidade_id,
          periodo_id,
          data_lancamento: "2026-01-01",
          tipo_despesa: "seguros",
          valor_mensal: 450,
          descricao: "Seguro do imóvel",
        }
      );

      expect(resultado).not.toBeNull();
      const saldoDebito = obterSaldoConta(db, periodo_id, 5213);
      expect(saldoDebito).toBe(450);
    });
  });

  describe("registrarReceitaAluguelNoLedger - Renda de Aluguel", () => {
    it("deve registrar receita de aluguel com lançamento duplo", () => {
      const resultado = registrarReceitaAluguelNoLedger(
        db,
        1,
        {
          imovel_id,
          entidade_id,
          periodo_id,
          data_lancamento: "2026-01-10",
          mes_referencia: "2026-01",
          valor_aluguel: 3000,
          inquilino_nome: "João Silva",
        }
      );

      expect(resultado).not.toBeNull();
      expect(resultado?.lancamento_id).toBeGreaterThan(0);

      // Verificar débito em Caixa (1.1.01)
      const saldoDebito = obterSaldoConta(db, periodo_id, 1101);
      expect(saldoDebito).toBe(3000);

      // Verificar crédito em Receita de Aluguel (4.1.01)
      const saldoCredito = obterSaldoConta(db, periodo_id, 4101);
      expect(saldoCredito).toBe(-3000);
    });

    it("deve evitar duplicação de receita de aluguel", () => {
      const receita = {
        imovel_id,
        entidade_id,
        periodo_id,
        data_lancamento: "2026-01-10",
        mes_referencia: "2026-01",
        valor_aluguel: 3500,
        inquilino_nome: "Maria Santos",
      };

      const resultado1 = registrarReceitaAluguelNoLedger(db, 1, receita);
      expect(resultado1).not.toBeNull();

      const resultado2 = registrarReceitaAluguelNoLedger(db, 2, receita);
      expect(resultado2).toBeNull();
    });

    it("deve registrar aluguel com referência do inquilino", () => {
      const resultado = registrarReceitaAluguelNoLedger(
        db,
        2,
        {
          imovel_id,
          entidade_id,
          periodo_id,
          data_lancamento: "2026-02-10",
          mes_referencia: "2026-02",
          valor_aluguel: 3200,
          inquilino_nome: "Carlos Oliveira",
          referencia_documento: "ALUG_2026_02_001",
        }
      );

      expect(resultado).not.toBeNull();
      expect(resultado?.lancamento_id).toBeGreaterThan(0);
    });
  });

  describe("registrarArrecadacaoTaxaNoLedger - Arrecadação de Taxa", () => {
    it("deve registrar arrecadação de taxa condominial", () => {
      const resultado = registrarArrecadacaoTaxaNoLedger(
        db,
        1,
        {
          imovel_id,
          entidade_id,
          periodo_id,
          data_lancamento: "2026-01-20",
          valor_taxa: 500,
          descricao: "Taxa de condomínio - janeiro",
        }
      );

      expect(resultado).not.toBeNull();
      expect(resultado?.lancamento_id).toBeGreaterThan(0);

      // Verificar débito em Caixa (1.1.01)
      const saldoDebito = obterSaldoConta(db, periodo_id, 1101);
      expect(saldoDebito).toBe(500);

      // Verificar crédito em Contas a Pagar (3.1.02)
      const saldoCredito = obterSaldoConta(db, periodo_id, 3102);
      expect(saldoCredito).toBeLessThan(0);
    });
  });

  describe("obterSaldoImoveisParaLedger - Saldo por Propriedade", () => {
    it("deve obter saldo consolidado de um imóvel", () => {
      // Registrar múltiplas despesas
      registrarDespesaImovelNoLedger(db, 1, {
        imovel_id,
        entidade_id,
        periodo_id,
        data_lancamento: "2026-01-01",
        tipo_despesa: "condominio",
        valor_mensal: 800,
        descricao: "Condomínio",
      });

      registrarDespesaImovelNoLedger(db, 2, {
        imovel_id,
        entidade_id,
        periodo_id,
        data_lancamento: "2026-01-05",
        tipo_despesa: "energia",
        valor_mensal: 300,
        descricao: "Energia",
      });

      // Obter saldos
      const saldos = obterSaldoImoveisParaLedger(db, periodo_id, imovel_id);

      expect(saldos).toHaveLength(2);
      expect(saldos[0].imovel_id).toBe(imovel_id);
      expect(saldos[0].total_debito).toBeGreaterThan(0);
    });

    it("deve retornar saldos para todos os imóveis", () => {
      // Criar segundo imóvel
      const [imovel2Id] = db.exec(
        `INSERT INTO imoveis (entidade_id, endereco, tipo_imovel, uso_pessoal, financiado, valor_aquisicao, criado_em)
         VALUES (?, 'Rua Secundária 456', 'casa', 0, 0, 350000, datetime('now'))`,
        [entidade_id]
      );

      const [imId] = db.exec("SELECT last_insert_rowid() as id");
      const imovel2_id = imId?.values[0]?.[0];

      // Registrar despesa no primeiro imóvel
      registrarDespesaImovelNoLedger(db, 1, {
        imovel_id,
        entidade_id,
        periodo_id,
        data_lancamento: "2026-01-01",
        tipo_despesa: "condominio",
        valor_mensal: 800,
        descricao: "Condomínio",
      });

      // Registrar despesa no segundo imóvel
      registrarDespesaImovelNoLedger(db, 2, {
        imovel_id: imovel2_id,
        entidade_id,
        periodo_id,
        data_lancamento: "2026-01-01",
        tipo_despesa: "agua",
        valor_mensal: 150,
        descricao: "Água",
      });

      // Obter saldos de ambos
      const saldos = obterSaldoImoveisParaLedger(db, periodo_id);

      expect(saldos.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("sincronizarMovimentosImoveisParaLedger - Sincronização em Lote", () => {
    it("deve sincronizar despesas operacionais pendentes", () => {
      // Criar despesas operacionais na tabela de agendamento
      db.exec(
        `INSERT INTO despesas_operacionais_agendadas (imovel_id, entidade_id, tipo_despesa, descricao, valor_mensal, dia_vencimento, status, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, 'ativa', datetime('now'))`,
        [imovel_id, entidade_id, "condominio", "Condomínio mensal", 900, 10]
      );

      db.exec(
        `INSERT INTO despesas_operacionais_agendadas (imovel_id, entidade_id, tipo_despesa, descricao, valor_mensal, dia_vencimento, status, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, 'ativa', datetime('now'))`,
        [imovel_id, entidade_id, "energia", "Energia", 280, 20]
      );

      const resultado = sincronizarMovimentosImoveisParaLedger(
        db,
        entidade_id,
        periodo_id,
        50
      );

      expect(resultado.processados).toBeGreaterThan(0);
      expect(resultado.sucessos).toBeGreaterThan(0);
    });
  });

  describe("gerarRelatorioImoveisParaLedger - Relatório Consolidado", () => {
    it("deve gerar relatório com despesas e receitas por imóvel", () => {
      // Registrar despesas
      registrarDespesaImovelNoLedger(db, 1, {
        imovel_id,
        entidade_id,
        periodo_id,
        data_lancamento: "2026-01-01",
        tipo_despesa: "condominio",
        valor_mensal: 800,
        descricao: "Condomínio",
      });

      registrarDespesaImovelNoLedger(db, 2, {
        imovel_id,
        entidade_id,
        periodo_id,
        data_lancamento: "2026-01-05",
        tipo_despesa: "energia",
        valor_mensal: 300,
        descricao: "Energia",
      });

      // Registrar receita de aluguel
      registrarReceitaAluguelNoLedger(db, 1, {
        imovel_id,
        entidade_id,
        periodo_id,
        data_lancamento: "2026-01-10",
        mes_referencia: "2026-01",
        valor_aluguel: 3000,
        inquilino_nome: "Inquilino X",
      });

      // Gerar relatório
      const relatorio = gerarRelatorioImoveisParaLedger(
        db,
        entidade_id,
        periodo_id
      );

      expect(relatorio).not.toBeNull();
      expect(relatorio?.total_imoveis).toBeGreaterThan(0);
      expect(relatorio?.total_despesas).toBe(1100); // 800 + 300
      expect(relatorio?.total_receitas).toBe(3000);
      expect(relatorio?.saldos_por_imovel.length).toBeGreaterThan(0);

      // Verificar saldo líquido do imóvel
      const imoveisSaldos = relatorio?.saldos_por_imovel || [];
      const imovelSaldo = imoveisSaldos.find((i) => i.imovel_id === imovel_id);
      expect(imovelSaldo).toBeDefined();
      expect(imovelSaldo?.saldo_liquido).toBe(1900); // 3000 - 1100
    });

    it("deve incluir arrecadações no relatório", () => {
      registrarDespesaImovelNoLedger(db, 1, {
        imovel_id,
        entidade_id,
        periodo_id,
        data_lancamento: "2026-01-01",
        tipo_despesa: "condominio",
        valor_mensal: 500,
        descricao: "Condomínio",
      });

      registrarArrecadacaoTaxaNoLedger(db, 1, {
        imovel_id,
        entidade_id,
        periodo_id,
        data_lancamento: "2026-01-20",
        valor_taxa: 250,
        descricao: "Taxa arrecadada",
      });

      const relatorio = gerarRelatorioImoveisParaLedger(
        db,
        entidade_id,
        periodo_id
      );

      expect(relatorio?.total_arrecadacoes).toBeGreaterThan(0);
    });

    it("deve retornar null para período inválido", () => {
      const relatorio = gerarRelatorioImoveisParaLedger(
        db,
        entidade_id,
        999 // período inexistente
      );

      expect(relatorio).toBeNull();
    });
  });

  describe("Integração Múltiplos Imóveis - Consolidação", () => {
    it("deve consolidar despesas e receitas de múltiplos imóveis", () => {
      // Criar segundo imóvel
      const [imovel2Id] = db.exec(
        `INSERT INTO imoveis (entidade_id, endereco, tipo_imovel, uso_pessoal, financiado, valor_aquisicao, criado_em)
         VALUES (?, 'Rua Secundária 456', 'casa', 0, 0, 350000, datetime('now'))`,
        [entidade_id]
      );

      const [imId] = db.exec("SELECT last_insert_rowid() as id");
      const imovel2_id = imId?.values[0]?.[0];

      // Despesas no imóvel 1
      registrarDespesaImovelNoLedger(db, 1, {
        imovel_id,
        entidade_id,
        periodo_id,
        data_lancamento: "2026-01-01",
        tipo_despesa: "condominio",
        valor_mensal: 800,
        descricao: "Condomínio",
      });

      registrarReceitaAluguelNoLedger(db, 1, {
        imovel_id,
        entidade_id,
        periodo_id,
        data_lancamento: "2026-01-10",
        mes_referencia: "2026-01",
        valor_aluguel: 2500,
        inquilino_nome: "Inquilino A",
      });

      // Despesas no imóvel 2
      registrarDespesaImovelNoLedger(db, 2, {
        imovel_id: imovel2_id,
        entidade_id,
        periodo_id,
        data_lancamento: "2026-01-05",
        tipo_despesa: "energia",
        valor_mensal: 300,
        descricao: "Energia",
      });

      registrarReceitaAluguelNoLedger(db, 2, {
        imovel_id: imovel2_id,
        entidade_id,
        periodo_id,
        data_lancamento: "2026-01-10",
        mes_referencia: "2026-01",
        valor_aluguel: 2000,
        inquilino_nome: "Inquilino B",
      });

      // Gerar relatório consolidado
      const relatorio = gerarRelatorioImoveisParaLedger(
        db,
        entidade_id,
        periodo_id
      );

      expect(relatorio).not.toBeNull();
      expect(relatorio?.total_imoveis).toBe(2);
      expect(relatorio?.total_despesas).toBe(1100); // 800 + 300
      expect(relatorio?.total_receitas).toBe(4500); // 2500 + 2000
      expect(relatorio?.saldos_por_imovel).toHaveLength(2);

      // Verificar saldos individuais
      const saldos = relatorio?.saldos_por_imovel || [];
      expect(saldos[0].saldo_liquido).toBe(1700); // 2500 - 800
      expect(saldos[1].saldo_liquido).toBe(1700); // 2000 - 300
    });
  });

  describe("Validação de Período Aberto", () => {
    it("deve lançar erro ao registrar despesa em período fechado", () => {
      // Fechar período
      db.exec(
        `UPDATE periodos_contabeis SET status = 'fechado' WHERE id = ?`,
        [periodo_id]
      );

      const resultado = registrarDespesaImovelNoLedger(
        db,
        1,
        {
          imovel_id,
          entidade_id,
          periodo_id,
          data_lancamento: "2026-01-15",
          tipo_despesa: "condominio",
          valor_mensal: 800,
          descricao: "Condomínio",
        }
      );

      expect(resultado).toBeNull();

      // Reabrir período para cleanup
      db.exec(
        `UPDATE periodos_contabeis SET status = 'aberto' WHERE id = ?`,
        [periodo_id]
      );
    });
  });

  describe("Mapeamento de Contas", () => {
    it("deve usar mapeamento correto para cada tipo de despesa", () => {
      const tiposDespesa = [
        { tipo: "condominio", conta: 5210 },
        { tipo: "agua", conta: 5207 },
        { tipo: "energia", conta: 5206 },
        { tipo: "internet", conta: 5212 },
        { tipo: "seguros", conta: 5213 },
        { tipo: "manutencao", conta: 5205 },
        { tipo: "reforma", conta: 1205 },
      ];

      tiposDespesa.forEach((item, index) => {
        registrarDespesaImovelNoLedger(
          db,
          index + 10,
          {
            imovel_id,
            entidade_id,
            periodo_id,
            data_lancamento: "2026-01-15",
            tipo_despesa: item.tipo,
            valor_mensal: 100,
            descricao: `Teste ${item.tipo}`,
          }
        );

        const saldo = obterSaldoConta(db, periodo_id, item.conta);
        expect(saldo).toBe(100);
      });
    });
  });

  describe("Rastreamento de Provenance", () => {
    it("deve registrar hash de provenance para evitar duplicação", () => {
      const despesa = {
        imovel_id,
        entidade_id,
        periodo_id,
        data_lancamento: "2026-01-15",
        tipo_despesa: "condominio",
        valor_mensal: 800,
        descricao: "Condomínio janeiro",
      };

      registrarDespesaImovelNoLedger(db, 1, despesa);

      // Verificar se hash foi registrado
      const [sync] = db.exec(
        `SELECT hash_provenance FROM sincronizacoes_imovel_ledger
         WHERE imovel_id = ? AND tipo_movimento = 'despesa'`,
        [imovel_id]
      );

      expect(sync?.values).toBeDefined();
      expect(sync?.values[0]).toBeDefined();
    });
  });

  describe("Sincronização com Múltiplas Tentativas", () => {
    it("deve rastrear número de tentativas de sincronização", () => {
      const despesa = {
        imovel_id,
        entidade_id,
        periodo_id,
        data_lancamento: "2026-01-15",
        tipo_despesa: "condominio",
        valor_mensal: 800,
        descricao: "Condomínio",
      };

      // Primeira tentativa
      const resultado1 = registrarDespesaImovelNoLedger(db, 1, despesa);
      expect(resultado1).not.toBeNull();

      // Verificar tentativas
      const [sync] = db.exec(
        `SELECT tentativas FROM sincronizacoes_imovel_ledger
         WHERE id = ?`,
        [resultado1?.sincronizacao_id]
      );

      expect(sync?.values[0]?.[0]).toBe(1);
    });
  });
});
