import { describe, it, expect, beforeEach } from "vitest";
import {
  registrarDespesaLegalNoLedger,
  registrarProvisoesProcessos,
  sincronizarDespesasAdvocaciaParaLedger,
  gerarRelatorioSincronizacaoAdvocacia,
} from "../advocacia-ledger-integration";
import { registrarProcessoLegal, registrarDespesaLegal } from "../advocacia";
import { registrarLancamentoContabil, obterSaldoConta } from "../ledger";
import { prepararBancoTeste } from "./test-setup";

describe("Integração Advocacia-Ledger", () => {
  let db: any;
  let entidade_id: number;
  let periodo_id: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
    periodo_id = setup.periodo_id;
  });

  describe("registrarDespesaLegalNoLedger", () => {
    it("deve registrar despesa legal com lançamento contábil", () => {
      // 1. Criar processo
      const processoBefore = db.exec(
        "INSERT INTO processos_legais (entidade_id, numero_processo, tipo, descricao, data_ajuizamento, status, foro, nivel_hierarquia, valor_causa, estimativa_despesa, risco_potencial, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
        [
          entidade_id,
          "0000123-45.2026.8.26.0100",
          "cobrança",
          "Ação de cobrança",
          "2026-01-15",
          "ativo",
          "São Paulo",
          1,
          50000,
          5000,
          "médio",
        ]
      );

      const [processoId] = db.exec("SELECT last_insert_rowid() as id");
      const processo_id = processoId?.values[0]?.[0];

      // 2. Registrar despesa legal no ledger
      const resultado = registrarDespesaLegalNoLedger(
        db,
        1,
        {
          processo_id,
          entidade_id,
          periodo_id,
          data_lancamento: "2026-01-20",
          tipo_despesa: "honorarios_advocaticios",
          valor_despesa: 2000,
          descricao: "Honorários do mês de janeiro",
          beneficiario: "Advogado Silva",
          referencia_documento: "DESP_001",
        }
      );

      // 3. Verificar se foi criado lançamento contábil
      expect(resultado).not.toBeNull();
      expect(resultado?.lancamento_id).toBeGreaterThan(0);

      // 4. Verificar saldos
      const saldoDebito = obterSaldoConta(db, periodo_id, 6301); // Despesa com Honorários
      expect(saldoDebito).toBe(2000);

      // obterSaldoConta devolve o saldo na direção natural da conta (ledger.ts:124):
      // crédito numa conta credora é positivo. Negativo indicaria saldo invertido.
      const saldoCredito = obterSaldoConta(db, periodo_id, 3102); // Contas a Pagar
      expect(saldoCredito).toBe(2000);
    });

    it("deve evitar duplicação de despesa", () => {
      const [processoId] = db.exec("SELECT last_insert_rowid() as id");
      const processo_id = processoId?.values[0]?.[0] || 1;

      const despesa = {
        processo_id,
        entidade_id,
        periodo_id,
        data_lancamento: "2026-01-20",
        tipo_despesa: "custas_judiciais" as const,
        valor_despesa: 1500,
        descricao: "Custas processuais",
        beneficiario: "Tribunal",
        referencia_documento: "CUSTAS_001",
      };

      // A chave de deduplicação inclui o id da despesa (gerarHashProvenance), e com
      // razão: dois honorários de mesmo valor, tipo e data são despesas distintas e
      // devem gerar dois lançamentos. O que não pode acontecer é a MESMA despesa ser
      // lançada duas vezes. O teste antes passava ids diferentes (2 e 3) e exigia
      // dedupe, ou seja, cobrava do código o comportamento errado.
      const resultado1 = registrarDespesaLegalNoLedger(db, 2, despesa);
      expect(resultado1).not.toBeNull();

      const resultado2 = registrarDespesaLegalNoLedger(db, 2, despesa);
      expect(resultado2).toBeNull();

      // Despesa diferente com o mesmo conteúdo continua sendo lançada.
      expect(registrarDespesaLegalNoLedger(db, 3, despesa)).not.toBeNull();
    });
  });

  describe("registrarProvisoesProcessos", () => {
    it("deve registrar provisões para processos com risco alto", () => {
      // 1. Criar processo com risco alto
      const [processoId] = db.exec(
        "INSERT INTO processos_legais (entidade_id, numero_processo, tipo, descricao, data_ajuizamento, status, foro, nivel_hierarquia, valor_causa, estimativa_despesa, risco_potencial, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
        [
          entidade_id,
          "0000456-78.2026.8.26.0100",
          "ação trabalhista",
          "Ação trabalhista",
          "2026-01-01",
          "ativo",
          "São Paulo",
          1,
          100000,
          20000,
          "alto",
        ]
      );

      const [processId] = db.exec("SELECT last_insert_rowid() as id");
      const id = processId?.values[0]?.[0];

      // 2. Registrar provisões
      const resultado = registrarProvisoesProcessos(db, entidade_id, periodo_id);

      // 3. Verificar resultado
      expect(resultado.processados).toBeGreaterThan(0);
      expect(resultado.sucessos).toBeGreaterThan(0);

      // 4. Verificar saldos de provisão
      const saldoProvisionado = obterSaldoConta(db, periodo_id, 6401); // Provisão
      expect(saldoProvisionado).toBeGreaterThan(0);
    });

    it("não deve provisionar processos com risco baixo", () => {
      // 1. Criar processo com risco baixo
      db.exec(
        "INSERT INTO processos_legais (entidade_id, numero_processo, tipo, descricao, data_ajuizamento, status, foro, nivel_hierarquia, valor_causa, estimativa_despesa, risco_potencial, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
        [
          entidade_id,
          "0000789-12.2026.8.26.0100",
          "cobrança",
          "Ação de cobrança",
          "2026-01-01",
          "ativo",
          "São Paulo",
          1,
          50000,
          2000,
          "baixo",
        ]
      );

      // 2. Registrar provisões
      const [idBaixo] = db.exec("SELECT last_insert_rowid() as id");
      const processoBaixoId = idBaixo?.values[0]?.[0];

      registrarProvisoesProcessos(db, entidade_id, periodo_id);

      // 3. O que se verifica é que ESTE processo não foi provisionado. Afirmar
      // sucessos === 0 era outra coisa: o beforeEach já semeia um processo de risco
      // médio, que é provisionado com razão, então o total nunca seria zero.
      const [provisoes] = db.exec(
        `SELECT COUNT(*) FROM ledger_entries
         WHERE periodo_id = ${periodo_id} AND origem_modulo = 'advocacia' AND origem_id = ${processoBaixoId}`
      );
      expect(provisoes?.values[0]?.[0]).toBe(0);
    });
  });

  describe("sincronizarDespesasAdvocaciaParaLedger", () => {
    it("deve sincronizar despesas pendentes", () => {
      // 1. Registrar processo e despesa
      const [processoId] = db.exec(
        "INSERT INTO processos_legais (entidade_id, numero_processo, tipo, descricao, data_ajuizamento, status, foro, nivel_hierarquia, valor_causa, estimativa_despesa, risco_potencial, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
        [
          entidade_id,
          "0000111-22.2026.8.26.0100",
          "cobrança",
          "Ação de cobrança",
          "2026-01-15",
          "ativo",
          "São Paulo",
          1,
          50000,
          5000,
          "médio",
        ]
      );

      const [pId] = db.exec("SELECT last_insert_rowid() as id");
      const processo_id = pId?.values[0]?.[0];

      db.exec(
        "INSERT INTO despesas_legais (processo_id, entidade_id, periodo_id, data_lancamento, tipo_despesa, descricao, valor_despesa, beneficiario, referencia_documento, origem_modulo, tentativas, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'advocacia', 0, datetime('now'))",
        [
          processo_id,
          entidade_id,
          periodo_id,
          "2026-01-20",
          "honorarios_advocaticios",
          "Honorários janeiro",
          2500,
          "Advogado Silva",
          "HON_001",
        ]
      );

      // 2. Sincronizar
      const resultado = sincronizarDespesasAdvocaciaParaLedger(db, entidade_id, periodo_id);

      // 3. Verificar resultado
      expect(resultado.processados).toBeGreaterThan(0);
      expect(resultado.sucessos).toBeGreaterThan(0);
    });
  });

  describe("gerarRelatorioSincronizacaoAdvocacia", () => {
    it("deve gerar relatório de sincronização", () => {
      const relatorio = gerarRelatorioSincronizacaoAdvocacia(db, entidade_id, periodo_id);

      expect(relatorio).toHaveProperty("total_processados");
      expect(relatorio).toHaveProperty("despesas_sincronizadas");
      expect(relatorio).toHaveProperty("provisoes_registradas");
      expect(relatorio).toHaveProperty("sucessos");
      expect(relatorio).toHaveProperty("erros");
      expect(Array.isArray(relatorio.ultimos_30_dias)).toBe(true);
    });

    // BUG real: `const [ultimos30] = consultar(...)` pegava só a PRIMEIRA linha do
    // resultado (a query devolve até 50), não o array inteiro — `ultimos_30_dias` saía
    // como um único objeto solto em vez da lista. Com 0 ou 1 sincronização o teste acima
    // não pega o defeito (undefined || [] ainda é array; e um objeto truthy escapava do
    // toHaveProperty), por isso é preciso 2+ linhas para expor.
    it("retorna todas as sincronizações recentes, não só a primeira linha", () => {
      for (let i = 0; i < 3; i++) {
        db.exec(
          "INSERT INTO sincronizacoes_advocacia_ledger (tipo_registro, status, criado_em) VALUES (?, ?, datetime('now'))",
          ["despesa_legal", "sucesso"]
        );
      }

      const relatorio = gerarRelatorioSincronizacaoAdvocacia(db, entidade_id, periodo_id);

      expect(Array.isArray(relatorio.ultimos_30_dias)).toBe(true);
      expect(relatorio.ultimos_30_dias.length).toBe(3);
    });
  });
});
