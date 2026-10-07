/**
 * Testes para Parser Registry
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ParserRegistry } from "../parser-registry.js";

describe("ParserRegistry", () => {
  let registry: ParserRegistry;

  beforeEach(() => {
    registry = ParserRegistry.getInstance();
  });

  describe("detectarTipo", () => {
    it("deve detectar CSV por extensão", () => {
      const conteudo = "data,valor,descrição\n2023-12-01,100,teste";
      const resultado = registry.detectarTipo(conteudo, ".csv");

      expect(resultado).not.toBeNull();
      expect(resultado?.tipo).toBe("csv");
      expect(resultado?.confianca).toBeGreaterThanOrEqual(80);
    });

    it("deve detectar OFX por extensão", () => {
      const conteudo = "OFXHEADER:100\n<OFX>";
      const resultado = registry.detectarTipo(conteudo, ".ofx");

      expect(resultado).not.toBeNull();
      expect(resultado?.tipo).toBe("ofx");
    });

    it("deve detectar MT940 por conteúdo", () => {
      const conteudo = `:20:0000001
:25:CONTA123`;
      const resultado = registry.detectarTipo(conteudo);

      expect(resultado).not.toBeNull();
      expect(resultado?.tipo).toBe("mt940");
    });

    it("deve detectar OFX por conteúdo", () => {
      const conteudo = `OFXHEADER:100
OFXVERSION:102
<OFX>`;
      const resultado = registry.detectarTipo(conteudo);

      expect(resultado).not.toBeNull();
      expect(resultado?.tipo).toBe("ofx");
    });

    it("deve retornar null para formato desconhecido", () => {
      const conteudo = "invalid content format";
      const resultado = registry.detectarTipo(conteudo);

      expect(resultado).toBeNull();
    });

    it("deve priorizar detecção por extensão", () => {
      const conteudo = `:20:0000001`; // Parece MT940
      const resultado = registry.detectarTipo(conteudo, ".csv"); // Mas extensão é CSV

      // Deve usar a extensão como hint
      expect(resultado?.confianca).toBeGreaterThan(0);
    });
  });

  describe("obterParser", () => {
    it("deve retornar parser para chave válida", () => {
      const parser = registry.obterParser("csv");
      expect(parser).not.toBeNull();
      expect(parser?.info.nome).toBe("CSV");
    });

    it("deve retornar null para chave inválida", () => {
      const parser = registry.obterParser("invalid");
      expect(parser).toBeNull();
    });
  });

  describe("listarParsers", () => {
    it("deve listar todos os parsers registrados", () => {
      const parsers = registry.listarParsers();

      expect(parsers.length).toBeGreaterThan(0);
      expect(parsers.some((p) => p.chave === "csv")).toBe(true);
      expect(parsers.some((p) => p.chave === "ofx")).toBe(true);
      expect(parsers.some((p) => p.chave === "mt940")).toBe(true);
    });

    it("deve incluir metadados em cada parser", () => {
      const parsers = registry.listarParsers();

      for (const parser of parsers) {
        expect(parser.chave).toBeTruthy();
        expect(parser.info.nome).toBeTruthy();
        expect(parser.info.descricao).toBeTruthy();
        expect(parser.info.formatos_entrada).toBeInstanceOf(Array);
      }
    });
  });

  describe("parse unificado", () => {
    it("deve fazer parse de CSV com detecção automática", async () => {
      const csv = `data,valor,descrição
2023-12-01,100.00,Teste 1
2023-12-02,200.00,Teste 2`;

      const resultado = await registry.parse(csv, {
        extensao: ".csv",
      });

      expect(resultado.sucesso).toBe(true);
      expect(resultado.transacoes.length).toBeGreaterThan(0);
    });

    it("deve fazer parse com parser forçado", async () => {
      const conteudo = `data,valor,descrição
2023-12-01,100,Teste`;

      const resultado = await registry.parse(conteudo, {
        parserForçado: "csv",
      });

      expect(resultado.sucesso).toBe(true);
    });

    it("deve retornar erro se parser forçado não existir", async () => {
      const resultado = await registry.parse("conteudo", {
        parserForçado: "invalid_parser",
      });

      expect(resultado.sucesso).toBe(false);
      expect(resultado.erros.length).toBeGreaterThan(0);
    });

    it("deve retornar erro se não conseguir detectar formato", async () => {
      const resultado = await registry.parse("xyz abc 123", {});

      expect(resultado.sucesso).toBe(false);
      expect(resultado.erros.length).toBeGreaterThan(0);
    });

    it("deve incluir informações de detecção no resultado", async () => {
      const csv = `data,valor,descrição
2023-12-01,100,Teste`;

      const resultado = await registry.parse(csv);

      expect(resultado.avisos).toBeTruthy();
      expect(
        resultado.avisos?.some((a) => a.includes("Formato detectado"))
      ).toBe(true);
    });
  });

  describe("Integração com parsers", () => {
    it("deve processar CSV através do registry", async () => {
      const csv = `data,valor,descrição
2023-12-01,150.00,Compra supermercado
2023-12-02,75.50,Lanche`;

      const resultado = await registry.parse(csv, {
        extensao: ".csv",
        options: { origem: "teste" },
      });

      expect(resultado.sucesso).toBe(true);
      expect(resultado.transacoes.length).toBe(2);
      expect(resultado.transacoes[0].valor).toBe(150.00);
      expect(resultado.transacoes[1].valor).toBe(75.50);
    });

    it("deve processar OFX através do registry", async () => {
      const ofx = `OFXHEADER:100
<OFX>
<BANKMSGSRSV1>
<STMTTRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20231201
<TRNAMT>1000.00
<FITID>001
<NAME>TEST
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRS>
</BANKMSGSRSV1>
</OFX>`;

      const resultado = await registry.parse(ofx, {
        extensao: ".ofx",
      });

      expect(resultado.sucesso).toBe(true);
      expect(resultado.transacoes.length).toBeGreaterThan(0);
    });
  });

  describe("Casos de uso reais", () => {
    it("deve processar múltiplos formatos em sequência", async () => {
      const csv = `data,valor,desc
2023-12-01,100,CSV`;
      const ofx = `<OFX>
<STMTTRN>
<DTPOSTED>20231202
<TRNAMT>200.00
</STMTTRN>
</OFX>`;

      const result1 = await registry.parse(csv, { extensao: ".csv" });
      const result2 = await registry.parse(ofx, { extensao: ".ofx" });

      expect(result1.sucesso).toBe(true);
      expect(result2.sucesso).toBe(true);
    });

    it("deve fazer parse com extensão desconhecida mas conteúdo claro", async () => {
      const mt940 = `:20:REF
:25:CONTA
:60F:231201BRL1000.00
:61:231202C500.00NMS001
:86:TEST
:62F:231202BRL1500.00`;

      const resultado = await registry.parse(mt940, {
        extensao: ".txt", // Extensão genérica
      });

      expect(resultado.sucesso).toBe(true);
      expect(
        resultado.avisos?.some((a) => a.includes("mt940"))
      ).toBe(true);
    });
  });
});
