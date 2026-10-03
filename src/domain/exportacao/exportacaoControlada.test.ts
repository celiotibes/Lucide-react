import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { consultar, executar } from "../../db/connection";
import {
  calcularHashConteudo,
  registrarExportacaoGerada,
  registrarAcessoExportacao,
  revogarExportacao,
  listarExportacoes,
  listarAcessosDeExportacao,
  verificarIntegridadeExportacao,
} from "./exportacaoControlada";

/**
 * Nota sobre escopo: as três funções de conveniência (gerarLaudoPdfControlado,
 * gerarRadPdfControlado, gerarEcdControlado) chamam a lógica de geração REAL de
 * gerarLaudoPdf.ts/gerarRadPdf.ts/ecd-export.ts, que por sua vez dependem de montar
 * DadosLaudo/DadosRad completos (dezenas de campos: DRE, patrimônio líquido, inventário de
 * bens, resultado de caução etc.) ou uma entidade legal + período contábil com lançamentos
 * no razão. Isso já está coberto pelos testes de cada módulo (gerarLaudoPdf, gerarRadPdf,
 * ecd-export.test.ts). O que este arquivo cobre é o envelope de controle em si — hash,
 * revogação, expiração, trilha de acesso, verificação de integridade —, testado com um
 * conteúdo fake (uma string qualquer) no lugar do PDF/TXT real, exatamente como a tarefa
 * autoriza. As três funções de conveniência foram conferidas por leitura: cada uma só chama
 * o gerador original e passa o retorno para registrarExportacaoGerada(), sem lógica própria
 * de geração — o mesmo caminho de registro já validado abaixo.
 */

let db: Database;

beforeEach(async () => {
  db = await criarBancoDeTeste();
});

describe("calcularHashConteudo", () => {
  it("é determinístico: o mesmo conteúdo sempre produz o mesmo hash", async () => {
    const hash1 = await calcularHashConteudo("conteúdo de teste idêntico");
    const hash2 = await calcularHashConteudo("conteúdo de teste idêntico");
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("conteúdos diferentes produzem hashes diferentes", async () => {
    const hash1 = await calcularHashConteudo("conteúdo A");
    const hash2 = await calcularHashConteudo("conteúdo B");
    expect(hash1).not.toBe(hash2);
  });

  it("aceita string e Uint8Array, e trata os mesmos bytes de forma equivalente", async () => {
    const texto = "mesmo conteúdo, tipos diferentes";
    const hashString = await calcularHashConteudo(texto);
    const hashBytes = await calcularHashConteudo(new TextEncoder().encode(texto));
    expect(hashString).toBe(hashBytes);
  });
});

describe("registrarExportacaoGerada", () => {
  it("insere o envelope com hash do conteúdo e sem expiração quando validadeDias não é informado", async () => {
    const { id, hash } = await registrarExportacaoGerada(db, {
      tipo: "laudo_pericial",
      formato: "pdf",
      conteudo: "conteúdo fake do laudo",
      geradoPor: "perito@example.com",
    });

    expect(id).toBeGreaterThan(0);
    expect(hash).toBe(await calcularHashConteudo("conteúdo fake do laudo"));

    const [linha] = consultar<{ arquivo_hash: string; expira_em: string | null; revogado: number }>(
      db,
      "SELECT arquivo_hash, expira_em, revogado FROM exportacoes_geradas WHERE id = ?",
      [id],
    );
    expect(linha.arquivo_hash).toBe(hash);
    expect(linha.expira_em).toBeNull();
    expect(linha.revogado).toBe(0);
  });

  it("calcula expira_em a partir de validadeDias quando informado", async () => {
    const antes = Date.now();
    const { id } = await registrarExportacaoGerada(db, {
      tipo: "rad",
      formato: "pdf",
      conteudo: "conteúdo fake do rad",
      geradoPor: "perito@example.com",
      validadeDias: 7,
    });

    const [linha] = consultar<{ expira_em: string | null }>(
      db,
      "SELECT expira_em FROM exportacoes_geradas WHERE id = ?",
      [id],
    );
    expect(linha.expira_em).not.toBeNull();
    const expiraEmMs = new Date(linha.expira_em as string).getTime();
    // Deve estar entre 7 dias e 7 dias + folga de execução do teste, a partir de "antes".
    expect(expiraEmMs).toBeGreaterThanOrEqual(antes + 6.99 * 24 * 60 * 60 * 1000);
    expect(expiraEmMs).toBeLessThanOrEqual(antes + 7.01 * 24 * 60 * 60 * 1000);
  });
});

describe("registrarAcessoExportacao", () => {
  it("registra acesso a exportação dentro da validade", async () => {
    const { id } = await registrarExportacaoGerada(db, {
      tipo: "ecd",
      formato: "txt",
      conteudo: "conteúdo fake do ecd",
      geradoPor: "contador@example.com",
      validadeDias: 30,
    });

    registrarAcessoExportacao(db, id, "advogado@example.com");

    const acessos = listarAcessosDeExportacao(db, id);
    expect(acessos).toHaveLength(1);
    expect(acessos[0].ator).toBe("advogado@example.com");
    expect(acessos[0].exportacao_id).toBe(id);
  });

  it("bloqueia acesso a exportação revogada e não registra o acesso", async () => {
    const { id } = await registrarExportacaoGerada(db, {
      tipo: "laudo_pericial",
      formato: "pdf",
      conteudo: "conteúdo fake",
      geradoPor: "perito@example.com",
    });

    revogarExportacao(db, id);

    expect(() => registrarAcessoExportacao(db, id, "alguem@example.com")).toThrow(/revogad/i);
    expect(listarAcessosDeExportacao(db, id)).toHaveLength(0);
  });

  it("bloqueia acesso a exportação expirada e não registra o acesso", async () => {
    const { id } = await registrarExportacaoGerada(db, {
      tipo: "laudo_pericial",
      formato: "pdf",
      conteudo: "conteúdo fake",
      geradoPor: "perito@example.com",
    });
    // Força a expiração diretamente no banco (equivalente a validadeDias já vencido).
    executar(db, "UPDATE exportacoes_geradas SET expira_em = ? WHERE id = ?", [
      new Date(Date.now() - 1000).toISOString(),
      id,
    ]);

    expect(() => registrarAcessoExportacao(db, id, "alguem@example.com")).toThrow(/expir/i);
    expect(listarAcessosDeExportacao(db, id)).toHaveLength(0);
  });

  it("lança erro claro para exportação inexistente", () => {
    expect(() => registrarAcessoExportacao(db, 999999, "alguem@example.com")).toThrow(/não encontrada/i);
  });
});

describe("revogarExportacao", () => {
  it("marca revogado = 1 sem apagar o registro", async () => {
    const { id } = await registrarExportacaoGerada(db, {
      tipo: "rad",
      formato: "pdf",
      conteudo: "conteúdo fake",
      geradoPor: "perito@example.com",
    });

    revogarExportacao(db, id);

    const [linha] = consultar<{ revogado: number }>(db, "SELECT revogado FROM exportacoes_geradas WHERE id = ?", [id]);
    expect(linha.revogado).toBe(1);
  });
});

describe("listarExportacoes", () => {
  it("filtra por tipo e por geradoPor", async () => {
    await registrarExportacaoGerada(db, { tipo: "laudo_pericial", formato: "pdf", conteudo: "a", geradoPor: "ana@example.com" });
    await registrarExportacaoGerada(db, { tipo: "rad", formato: "pdf", conteudo: "b", geradoPor: "ana@example.com" });
    await registrarExportacaoGerada(db, { tipo: "laudo_pericial", formato: "pdf", conteudo: "c", geradoPor: "beto@example.com" });

    expect(listarExportacoes(db, { tipo: "laudo_pericial" })).toHaveLength(2);
    expect(listarExportacoes(db, { geradoPor: "ana@example.com" })).toHaveLength(2);
    expect(listarExportacoes(db, { tipo: "laudo_pericial", geradoPor: "beto@example.com" })).toHaveLength(1);
    expect(listarExportacoes(db)).toHaveLength(3);
  });
});

describe("verificarIntegridadeExportacao", () => {
  it("retorna true quando o conteúdo fornecido bate com o hash gravado", async () => {
    const conteudoOriginal = "PDF fake — conteúdo exato gerado na época";
    const { id } = await registrarExportacaoGerada(db, {
      tipo: "laudo_pericial",
      formato: "pdf",
      conteudo: conteudoOriginal,
      geradoPor: "perito@example.com",
    });

    expect(await verificarIntegridadeExportacao(db, id, conteudoOriginal)).toBe(true);
  });

  it("detecta conteúdo alterado", async () => {
    const { id } = await registrarExportacaoGerada(db, {
      tipo: "laudo_pericial",
      formato: "pdf",
      conteudo: "PDF fake — conteúdo exato gerado na época",
      geradoPor: "perito@example.com",
    });

    expect(await verificarIntegridadeExportacao(db, id, "PDF fake — conteúdo ADULTERADO depois")).toBe(false);
  });

  it("retorna false para exportação inexistente", async () => {
    expect(await verificarIntegridadeExportacao(db, 999999, "qualquer coisa")).toBe(false);
  });
});
