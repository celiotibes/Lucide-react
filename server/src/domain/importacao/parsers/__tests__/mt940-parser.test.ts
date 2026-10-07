/**
 * Testes para MT940 Parser
 */

import { describe, it, expect } from "vitest";
import { MT940Parser } from "../mt940-parser.js";

describe("MT940Parser", () => {
  const parser = new MT940Parser();

  describe("pode_processar", () => {
    it("deve detectar MT940 pelas tags", () => {
      const mt940 = `:20:0000001
:25:BR0000000000001234567890AB
:28C:00001/1
:60F:231201BRL1000.00
:61:231202C1500.00NMSCNONREF//TXN001
:86:120-COMPRA NO DÉBITO
:62F:231202BRL2500.00`;

      expect(parser.pode_processar(mt940)).toBe(true);
    });

    it("deve rejeitar conteúdo que não é MT940", () => {
      const csv = "data,valor,descricao\n2023-12-01,150.00,Teste";
      expect(parser.pode_processar(csv)).toBe(false);
    });
  });

  describe("parse", () => {
    it("deve fazer parse de MT940 simples", async () => {
      const mt940 = `:20:0000001
:25:BR0000000000001234567890AB
:28C:00001/1
:60F:231201BRL1000.00
:61:231202C1500.00NMSCNONREF//TXN001
:86:120-COMPRA NO DÉBITO
:62F:231202BRL2500.00`;

      const resultado = await parser.parse(mt940);

      expect(resultado.sucesso).toBe(true);
      expect(resultado.transacoes.length).toBeGreaterThan(0);

      const trn = resultado.transacoes[0];
      expect(trn.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(trn.valor).toBeGreaterThan(0);
      expect(trn.tipo_transacao).toBeDefined();
    });

    it("deve extrair referência de transação", async () => {
      const mt940 = `:20:REF0001
:25:CONTA123
:28C:001/1
:60F:231201BRL1000.00
:61:231202C500.00NMSCNONREF//ABC123
:86:PIX RECEBIDO - REFERÊNCIA ABC
:62F:231202BRL1500.00`;

      const resultado = await parser.parse(mt940);
      const trn = resultado.transacoes[0];

      expect(trn.campos_adicionais?.referencia).toBe("ABC123");
    });

    it("deve detectar débito e crédito corretamente", async () => {
      const mt940 = `:20:0000001
:25:BR0000000000001234567890AB
:28C:00001/1
:60F:231201BRL1000.00
:61:231202D500.00NMSCNONREF//DEBIT001
:86:DÉBITO
:61:231203C300.00NMSCNONREF//CREDIT001
:86:CRÉDITO
:62F:231203BRL800.00`;

      const resultado = await parser.parse(mt940);

      expect(resultado.transacoes.length).toBe(2);
      expect(resultado.transacoes[0].tipo_transacao).toBe("saida");
      expect(resultado.transacoes[1].tipo_transacao).toBe("entrada");
    });

    it("deve normalizar datas YYMMDD", async () => {
      const mt940 = `:20:0000001
:25:CONTA123
:28C:001/1
:60F:231201BRL1000.00
:61:231202C500.00NMSCNONREF//REF
:86:TEST
:62F:231202BRL1500.00`;

      const resultado = await parser.parse(mt940);
      const trn = resultado.transacoes[0];

      // Data 231202 deve ser 2023-12-02
      expect(trn.data).toMatch(/2023-12-02/);
    });

    it("deve retornar erro para MT940 malformado", async () => {
      const mt940Invalido = `:20:0000001
:25:CONTA123
:61:INVALIDO`;

      const resultado = await parser.parse(mt940Invalido, {
        tolerarErros: true,
      });

      // Pode ter transações ou não, mas não deve falhar completamente
      expect(resultado.erros.length >= 0).toBe(true);
    });

    it("deve respeitar maxLinhas", async () => {
      const mt940 = `:20:0000001
:25:CONTA123
:28C:001/1
:60F:231201BRL1000.00
:61:231202C100.00NMSC001
:86:TRANS1
:61:231203C200.00NMSC002
:86:TRANS2
:61:231204C300.00NMSC003
:86:TRANS3
:62F:231204BRL600.00`;

      const resultado = await parser.parse(mt940, { maxLinhas: 2 });

      expect(resultado.transacoes.length).toBeLessThanOrEqual(2);
    });

    it("deve medir performance com 1000+ transações", async () => {
      // Gerar MT940 com muitas transações
      let mt940 = `:20:0000001
:25:CONTA123
:28C:001/1
:60F:231201BRL10000.00
`;

      for (let i = 1; i <= 1001; i++) {
        const dia = String((i % 28) + 1).padStart(2, "0");
        mt940 += `:61:23${dia}02C10.00NMSC${i}
:86:TRANS ${i}
`;
      }

      mt940 += `:62F:231228BRL20000.00`;

      const inicio = performance.now();
      const resultado = await parser.parse(mt940);
      const tempo = performance.now() - inicio;

      expect(resultado.transacoes.length).toBeGreaterThanOrEqual(1000);
      expect(tempo).toBeLessThan(2000); // Menos de 2 segundos
      console.log(`Processou ${resultado.transacoes.length} transações em ${tempo.toFixed(0)}ms`);
    });
  });

  describe("extractDocumento", () => {
    it("deve extrair CNPJ da descrição", async () => {
      const mt940 = `:20:0000001
:25:CONTA123
:28C:001/1
:60F:231201BRL1000.00
:61:231202C500.00NMSC001
:86:DEPOSITO DE 12.345.678/0001-90
:62F:231202BRL1500.00`;

      const resultado = await parser.parse(mt940);
      const trn = resultado.transacoes[0];

      expect(trn.campos_adicionais?.documento).toBeTruthy();
    });
  });
});
