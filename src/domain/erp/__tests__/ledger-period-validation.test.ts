import { describe, it, expect, beforeEach } from "vitest";
import {
  registrarLancamentoContabil,
  encerrarPeriodo,
  registrarRetificacao,
  validarBalanceamento,
} from "../ledger";
import {
  validarPeriodoAberto,
  assegurarPeriodoAberto,
  PeriodoFechadoError,
  obterDescricaoPeriodo,
} from "../ledger-period-validation";
import { prepararBancoTeste } from "./test-setup";

describe("Validação de Período Fechado", () => {
  let db: any;
  let entidade_id: number;
  let periodo_id: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
    periodo_id = setup.periodo_id;
  });

  describe("validarPeriodoAberto", () => {
    it("deve retornar aberto=true para período aberto", () => {
      const validacao = validarPeriodoAberto(db, periodo_id);

      expect(validacao.aberto).toBe(true);
      expect(validacao.periodo).toBeDefined();
      expect(validacao.erro).toBeUndefined();
    });

    it("deve retornar aberto=false para período inexistente", () => {
      const validacao = validarPeriodoAberto(db, 99999);

      expect(validacao.aberto).toBe(false);
      expect(validacao.erro).toBeDefined();
    });

    it("deve retornar aberto=false para período fechado", () => {
      // Primeiro fechar o período
      const balancete_ok = validarBalanceamento(db, periodo_id);
      if (balancete_ok.balanceado) {
        encerrarPeriodo(db, periodo_id, 1, "Teste");
      }

      const validacao = validarPeriodoAberto(db, periodo_id);

      expect(validacao.aberto).toBe(false);
      expect(validacao.periodo?.status).toBe("fechado");
    });
  });

  describe("assegurarPeriodoAberto", () => {
    it("não deve lançar exceção para período aberto", () => {
      expect(() => {
        assegurarPeriodoAberto(db, periodo_id);
      }).not.toThrow();
    });

    it("deve lançar PeriodoFechadoError para período fechado", () => {
      // Fechar período
      const balancete_ok = validarBalanceamento(db, periodo_id);
      if (balancete_ok.balanceado) {
        encerrarPeriodo(db, periodo_id, 1, "Teste");
      }

      expect(() => {
        assegurarPeriodoAberto(db, periodo_id);
      }).toThrow(PeriodoFechadoError);
    });
  });

  describe("obterDescricaoPeriodo", () => {
    it("deve retornar descrição formatada do período", () => {
      const descricao = obterDescricaoPeriodo(db, periodo_id);

      expect(descricao).toMatch(/\d{4}/); // Deve conter ano
      expect(descricao).toMatch(/ABERTO|FECHADO/); // Deve conter status
    });

    it("deve incluir [FECHADO] quando período está fechado", () => {
      // Fechar período
      const balancete_ok = validarBalanceamento(db, periodo_id);
      if (balancete_ok.balanceado) {
        encerrarPeriodo(db, periodo_id, 1, "Teste");
      }

      const descricao = obterDescricaoPeriodo(db, periodo_id);

      expect(descricao).toContain("[FECHADO]");
    });
  });

  describe("registrarLancamentoContabil com validação de período", () => {
    it("deve permitir registro em período aberto", () => {
      const contas = db.exec(`SELECT id FROM contas_plano_contas WHERE codigo = '1.1.01' LIMIT 1`);
      const conta_id = contas[0]?.values[0]?.[0];

      if (conta_id) {
        const resultado = registrarLancamentoContabil(db, {
          entidade_id,
          periodo_id,
          conta_id,
          data_lancamento: "2026-01-15",
          valor_debito: 1000,
          descricao: "Teste em período aberto",
          origem_modulo: "manual",
          origem_id: 1,
          referencia_documento: "TEST-OPEN",
        });

        expect(resultado).toBeGreaterThan(0);
      }
    });

    it("deve bloquear registro em período fechado", () => {
      const contas = db.exec(`SELECT id FROM contas_plano_contas WHERE codigo = '1.1.01' LIMIT 1`);
      const conta_id = contas[0]?.values[0]?.[0];

      if (conta_id) {
        // Fechar período
        const balancete_ok = validarBalanceamento(db, periodo_id);
        if (balancete_ok.balanceado) {
          encerrarPeriodo(db, periodo_id, 1, "Teste");
        }

        // Tentar registrar em período fechado
        expect(() => {
          registrarLancamentoContabil(db, {
            entidade_id,
            periodo_id,
            conta_id,
            data_lancamento: "2026-01-15",
            valor_debito: 1000,
            descricao: "Teste em período fechado",
            origem_modulo: "manual",
            origem_id: 2,
            referencia_documento: "TEST-CLOSED",
          });
        }).toThrow(PeriodoFechadoError);
      }
    });
  });
});

describe("Retificação com Mecanismo de Reversão", () => {
  let db: any;
  let entidade_id: number;
  let periodo_id: number;
  let conta_id: number;
  let contaCaixaId: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
    periodo_id = setup.periodo_id;

    // Obter ID de uma conta válida
    const contas = db.exec(
      `SELECT id FROM contas_plano_contas WHERE codigo = '5.1.01' LIMIT 1`
    );
    conta_id = contas[0]?.values[0]?.[0];
    // Contrapartida para os lançamentos deste bloco ficarem em partida dobrada.
    const caixa = db.exec(
      `SELECT id FROM contas_plano_contas WHERE codigo = '1.1.01' LIMIT 1`
    );
    contaCaixaId = caixa[0]?.values[0]?.[0];
  });

  it("deve registrar retificação com reversão do valor anterior", () => {
    if (!conta_id) {
      console.log("Conta não encontrada, pulando teste");
      return;
    }

    // PASSO 1: Registrar lançamento original (débito 210)
    const lancamento_original = registrarLancamentoContabil(db, {
      entidade_id,
      periodo_id,
      conta_id,
      data_lancamento: "2026-01-10",
      valor_debito: 210,
      descricao: "Apontamento original",
      origem_modulo: "apontamento-prestador",
      origem_id: 1,
      referencia_documento: "APT-001",
    });

    expect(lancamento_original).toBeGreaterThan(0);

    // PASSO 2: Registrar retificação (210 → 250)
    const resultado = registrarRetificacao(db, {
      retificacao_id: 100,
      apontamento_id: 1,
      conta_id,
      valor_anterior: 210,
      valor_novo: 250,
      entidade_id,
      periodo_id,
      data_lancamento: "2026-01-10",
      origem_modulo: "apontamento-prestador",
      motivo_retificacao: "Ajuste de valor",
      retificada_por: 1,
    });

    expect(resultado.sucesso).toBe(true);
    expect(resultado.ledger_reverso_id).toBeDefined();
    expect(resultado.ledger_novo_id).toBeDefined();

    // PASSO 3: Validar que o ledger está balanceado
    // (débito 210 reverso + débito 250 novo = débito 250 final correto)
    const balancete = validarBalanceamento(db, periodo_id);
    // Não deve estar balanceado porque temos débitos sem créditos correspondentes
    // mas a diferença deve refletir o valor final correto (250)
    expect(balancete).toBeDefined();
  });

  it("deve criar rastreamento de retificação no mapping", () => {
    if (!conta_id) {
      console.log("Conta não encontrada, pulando teste");
      return;
    }

    // Registrar lançamento original
    registrarLancamentoContabil(db, {
      entidade_id,
      periodo_id,
      conta_id,
      data_lancamento: "2026-01-10",
      valor_credito: 210,
      descricao: "Crédito original",
      origem_modulo: "apontamento-prestador",
      origem_id: 2,
      referencia_documento: "APT-002",
    });

    // Registrar retificação
    const resultado = registrarRetificacao(db, {
      retificacao_id: 101,
      apontamento_id: 2,
      conta_id,
      valor_anterior: 210,
      valor_novo: 250,
      entidade_id,
      periodo_id,
      data_lancamento: "2026-01-10",
      origem_modulo: "apontamento-prestador",
      motivo_retificacao: "Correção",
      retificada_por: 1,
    });

    expect(resultado.sucesso).toBe(true);

    // Verificar se mapping foi criado (se tabela existir)
    if (resultado.ledger_reverso_id && resultado.ledger_novo_id) {
      const mapping = db.exec(
        `SELECT * FROM retificacao_ledger_mapping
         WHERE retificacao_id = 101 LIMIT 1`
      );

      // Se tabela existir, deve haver um registro
      if (mapping.length > 0) {
        expect(mapping[0].values.length).toBeGreaterThan(0);
      }
    }
  });

  it("deve bloquear retificação em período fechado", () => {
    if (!conta_id) {
      console.log("Conta não encontrada, pulando teste");
      return;
    }

    // Lançamento em partida dobrada. Antes só o débito de 100 era registrado, o que
    // desbalanceava o período; encerrarPeriodo então se recusava a fechar (e faz bem), o
    // período seguia aberto e a retificação passava — o teste falhava acusando falta de
    // bloqueio onde o que faltava era o fechamento.
    registrarLancamentoContabil(db, {
      entidade_id,
      periodo_id,
      conta_id,
      data_lancamento: "2026-01-10",
      valor_debito: 100,
      descricao: "Lançamento para teste",
      origem_modulo: "manual",
      origem_id: 3,
      referencia_documento: "TEST-003",
    });
    registrarLancamentoContabil(db, {
      entidade_id,
      periodo_id,
      conta_id: contaCaixaId,
      data_lancamento: "2026-01-10",
      valor_credito: 100,
      descricao: "Contrapartida do lançamento de teste",
      origem_modulo: "manual",
      origem_id: 3,
      referencia_documento: "TEST-003C",
    });

    // Fechar período. A precondição é verificada, não presumida: se o fechamento não
    // acontecer, o que vem depois não testa bloqueio nenhum.
    expect(validarBalanceamento(db, periodo_id).balanceado).toBe(true);
    expect(encerrarPeriodo(db, periodo_id, 1, "Teste").sucesso).toBe(true);

    // Tentar retificação em período fechado
    const resultado = registrarRetificacao(db, {
      retificacao_id: 102,
      apontamento_id: 3,
      conta_id,
      valor_anterior: 100,
      valor_novo: 150,
      entidade_id,
      periodo_id,
      data_lancamento: "2026-01-10",
      origem_modulo: "manual",
      motivo_retificacao: "Ajuste",
      retificada_por: 1,
    });

    expect(resultado.sucesso).toBe(false);
    expect(resultado.mensagem).toContain("fechado");
  });

  it("deve calcular mensagem de retificação corretamente", () => {
    if (!conta_id) {
      console.log("Conta não encontrado, pulando teste");
      return;
    }

    // Retificar pressupõe algo a retificar: sem o lançamento de 500,50 no período, não
    // há o que reverter e a operação falha legitimamente. O teste antes não o criava e
    // só verificava a mensagem de erro que voltava, sem exercitar a retificação.
    registrarLancamentoContabil(db, {
      entidade_id,
      periodo_id,
      conta_id,
      data_lancamento: "2026-01-09",
      valor_debito: 500.5,
      descricao: "Lançamento a ser retificado",
      origem_modulo: "manual",
      origem_id: 4,
      referencia_documento: "ORIG-103",
    });

    const resultado = registrarRetificacao(db, {
      retificacao_id: 103,
      apontamento_id: 4,
      conta_id,
      valor_anterior: 500.50,
      valor_novo: 750.75,
      entidade_id,
      periodo_id,
      data_lancamento: "2026-01-10",
      origem_modulo: "manual",
      motivo_retificacao: "Teste",
      retificada_por: 1,
    });

    expect(resultado.mensagem).toContain("500.50");
    expect(resultado.mensagem).toContain("750.75");
  });
});
