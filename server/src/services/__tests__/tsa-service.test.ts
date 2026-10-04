import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { montarTimeStampReq, validarRespostaTsr, solicitarCarimbo } from "../tsa-service";

const HASH = "a".repeat(64);

// TimeStampResp mínima: SEQUENCE { PKIStatusInfo{status}, timeStampToken SEQUENCE{} }
const respostaOk = Buffer.from("3007" + "3003020100" + "3000", "hex");
const respostaRecusada = Buffer.from("3005" + "3003020102", "hex"); // status 2, sem token

describe("tsa-service", () => {
  it("monta TimeStampReq que o OpenSSL decodifica (SHA-256, nonce, certReq)", () => {
    const pedido = montarTimeStampReq(HASH, { nonce: 12345n });
    const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tsq-")), "req.tsq");
    fs.writeFileSync(arq, pedido);
    let texto: string;
    try {
      texto = execFileSync("openssl", ["ts", "-query", "-in", arq, "-text"], { encoding: "utf-8" });
    } catch (e: any) {
      if (e.code === "ENOENT") return; // openssl indisponível
      throw e;
    }
    expect(texto).toMatch(/sha256/i);
    expect(texto).toMatch(/aa aa aa aa/i);
    expect(texto).toMatch(/Nonce: 0x3039/);
    expect(texto).toMatch(/Certificate required: yes/);
  });

  it("recusa hash que não seja SHA-256 hexadecimal", () => {
    expect(() => montarTimeStampReq("xyz")).toThrow();
    expect(() => montarTimeStampReq("a".repeat(63))).toThrow();
  });

  it("gera nonces diferentes a cada pedido", () => {
    expect(montarTimeStampReq(HASH).equals(montarTimeStampReq(HASH))).toBe(false);
  });

  it("valida resposta granted e recusa rejeição ou lixo", () => {
    expect(validarRespostaTsr(respostaOk).pkiStatus).toBe(0);
    expect(() => validarRespostaTsr(respostaRecusada)).toThrow();
    expect(() => validarRespostaTsr(Buffer.from("lixo"))).toThrow();
  });

  const resp = (corpo: Buffer, status = 200) =>
    ({ ok: status < 400, status, arrayBuffer: async () => corpo.buffer.slice(corpo.byteOffset, corpo.byteOffset + corpo.byteLength) }) as unknown as Response;

  it("uma TSA falhando não impede a outra", async () => {
    const fetchImpl = (async (url: string) => (url.includes("boa") ? resp(respostaOk) : resp(Buffer.alloc(0), 500))) as unknown as typeof fetch;
    const r = await solicitarCarimbo(HASH, { urls: ["https://ruim/tsr", "https://boa/tsr"], fetchImpl });
    expect(r.resultados).toHaveLength(1);
    expect(r.resultados[0].tsa_url).toBe("https://boa/tsr");
    expect(Buffer.from(r.resultados[0].token_base64, "base64").equals(respostaOk)).toBe(true);
    expect(r.falhas).toHaveLength(1);
  });

  it("lança quando todas as TSAs falham", async () => {
    const fetchImpl = (async () => { throw new Error("sem rede"); }) as unknown as typeof fetch;
    await expect(solicitarCarimbo(HASH, { urls: ["https://x/tsr"], fetchImpl })).rejects.toThrow(/Nenhuma TSA disponível/);
  });
});
