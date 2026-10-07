/**
 * Testes avançados para OFX Parser
 * Incluindo variantes brasileiras e performance
 */

import { describe, it, expect } from "vitest";
import { parseOFX } from "../ofx-parser.js";

describe("OFX Parser - Brazilian Banks", () => {
  describe("OFX 1.x", () => {
    it("deve processar OFX 1.x do Banco do Brasil", () => {
      const ofx = `OFXHEADER:100
OFXVERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEFORMAT:NO
NEWFILEFORMAT:NO

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>20231215120000
<LANGUAGE>PORT
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRS>
<CURDEF>BRL
<STMTRS>
<BANKTRANLIST>
<DTSTART>20231201
<DTEND>20231215
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20231202
<TRNAMT>1500.00
<FITID>001
<NAME>DEPÓSITO PIX
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20231203
<TRNAMT>-250.50
<FITID>002
<NAME>PAGAMENTO BOLETO
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>1249.50
<DTASOF>20231215
</LEDGERBAL>
</STMTRS>
</STMTTRS>
</BANKMSGSRSV1>
</OFX>`;

      const resultado = parseOFX(ofx);

      expect(resultado.sucesso).toBe(true);
      expect(resultado.transacoes.length).toBe(2);

      // Verificar primeira transação (crédito)
      const trans1 = resultado.transacoes[0];
      expect(trans1.tipo_transacao).toBe("entrada");
      expect(trans1.valor).toBe(1500.00);
      expect(trans1.data).toMatch(/^2023-12-02$/);

      // Verificar segunda transação (débito)
      const trans2 = resultado.transacoes[1];
      expect(trans2.tipo_transacao).toBe("saida");
      expect(trans2.valor).toBe(250.50);
    });

    it("deve processar OFX 1.x do Bradesco", () => {
      const ofx = `OFXHEADER:100
OFXVERSION:102
SECURITY:NONE
ENCODING:USASCII

<OFX>
<BANKMSGSRSV1>
<STMTTRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20231201
<TRNAMT>5000.00
<FITID>BRAD001
<MEMO>SALÁRIO
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20231202
<TRNAMT>-100.00
<FITID>BRAD002
<MEMO>TARIFA MENSAL
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRS>
</BANKMSGSRSV1>
</OFX>`;

      const resultado = parseOFX(ofx);

      expect(resultado.sucesso).toBe(true);
      expect(resultado.transacoes.length).toBe(2);
      expect(resultado.transacoes[0].valor).toBe(5000.00);
    });
  });

  describe("OFX 2.0", () => {
    it("deve processar OFX 2.0 (XML)", () => {
      const ofx = `<?xml version="1.0" encoding="UTF-8"?>
<OFX>
  <SIGNONMSGSRSV1>
    <SONRS>
      <STATUS>
        <CODE>0
        <SEVERITY>INFO
      </STATUS>
      <DTSERVER>20231215120000
      <LANGUAGE>PORT
    </SONRS>
  </SIGNONMSGSRSV1>
  <BANKMSGSRSV1>
    <STMTTRS>
      <CURDEF>BRL
      <STMTRS>
        <BANKTRANLIST>
          <DTSTART>20231201
          <DTEND>20231215
          <STMTTRN>
            <TRNTYPE>CREDIT
            <DTPOSTED>20231204
            <TRNAMT>750.00
            <FITID>OFX001
            <NAME>PIX RECEBIDO
          </STMTTRN>
        </BANKTRANLIST>
        <LEDGERBAL>
          <BALAMT>750.00
          <DTASOF>20231215
        </LEDGERBAL>
      </STMTRS>
    </STMTTRS>
  </BANKMSGSRSV1>
</OFX>`;

      const resultado = parseOFX(ofx);

      expect(resultado.sucesso).toBe(true);
      expect(resultado.transacoes.length).toBeGreaterThan(0);
      expect(resultado.transacoes[0].valor).toBe(750.00);
    });
  });

  describe("Múltiplas contas", () => {
    it("deve processar OFX com múltiplas contas", () => {
      const ofx = `OFXHEADER:100
OFXVERSION:102

<OFX>
<BANKMSGSRSV1>
<STMTTRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20231201
<TRNAMT>1000.00
<FITID>ACC1
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRS>
<STMTTRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20231202
<TRNAMT>-200.00
<FITID>ACC2
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRS>
</BANKMSGSRSV1>
</OFX>`;

      const resultado = parseOFX(ofx);

      expect(resultado.sucesso).toBe(true);
      expect(resultado.transacoes.length).toBe(2);
    });
  });

  describe("Tratamento de erros", () => {
    it("deve continuar com tolerarErros=true", () => {
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
</STMTTRN>
<STMTTRN>
<TRNTYPE>INVALID
<DTPOSTED>INVALID_DATE
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20231203
<TRNAMT>-500.00
<FITID>003
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRS>
</BANKMSGSRSV1>
</OFX>`;

      const resultado = parseOFX(ofx, { tolerarErros: true });

      // Deve ter processado transações válidas
      expect(resultado.transacoes.length).toBeGreaterThan(0);
      // Deve ter registrado erros
      expect(resultado.erros.length).toBeGreaterThan(0);
    });

    it("deve parar no primeiro erro com tolerarErros=false", () => {
      const ofx = `<OFX>
<BANKMSGSRSV1>
<STMTTRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>INVALID
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRS>
</BANKMSGSRSV1>
</OFX>`;

      const resultado = parseOFX(ofx, { tolerarErros: false });

      expect(resultado.sucesso).toBe(false);
    });
  });

  describe("Performance", () => {
    it("deve processar 1000+ transações em menos de 2 segundos", () => {
      let ofx = `OFXHEADER:100
<OFX>
<BANKMSGSRSV1>
<STMTTRS>
<STMTRS>
<BANKTRANLIST>
`;

      for (let i = 1; i <= 1001; i++) {
        const dia = String((i % 28) + 1).padStart(2, "0");
        ofx += `<STMTTRN>
<TRNTYPE>${i % 2 === 0 ? "CREDIT" : "DEBIT"}
<DTPOSTED>202312${dia}
<TRNAMT>${i % 2 === 0 ? "" : "-"}${(i * 10).toFixed(2)}
<FITID>TRN${i}
</STMTTRN>
`;
      }

      ofx += `</BANKTRANLIST>
</STMTRS>
</STMTTRS>
</BANKMSGSRSV1>
</OFX>`;

      const inicio = performance.now();
      const resultado = parseOFX(ofx);
      const tempo = performance.now() - inicio;

      expect(resultado.transacoes.length).toBeGreaterThanOrEqual(1000);
      expect(tempo).toBeLessThan(2000);
      console.log(
        `OFX: Processou ${resultado.transacoes.length} transações em ${tempo.toFixed(0)}ms`
      );
    });
  });

  describe("Detecção de formato", () => {
    it("deve detectar OFX 1.x corretamente", () => {
      const ofx1x = `OFXHEADER:100
OFXVERSION:102
<OFX>`;

      expect(parseOFX(ofx1x).avisos?.some((a) => a.includes("1.x"))).toBe(true);
    });

    it("deve detectar OFX 2.x (XML) corretamente", () => {
      const ofx2x = `<?xml version="1.0"?>
<OFX>`;

      expect(parseOFX(ofx2x).avisos?.some((a) => a.includes("2.x"))).toBe(true);
    });
  });
});
