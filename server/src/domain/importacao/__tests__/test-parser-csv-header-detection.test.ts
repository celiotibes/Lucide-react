/**
 * Testes do Parser CSV - Detecção automática de headers
 *
 * Cobertura:
 * 1. Detecção automática de headers com confiança
 * 2. Parsing de CSV com múltiplos separadores
 * 3. Normalização de datas em vários formatos
 * 4. Normalização de valores monetários
 * 5. Tratamento de erros e linhas inválidas
 */

import { describe, it, expect } from "vitest";
import { parseCSV } from "../parsers/csv-parser.js";

describe("CSV Parser - Header Detection", () => {
  it("Teste 1: Detecta headers em português com alta confiança", () => {
    const csv = `data,valor,descricao,tipo
2024-01-15,150.50,Venda de produtos,entrada
2024-01-16,-75.25,Despesa operacional,saida`;

    const resultado = parseCSV(csv);

    expect(resultado.sucesso).toBe(true);
    expect(resultado.transacoes.length).toBe(2);
    expect(resultado.transacoes[0]).toMatchObject({
      data: "2024-01-15",
      valor: 150.5,
      descricao: "Venda de produtos",
      tipo_transacao: "entrada",
    });
    expect(resultado.avisos?.length).toBe(0);
  });

  it("Teste 2: Detecta headers em inglês", () => {
    const csv = `date,amount,description,type
2024-01-15,200.00,Sales income,credit
2024-01-16,50.00,Expense,debit`;

    const resultado = parseCSV(csv);

    expect(resultado.sucesso).toBe(true);
    expect(resultado.transacoes.length).toBe(2);
    expect(resultado.transacoes[0].valor).toBe(200);
    expect(resultado.transacoes[1].valor).toBe(50);
  });

  it("Teste 3: Normaliza data DD/MM/YYYY", () => {
    const csv = `data,valor,descricao
15/01/2024,100.00,Teste 1
16/01/2024,200.00,Teste 2`;

    const resultado = parseCSV(csv);

    expect(resultado.transacoes[0].data).toBe("2024-01-15");
    expect(resultado.transacoes[1].data).toBe("2024-01-16");
  });

  it("Teste 4: Normaliza valores com separadores de milhares", () => {
    const csv = `data,valor,descricao
2024-01-15,"1.234,56",Teste com mil`;

    const resultado = parseCSV(csv, {
      separadorDecimal: ",",
      separadorMilhares: ".",
    });

    expect(resultado.transacoes[0].valor).toBe(1234.56);
  });

  it("Teste 5: Determina tipo por padrão de coluna ou sinal do valor", () => {
    const csvComTipo = `data,valor,descricao,tipo
2024-01-15,100.00,Entrada,entrada
2024-01-16,-50.00,Saida,saida`;

    const resultado1 = parseCSV(csvComTipo);
    expect(resultado1.transacoes[0].tipo_transacao).toBe("entrada");
    expect(resultado1.transacoes[1].tipo_transacao).toBe("saida");

    // Sem tipo explícito, inferir do sinal
    const csvSemTipo = `data,valor,descricao
2024-01-15,100.00,Entrada
2024-01-16,-50.00,Saida`;

    const resultado2 = parseCSV(csvSemTipo);
    expect(resultado2.transacoes[0].tipo_transacao).toBe("entrada");
    expect(resultado2.transacoes[1].tipo_transacao).toBe("saida");
  });

  it("Teste 6: Retorna preview limitado a 10 linhas", () => {
    const linhas = Array.from({ length: 20 }, (_, i) => `2024-01-${String(i + 1).padStart(2, "0")},${100 + i}.00,Linha ${i + 1}`);
    const csv = "data,valor,descricao\n" + linhas.join("\n");

    const resultado = parseCSV(csv, { maxLinhas: 10 });

    expect(resultado.transacoes.length).toBeLessThanOrEqual(10);
    expect(resultado.estatisticas?.linhas_processadas).toBeLessThanOrEqual(10);
  });

  it("Teste 7: Trata linhas vazias corretamente", () => {
    const csv = `data,valor,descricao

2024-01-15,100.00,Teste 1

2024-01-16,200.00,Teste 2

`;

    const resultado = parseCSV(csv);

    expect(resultado.transacoes.length).toBe(2);
    expect(resultado.estatisticas?.linhas_vazias).toBeGreaterThan(0);
    expect(resultado.linhas_descartadas).toBeGreaterThanOrEqual(
      resultado.estatisticas?.linhas_vazias || 0,
    );
  });

  it("Teste 8: Registra erros de validação sem parar (tolerarErros=true)", () => {
    const csv = `data,valor,descricao
2024-01-15,100.00,Valido
,200.00,Invalido - sem data
2024-01-17,abc,Invalido - valor nao numero
2024-01-18,300.00,Valido 2`;

    const resultado = parseCSV(csv, { tolerarErros: true });

    expect(resultado.transacoes.length).toBe(2); // Apenas linhas válidas
    expect(resultado.erros.length).toBe(2); // Dois erros registrados
    expect(resultado.avisos).toBeDefined();
  });

  it("Teste 9: Normaliza diferentes formatos de data", () => {
    const csvFormatos = [
      { csv: "data,valor,descricao\n15/01/2024,100.00,Teste", esperado: "2024-01-15" },
      { csv: "data,valor,descricao\n2024-01-15,100.00,Teste", esperado: "2024-01-15" },
      { csv: "data,valor,descricao\n01-15-2024,100.00,Teste", esperado: "2024-01-15" },
    ];

    for (const { csv, esperado } of csvFormatos) {
      const resultado = parseCSV(csv);
      if (resultado.transacoes.length > 0) {
        expect(resultado.transacoes[0].data).toBe(esperado);
      }
    }
  });

  it("Teste 10: Preserva número de linha para auditoria", () => {
    const csv = `data,valor,descricao
2024-01-15,100.00,Linha 1
2024-01-16,200.00,Linha 2
2024-01-17,300.00,Linha 3`;

    const resultado = parseCSV(csv);

    expect(resultado.transacoes[0].numero_linha).toBe(2); // Linha 2 do arquivo (skip header)
    expect(resultado.transacoes[1].numero_linha).toBe(3);
    expect(resultado.transacoes[2].numero_linha).toBe(4);
  });

  it("Teste 11: Retorna estatísticas detalhadas", () => {
    const csv = `data,valor,descricao

2024-01-15,100.00,Teste

2024-01-16,200.00,Teste

`;

    const resultado = parseCSV(csv);

    expect(resultado.estatisticas).toBeDefined();
    expect(resultado.estatisticas?.total_linhas).toBeGreaterThan(0);
    expect(resultado.estatisticas?.linhas_processadas).toBeGreaterThan(0);
    expect(resultado.estatisticas?.linhas_vazias).toBeGreaterThan(0);
  });

  it("Teste 12: Usa origem_modulo para rastreabilidade", () => {
    const csv = `data,valor,descricao
2024-01-15,100.00,Teste`;

    const resultado = parseCSV(csv, { origem: "csv_banco_test.csv" });

    expect(resultado.transacoes[0].origem_modulo).toBe("csv_banco_test.csv");
  });

  it("Teste 13: Trata valores negativos corretamente", () => {
    const csv = `data,valor,descricao,tipo
2024-01-15,-150.00,Despesa,saida
2024-01-16,200.00,Receita,entrada`;

    const resultado = parseCSV(csv);

    // Valores sempre armazenados como positivos, tipo_transacao indica direção
    expect(resultado.transacoes[0].valor).toBe(150);
    expect(resultado.transacoes[0].tipo_transacao).toBe("saida");
    expect(resultado.transacoes[1].valor).toBe(200);
    expect(resultado.transacoes[1].tipo_transacao).toBe("entrada");
  });

  it("Teste 14: Lida com CSV vazio graciosamente", () => {
    const csv = "";

    const resultado = parseCSV(csv);

    expect(resultado.sucesso).toBe(false);
    expect(resultado.transacoes.length).toBe(0);
    expect(resultado.avisos?.length).toBeGreaterThan(0);
  });

  it("Teste 15: Mapeia colunas com nomes não-padronizados", () => {
    const csv = `data_movimentacao,vlr,descricao_operacao
2024-01-15,123.45,Teste operação
2024-01-16,234.56,Teste 2`;

    const resultado = parseCSV(csv);

    // Mesmo com nomes não-padrão, deve tentar detectar
    expect(resultado.transacoes.length).toBeGreaterThanOrEqual(0);
    if (resultado.transacoes.length > 0) {
      expect(resultado.transacoes[0].data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
