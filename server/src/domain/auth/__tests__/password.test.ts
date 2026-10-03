import { describe, it, expect } from "vitest";
import { gerarHashSenha, verificarSenha } from "../password";

describe("password.ts (hash scrypt)", () => {
  it("the correct password verifies against its own hash", async () => {
    const hash = await gerarHashSenha("minha-senha-forte");
    expect(await verificarSenha("minha-senha-forte", hash)).toBe(true);
  });

  it("a wrong password fails verification", async () => {
    const hash = await gerarHashSenha("minha-senha-forte");
    expect(await verificarSenha("senha-diferente", hash)).toBe(false);
  });

  it("is case-sensitive", async () => {
    const hash = await gerarHashSenha("SenhaComMaiuscula");
    expect(await verificarSenha("senhacommaiuscula", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt) for the same password", async () => {
    const hash1 = await gerarHashSenha("mesma-senha");
    const hash2 = await gerarHashSenha("mesma-senha");
    expect(hash1).not.toBe(hash2);
    // Mas as duas continuam validando a mesma senha correta.
    expect(await verificarSenha("mesma-senha", hash1)).toBe(true);
    expect(await verificarSenha("mesma-senha", hash2)).toBe(true);
  });

  it("stores the cost parameters in the hash string, self-describing", async () => {
    const hash = await gerarHashSenha("x");
    const partes = hash.split("$");
    expect(partes[0]).toBe("scrypt");
    expect(partes.length).toBe(6);
  });

  it("never throws on a malformed stored hash — just fails verification", async () => {
    await expect(verificarSenha("qualquer", "isto-nao-e-um-hash-valido")).resolves.toBe(false);
    await expect(verificarSenha("qualquer", "")).resolves.toBe(false);
    await expect(verificarSenha("qualquer", "$2b$12$placeholder_hash_admin")).resolves.toBe(false);
  });
});
