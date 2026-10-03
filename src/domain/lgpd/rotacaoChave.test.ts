import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { registrarRotacao, listarRotacoes, proximaRotacaoDevida } from "./rotacaoChave";

describe("rotacaoChave: registro de política (NÃO é criptografia de arquivo)", () => {
  it("registrarRotacao grava e devolve o registro completo, nunca a chave em si — só o hash de referência", async () => {
    const db = await criarBancoDeTeste();
    const registro = registrarRotacao(db, {
      responsavel: "Ana (DPO)",
      motivo: "Rotação trimestral programada",
      chave_anterior_hash: "abc123hash",
      observacoes: "Sem incidente associado",
    });

    expect(registro.id).toBeDefined();
    expect(registro.responsavel).toBe("Ana (DPO)");
    expect(registro.chave_anterior_hash).toBe("abc123hash");
    expect(registro.data_rotacao).toBeTruthy();
  });

  it("listarRotacoes devolve mais recente primeiro", async () => {
    const db = await criarBancoDeTeste();
    registrarRotacao(db, { responsavel: "Ana", motivo: "Primeira", chave_anterior_hash: "hash1", data_rotacao: "2025-01-01T00:00:00.000Z" });
    registrarRotacao(db, { responsavel: "Bruno", motivo: "Segunda", chave_anterior_hash: "hash2", data_rotacao: "2025-06-01T00:00:00.000Z" });

    const rotacoes = listarRotacoes(db);
    expect(rotacoes).toHaveLength(2);
    expect(rotacoes[0].motivo).toBe("Segunda"); // mais recente primeiro
    expect(rotacoes[1].motivo).toBe("Primeira");
  });

  it("proximaRotacaoDevida sem NENHUMA rotação registrada considera devida (não assume que está em dia)", async () => {
    const db = await criarBancoDeTeste();
    const status = proximaRotacaoDevida(db);
    expect(status.ultima_rotacao).toBeNull();
    expect(status.meses_desde_ultima_rotacao).toBeNull();
    expect(status.devida).toBe(true);
  });

  it("proximaRotacaoDevida com rotação recente (hoje) e limite de 6 meses: não devida", async () => {
    const db = await criarBancoDeTeste();
    registrarRotacao(db, {
      responsavel: "Ana",
      motivo: "Rotação de hoje",
      chave_anterior_hash: "hashX",
      data_rotacao: new Date().toISOString(),
    });

    const status = proximaRotacaoDevida(db, 6);
    expect(status.devida).toBe(false);
    expect(status.meses_desde_ultima_rotacao).toBeLessThan(1);
  });

  it("proximaRotacaoDevida com rotação de 8 meses atrás e limite de 6 meses: devida", async () => {
    const db = await criarBancoDeTeste();
    const oitoMesesAtras = new Date();
    oitoMesesAtras.setMonth(oitoMesesAtras.getMonth() - 8);

    registrarRotacao(db, {
      responsavel: "Ana",
      motivo: "Rotação antiga",
      chave_anterior_hash: "hashAntigo",
      data_rotacao: oitoMesesAtras.toISOString(),
    });

    const status = proximaRotacaoDevida(db, 6);
    expect(status.devida).toBe(true);
    expect(status.meses_desde_ultima_rotacao).toBeGreaterThanOrEqual(6);
  });

  it("proximaRotacaoDevida respeita um mesesLimite customizado (política mais rígida, ex: 3 meses)", async () => {
    const db = await criarBancoDeTeste();
    const quatroMesesAtras = new Date();
    quatroMesesAtras.setMonth(quatroMesesAtras.getMonth() - 4);
    registrarRotacao(db, { responsavel: "Ana", motivo: "X", chave_anterior_hash: "h", data_rotacao: quatroMesesAtras.toISOString() });

    expect(proximaRotacaoDevida(db, 6).devida).toBe(false); // dentro dos 6 meses padrão
    expect(proximaRotacaoDevida(db, 3).devida).toBe(true); // mas fora de uma política de 3 meses
  });
});
