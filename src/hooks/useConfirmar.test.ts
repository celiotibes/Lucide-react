import { describe, it, expect } from "vitest";
import { OpcoesConfirm } from "./useConfirmar";

describe("useConfirmar types", () => {
  it("OpcoesConfirm has correct interface", () => {
    const opcoes: OpcoesConfirm = {
      titulo: "Test",
      mensagem: "Are you sure?",
      textoCancelar: "Cancel",
      textoConfirmar: "Confirm",
      perigo: false,
    };

    expect(opcoes.titulo).toBe("Test");
    expect(opcoes.mensagem).toBe("Are you sure?");
    expect(opcoes.textoCancelar).toBe("Cancel");
    expect(opcoes.textoConfirmar).toBe("Confirm");
    expect(opcoes.perigo).toBe(false);
  });

  it("OpcoesConfirm with minimal properties", () => {
    const opcoes: OpcoesConfirm = {
      mensagem: "Delete?",
    };

    expect(opcoes.mensagem).toBe("Delete?");
    expect(opcoes.titulo).toBeUndefined();
    expect(opcoes.textoCancelar).toBeUndefined();
    expect(opcoes.textoConfirmar).toBeUndefined();
    expect(opcoes.perigo).toBeUndefined();
  });

  it("OpcoesConfirm with danger variant", () => {
    const opcoes: OpcoesConfirm = {
      titulo: "Delete account",
      mensagem: "This cannot be undone",
      textoConfirmar: "Delete",
      perigo: true,
    };

    expect(opcoes.perigo).toBe(true);
    expect(opcoes.titulo).toBe("Delete account");
  });
});
