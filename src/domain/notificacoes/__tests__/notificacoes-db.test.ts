import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { registrarTentativa, marcarEnviado, marcarFalha, listarPorOrigem, listarRecentes } from "../notificacoes-db";

let db: Database;

beforeEach(async () => {
  db = await criarBancoDeTeste();
});

describe("notificacoes-db", () => {
  it("registrarTentativa grava com status 'pendente'", () => {
    const n = registrarTentativa(db, {
      origemTipo: "cobranca_asaas",
      origemId: 7,
      canal: "email",
      destinatario: "a@b.com",
      assunto: "Boleto",
      mensagem: "Seu boleto chegou",
    });
    expect(n.status).toBe("pendente");
    expect(n.origemTipo).toBe("cobranca_asaas");
    expect(n.origemId).toBe(7);
    expect(n.canal).toBe("email");
    expect(n.enviadoEm).toBeNull();
  });

  it("marcarEnviado preenche enviado_em e muda o status", () => {
    const n = registrarTentativa(db, { origemTipo: "comunicado_generico", canal: "whatsapp", destinatario: "+551199990000", mensagem: "oi" });
    const atualizado = marcarEnviado(db, n.id);
    expect(atualizado.status).toBe("enviado");
    expect(atualizado.enviadoEm).not.toBeNull();
  });

  it("marcarFalha grava a mensagem de erro e muda o status", () => {
    const n = registrarTentativa(db, { origemTipo: "comunicado_generico", canal: "telegram", destinatario: "123", mensagem: "oi" });
    const atualizado = marcarFalha(db, n.id, "Telegram Bot API respondeu 403");
    expect(atualizado.status).toBe("falha");
    expect(atualizado.erroMensagem).toBe("Telegram Bot API respondeu 403");
  });

  it("marcarEnviado/marcarFalha lançam ao tentar mudar uma tentativa que não está mais pendente", () => {
    const n = registrarTentativa(db, { origemTipo: "comunicado_generico", canal: "email", destinatario: "a@b.com", mensagem: "oi" });
    marcarEnviado(db, n.id);
    expect(() => marcarEnviado(db, n.id)).toThrow();
    expect(() => marcarFalha(db, n.id, "erro")).toThrow();
  });

  it("listarPorOrigem filtra por origem_tipo + origem_id, mais recente primeiro", () => {
    registrarTentativa(db, { origemTipo: "cobranca_asaas", origemId: 1, canal: "email", destinatario: "a@b.com", mensagem: "m1" });
    registrarTentativa(db, { origemTipo: "cobranca_asaas", origemId: 1, canal: "whatsapp", destinatario: "+5511999999999", mensagem: "m1" });
    registrarTentativa(db, { origemTipo: "cobranca_asaas", origemId: 2, canal: "email", destinatario: "c@d.com", mensagem: "m2" });

    const doOrigem1 = listarPorOrigem(db, "cobranca_asaas", 1);
    expect(doOrigem1).toHaveLength(2);
    expect(doOrigem1.every((n) => n.origemId === 1)).toBe(true);
  });

  it("listarPorOrigem com origemId nulo lista comunicados genéricos soltos", () => {
    registrarTentativa(db, { origemTipo: "comunicado_generico", origemId: null, canal: "email", destinatario: "a@b.com", mensagem: "aviso" });
    const lista = listarPorOrigem(db, "comunicado_generico", null);
    expect(lista).toHaveLength(1);
    expect(lista[0].origemId).toBeNull();
  });

  it("listarRecentes devolve todas as origens, respeitando o limite", () => {
    for (let i = 0; i < 5; i++) {
      registrarTentativa(db, { origemTipo: "comunicado_generico", canal: "email", destinatario: `u${i}@b.com`, mensagem: "x" });
    }
    expect(listarRecentes(db, 3)).toHaveLength(3);
    expect(listarRecentes(db)).toHaveLength(5);
  });
});
