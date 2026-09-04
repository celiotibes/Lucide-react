import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { registrarLog, resumirDiferenca, listarHistoricoDoRegistro, listarLogCompleto } from "./logAlteracoes";

describe("logAlteracoes", () => {
  it("resumirDiferenca lista só os campos que mudaram, não a linha inteira", () => {
    const anterior = { id: 1, valor_venal_atual: 450000, apelido: "Kitnet 1" };
    const novo = { id: 1, valor_venal_atual: 480000, apelido: "Kitnet 1" };
    expect(resumirDiferenca(anterior, novo)).toBe("valor_venal_atual: 450000 → 480000");
  });

  it("resumirDiferenca sem snapshot anterior marca como criação", () => {
    expect(resumirDiferenca(null, { id: 1, apelido: "Kitnet 1" })).toBe("registro criado");
  });

  it("registrarLog + listarHistoricoDoRegistro/listarLogCompleto", async () => {
    const db = await criarBancoDeTeste();
    registrarLog(db, "imoveis", 1, "criacao", "registro criado", null, { id: 1, apelido: "Kitnet 1" });
    registrarLog(db, "imoveis", 1, "edicao", "valor_venal_atual: 450000 → 480000", { valor_venal_atual: 450000 }, { valor_venal_atual: 480000 });
    registrarLog(db, "contratos_locacao", 5, "criacao", "registro criado", null, { id: 5 });

    const historicoImovel1 = listarHistoricoDoRegistro(db, "imoveis", 1);
    expect(historicoImovel1).toHaveLength(2);
    expect(historicoImovel1[0].operacao).toBe("edicao"); // mais recente primeiro
    expect(JSON.parse(historicoImovel1[0].dados_novos!)).toEqual({ valor_venal_atual: 480000 });

    expect(listarLogCompleto(db)).toHaveLength(3);
  });
});
