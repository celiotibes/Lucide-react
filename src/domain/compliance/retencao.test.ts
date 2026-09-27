import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import {
  cadastrarPoliticaRetencao,
  obterPoliticaVigente,
  registrarRetencaoLegal,
  encerrarRetencaoLegal,
  existeRetencaoLegalAtiva,
  podeExcluirOuAnonimizar,
  garantirPoliticasRetencaoPadrao,
} from "./retencao";

describe("compliance/retencao: cadastrarPoliticaRetencao — versionamento", () => {
  it("primeira política de um domínio nasce na versão 1", async () => {
    const db = await criarBancoDeTeste();
    const politica = cadastrarPoliticaRetencao(db, {
      dominio: "contabil",
      prazoAnos: 5,
      baseLegal: "Lei X",
      vigenteDesde: "2020-01-01",
    });
    expect(politica.versao).toBe(1);
    expect(politica.dominio).toBe("contabil");
    expect(politica.prazo_anos).toBe(5);
  });

  it("uma segunda política do MESMO domínio entra como nova versão — não edita/substitui a anterior", async () => {
    const db = await criarBancoDeTeste();
    cadastrarPoliticaRetencao(db, { dominio: "contabil", prazoAnos: 5, baseLegal: "Lei X", vigenteDesde: "2020-01-01" });
    const v2 = cadastrarPoliticaRetencao(db, { dominio: "contabil", prazoAnos: 7, baseLegal: "Lei Y", vigenteDesde: "2024-01-01" });

    expect(v2.versao).toBe(2);

    // A versão 1 continua existindo intacta (histórico preservado).
    const antiga = obterPoliticaVigente(db, "contabil", "2021-01-01");
    expect(antiga?.versao).toBe(1);
    expect(antiga?.prazo_anos).toBe(5);
  });

  it("domínios diferentes versionam independentemente", async () => {
    const db = await criarBancoDeTeste();
    const a = cadastrarPoliticaRetencao(db, { dominio: "contabil", prazoAnos: 7, baseLegal: "Lei X", vigenteDesde: "2020-01-01" });
    const b = cadastrarPoliticaRetencao(db, { dominio: "contrato_locacao", prazoAnos: 7, baseLegal: "Lei X", vigenteDesde: "2020-01-01" });
    expect(a.versao).toBe(1);
    expect(b.versao).toBe(1);
  });
});

describe("compliance/retencao: obterPoliticaVigente — vigência por data", () => {
  it("retorna null quando não há NENHUMA política cadastrada para o domínio", async () => {
    const db = await criarBancoDeTeste();
    expect(obterPoliticaVigente(db, "dominio_inexistente")).toBeNull();
  });

  it("escolhe a versão de maior vigente_desde que ainda seja <= a data de referência", async () => {
    const db = await criarBancoDeTeste();
    cadastrarPoliticaRetencao(db, { dominio: "contabil", prazoAnos: 5, baseLegal: "Lei X v1", vigenteDesde: "2015-01-01" });
    cadastrarPoliticaRetencao(db, { dominio: "contabil", prazoAnos: 7, baseLegal: "Lei X v2", vigenteDesde: "2022-06-01" });

    // Antes da v2 entrar em vigor: v1.
    expect(obterPoliticaVigente(db, "contabil", "2020-01-01")?.prazo_anos).toBe(5);
    // Exatamente na data em que v2 passa a vigorar: v2 (comparação é <=).
    expect(obterPoliticaVigente(db, "contabil", "2022-06-01")?.prazo_anos).toBe(7);
    // Bem depois: ainda v2 (é a mais recente vigente).
    expect(obterPoliticaVigente(db, "contabil", "2026-01-01")?.prazo_anos).toBe(7);
  });

  it("data de referência default é hoje, quando omitida", async () => {
    const db = await criarBancoDeTeste();
    cadastrarPoliticaRetencao(db, { dominio: "contabil", prazoAnos: 7, baseLegal: "Lei X", vigenteDesde: "2000-01-01" });
    expect(obterPoliticaVigente(db, "contabil")?.prazo_anos).toBe(7);
  });
});

describe("compliance/retencao: legal hold (retencoes_legais)", () => {
  it("registrarRetencaoLegal + existeRetencaoLegalAtiva", async () => {
    const db = await criarBancoDeTeste();
    expect(existeRetencaoLegalAtiva(db, "documentos", 1)).toBe(false);

    registrarRetencaoLegal(db, { entidadeTipo: "documentos", entidadeId: 1, motivo: "Auditoria em curso" });
    expect(existeRetencaoLegalAtiva(db, "documentos", 1)).toBe(true);
  });

  it("registrar um segundo hold para a mesma entidade retorna o hold já ativo, sem duplicar", async () => {
    const db = await criarBancoDeTeste();
    const primeiro = registrarRetencaoLegal(db, { entidadeTipo: "documentos", entidadeId: 1, motivo: "Auditoria em curso" });
    const segundo = registrarRetencaoLegal(db, { entidadeTipo: "documentos", entidadeId: 1, motivo: "Outro motivo qualquer" });
    expect(segundo.id).toBe(primeiro.id);
    expect(segundo.motivo).toBe("Auditoria em curso");
  });

  it("legal hold ativo bloqueia exclusão mesmo com o prazo padrão de retenção já vencido", async () => {
    const db = await criarBancoDeTeste();
    cadastrarPoliticaRetencao(db, { dominio: "contabil", prazoAnos: 7, baseLegal: "Lei X", vigenteDesde: "2000-01-01" });
    registrarRetencaoLegal(db, { entidadeTipo: "documentos", entidadeId: 1, motivo: "Processo nº 123 em curso" });

    const resultado = podeExcluirOuAnonimizar(db, {
      entidadeTipo: "documentos",
      entidadeId: 1,
      dominio: "contabil",
      dataReferenciaDoRegistro: "2000-01-01", // muitíssimo além dos 7 anos — prazo já venceria
    });

    expect(resultado.permitido).toBe(false);
    expect(resultado.motivo).toMatch(/Processo nº 123 em curso/);
  });

  it("encerrarRetencaoLegal libera a exclusão de novo", async () => {
    const db = await criarBancoDeTeste();
    cadastrarPoliticaRetencao(db, { dominio: "contabil", prazoAnos: 7, baseLegal: "Lei X", vigenteDesde: "2000-01-01" });
    const hold = registrarRetencaoLegal(db, { entidadeTipo: "documentos", entidadeId: 1, motivo: "Processo em curso" });

    expect(
      podeExcluirOuAnonimizar(db, { entidadeTipo: "documentos", entidadeId: 1, dominio: "contabil", dataReferenciaDoRegistro: "2000-01-01" })
        .permitido,
    ).toBe(false);

    const encerrada = encerrarRetencaoLegal(db, hold.id);
    expect(encerrada.ativo).toBe(0);
    expect(encerrada.encerrado_em).toBeTruthy();
    expect(existeRetencaoLegalAtiva(db, "documentos", 1)).toBe(false);

    expect(
      podeExcluirOuAnonimizar(db, { entidadeTipo: "documentos", entidadeId: 1, dominio: "contabil", dataReferenciaDoRegistro: "2000-01-01" })
        .permitido,
    ).toBe(true);
  });

  it("encerrarRetencaoLegal lança erro claro para id inexistente", async () => {
    const db = await criarBancoDeTeste();
    expect(() => encerrarRetencaoLegal(db, 999)).toThrow(/não encontrada/i);
  });

  it("encerrarRetencaoLegal é idempotente — encerrar de novo um hold já encerrado não lança erro", async () => {
    const db = await criarBancoDeTeste();
    const hold = registrarRetencaoLegal(db, { entidadeTipo: "documentos", entidadeId: 1, motivo: "x" });
    encerrarRetencaoLegal(db, hold.id);
    expect(() => encerrarRetencaoLegal(db, hold.id)).not.toThrow();
  });
});

describe("compliance/retencao: podeExcluirOuAnonimizar — os três casos combinados", () => {
  it("hold ativo → não permitido, independente do prazo", async () => {
    const db = await criarBancoDeTeste();
    cadastrarPoliticaRetencao(db, { dominio: "contabil", prazoAnos: 7, baseLegal: "Lei X", vigenteDesde: "2000-01-01" });
    registrarRetencaoLegal(db, { entidadeTipo: "prestadores", entidadeId: 5, motivo: "Notificação de auditoria" });

    const resultado = podeExcluirOuAnonimizar(db, {
      entidadeTipo: "prestadores",
      entidadeId: 5,
      dominio: "contabil",
      dataReferenciaDoRegistro: "2010-01-01",
    });
    expect(resultado.permitido).toBe(false);
    expect(resultado.motivo).toMatch(/retenção legal ativa/i);
  });

  it("sem hold, prazo NÃO vencido → não permitido, citando prazo e base legal", async () => {
    const db = await criarBancoDeTeste();
    cadastrarPoliticaRetencao(db, { dominio: "contabil", prazoAnos: 7, baseLegal: "Lei 6.404/76", vigenteDesde: "2000-01-01" });

    const dataRecente = new Date();
    dataRecente.setFullYear(dataRecente.getFullYear() - 2); // 2 anos atrás, dentro dos 7

    const resultado = podeExcluirOuAnonimizar(db, {
      entidadeTipo: "prestadores",
      entidadeId: 5,
      dominio: "contabil",
      dataReferenciaDoRegistro: dataRecente,
    });
    expect(resultado.permitido).toBe(false);
    expect(resultado.motivo).toMatch(/7 anos/);
    expect(resultado.motivo).toMatch(/Lei 6\.404\/76/);
  });

  it("sem hold, prazo vencido → permitido", async () => {
    const db = await criarBancoDeTeste();
    cadastrarPoliticaRetencao(db, { dominio: "contabil", prazoAnos: 7, baseLegal: "Lei X", vigenteDesde: "2000-01-01" });

    const dataAntiga = new Date();
    dataAntiga.setFullYear(dataAntiga.getFullYear() - 10); // 10 anos atrás, além dos 7

    const resultado = podeExcluirOuAnonimizar(db, {
      entidadeTipo: "prestadores",
      entidadeId: 5,
      dominio: "contabil",
      dataReferenciaDoRegistro: dataAntiga,
    });
    expect(resultado.permitido).toBe(true);
    expect(resultado.motivo).toBeUndefined();
  });

  it("sem política cadastrada para o domínio → permitido (fallback permissivo documentado)", async () => {
    const db = await criarBancoDeTeste();
    const resultado = podeExcluirOuAnonimizar(db, {
      entidadeTipo: "prestadores",
      entidadeId: 5,
      dominio: "dominio_sem_politica",
      dataReferenciaDoRegistro: "2024-01-01",
    });
    expect(resultado.permitido).toBe(true);
  });
});

describe("compliance/retencao: garantirPoliticasRetencaoPadrao", () => {
  it("cadastra as políticas padrão (contabil, contrato_locacao, processo_legal) com 7 anos cada", async () => {
    const db = await criarBancoDeTeste();
    garantirPoliticasRetencaoPadrao(db);

    for (const dominio of ["contabil", "contrato_locacao", "processo_legal"]) {
      const politica = obterPoliticaVigente(db, dominio);
      expect(politica).not.toBeNull();
      expect(politica?.prazo_anos).toBe(7);
      expect(politica?.base_legal).toMatch(/Lei 6\.404\/76/);
    }
  });

  it("é idempotente — chamar duas vezes não cria uma segunda versão", async () => {
    const db = await criarBancoDeTeste();
    garantirPoliticasRetencaoPadrao(db);
    garantirPoliticasRetencaoPadrao(db);

    const politica = obterPoliticaVigente(db, "contabil");
    expect(politica?.versao).toBe(1);
  });

  it("não sobrescreve uma política já cadastrada manualmente antes para o mesmo domínio", async () => {
    const db = await criarBancoDeTeste();
    cadastrarPoliticaRetencao(db, { dominio: "contabil", prazoAnos: 3, baseLegal: "Política interna customizada", vigenteDesde: "2020-01-01" });

    garantirPoliticasRetencaoPadrao(db);

    const politica = obterPoliticaVigente(db, "contabil");
    expect(politica?.prazo_anos).toBe(3);
    expect(politica?.versao).toBe(1);
  });
});
