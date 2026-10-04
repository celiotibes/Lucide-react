import { describe, expect, it } from "vitest";
import {
  formatarEspera,
  formatarTamanho,
  montarPayload,
  parseDecimalBR,
  resumoContagem,
  validarFormulario,
  type FormularioApontamentoCampo,
} from "../prestadorMobile";
import { deveRegistrarServiceWorker } from "../../../pwa/registrarServiceWorker";

const base: FormularioApontamentoCampo = { imovelId: "3", tipo: "servico", servico: "Troca de torneira", horas: "2,5", valor: "1.234,50", observacoes: " ok " };

describe("parseDecimalBR", () => {
  it.each([
    ["2,5", 2.5],
    ["2.5", 2.5],
    ["1.234,56", 1234.56],
    ["R$ 150,00", 150],
    ["", undefined],
    ["abc", undefined],
    ["1,2,3", undefined],
  ])("%s -> %s", (entrada, esperado) => {
    expect(parseDecimalBR(entrada)).toBe(esperado);
  });
});

describe("validarFormulario", () => {
  it("aceita formulário completo e mínimo (horas/valor opcionais)", () => {
    expect(validarFormulario(base)).toEqual({});
    expect(validarFormulario({ ...base, horas: "", valor: "" })).toEqual({});
  });
  it("aponta campos inválidos", () => {
    const e = validarFormulario({ ...base, imovelId: "", servico: "a", horas: "25", valor: "x" });
    expect(Object.keys(e).sort()).toEqual(["horas", "imovelId", "servico", "valor"]);
  });
  it("horas zero é inválido", () => {
    expect(validarFormulario({ ...base, horas: "0" }).horas).toBeDefined();
  });
});

describe("montarPayload", () => {
  it("normaliza números, apara texto e usa data local", () => {
    const p = montarPayload(base, new Date(2026, 9, 4, 8, 30));
    expect(p).toMatchObject({ tipo: "servico", imovel_id: 3, servico: "Troca de torneira", horas: 2.5, valor: 1234.5, observacoes: "ok", data: "2026-10-04" });
  });
  it("omite campos opcionais vazios", () => {
    const p = montarPayload({ ...base, horas: "", valor: "", observacoes: "" });
    expect(p).not.toHaveProperty("horas");
    expect(p).not.toHaveProperty("valor");
    expect(p).not.toHaveProperty("observacoes");
  });
});

describe("rótulos", () => {
  it("resumoContagem", () => {
    expect(resumoContagem({ pendente: 1, enviando: 1, enviado: 0, erro: 0 })).toBe("2 itens na fila");
    expect(resumoContagem({ pendente: 0, enviando: 0, enviado: 3, erro: 1 })).toBe("0 itens na fila · 1 com erro · 3 enviados");
  });
  it("formatarEspera", () => {
    expect(formatarEspera(1000, 2000)).toBe("");
    expect(formatarEspera(13_000, 1000)).toBe("em 12 s");
    expect(formatarEspera(1000 + 150_000, 1000)).toBe("em 3 min");
  });
  it("formatarTamanho", () => {
    expect(formatarTamanho(500)).toBe("500 B");
    expect(formatarTamanho(2048)).toBe("2 KB");
    expect(formatarTamanho(3 * 1048576)).toBe("3.0 MB");
  });
});

describe("deveRegistrarServiceWorker", () => {
  it("só em produção, com suporte e contexto seguro", () => {
    expect(deveRegistrarServiceWorker({ PROD: true }, { serviceWorker: {} }, true)).toBe(true);
    expect(deveRegistrarServiceWorker({ PROD: false }, { serviceWorker: {} }, true)).toBe(false);
    expect(deveRegistrarServiceWorker({ PROD: true }, {}, true)).toBe(false);
    expect(deveRegistrarServiceWorker({ PROD: true }, { serviceWorker: {} }, false)).toBe(false);
  });
});
