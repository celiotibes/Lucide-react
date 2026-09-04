import { describe, expect, it } from "vitest";
import { analisarOfx } from "./ofx";

function blocoStmttrn(trnamt: string): string {
  return `<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260315<TRNAMT>${trnamt}<FITID>123<MEMO>teste</STMTTRN>`;
}

describe("analisarOfx — TRNAMT", () => {
  it("interpreta ponto decimal (formato padrão da especificação OFX)", () => {
    const [t] = analisarOfx(blocoStmttrn("-50.00"));
    expect(t.valor).toBe(-50);
  });

  it("interpreta vírgula decimal sem corromper por ordem de grandeza (extrato BR fora da especificação)", () => {
    // Bug real de auditoria: parseFloat("-1.234,56") = -1.234 (perde os centavos e o milhar).
    const [t] = analisarOfx(blocoStmttrn("-1.234,56"));
    expect(t.valor).toBe(-1234.56);
  });
});
