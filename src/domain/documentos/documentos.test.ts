import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { consultar, executar } from "../../db/connection";
import {
  inserirDocumento,
  definirImoveisDoDocumento,
  atualizarDocumento,
  excluirDocumento,
  listarDocumentos,
  obterDocumento,
  listarImoveisDoDocumento,
  listarTransacoesVinculadas,
  type NovoDocumento,
} from "./documentos";

let db: Database;

beforeEach(async () => {
  db = await criarBancoDeTeste();
});

function criarImovel(apelido = "Kitnet 1"): number {
  executar(db, "INSERT INTO imoveis (apelido, tipo, financiado) VALUES (?, 'kitnet', 0)", [apelido]);
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
}

function criarContaBancaria(): number {
  executar(db, "INSERT INTO contas_bancarias (banco, numero, titular, tipo) VALUES ('Banco Teste', '0001', 'Titular', 'corrente')");
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
}

function criarTransacao(contaId: number, valor = 100): number {
  executar(
    db,
    "INSERT INTO transacoes (conta_id, data, valor, descricao_original) VALUES (?, '2025-01-10', ?, 'Transação de teste')",
    [contaId, valor],
  );
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
}

const DOC_BASE: NovoDocumento = {
  tipo: "fatura",
  arquivo_nome: "fatura-energia.pdf",
};

describe("documentos", () => {
  describe("inserirDocumento", () => {
    it("grava o documento com os campos opcionais e retorna o id gerado", () => {
      const id = inserirDocumento(db, {
        tipo: "nota_fiscal",
        arquivo_nome: "nf-123.pdf",
        valor: 500.5,
        data_documento: "2025-02-01",
        cnpj_cpf_contraparte: "12345678000190",
        nome_contraparte: "Fornecedor X",
        descricao_produto_servico: "Material de construção",
        plano_conta_codigo: "2.1.02",
        texto_extraido: "texto bruto do PDF",
        observacoes: "observação de teste",
      });

      expect(id).toBeGreaterThan(0);
      const doc = obterDocumento(db, id);
      expect(doc).toMatchObject({
        tipo: "nota_fiscal",
        arquivo_nome: "nf-123.pdf",
        valor: 500.5,
        data_documento: "2025-02-01",
        cnpj_cpf_contraparte: "12345678000190",
        nome_contraparte: "Fornecedor X",
        descricao_produto_servico: "Material de construção",
        plano_conta_codigo: "2.1.02",
        texto_extraido: "texto bruto do PDF",
        observacoes: "observação de teste",
      });
      expect(doc?.criado_em).toBe(new Date().toISOString().slice(0, 10));
    });

    it("campos opcionais omitidos gravam null", () => {
      const id = inserirDocumento(db, DOC_BASE);
      const doc = obterDocumento(db, id);
      expect(doc?.valor).toBeNull();
      expect(doc?.data_documento).toBeNull();
      expect(doc?.cnpj_cpf_contraparte).toBeNull();
      expect(doc?.nome_contraparte).toBeNull();
      expect(doc?.descricao_produto_servico).toBeNull();
      expect(doc?.plano_conta_codigo).toBeNull();
      expect(doc?.texto_extraido).toBeNull();
      expect(doc?.observacoes).toBeNull();
    });

    it("grava a distribuição de imóveis quando informada", () => {
      const imovel1 = criarImovel("Kitnet A");
      const imovel2 = criarImovel("Kitnet B");
      const id = inserirDocumento(db, DOC_BASE, [
        { imovelId: imovel1, percentual: 60 },
        { imovelId: imovel2, percentual: 40 },
      ]);

      const imoveis = listarImoveisDoDocumento(db, id);
      expect(imoveis).toHaveLength(2);
      expect(imoveis.find((i) => i.imovel_id === imovel1)?.percentual).toBe(60);
      expect(imoveis.find((i) => i.imovel_id === imovel2)?.percentual).toBe(40);
    });

    it("sem imóveis informados, não grava nenhuma linha de distribuição", () => {
      const id = inserirDocumento(db, DOC_BASE);
      expect(listarImoveisDoDocumento(db, id)).toEqual([]);
    });
  });

  describe("definirImoveisDoDocumento", () => {
    it("substitui a distribuição anterior em vez de somar a ela", () => {
      const imovel1 = criarImovel("Kitnet A");
      const imovel2 = criarImovel("Kitnet B");
      const id = inserirDocumento(db, DOC_BASE, [{ imovelId: imovel1, percentual: 100 }]);

      definirImoveisDoDocumento(db, id, [{ imovelId: imovel2, percentual: 100 }]);

      const imoveis = listarImoveisDoDocumento(db, id);
      expect(imoveis).toHaveLength(1);
      expect(imoveis[0].imovel_id).toBe(imovel2);
    });

    it("lista vazia remove toda a distribuição existente", () => {
      const imovel1 = criarImovel();
      const id = inserirDocumento(db, DOC_BASE, [{ imovelId: imovel1, percentual: 100 }]);
      definirImoveisDoDocumento(db, id, []);
      expect(listarImoveisDoDocumento(db, id)).toEqual([]);
    });
  });

  describe("atualizarDocumento", () => {
    it("atualiza os campos do documento e substitui a distribuição de imóveis", () => {
      const imovel1 = criarImovel("Kitnet A");
      const imovel2 = criarImovel("Kitnet B");
      const id = inserirDocumento(db, DOC_BASE, [{ imovelId: imovel1, percentual: 100 }]);

      atualizarDocumento(
        db,
        id,
        {
          tipo: "boleto",
          arquivo_nome: "boleto-atualizado.pdf",
          valor: 999,
          data_documento: "2025-03-01",
          cnpj_cpf_contraparte: "99988877766",
          nome_contraparte: "Novo Contraparte",
          descricao_produto_servico: "Serviço atualizado",
          plano_conta_codigo: "2.1.04",
        },
        [{ imovelId: imovel2, percentual: 100 }],
      );

      const doc = obterDocumento(db, id);
      expect(doc).toMatchObject({
        tipo: "boleto",
        arquivo_nome: "boleto-atualizado.pdf",
        valor: 999,
        data_documento: "2025-03-01",
        cnpj_cpf_contraparte: "99988877766",
        nome_contraparte: "Novo Contraparte",
        descricao_produto_servico: "Serviço atualizado",
        plano_conta_codigo: "2.1.04",
      });

      const imoveis = listarImoveisDoDocumento(db, id);
      expect(imoveis).toHaveLength(1);
      expect(imoveis[0].imovel_id).toBe(imovel2);
    });
  });

  describe("excluirDocumento", () => {
    it("remove o documento e seus vínculos (imóveis e transações)", () => {
      const imovel1 = criarImovel();
      const contaId = criarContaBancaria();
      const transacaoId = criarTransacao(contaId);
      const id = inserirDocumento(db, DOC_BASE, [{ imovelId: imovel1, percentual: 100 }]);
      executar(db, "INSERT INTO documento_transacoes (documento_id, transacao_id, score, status) VALUES (?, ?, 0.9, 'sugerido')", [id, transacaoId]);

      excluirDocumento(db, id);

      expect(obterDocumento(db, id)).toBeNull();
      expect(listarImoveisDoDocumento(db, id)).toEqual([]);
      expect(listarTransacoesVinculadas(db, id)).toEqual([]);
      // a transação em si não é afetada, só o vínculo.
      const transacao = consultar(db, "SELECT * FROM transacoes WHERE id = ?", [transacaoId]);
      expect(transacao).toHaveLength(1);
    });

    it("excluir um id inexistente não lança erro (idempotente)", () => {
      expect(() => excluirDocumento(db, 999999)).not.toThrow();
    });
  });

  describe("listarDocumentos", () => {
    it("retorna todos os documentos, mais recente primeiro", () => {
      const id1 = inserirDocumento(db, { ...DOC_BASE, arquivo_nome: "primeiro.pdf" });
      const id2 = inserirDocumento(db, { ...DOC_BASE, arquivo_nome: "segundo.pdf" });

      const docs = listarDocumentos(db);
      expect(docs.map((d) => d.id)).toEqual([id2, id1]);
    });

    it("banco vazio retorna lista vazia", () => {
      expect(listarDocumentos(db)).toEqual([]);
    });
  });

  describe("obterDocumento", () => {
    it("retorna null para um id inexistente", () => {
      expect(obterDocumento(db, 123456)).toBeNull();
    });
  });

  describe("listarImoveisDoDocumento", () => {
    it("inclui o apelido do imóvel", () => {
      const imovel1 = criarImovel("Apto Central");
      const id = inserirDocumento(db, DOC_BASE, [{ imovelId: imovel1, percentual: 100 }]);
      const imoveis = listarImoveisDoDocumento(db, id);
      expect(imoveis[0].apelido).toBe("Apto Central");
    });

    it("documento sem imóveis vinculados retorna lista vazia", () => {
      const id = inserirDocumento(db, DOC_BASE);
      expect(listarImoveisDoDocumento(db, id)).toEqual([]);
    });
  });

  describe("listarTransacoesVinculadas", () => {
    it("retorna as transações sugeridas/confirmadas vinculadas ao documento", () => {
      const contaId = criarContaBancaria();
      const transacao1 = criarTransacao(contaId, 100);
      const transacao2 = criarTransacao(contaId, 200);
      const id = inserirDocumento(db, DOC_BASE);
      executar(db, "INSERT INTO documento_transacoes (documento_id, transacao_id, score, status) VALUES (?, ?, 0.95, 'confirmado')", [id, transacao1]);
      executar(db, "INSERT INTO documento_transacoes (documento_id, transacao_id, score, status) VALUES (?, ?, 0.4, 'sugerido')", [id, transacao2]);

      const vinculadas = listarTransacoesVinculadas(db, id);
      expect(vinculadas).toHaveLength(2);
      expect(vinculadas).toEqual(
        expect.arrayContaining([
          { transacaoId: transacao1, status: "confirmado", score: 0.95 },
          { transacaoId: transacao2, status: "sugerido", score: 0.4 },
        ]),
      );
    });

    it("documento sem transações vinculadas retorna lista vazia", () => {
      const id = inserirDocumento(db, DOC_BASE);
      expect(listarTransacoesVinculadas(db, id)).toEqual([]);
    });
  });
});
