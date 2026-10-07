/**
 * Testes para utilitários de normalização
 */

import { describe, it, expect } from "vitest";
import {
  NormalizadorTransacao,
  normalizarData,
  normalizarValor,
  normalizarDescricao,
  extrairDocumento,
  detectarTipo,
  extrairCategoria,
} from "../normalizacao.js";

describe("NormalizadorTransacao", () => {
  describe("normalizarData", () => {
    it("deve normalizar YYYY-MM-DD", () => {
      const data = NormalizadorTransacao.normalizarData("2023-12-15");
      expect(data).toBe("2023-12-15");
    });

    it("deve normalizar DD/MM/YYYY", () => {
      const data = NormalizadorTransacao.normalizarData("15/12/2023");
      expect(data).toBe("2023-12-15");
    });

    it("deve normalizar YYYYMMDD", () => {
      const data = NormalizadorTransacao.normalizarData("20231215");
      expect(data).toBe("2023-12-15");
    });

    it("deve normalizar YYMMDD (século 20)", () => {
      const data = NormalizadorTransacao.normalizarData("991215");
      expect(data).toBe("1999-12-15");
    });

    it("deve normalizar YYMMDD (século 21)", () => {
      const data = NormalizadorTransacao.normalizarData("231215");
      expect(data).toBe("2023-12-15");
    });

    it("deve retornar null para data inválida", () => {
      expect(NormalizadorTransacao.normalizarData("invalid")).toBeNull();
      expect(NormalizadorTransacao.normalizarData("2023-13-45")).toBeNull();
    });

    it("deve retornar null para undefined", () => {
      expect(NormalizadorTransacao.normalizarData(undefined)).toBeNull();
    });
  });

  describe("normalizarValor", () => {
    it("deve normalizar número", () => {
      const valor = NormalizadorTransacao.normalizarValor(150.5);
      expect(valor).toBe(150.5);
    });

    it("deve normalizar string com ponto decimal", () => {
      const valor = NormalizadorTransacao.normalizarValor("1.500.50");
      expect(valor).toBe(1500.5);
    });

    it("deve normalizar string com vírgula decimal (BR)", () => {
      const valor = NormalizadorTransacao.normalizarValor("1.500,50", ",");
      expect(valor).toBe(1500.5);
    });

    it("deve normalizar valores negativos", () => {
      const valor = NormalizadorTransacao.normalizarValor("-150.50");
      expect(valor).toBe(-150.5);
    });

    it("deve normalizar com parênteses (contábil)", () => {
      const valor = NormalizadorTransacao.normalizarValor("(150.50)");
      expect(Math.abs(valor!)).toBe(150.5);
    });

    it("deve normalizar com símbolo de moeda", () => {
      const valor = NormalizadorTransacao.normalizarValor("R$ 1.500,00", ",");
      expect(valor).toBe(1500);
    });

    it("deve retornar null para valor inválido", () => {
      expect(NormalizadorTransacao.normalizarValor("abc")).toBeNull();
      expect(NormalizadorTransacao.normalizarValor("")).toBeNull();
    });
  });

  describe("normalizarDescricao", () => {
    it("deve normalizar descrição simples", () => {
      const desc = NormalizadorTransacao.normalizarDescricao("Compra no supermercado");
      expect(desc).toBe("Compra no supermercado");
    });

    it("deve remover espaços extras", () => {
      const desc = NormalizadorTransacao.normalizarDescricao(
        "Compra   no    supermercado"
      );
      expect(desc).toBe("Compra no supermercado");
    });

    it("deve limitar a 500 caracteres", () => {
      const longDesc = "a".repeat(600);
      const desc = NormalizadorTransacao.normalizarDescricao(longDesc);
      expect(desc.length).toBeLessThanOrEqual(500);
      expect(desc).toContain("...");
    });

    it("deve normalizar aspas", () => {
      const desc = NormalizadorTransacao.normalizarDescricao(
        '"teste" e "outro"'
      );
      expect(desc).toContain('"');
    });

    it("deve retornar string vazia para undefined", () => {
      const desc = NormalizadorTransacao.normalizarDescricao(undefined);
      expect(desc).toBe("");
    });
  });

  describe("extrairDocumento", () => {
    it("deve extrair CNPJ com formatação", () => {
      const doc = NormalizadorTransacao.extrairDocumento(
        "Pagamento para 12.345.678/0001-90"
      );
      expect(doc?.tipo).toBe("CNPJ");
      expect(doc?.valor).toContain("12.345.678/0001-90");
    });

    it("deve extrair CNPJ sem formatação", () => {
      const doc = NormalizadorTransacao.extrairDocumento(
        "Transação 12345678000190"
      );
      expect(doc?.tipo).toBe("CNPJ");
    });

    it("deve extrair CPF com formatação", () => {
      const doc = NormalizadorTransacao.extrairDocumento(
        "Depósito para 123.456.789-10"
      );
      expect(doc?.tipo).toBe("CPF");
    });

    it("deve extrair CPF sem formatação", () => {
      const doc = NormalizadorTransacao.extrairDocumento("CPF 12345678910");
      expect(doc?.tipo).toBe("CPF");
    });

    it("deve retornar null se não encontrar documento", () => {
      const doc = NormalizadorTransacao.extrairDocumento("Descrição sem documento");
      expect(doc).toBeNull();
    });

    it("deve preferir CNPJ sobre CPF quando ambos presentes", () => {
      const doc = NormalizadorTransacao.extrairDocumento(
        "CNPJ 12.345.678/0001-90 e CPF 123.456.789-10"
      );
      expect(doc?.tipo).toBe("CNPJ");
    });
  });

  describe("detectarTipo", () => {
    it("deve detectar entrada por palavra-chave", () => {
      expect(
        NormalizadorTransacao.detectarTipo("Depósito em conta")
      ).toBe("entrada");
      expect(
        NormalizadorTransacao.detectarTipo("PIX RECEBIDO")
      ).toBe("entrada");
      expect(
        NormalizadorTransacao.detectarTipo("TED recebido")
      ).toBe("entrada");
      expect(
        NormalizadorTransacao.detectarTipo("Devolução de produto")
      ).toBe("entrada");
    });

    it("deve detectar saída por palavra-chave", () => {
      expect(
        NormalizadorTransacao.detectarTipo("Saque no caixa")
      ).toBe("saida");
      expect(
        NormalizadorTransacao.detectarTipo("PIX ENVIADO")
      ).toBe("saida");
      expect(
        NormalizadorTransacao.detectarTipo("Pagamento boleto")
      ).toBe("saida");
      expect(
        NormalizadorTransacao.detectarTipo("Tarifa mensal")
      ).toBe("saida");
    });

    it("deve usar valor como fallback", () => {
      expect(
        NormalizadorTransacao.detectarTipo("Transação misteriosa", 100)
      ).toBe("entrada");
      expect(
        NormalizadorTransacao.detectarTipo("Transação misteriosa", -50)
      ).toBe("saida");
    });

    it("deve defaultar para saída", () => {
      expect(
        NormalizadorTransacao.detectarTipo("Transação aleatória")
      ).toBe("saida");
    });

    it("deve ser case-insensitive", () => {
      expect(
        NormalizadorTransacao.detectarTipo("CRÉDITO")
      ).toBe("entrada");
      expect(
        NormalizadorTransacao.detectarTipo("débito")
      ).toBe("saida");
    });
  });

  describe("extrairCategoria", () => {
    it("deve extrair categoria Alimentação", () => {
      expect(
        NormalizadorTransacao.extrairCategoria("Compra no restaurante")
      ).toBe("Alimentação");
      expect(
        NormalizadorTransacao.extrairCategoria("Padaria do bairro")
      ).toBe("Alimentação");
      expect(
        NormalizadorTransacao.extrairCategoria("Supermercado ABC")
      ).toBe("Alimentação");
    });

    it("deve extrair categoria Transporte", () => {
      expect(
        NormalizadorTransacao.extrairCategoria("UBER TRIP")
      ).toBe("Transporte");
      expect(
        NormalizadorTransacao.extrairCategoria("Gasolina Esso")
      ).toBe("Transporte");
      expect(
        NormalizadorTransacao.extrairCategoria("Estacionamento Centro")
      ).toBe("Transporte");
    });

    it("deve extrair categoria Moradia", () => {
      expect(
        NormalizadorTransacao.extrairCategoria("Aluguel casa")
      ).toBe("Moradia");
      expect(
        NormalizadorTransacao.extrairCategoria("Conta água")
      ).toBe("Moradia");
      expect(
        NormalizadorTransacao.extrairCategoria("Internet provider")
      ).toBe("Moradia");
    });

    it("deve extrair categoria Saúde", () => {
      expect(
        NormalizadorTransacao.extrairCategoria("Farmácia da esquina")
      ).toBe("Saúde");
      expect(
        NormalizadorTransacao.extrairCategoria("Consultório médico")
      ).toBe("Saúde");
      expect(
        NormalizadorTransacao.extrairCategoria("Dentista Silva")
      ).toBe("Saúde");
    });

    it("deve extrair categoria Lazer", () => {
      expect(
        NormalizadorTransacao.extrairCategoria("Cinema Cinemark")
      ).toBe("Lazer");
      expect(
        NormalizadorTransacao.extrairCategoria("NETFLIX SUBSCRIPTION")
      ).toBe("Lazer");
      expect(
        NormalizadorTransacao.extrairCategoria("Hotel em São Paulo")
      ).toBe("Lazer");
    });

    it("deve retornar null se não identificar categoria", () => {
      expect(
        NormalizadorTransacao.extrairCategoria("XYZ ABC 123")
      ).toBeNull();
    });

    it("deve ser case-insensitive", () => {
      expect(
        NormalizadorTransacao.extrairCategoria("RESTAURANTE")
      ).toBe("Alimentação");
      expect(
        NormalizadorTransacao.extrairCategoria("restaurante")
      ).toBe("Alimentação");
    });
  });

  describe("Funções de conveniência", () => {
    it("deve exportar funções de conveniência", () => {
      expect(normalizarData("2023-12-15")).toBe("2023-12-15");
      expect(normalizarValor(150.5)).toBe(150.5);
      expect(normalizarDescricao("Teste")).toBe("Teste");
      expect(detectarTipo("PIX recebido")).toBe("entrada");
      expect(extrairCategoria("Restaurante")).toBe("Alimentação");
    });
  });

  describe("Performance", () => {
    it("deve normalizar 1000 valores em menos de 100ms", () => {
      const inicio = performance.now();
      for (let i = 0; i < 1000; i++) {
        NormalizadorTransacao.normalizarValor(`${i}.50`);
      }
      const tempo = performance.now() - inicio;
      expect(tempo).toBeLessThan(100);
    });

    it("deve extrair 1000 documentos em menos de 100ms", () => {
      const inicio = performance.now();
      for (let i = 0; i < 1000; i++) {
        NormalizadorTransacao.extrairDocumento(
          `Descrição ${i} com CNPJ 12.345.678/0001-90`
        );
      }
      const tempo = performance.now() - inicio;
      expect(tempo).toBeLessThan(100);
    });
  });
});
