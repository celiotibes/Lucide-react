import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { consultar, executar } from "../../../db/connection";
import {
  somenteDigitos,
  cpfValido,
  cnpjValido,
  validarDocumento,
  formatarDocumento,
  obterEntidadeAtiva,
  criarEntidadeLegal,
  sincronizarRazao,
  resumirMigracao,
} from "../entidadeLegal";

// CPFs e CNPJs válidos (dígitos verificadores reais, conferidos via algoritmo padrão) —
// usados em todo o teste em vez de valores inventados, para nunca mascarar um bug de
// validação com um documento que o próprio validador rejeitaria.
const CPF_TESTE = "52998224725";
const CPF_TESTE_2 = "11144477735";
const CNPJ_TESTE = "11222333000181";

let db: Database;

beforeEach(async () => {
  db = await criarBancoDeTeste();
});

function criarContaBancaria(): number {
  executar(
    db,
    "INSERT INTO contas_bancarias (banco, numero, titular, tipo) VALUES ('Banco Teste', '12345-6', 'Titular', 'corrente')",
  );
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
}

function criarTransacao(contaId: number, data: string, valor: number, planoContaCodigo: string | null = null): number {
  executar(
    db,
    "INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (?, ?, ?, 'Transação de teste', ?)",
    [contaId, data, valor, planoContaCodigo],
  );
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
}

describe("entidadeLegal", () => {
  describe("somenteDigitos", () => {
    it("remove tudo que não é dígito", () => {
      expect(somenteDigitos("123.456.789-09")).toBe("12345678909");
      expect(somenteDigitos("11.222.333/0001-81")).toBe("11222333000181");
    });

    it("string vazia ou sem dígitos retorna vazio", () => {
      expect(somenteDigitos("")).toBe("");
      expect(somenteDigitos("abc-/.")).toBe("");
    });
  });

  describe("cpfValido", () => {
    it("aceita CPFs com dígitos verificadores corretos", () => {
      expect(cpfValido(CPF_TESTE)).toBe(true);
      expect(cpfValido(CPF_TESTE_2)).toBe(true);
    });

    it("rejeita CPF com dígito verificador errado", () => {
      expect(cpfValido("12345678900")).toBe(false);
    });

    it("rejeita CPF com todos os dígitos iguais, mesmo que a conta dos verificadores bata", () => {
      // 111.111.111-11 passaria na conta dos dígitos verificadores — regra extra existe
      // para cobrir exatamente este caso.
      expect(cpfValido("11111111111")).toBe(false);
    });

    it("rejeita string com tamanho diferente de 11", () => {
      expect(cpfValido("123")).toBe(false);
      expect(cpfValido("")).toBe(false);
    });
  });

  describe("cnpjValido", () => {
    it("aceita CNPJs com dígitos verificadores corretos", () => {
      expect(cnpjValido(CNPJ_TESTE)).toBe(true);
    });

    it("rejeita CNPJ com dígito verificador errado", () => {
      expect(cnpjValido("11222333000180")).toBe(false);
    });

    it("rejeita CNPJ com todos os dígitos iguais", () => {
      expect(cnpjValido("11111111111111")).toBe(false);
    });

    it("rejeita string com tamanho diferente de 14", () => {
      expect(cnpjValido("123")).toBe(false);
    });
  });

  describe("validarDocumento", () => {
    it("identifica CPF válido como pessoa_fisica", () => {
      const r = validarDocumento("529.982.247-25");
      expect(r).toEqual({ valido: true, normalizado: CPF_TESTE, tipo: "pessoa_fisica", erro: null });
    });

    it("identifica CNPJ válido como pessoa_juridica", () => {
      const r = validarDocumento("11.222.333/0001-81");
      expect(r).toEqual({ valido: true, normalizado: CNPJ_TESTE, tipo: "pessoa_juridica", erro: null });
    });

    it("CPF com 11 dígitos mas inválido retorna tipo pessoa_fisica com erro", () => {
      const r = validarDocumento("123.456.789-00");
      expect(r.valido).toBe(false);
      expect(r.tipo).toBe("pessoa_fisica");
      expect(r.erro).toMatch(/CPF inválido/);
    });

    it("CNPJ com 14 dígitos mas inválido retorna tipo pessoa_juridica com erro", () => {
      const r = validarDocumento("11.222.333/0001-80");
      expect(r.valido).toBe(false);
      expect(r.tipo).toBe("pessoa_juridica");
      expect(r.erro).toMatch(/CNPJ inválido/);
    });

    it("string vazia retorna erro pedindo o documento", () => {
      const r = validarDocumento("");
      expect(r).toEqual({ valido: false, normalizado: "", tipo: null, erro: "Informe o CPF ou o CNPJ do titular." });
    });

    it("quantidade de dígitos diferente de 11/14 retorna erro mencionando a contagem", () => {
      const r = validarDocumento("123456");
      expect(r.valido).toBe(false);
      expect(r.tipo).toBeNull();
      expect(r.erro).toMatch(/11.*14.*6/);
    });
  });

  describe("formatarDocumento", () => {
    it("formata 11 dígitos como CPF", () => {
      expect(formatarDocumento(CPF_TESTE)).toBe("529.982.247-25");
    });

    it("formata 14 dígitos como CNPJ", () => {
      expect(formatarDocumento(CNPJ_TESTE)).toBe("11.222.333/0001-81");
    });

    it("quantidade de dígitos fora do esperado retorna o valor original sem máscara", () => {
      expect(formatarDocumento("123")).toBe("123");
    });
  });

  describe("obterEntidadeAtiva", () => {
    it("retorna null quando nenhuma entidade foi criada ainda", () => {
      expect(obterEntidadeAtiva(db)).toBeNull();
    });

    it("retorna a entidade de menor id quando existe mais de uma", () => {
      const r1 = criarEntidadeLegal(db, { nome: "Primeiro Titular", cpf_cnpj: CPF_TESTE });
      criarEntidadeLegal(db, { nome: "Segundo Titular", cpf_cnpj: CPF_TESTE_2 });
      const ativa = obterEntidadeAtiva(db);
      expect(ativa?.id).toBe(r1.entidade_id);
      expect(ativa?.nome).toBe("Primeiro Titular");
    });
  });

  describe("criarEntidadeLegal", () => {
    it("cria a entidade, semeia o plano de contas do razão e retorna sucesso", () => {
      const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: CPF_TESTE });
      expect(r.sucesso).toBe(true);
      expect(r.entidade_id).toBeGreaterThan(0);
      expect(r.migracao).toBeDefined();

      const entidade = consultar<{ tipo: string; cpf_cnpj: string; nome: string }>(
        db,
        "SELECT tipo, cpf_cnpj, nome FROM entidades_legais WHERE id = ?",
        [r.entidade_id!],
      )[0];
      expect(entidade).toEqual({ tipo: "pessoa_fisica", cpf_cnpj: CPF_TESTE, nome: "Titular de Teste" });

      // garantirPlanoDeContasErp deve ter semeado as 47 contas do plano fixo do razão.
      const contas = consultar<{ total: number }>(db, "SELECT COUNT(*) AS total FROM contas_plano_contas")[0];
      expect(contas.total).toBe(47);
    });

    it("documento com CNPJ cria entidade pessoa_juridica", () => {
      const r = criarEntidadeLegal(db, { nome: "Empresa de Teste", cpf_cnpj: CNPJ_TESTE });
      expect(r.sucesso).toBe(true);
      const entidade = consultar<{ tipo: string }>(db, "SELECT tipo FROM entidades_legais WHERE id = ?", [r.entidade_id!])[0];
      expect(entidade.tipo).toBe("pessoa_juridica");
    });

    it("normaliza o documento antes de gravar (sem máscara)", () => {
      const r = criarEntidadeLegal(db, { nome: "Titular Mascarado", cpf_cnpj: "529.982.247-25" });
      expect(r.sucesso).toBe(true);
      const entidade = consultar<{ cpf_cnpj: string }>(db, "SELECT cpf_cnpj FROM entidades_legais WHERE id = ?", [r.entidade_id!])[0];
      expect(entidade.cpf_cnpj).toBe(CPF_TESTE);
    });

    it("rejeita nome vazio ou com menos de 2 caracteres, sem gravar nada", () => {
      const r = criarEntidadeLegal(db, { nome: " A ", cpf_cnpj: CPF_TESTE });
      expect(r.sucesso).toBe(false);
      expect(r.mensagem).toMatch(/Informe o nome/);
      expect(consultar(db, "SELECT * FROM entidades_legais")).toHaveLength(0);
    });

    it("rejeita documento inválido, sem gravar nada", () => {
      const r = criarEntidadeLegal(db, { nome: "Titular Inválido", cpf_cnpj: "123.456.789-00" });
      expect(r.sucesso).toBe(false);
      expect(r.mensagem).toMatch(/CPF inválido/);
      expect(consultar(db, "SELECT * FROM entidades_legais")).toHaveLength(0);
    });

    it("rejeita documento já cadastrado por outra entidade", () => {
      criarEntidadeLegal(db, { nome: "Primeiro Titular", cpf_cnpj: CPF_TESTE });
      const r2 = criarEntidadeLegal(db, { nome: "Segundo Titular", cpf_cnpj: CPF_TESTE });
      expect(r2.sucesso).toBe(false);
      expect(r2.mensagem).toMatch(/Já existe uma entidade.*Primeiro Titular/);
      expect(consultar(db, "SELECT * FROM entidades_legais")).toHaveLength(1);
    });

    it("endereco e regime_tributario opcionais são gravados quando informados, null quando omitidos", () => {
      const r = criarEntidadeLegal(db, {
        nome: "Titular Completo",
        cpf_cnpj: CPF_TESTE,
        endereco: "  Rua Teste, 123  ",
        regime_tributario: "lucro_real",
      });
      const entidade = consultar<{ endereco: string; regime_tributario: string }>(
        db,
        "SELECT endereco, regime_tributario FROM entidades_legais WHERE id = ?",
        [r.entidade_id!],
      )[0];
      expect(entidade.endereco).toBe("Rua Teste, 123");
      expect(entidade.regime_tributario).toBe("lucro_real");

      const r2 = criarEntidadeLegal(db, { nome: "Titular Sem Endereco", cpf_cnpj: CPF_TESTE_2 });
      const entidade2 = consultar<{ endereco: string | null; regime_tributario: string | null }>(
        db,
        "SELECT endereco, regime_tributario FROM entidades_legais WHERE id = ?",
        [r2.entidade_id!],
      )[0];
      expect(entidade2.endereco).toBeNull();
      expect(entidade2.regime_tributario).toBeNull();
    });

    it("migra transações já existentes para o razão ao criar a entidade", () => {
      const contaId = criarContaBancaria();
      criarTransacao(contaId, "2025-03-10", 1000, null);

      const r = criarEntidadeLegal(db, { nome: "Titular com Histórico", cpf_cnpj: CPF_TESTE });
      expect(r.sucesso).toBe(true);
      expect(r.migracao?.total_transacoes).toBe(1);
      expect(r.migracao?.transacoes_migradas).toBe(1);
      expect(r.mensagem).toMatch(/1 de 1 transações lançadas no razão/);
      expect(r.mensagem).toMatch(/classificação pendente/);
    });
  });

  describe("sincronizarRazao", () => {
    it("migra transações novas lançadas depois da criação da entidade", () => {
      const r = criarEntidadeLegal(db, { nome: "Titular", cpf_cnpj: CPF_TESTE });
      const entidade_id = r.entidade_id!;

      // nenhuma transação ainda.
      let status = sincronizarRazao(db, entidade_id);
      expect(status.total_transacoes).toBe(0);

      const contaId = criarContaBancaria();
      criarTransacao(contaId, "2025-04-05", -200, null);

      status = sincronizarRazao(db, entidade_id);
      expect(status.total_transacoes).toBe(1);
      expect(status.transacoes_migradas).toBe(1);

      // chamando de novo sem transação nova: a mesma transação é reconhecida como já migrada.
      const status2 = sincronizarRazao(db, entidade_id);
      expect(status2.transacoes_ja_migradas).toBe(1);
      expect(status2.transacoes_migradas).toBe(0);
    });

    it("é idempotente quanto ao plano de contas: chamar duas vezes não duplica contas", () => {
      const r = criarEntidadeLegal(db, { nome: "Titular", cpf_cnpj: CPF_TESTE });
      sincronizarRazao(db, r.entidade_id!);
      sincronizarRazao(db, r.entidade_id!);
      const contas = consultar<{ total: number }>(db, "SELECT COUNT(*) AS total FROM contas_plano_contas")[0];
      expect(contas.total).toBe(47);
    });
  });

  describe("resumirMigracao", () => {
    it("sem nenhuma transação, mensagem diz que o razão está pronto e vazio", () => {
      const msg = resumirMigracao({
        total_transacoes: 0,
        transacoes_migradas: 0,
        transacoes_ja_migradas: 0,
        transacoes_falhadas: 0,
        transacoes_sem_classificacao: 0,
        erros: [],
        tempo_ms: 1,
      });
      expect(msg).toBe("Razão pronto. Não havia transações para lançar ainda.");
    });

    it("menciona só as partes com valor diferente de zero, na ordem migradas · já lá · pendente · falhadas", () => {
      const msg = resumirMigracao({
        total_transacoes: 10,
        transacoes_migradas: 6,
        transacoes_ja_migradas: 2,
        transacoes_falhadas: 1,
        transacoes_sem_classificacao: 3,
        erros: [{ transacao_id: 99, erro: "falha simulada" }],
        tempo_ms: 5,
      });
      expect(msg).toBe(
        "6 de 10 transações lançadas no razão · 2 já estavam lá · 3 em classificação pendente (conta 1.9.99) · 1 não puderam ser lançadas.",
      );
    });

    it("omite partes zeradas (ex: nenhuma falha, nenhuma pendência)", () => {
      const msg = resumirMigracao({
        total_transacoes: 5,
        transacoes_migradas: 5,
        transacoes_ja_migradas: 0,
        transacoes_falhadas: 0,
        transacoes_sem_classificacao: 0,
        erros: [],
        tempo_ms: 2,
      });
      expect(msg).toBe("5 de 5 transações lançadas no razão.");
    });
  });
});
