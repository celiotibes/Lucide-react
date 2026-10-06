import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import {
  lerContratoParaPortal,
  montarPayloadPortal,
  publicarContratoNoPortal,
  reaisParaCentavos,
  type EntradaMontagemPortal,
} from "./publicarPortal";

function entrada(over: Partial<EntradaMontagemPortal> = {}): EntradaMontagemPortal {
  return {
    usuarioId: "u1",
    versao: 3,
    hoje: "2026-03-15",
    contrato: { id: 7, valor_referencia: 1500.5, dia_vencimento: 10, data_inicio: "2026-01-01", data_fim: null },
    imovel: { apelido: "Kitnet 302" },
    competencias: [
      { id: 12, ano: 2026, mes: 3, valor_devido: 1500.5, data_vencimento: "2026-03-10", status: "pendente", data_recebimento: null },
      { id: 10, ano: 2026, mes: 1, valor_devido: 1500.5, data_vencimento: "2026-01-10", status: "recebido", data_recebimento: "2026-01-09" },
      { id: 11, ano: 2026, mes: 2, valor_devido: 0.1 + 0.2, data_vencimento: "2026-02-10", status: "cancelado", data_recebimento: null },
      { id: 13, ano: 2026, mes: 4, valor_devido: 1500.5, data_vencimento: "2026-04-10", status: "pendente", data_recebimento: null },
    ],
    ...over,
  };
}

describe("montarPayloadPortal", () => {
  it("converte para centavos exatos, ordena por competência e mapeia status", () => {
    const p = montarPayloadPortal(entrada());
    expect(p).toMatchObject({
      usuarioId: "u1",
      contratoRef: "7",
      versao: 3,
      imovelApelido: "Kitnet 302",
      valorAluguelCentavos: 150050,
      diaVencimento: 10,
      dataFim: null,
    });
    expect(p.cobrancas.map((c) => [c.competencia, c.status, c.valorCentavos])).toEqual([
      ["2026-01", "paga", 150050],
      ["2026-02", "cancelada", 30], // 0.1 + 0.2 normalizado
      ["2026-03", "vencida", 150050],
      ["2026-04", "pendente", 150050],
    ]);
    expect(p.cobrancas[0].dataPagamento).toBe("2026-01-09");
    expect(p.cobrancas[2].dataPagamento).toBeNull();
    expect(p.cobrancas.map((c) => c.cobrancaRef)).toEqual(["10", "11", "12", "13"]);
  });

  it("não vaza campos além do necessário (minimização)", () => {
    const suja = entrada() as any;
    (suja.contrato as any).locatario = "Fulano";
    (suja.contrato as any).cpf = "999.888";
    (suja.imovel as any).endereco = "Rua X";
    const json = JSON.stringify(montarPayloadPortal(suja));
    expect(json).not.toMatch(/Fulano|999\.888|Rua X|locatario|cpf|endereco/);
  });

  it("recusa fração de centavo em vez de arredondar", () => {
    expect(() =>
      montarPayloadPortal(
        entrada({ contrato: { id: 1, valor_referencia: 333.3333, dia_vencimento: 5, data_inicio: "2026-01-01", data_fim: null } }),
      ),
    ).toThrow(/2 casas/);
    expect(() => reaisParaCentavos(-1, "v")).toThrow();
  });

  it("é determinístico (mesma entrada, mesmo payload)", () => {
    expect(montarPayloadPortal(entrada())).toEqual(montarPayloadPortal(entrada()));
  });
});

describe("lerContratoParaPortal (sql.js)", () => {
  let db: Database;
  beforeEach(async () => {
    db = await criarBancoDeTeste();
    executar(db, "INSERT INTO imoveis (id, apelido, tipo, endereco, financiado) VALUES (1, 'Kitnet 1', 'kitnet', 'Rua Secreta 10', 0)");
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, dia_vencimento, data_inicio)
       VALUES (5, 1, 'Maria Segredo', 'residencial_fixo', 1000, 5, '2026-01-01')`,
    );
    executar(
      db,
      `INSERT INTO aluguel_competencias (contrato_id, imovel_id, ano, mes, valor_devido, data_vencimento, status, criado_em)
       VALUES (5, 1, 2026, 1, 1000, '2026-01-05', 'pendente', '2026-01-01')`,
    );
  });

  it("lê contrato, imóvel e competências locais sem dados sensíveis", () => {
    const p = lerContratoParaPortal(db, 5, { usuarioId: "u9", versao: 1, hoje: "2026-02-01" })!;
    expect(p.imovelApelido).toBe("Kitnet 1");
    expect(p.valorAluguelCentavos).toBe(100000);
    expect(p.cobrancas).toEqual([
      { cobrancaRef: expect.any(String), competencia: "2026-01", vencimento: "2026-01-05", valorCentavos: 100000, status: "vencida", dataPagamento: null },
    ]);
    expect(JSON.stringify(p)).not.toMatch(/Secreta|Segredo/);
  });

  it("devolve null para contrato inexistente", () => {
    expect(lerContratoParaPortal(db, 999, { usuarioId: "u", versao: 1, hoje: "2026-01-01" })).toBeNull();
  });
});

describe("publicarContratoNoPortal", () => {
  const payload = montarPayloadPortal(entrada());
  const resposta = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status });

  it("faz POST JSON via apiFetch injetado e reporta idempotência", async () => {
    const apiFetch = vi.fn().mockResolvedValue(resposta(200, { ok: true, idempotente: true }));
    const r = await publicarContratoNoPortal(apiFetch, payload);
    expect(r).toEqual({ ok: true, status: 200, idempotente: true });
    const [caminho, init] = apiFetch.mock.calls[0];
    expect(caminho).toBe("/api/portal/publicar");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it("devolve ok:false com a mensagem do servidor em erro HTTP", async () => {
    const apiFetch = vi.fn().mockResolvedValue(resposta(400, { erro: "Payload inválido", detalhes: ["versao: x"] }));
    const r = await publicarContratoNoPortal(apiFetch, payload);
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(r.erro).toContain("Payload inválido");
    expect(r.erro).toContain("versao: x");
  });

  it("propaga falha de rede ao chamador", async () => {
    await expect(publicarContratoNoPortal(vi.fn().mockRejectedValue(new Error("offline")), payload)).rejects.toThrow("offline");
  });
});
