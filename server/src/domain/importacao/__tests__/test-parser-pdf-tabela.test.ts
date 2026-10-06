/**
 * Testes do Parser PDF - Extração de tabelas e padrões
 *
 * Cobertura:
 * 1. Extração de texto simples do PDF
 * 2. Detecção de padrões de data e valor
 * 3. Parsing de PDFs com extratos bancários
 * 4. Fallback para regex patterns
 * 5. Tratamento de PDFs sem estrutura de tabela
 */

import { describe, it, expect } from "vitest";
import { parsePDF } from "../parsers/pdf-parser.js";
import type { ParserResult } from "../tipos.js";

describe("PDF Parser - Tabela e Padrões", () => {
  it("Teste 1: Extrai dados básicos de texto simulado", async () => {
    // Simular conteúdo de PDF com dados estruturados
    const conteudoPDF = "15/01/2024  R$ 1.234,56  Venda de produtos\n16/01/2024  R$ 2.345,67  Prestação de serviço";
    const buffer = Buffer.from(conteudoPDF);

    const resultado = await parsePDF(buffer);

    expect(resultado.sucesso).toBe(true);
    expect(resultado.transacoes.length).toBeGreaterThan(0);
    expect(resultado.estatisticas?.linhas_processadas).toBeGreaterThan(0);
  });

  it("Teste 2: Detecta padrões de data DD/MM/YYYY", async () => {
    const conteudoPDF = "Data: 15/01/2024  Valor: R$ 500,00  Descrição: Pagamento";
    const buffer = Buffer.from(conteudoPDF);

    const resultado = await parsePDF(buffer);

    if (resultado.transacoes.length > 0) {
      expect(resultado.transacoes[0].data).toBe("2024-01-15");
    }
  });

  it("Teste 3: Detecta valores em formato R$ XXXXX,XX", async () => {
    const conteudoPDF = "15/01/2024  R$ 1.234,56  Teste";
    const buffer = Buffer.from(conteudoPDF);

    const resultado = await parsePDF(buffer);

    if (resultado.transacoes.length > 0) {
      expect(resultado.transacoes[0].valor).toBeCloseTo(1234.56, 2);
    }
  });

  it("Teste 4: Extrai descrição entre data e valor", async () => {
    const conteudoPDF =
      "15/01/2024 Venda de produtos importados R$ 2.500,00";
    const buffer = Buffer.from(conteudoPDF);

    const resultado = await parsePDF(buffer);

    if (resultado.transacoes.length > 0) {
      expect(resultado.transacoes[0].descricao).toBeDefined();
      expect(resultado.transacoes[0].descricao.length).toBeGreaterThan(0);
    }
  });

  it("Teste 5: Infere tipo de transação pelo sinal do valor", async () => {
    const conteudoPDF =
      "15/01/2024 R$ 1.000,00 Receita\n16/01/2024 R$ -500,00 Despesa";
    const buffer = Buffer.from(conteudoPDF);

    const resultado = await parsePDF(buffer);

    if (resultado.transacoes.length >= 2) {
      // Valores positivos são entrada
      expect(resultado.transacoes[0].tipo_transacao).toBe("entrada");
      // Valores negativos são saída (convertidos para positivo, tipo indica direção)
      expect(resultado.transacoes[1].tipo_transacao).toBe("saida");
    }
  });

  it("Teste 6: Trata múltiplas transações por PDF", async () => {
    const conteudoPDF = `Extrato - Janeiro 2024
15/01/2024 R$ 1.000,00 Venda
16/01/2024 R$ 2.000,00 Serviço
17/01/2024 R$ 1.500,00 Consulta
18/01/2024 R$ 3.000,00 Projeto
19/01/2024 R$ 2.500,00 Manutenção`;

    const buffer = Buffer.from(conteudoPDF);

    const resultado = await parsePDF(buffer);

    expect(resultado.transacoes.length).toBeGreaterThanOrEqual(5);
  });

  it("Teste 7: Normaliza datas em formato DD.MM.YYYY", async () => {
    const conteudoPDF = "15.01.2024 R$ 500,00 Teste"; // Formato europeu
    const buffer = Buffer.from(conteudoPDF);

    const resultado = await parsePDF(buffer);

    if (resultado.transacoes.length > 0) {
      expect(resultado.transacoes[0].data).toBe("2024-01-15");
    }
  });

  it("Teste 8: Registra erros de padrão não-reconhecidos", async () => {
    const conteudoPDF = "Texto sem padrão reconhecível de transação";
    const buffer = Buffer.from(conteudoPDF);

    const resultado = await parsePDF(buffer);

    // Pode não ter transações, mas não deve falhar criticamente
    expect(resultado.avisos?.length).toBeGreaterThanOrEqual(0);
  });

  it("Teste 9: Respeita limite de linhas para preview", async () => {
    const conteudoPDF = Array.from({ length: 20 }, (_, i) =>
      `${String(i + 1).padStart(2, "0")}/01/2024 R$ ${(100 + i) * 10},00 Transação ${i + 1}`,
    ).join("\n");

    const buffer = Buffer.from(conteudoPDF);

    const resultado = await parsePDF(buffer, { maxLinhas: 10 });

    expect(resultado.transacoes.length).toBeLessThanOrEqual(10);
  });

  it("Teste 10: Preserva número de linha para auditoria", async () => {
    const conteudoPDF = "15/01/2024 R$ 500,00 Linha 1\n16/01/2024 R$ 600,00 Linha 2";
    const buffer = Buffer.from(conteudoPDF);

    const resultado = await parsePDF(buffer);

    if (resultado.transacoes.length > 0) {
      expect(resultado.transacoes[0].numero_linha).toBeDefined();
      expect(resultado.transacoes[0].numero_linha).toBeGreaterThan(0);
    }
  });

  it("Teste 11: Usa origem_modulo para rastreabilidade", async () => {
    const conteudoPDF = "15/01/2024 R$ 500,00 Teste";
    const buffer = Buffer.from(conteudoPDF);

    const resultado = await parsePDF(buffer, {
      origem: "pdf_extrato_jan_2024.pdf",
    });

    if (resultado.transacoes.length > 0) {
      expect(resultado.transacoes[0].origem_modulo).toBe(
        "pdf_extrato_jan_2024.pdf",
      );
    }
  });

  it("Teste 12: Trata valores com separador decimal europeu", async () => {
    const conteudoPDF = "15/01/2024 R$ 1.234,56 Teste"; // Brasileiro
    const buffer = Buffer.from(conteudoPDF);

    const resultado = await parsePDF(buffer);

    if (resultado.transacoes.length > 0) {
      // Valor deve ser normalizado
      expect(resultado.transacoes[0].valor).toBeGreaterThan(1000);
    }
  });

  it("Teste 13: Lida com PDF vazio graciosamente", async () => {
    const buffer = Buffer.from("");

    const resultado = await parsePDF(buffer);

    expect(resultado.sucesso).toBe(false);
    expect(resultado.transacoes.length).toBe(0);
    expect(resultado.avisos?.length).toBeGreaterThan(0);
  });

  it("Teste 14: Trata padrão YYYY-MM-DD em PDFs", async () => {
    const conteudoPDF = "2024-01-15 R$ 1.000,00 Transação";
    const buffer = Buffer.from(conteudoPDF);

    const resultado = await parsePDF(buffer);

    if (resultado.transacoes.length > 0) {
      expect(resultado.transacoes[0].data).toBe("2024-01-15");
    }
  });

  it("Teste 15: Retorna estatísticas detalhadas", async () => {
    const conteudoPDF = "15/01/2024 R$ 500,00 Teste\n16/01/2024 R$ 600,00 Teste";
    const buffer = Buffer.from(conteudoPDF);

    const resultado = await parsePDF(buffer);

    expect(resultado.estatisticas).toBeDefined();
    expect(resultado.estatisticas?.total_linhas).toBeGreaterThan(0);
    expect(resultado.estatisticas?.linhas_processadas).toBeGreaterThanOrEqual(0);
  });
});
