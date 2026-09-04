import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { registrarDocumentoGerado, listarDocumentosGerados } from "./historicoDocumentos";

describe("registrarDocumentoGerado / listarDocumentosGerados", () => {
  it("registra o hash SHA-256 do conteúdo exato e lista do mais recente para o mais antigo", async () => {
    const db = await criarBancoDeTeste();

    await registrarDocumentoGerado(db, {
      tipo: "laudo_pericial",
      nomeArquivo: "laudo-1.pdf",
      dataEmissao: "2026-01-01",
      bytes: new TextEncoder().encode("conteudo A"),
    });
    await registrarDocumentoGerado(db, {
      tipo: "rad",
      nomeArquivo: "rad-1.pdf",
      dataEmissao: "2026-02-01",
      bytes: new TextEncoder().encode("conteudo B"),
      contratoId: undefined,
      imovelId: undefined,
    });

    const historico = listarDocumentosGerados(db);
    expect(historico).toHaveLength(2);
    // mais recente primeiro (ORDER BY gerado_em DESC)
    expect(historico[0].nome_arquivo).toBe("rad-1.pdf");
    expect(historico[1].nome_arquivo).toBe("laudo-1.pdf");
    // hash real do conteúdo, não um placeholder — dois conteúdos diferentes produzem hashes diferentes
    expect(historico[0].hash_sha256).not.toBe(historico[1].hash_sha256);
    expect(historico[0].hash_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
