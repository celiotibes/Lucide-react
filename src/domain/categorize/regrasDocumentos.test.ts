import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { buscarRegraPorCnpjCpf, excluirRegraDocumento, listarRegrasDocumentos, salvarOuAtualizarRegraDocumento } from "./regrasDocumentos";

describe("regrasDocumentos — regra aprendida por CNPJ/CPF para pré-preencher documentos futuros", () => {
  it("buscarRegraPorCnpjCpf retorna null quando ainda não há regra aprendida para o CNPJ", async () => {
    const db = await criarBancoDeTeste();
    expect(buscarRegraPorCnpjCpf(db, "18.071.719/0001-89")).toBeNull();
  });

  it("salvarOuAtualizarRegraDocumento cria a regra na primeira vez (insert)", async () => {
    const db = await criarBancoDeTeste();
    salvarOuAtualizarRegraDocumento(db, "18.071.719/0001-89", {
      tipo: "boleto",
      nomeContraparte: "LIFE SPACE ESTACIONAMENTOS LTDA",
      planoContaCodigo: "2.1.01",
      imovelId: null,
    });

    const regra = buscarRegraPorCnpjCpf(db, "18.071.719/0001-89");
    expect(regra).not.toBeNull();
    expect(regra?.tipo).toBe("boleto");
    expect(regra?.nome_contraparte).toBe("LIFE SPACE ESTACIONAMENTOS LTDA");
    expect(regra?.plano_conta_codigo).toBe("2.1.01");
    expect(regra?.imovel_id).toBeNull();
  });

  it("salvarOuAtualizarRegraDocumento na segunda vez para o mesmo CNPJ atualiza em vez de duplicar (upsert)", async () => {
    const db = await criarBancoDeTeste();
    salvarOuAtualizarRegraDocumento(db, "18.071.719/0001-89", {
      tipo: "boleto",
      nomeContraparte: "LIFE SPACE ESTACIONAMENTOS LTDA",
      planoContaCodigo: "2.1.01",
      imovelId: null,
    });
    salvarOuAtualizarRegraDocumento(db, "18.071.719/0001-89", {
      tipo: "fatura",
      nomeContraparte: "LIFE SPACE ESTACIONAMENTOS LTDA",
      planoContaCodigo: "2.1.02",
      imovelId: null,
    });

    const todas = listarRegrasDocumentos(db);
    expect(todas.length).toBe(1);
    expect(todas[0].tipo).toBe("fatura");
    expect(todas[0].plano_conta_codigo).toBe("2.1.02");
  });

  it("excluirRegraDocumento remove a regra pelo id", async () => {
    const db = await criarBancoDeTeste();
    salvarOuAtualizarRegraDocumento(db, "18.071.719/0001-89", {
      tipo: "boleto",
      nomeContraparte: "LIFE SPACE ESTACIONAMENTOS LTDA",
      planoContaCodigo: "2.1.01",
      imovelId: null,
    });
    const [regra] = listarRegrasDocumentos(db);

    excluirRegraDocumento(db, regra.id);

    expect(listarRegrasDocumentos(db)).toEqual([]);
  });

  it("regras de CNPJs diferentes coexistem sem interferência", async () => {
    const db = await criarBancoDeTeste();
    salvarOuAtualizarRegraDocumento(db, "18.071.719/0001-89", {
      tipo: "boleto",
      nomeContraparte: "LIFE SPACE ESTACIONAMENTOS LTDA",
      planoContaCodigo: "2.1.01",
      imovelId: null,
    });
    salvarOuAtualizarRegraDocumento(db, "99.999.999/0001-99", {
      tipo: "recibo",
      nomeContraparte: "Outra Empresa LTDA",
      planoContaCodigo: "2.1.04",
      imovelId: null,
    });

    expect(listarRegrasDocumentos(db).length).toBe(2);
    expect(buscarRegraPorCnpjCpf(db, "18.071.719/0001-89")?.tipo).toBe("boleto");
    expect(buscarRegraPorCnpjCpf(db, "99.999.999/0001-99")?.tipo).toBe("recibo");
  });
});
