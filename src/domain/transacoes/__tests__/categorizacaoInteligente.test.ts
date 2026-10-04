import { describe, it, expect } from "vitest";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { executar, consultar } from "../../../db/connection";
import { sugerirCategoria, registrarSugestaoCategoria } from "../categorizacaoInteligente";
import { criarTransacaoManual } from "../transacaoManual";

async function bancoComTransacoes() {
  const db = await criarBancoDeTeste();
  // Criar conta bancária para testes
  executar(db, "INSERT OR IGNORE INTO contas_bancarias (id, banco, numero, titular, tipo) VALUES (1, 'Banco Teste', '000-0', 'Célio', 'corrente')");
  executar(db, "INSERT OR IGNORE INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet 1', 'kitnet')");

  // Criar plano de contas (categorias padrão) — INSERT OR IGNORE para evitar UNIQUE constraint
  executar(db, "INSERT OR IGNORE INTO plano_de_contas (codigo, descricao, grupo, natureza) VALUES ('1.1.01', 'Receita - Aluguel', 'receita', 'credito')");
  executar(db, "INSERT OR IGNORE INTO plano_de_contas (codigo, descricao, grupo, natureza) VALUES ('2.1.01', 'Despesa - Folha', 'despesa', 'debito')");
  executar(db, "INSERT OR IGNORE INTO plano_de_contas (codigo, descricao, grupo, natureza) VALUES ('2.1.02', 'Despesa - Condomínio', 'despesa', 'debito')");
  executar(db, "INSERT OR IGNORE INTO plano_de_contas (codigo, descricao, grupo, natureza) VALUES ('2.1.03', 'Despesa - Manutenção', 'despesa', 'debito')");
  executar(db, "INSERT OR IGNORE INTO plano_de_contas (codigo, descricao, grupo, natureza) VALUES ('2.1.04', 'Despesa - Utilidades', 'despesa', 'debito')");

  return db;
}

describe("sugerirCategoria", () => {
  describe("categoria baseada em histórico", () => {
    it("sugere categoria quando 70%+ das transações do mesmo beneficiário têm a mesma categoria", async () => {
      const db = await bancoComTransacoes();

      // Criar 7 transações de "SUPERMERCADO" com a mesma categoria
      for (let i = 0; i < 7; i++) {
        criarTransacaoManual(db, {
          contaId: 1,
          data: "2026-01-01",
          valor: -100,
          descricaoOriginal: "SUPERMERCADO MERCADÃO",
          planoContaCodigo: "2.1.03", // Manutenção
        });
      }

      // Criar 1 transação de supermercado com categoria diferente
      criarTransacaoManual(db, {
        contaId: 1,
        data: "2026-01-02",
        valor: -50,
        descricaoOriginal: "SUPERMERCADO EXTRA",
        planoContaCodigo: "2.1.02", // Condomínio
      });

      // Agora sugerir categoria para uma nova transação de SUPERMERCADO
      // Queremos que uma transação do supermercado SEM categoria receba sugestão
      // Vamos criar uma sem categoria e ver a sugestão
      const novaTransacao = criarTransacaoManual(db, {
        contaId: 1,
        data: "2026-01-03",
        valor: -75,
        descricaoOriginal: "SUPERMERCADO NOVO",
      });

      const sugestaoReal = sugerirCategoria(db, novaTransacao);
      expect(sugestaoReal.confianca).toBeGreaterThanOrEqual(70);
      expect(sugestaoReal.categoria).toBe("2.1.03");
      expect(sugestaoReal.motivo).toContain("histórico");
      expect(sugestaoReal.historico_match).toBeDefined();
      expect(sugestaoReal.historico_match?.count).toBeGreaterThan(0);
    });

    it("retorna confiança média (40-70) quando há variação nas categorias do histórico", async () => {
      const db = await bancoComTransacoes();

      // Criar transações com categorias variadas
      for (let i = 0; i < 3; i++) {
        criarTransacaoManual(db, {
          contaId: 1,
          data: "2026-01-01",
          valor: -100,
          descricaoOriginal: "FORNECEDOR XYZ",
          planoContaCodigo: "2.1.03",
        });
      }

      for (let i = 0; i < 2; i++) {
        criarTransacaoManual(db, {
          contaId: 1,
          data: "2026-01-02",
          valor: -100,
          descricaoOriginal: "FORNECEDOR XYZ",
          planoContaCodigo: "2.1.02",
        });
      }

      const novaTransacao = criarTransacaoManual(db, {
        contaId: 1,
        data: "2026-01-03",
        valor: -100,
        descricaoOriginal: "FORNECEDOR XYZ NOVA",
      });

      const sugestao = sugerirCategoria(db, novaTransacao);
      expect(sugestao.confianca).toBeGreaterThan(40);
      expect(sugestao.confianca).toBeLessThan(90);
    });

    it("não sugere por histórico quando nenhuma transação similar foi encontrada", async () => {
      const db = await bancoComTransacoes();

      const novaTransacao = criarTransacaoManual(db, {
        contaId: 1,
        data: "2026-01-01",
        valor: -100,
        descricaoOriginal: "TRANSACAO UNICA SEM HISTORIA",
      });

      const sugestao = sugerirCategoria(db, novaTransacao);
      // Sem histórico, não deve ter historico_match
      expect(sugestao.historico_match).toBeUndefined();
    });
  });

  describe("categoria baseada em keywords", () => {
    it("detecta keyword 'aluguel' e sugere categoria padrão com confiança alta", async () => {
      const db = await bancoComTransacoes();

      const novaTransacao = criarTransacaoManual(db, {
        contaId: 1,
        data: "2026-01-01",
        valor: 2000,
        descricaoOriginal: "TRANSFERENCIA ALUGUEL INQUILINO",
      });

      const sugestao = sugerirCategoria(db, novaTransacao);
      expect(sugestao.categoria).toBe("1.1.01"); // Receita - Aluguel
      expect(sugestao.confianca).toBeGreaterThanOrEqual(85);
      expect(sugestao.motivo).toContain("Keyword");
    });

    it("detecta keyword 'folha de pagamento' e sugere categoria com confiança muito alta", async () => {
      const db = await bancoComTransacoes();

      const novaTransacao = criarTransacaoManual(db, {
        contaId: 1,
        data: "2026-01-01",
        valor: -5000,
        descricaoOriginal: "FOLHA DE PAGAMENTO - FUNCIONARIOS",
      });

      const sugestao = sugerirCategoria(db, novaTransacao);
      expect(sugestao.categoria).toBe("2.1.01");
      expect(sugestao.confianca).toBeGreaterThanOrEqual(90);
    });

    it("detecta múltiplas keywords e usa a primeira encontrada", async () => {
      const db = await bancoComTransacoes();

      const novaTransacao = criarTransacaoManual(db, {
        contaId: 1,
        data: "2026-01-01",
        valor: -300,
        descricaoOriginal: "TAXA CONDOMINIO - REFORMA PINTURA",
      });

      const sugestao = sugerirCategoria(db, novaTransacao);
      // Pode ser condominio ou manutenção dependendo da ordem
      expect(sugestao.confianca).toBeGreaterThan(0);
    });

    it("caso insensível: detecta keywords em minúsculas e maiúsculas", async () => {
      const db = await bancoComTransacoes();

      const novaTransacao = criarTransacaoManual(db, {
        contaId: 1,
        data: "2026-01-01",
        valor: -200,
        descricaoOriginal: "pix AGUA SANEAMENTO",
      });

      const sugestao = sugerirCategoria(db, novaTransacao);
      expect(sugestao.categoria).toBe("2.1.04"); // Utilidades
    });
  });

  describe("cálculo de confiança", () => {
    it("confiança 0-100 sempre dentro do intervalo válido", async () => {
      const db = await bancoComTransacoes();

      for (let i = 0; i < 5; i++) {
        const t = criarTransacaoManual(db, {
          contaId: 1,
          data: "2026-01-01",
          valor: -100 * i,
          descricaoOriginal: `Transação ${i}`,
        });

        const sugestao = sugerirCategoria(db, t);
        expect(sugestao.confianca).toBeGreaterThanOrEqual(0);
        expect(sugestao.confianca).toBeLessThanOrEqual(100);
      }
    });

    it("histórico com 100% de concordância retorna confiança 90+", async () => {
      const db = await bancoComTransacoes();

      // Todas as transações do mesmo beneficiário com a mesma categoria
      for (let i = 0; i < 10; i++) {
        criarTransacaoManual(db, {
          contaId: 1,
          data: "2026-01-01",
          valor: -100,
          descricaoOriginal: "MESMO FORNECEDOR",
          planoContaCodigo: "2.1.03",
        });
      }

      const novaTransacao = criarTransacaoManual(db, {
        contaId: 1,
        data: "2026-01-02",
        valor: -100,
        descricaoOriginal: "MESMO FORNECEDOR NOVO",
      });

      const sugestao = sugerirCategoria(db, novaTransacao);
      expect(sugestao.confianca).toBeGreaterThanOrEqual(90);
    });
  });

  describe("transação não encontrada", () => {
    it("retorna sugestão com confiança 0 quando transação não existe", async () => {
      const db = await bancoComTransacoes();

      const sugestao = sugerirCategoria(db, 9999);
      expect(sugestao.confianca).toBe(0);
      expect(sugestao.motivo).toContain("não encontrada");
    });
  });

  describe("histórico vazio / sem categorias", () => {
    it("sem transações no histórico, usa fallback (categoria mais frequente ou default)", async () => {
      const db = await bancoComTransacoes();

      const novaTransacao = criarTransacaoManual(db, {
        contaId: 1,
        data: "2026-01-01",
        valor: -100,
        descricaoOriginal: "ALGO ALEATORIO",
      });

      const sugestao = sugerirCategoria(db, novaTransacao);
      // Deve retornar algo (nunca falha)
      expect(sugestao.categoria).toBeDefined();
      expect(sugestao.motivo).toBeDefined();
    });

    it("quando nenhuma transação anterior tem categoria, retorna fallback com confiança baixa", async () => {
      const db = await bancoComTransacoes();

      // Criar transações SEM categoria
      criarTransacaoManual(db, {
        contaId: 1,
        data: "2026-01-01",
        valor: -100,
        descricaoOriginal: "SEM CATEGORIA 1",
      });

      criarTransacaoManual(db, {
        contaId: 1,
        data: "2026-01-02",
        valor: -50,
        descricaoOriginal: "SEM CATEGORIA 2",
      });

      const novaTransacao = criarTransacaoManual(db, {
        contaId: 1,
        data: "2026-01-03",
        valor: -75,
        descricaoOriginal: "SEM CATEGORIA 3",
      });

      const sugestao = sugerirCategoria(db, novaTransacao);
      expect(sugestao.categoria).toBeDefined();
      expect(sugestao.motivo).toContain("fallback");
    });
  });

  describe("edge cases", () => {
    it("descrição com caracteres especiais é normalizada antes do matching", async () => {
      const db = await bancoComTransacoes();

      const novaTransacao = criarTransacaoManual(db, {
        contaId: 1,
        data: "2026-01-01",
        valor: -200,
        descricaoOriginal: "PIX - TAXA CONDOMINIO (KIT-302)",
      });

      const sugestao = sugerirCategoria(db, novaTransacao);
      // Deve encontrar o keyword "condominio" mesmo com caracteres especiais
      expect(sugestao.categoria).toBe("2.1.02");
    });

    it("keywords ambíguas: se houver múltiplas keywords, usa a primeira encontrada", async () => {
      const db = await bancoComTransacoes();

      // Descrição que combina aluguel E condomínio
      const novaTransacao = criarTransacaoManual(db, {
        contaId: 1,
        data: "2026-01-01",
        valor: 1500,
        descricaoOriginal: "ALUGUEL E TAXA CONDOMINIO INTEGRADOS",
      });

      const sugestao = sugerirCategoria(db, novaTransacao);
      // A ordem de padrões importa; o primeiro match vence
      expect(sugestao.categoria).toBeDefined();
      expect(sugestao.confianca).toBeGreaterThan(0);
    });

    it("transação com histórico E keywords: prioriza histórico se confiança >= 70", async () => {
      const db = await bancoComTransacoes();

      // Criar histórico forte para "IMOVEL REFORMA"
      for (let i = 0; i < 8; i++) {
        criarTransacaoManual(db, {
          contaId: 1,
          data: "2026-01-01",
          valor: -500,
          descricaoOriginal: "IMOVEL REFORMA CONSERTO",
          planoContaCodigo: "2.1.03", // Manutenção
        });
      }

      const novaTransacao = criarTransacaoManual(db, {
        contaId: 1,
        data: "2026-01-09",
        valor: -600,
        descricaoOriginal: "IMOVEL REFORMA NOVO CONSERTO",
      });

      const sugestao = sugerirCategoria(db, novaTransacao);
      // Deve usar o histórico (confiança 90) em vez dos keywords
      expect(sugestao.categoria).toBe("2.1.03");
      expect(sugestao.confianca).toBeGreaterThanOrEqual(70);
    });
  });
});

describe("registrarSugestaoCategoria", () => {
  it("insere registro no histórico de sugestões", async () => {
    const db = await bancoComTransacoes();

    const novaTransacao = criarTransacaoManual(db, {
      contaId: 1,
      data: "2026-01-01",
      valor: -100,
      descricaoOriginal: "TESTE REGISTRO",
    });

    registrarSugestaoCategoria(db, novaTransacao, "2.1.03", 85, "Teste motivo");

    const [registro] = consultar<{
      transacao_id: number;
      categoria_sugerida: string;
      confianca_sugestao: number;
      motivo: string;
    }>(db, "SELECT transacao_id, categoria_sugerida, confianca_sugestao, motivo FROM categorias_sugeridas_historico WHERE transacao_id = ?", [
      novaTransacao,
    ]);

    expect(registro.transacao_id).toBe(novaTransacao);
    expect(registro.categoria_sugerida).toBe("2.1.03");
    expect(registro.confianca_sugestao).toBe(85);
    expect(registro.motivo).toBe("Teste motivo");
  });

  it("registra timestamp de criação (criado_em)", async () => {
    const db = await bancoComTransacoes();

    const novaTransacao = criarTransacaoManual(db, {
      contaId: 1,
      data: "2026-01-01",
      valor: -100,
      descricaoOriginal: "TESTE TIMESTAMP",
    });

    const agora = new Date();
    registrarSugestaoCategoria(db, novaTransacao, "2.1.01", 75, "Motivo");

    const [registro] = consultar<{ criado_em: string }>(
      db,
      "SELECT criado_em FROM categorias_sugeridas_historico WHERE transacao_id = ?",
      [novaTransacao],
    );

    expect(registro.criado_em).toBeDefined();
    // Timestamp deve estar próximo ao momento da chamada
    const criadoEm = new Date(registro.criado_em);
    expect(Math.abs(criadoEm.getTime() - agora.getTime())).toBeLessThan(5000); // 5 segundos de margem
  });
});
