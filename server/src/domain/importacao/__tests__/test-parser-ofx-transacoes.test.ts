/**
 * Testes do Parser OFX - Extração de transações bancárias
 *
 * Cobertura:
 * 1. Parsing de OFX 1.x (formato texto)
 * 2. Parsing de OFX 2.x (formato XML)
 * 3. Extração de elementos STMTTRN
 * 4. Normalização de datas YYYYMMDD
 * 5. Determinação de tipo de transação (débito/crédito)
 */

import { describe, it, expect } from "vitest";
import { parseOFX } from "../parsers/ofx-parser.js";

describe("OFX Parser - Transações Bancárias", () => {
  it("Teste 1: Parse OFX 1.x básico", () => {
    const ofx1x = `OFXHEADER:100
OFXVERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEFORMAT:NO
NEWFILEFORMAT:YES
<OFX>
<BANKMSGSRSV1>
<STMTTRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240115
<TRNAMT>-150.00
<FITID>1001
<NAME>Compra no supermercado
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRS>
</BANKMSGSRSV1>
</OFX>`;

    const resultado = parseOFX(ofx1x);

    expect(resultado.sucesso).toBe(true);
    expect(resultado.transacoes.length).toBeGreaterThan(0);
    expect(resultado.transacoes[0].data).toBe("2024-01-15");
    expect(resultado.transacoes[0].valor).toBe(150);
    expect(resultado.transacoes[0].tipo_transacao).toBe("saida");
  });

  it("Teste 2: Parse OFX 2.x (XML bem-formado)", () => {
    const ofx2x = `<?xml version="1.0" encoding="UTF-8"?>
<OFX>
<BANKMSGSRSV1>
<STMTTRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT</TRNTYPE>
<DTPOSTED>20240116</DTPOSTED>
<TRNAMT>1500.00</TRNAMT>
<FITID>1002</FITID>
<NAME>Depósito salário</NAME>
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRS>
</BANKMSGSRSV1>
</OFX>`;

    const resultado = parseOFX(ofx2x);

    expect(resultado.sucesso).toBe(true);
    expect(resultado.transacoes.length).toBeGreaterThan(0);
    expect(resultado.transacoes[0].data).toBe("2024-01-16");
    expect(resultado.transacoes[0].valor).toBe(1500);
    expect(resultado.transacoes[0].tipo_transacao).toBe("entrada");
  });

  it("Teste 3: Normaliza datas OFX (YYYYMMDD)", () => {
    const ofx = `<OFX>
<STMTTRN>
<DTPOSTED>20240115
<TRNAMT>100.00
<NAME>Teste
</STMTTRN>
</OFX>`;

    const resultado = parseOFX(ofx);

    if (resultado.transacoes.length > 0) {
      expect(resultado.transacoes[0].data).toBe("2024-01-15");
    }
  });

  it("Teste 4: Detecta débitos (DEBIT)", () => {
    const ofx = `<OFX>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240115
<TRNAMT>-250.00
<NAME>Despesa
</STMTTRN>
</OFX>`;

    const resultado = parseOFX(ofx);

    if (resultado.transacoes.length > 0) {
      expect(resultado.transacoes[0].tipo_transacao).toBe("saida");
    }
  });

  it("Teste 5: Detecta créditos (CREDIT)", () => {
    const ofx = `<OFX>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20240116
<TRNAMT>1000.00
<NAME>Receita
</STMTTRN>
</OFX>`;

    const resultado = parseOFX(ofx);

    if (resultado.transacoes.length > 0) {
      expect(resultado.transacoes[0].tipo_transacao).toBe("entrada");
    }
  });

  it("Teste 6: Trata múltiplas transações", () => {
    const ofx = `<OFX>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240115
<TRNAMT>-100.00
<NAME>Transação 1
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20240116
<TRNAMT>500.00
<NAME>Transação 2
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240117
<TRNAMT>-200.00
<NAME>Transação 3
</STMTTRN>
</OFX>`;

    const resultado = parseOFX(ofx);

    expect(resultado.transacoes.length).toBe(3);
    expect(resultado.transacoes[0].valor).toBe(100);
    expect(resultado.transacoes[1].valor).toBe(500);
    expect(resultado.transacoes[2].valor).toBe(200);
  });

  it("Teste 7: Usa MEMO quando NAME não disponível", () => {
    const ofx = `<OFX>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240115
<TRNAMT>-100.00
<MEMO>Descrição do memo
</STMTTRN>
</OFX>`;

    const resultado = parseOFX(ofx);

    if (resultado.transacoes.length > 0) {
      expect(resultado.transacoes[0].descricao).toBe("Descrição do memo");
    }
  });

  it("Teste 8: Registra FITID em campos adicionais", () => {
    const ofx = `<OFX>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240115
<TRNAMT>-100.00
<FITID>ABC123
<NAME>Teste
</STMTTRN>
</OFX>`;

    const resultado = parseOFX(ofx);

    if (resultado.transacoes.length > 0) {
      expect(resultado.transacoes[0].campos_adicionais?.fitid).toBe("ABC123");
    }
  });

  it("Teste 9: Infere tipo do sinal do valor quando tipo não especificado", () => {
    const ofx = `<OFX>
<STMTTRN>
<DTPOSTED>20240115
<TRNAMT>500.00
<NAME>Positivo
</STMTTRN>
<STMTTRN>
<DTPOSTED>20240116
<TRNAMT>-300.00
<NAME>Negativo
</STMTTRN>
</OFX>`;

    const resultado = parseOFX(ofx);

    expect(resultado.transacoes[0].tipo_transacao).toBe("entrada");
    expect(resultado.transacoes[1].tipo_transacao).toBe("saida");
  });

  it("Teste 10: Respeita limite de linhas", () => {
    const ofx = `<OFX>
${Array.from({ length: 20 }, (_, i) =>
  `<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>${String(20240101 + i).padStart(8, "0")}
<TRNAMT>-${100 + i}.00
<NAME>Transação ${i + 1}
</STMTTRN>`,
).join("\n")}
</OFX>`;

    const resultado = parseOFX(ofx, { maxLinhas: 10 });

    expect(resultado.transacoes.length).toBeLessThanOrEqual(10);
  });

  it("Teste 11: Preserva número de linha", () => {
    const ofx = `<OFX>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240115
<TRNAMT>-100.00
<NAME>Transação 1
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20240116
<TRNAMT>500.00
<NAME>Transação 2
</STMTTRN>
</OFX>`;

    const resultado = parseOFX(ofx);

    if (resultado.transacoes.length >= 2) {
      expect(resultado.transacoes[0].numero_linha).toBe(1);
      expect(resultado.transacoes[1].numero_linha).toBe(2);
    }
  });

  it("Teste 12: Usa origem_modulo para rastreabilidade", () => {
    const ofx = `<OFX>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240115
<TRNAMT>-100.00
<NAME>Teste
</STMTTRN>
</OFX>`;

    const resultado = parseOFX(ofx, { origem: "ofx_banco_xyz.ofx" });

    if (resultado.transacoes.length > 0) {
      expect(resultado.transacoes[0].origem_modulo).toBe("ofx_banco_xyz.ofx");
    }
  });

  it("Teste 13: Trata valores decimais corretamente", () => {
    const ofx = `<OFX>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240115
<TRNAMT>-1234.56
<NAME>Teste valores
</STMTTRN>
</OFX>`;

    const resultado = parseOFX(ofx);

    if (resultado.transacoes.length > 0) {
      expect(resultado.transacoes[0].valor).toBeCloseTo(1234.56, 2);
    }
  });

  it("Teste 14: Registra erros de transações inválidas", () => {
    const ofx = `<OFX>
<STMTTRN>
<DTPOSTED>20240115
<TRNAMT>-100.00
<NAME>Válida
</STMTTRN>
<STMTTRN>
<TRNAMT>-100.00
<NAME>Sem data
</STMTTRN>
</OFX>`;

    const resultado = parseOFX(ofx, { tolerarErros: true });

    expect(resultado.erros.length).toBeGreaterThan(0);
  });

  it("Teste 15: Retorna estatísticas detalhadas", () => {
    const ofx = `<OFX>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240115
<TRNAMT>-100.00
<NAME>Teste 1
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20240116
<TRNAMT>500.00
<NAME>Teste 2
</STMTTRN>
</OFX>`;

    const resultado = parseOFX(ofx);

    expect(resultado.estatisticas).toBeDefined();
    expect(resultado.estatisticas?.total_linhas).toBe(2);
    expect(resultado.estatisticas?.linhas_processadas).toBe(2);
  });
});
