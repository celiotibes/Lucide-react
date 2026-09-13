import { describe, expect, it } from 'vitest';
import { gerarOFX, OFXInvalidoError, parsearOFX, type TransacaoOFX } from './ofx';

describe('gerarOFX', () => {
  const opcoesBase = {
    contaId: 'ASAAS',
    dataInicio: new Date(Date.UTC(2026, 6, 1)),
    dataFim: new Date(Date.UTC(2026, 6, 31)),
    dataGeracao: new Date(Date.UTC(2026, 6, 31, 14, 30, 5)),
  };

  it('gera o cabeçalho OFX 1.0 SGML correto', () => {
    const ofx = gerarOFX([], opcoesBase);
    expect(ofx).toContain('OFXHEADER:100');
    expect(ofx).toContain('DATA:OFXSGML');
    expect(ofx).toContain('VERSION:102');
    expect(ofx).toContain('<CURDEF>BRL');
    expect(ofx).toContain('<ACCTID>ASAAS');
    expect(ofx).toContain('<DTSERVER>20260731143005');
    expect(ofx).toContain('<DTSTART>20260701');
    expect(ofx).toContain('<DTEND>20260731');
  });

  it('cada transação vira um bloco STMTTRN com tipo, data, valor e memo', () => {
    const transacoes: TransacaoOFX[] = [
      { id: 'pay_123', data: new Date(Date.UTC(2026, 6, 10)), valor: 1500, descricao: 'Fatura Kitnet 16 - julho/2026' },
    ];
    const ofx = gerarOFX(transacoes, opcoesBase);

    expect(ofx).toContain('<TRNTYPE>CREDIT');
    expect(ofx).toContain('<DTPOSTED>20260710');
    expect(ofx).toContain('<TRNAMT>1500.00');
    expect(ofx).toContain('<FITID>pay_123');
    expect(ofx).toContain('<MEMO>Fatura Kitnet 16 - julho/2026');
  });

  it('valor negativo vira DEBIT', () => {
    const transacoes: TransacaoOFX[] = [{ id: 'x', data: opcoesBase.dataInicio, valor: -100, descricao: 'Estorno' }];
    const ofx = gerarOFX(transacoes, opcoesBase);
    expect(ofx).toContain('<TRNTYPE>DEBIT');
    expect(ofx).toContain('<TRNAMT>-100.00');
  });

  it('escapa caracteres especiais SGML no memo (& < >) e remove quebras de linha', () => {
    const transacoes: TransacaoOFX[] = [
      { id: 'x', data: opcoesBase.dataInicio, valor: 1, descricao: 'A&B <teste>\nlinha 2' },
    ];
    const ofx = gerarOFX(transacoes, opcoesBase);
    expect(ofx).toContain('<MEMO>A&amp;B &lt;teste&gt; linha 2');
  });

  it('múltiplas transações mantêm a ordem recebida', () => {
    const transacoes: TransacaoOFX[] = [
      { id: 'a', data: opcoesBase.dataInicio, valor: 100, descricao: 'Primeira' },
      { id: 'b', data: opcoesBase.dataInicio, valor: 200, descricao: 'Segunda' },
    ];
    const ofx = gerarOFX(transacoes, opcoesBase);
    expect(ofx.indexOf('<FITID>a')).toBeLessThan(ofx.indexOf('<FITID>b'));
  });

  it('usa BANKID padrão "0000" quando não informado', () => {
    const ofx = gerarOFX([], opcoesBase);
    expect(ofx).toContain('<BANKID>0000');
  });

  it('sem transações: gera um extrato válido com BANKTRANLIST vazia', () => {
    const ofx = gerarOFX([], opcoesBase);
    expect(ofx).toContain('<BANKTRANLIST>');
    expect(ofx).toContain('</BANKTRANLIST>');
    expect(ofx).not.toContain('<STMTTRN>');
  });
});

describe('parsearOFX', () => {
  it('round-trip: o que gerarOFX escreve, parsearOFX lê de volta igual', () => {
    const transacoes: TransacaoOFX[] = [
      { id: 'pay_1', data: new Date(Date.UTC(2026, 6, 10)), valor: 1500, descricao: 'Fatura Kitnet 16' },
      { id: 'pay_2', data: new Date(Date.UTC(2026, 6, 15)), valor: -50.5, descricao: 'Estorno parcial' },
    ];
    const ofx = gerarOFX(transacoes, {
      contaId: 'ASAAS',
      dataInicio: new Date(Date.UTC(2026, 6, 1)),
      dataFim: new Date(Date.UTC(2026, 6, 31)),
    });

    const importadas = parsearOFX(ofx);
    expect(importadas).toHaveLength(2);
    expect(importadas[0]).toEqual({ id: 'pay_1', data: new Date(Date.UTC(2026, 6, 10)), valor: 1500, descricao: 'Fatura Kitnet 16' });
    expect(importadas[1]).toEqual({ id: 'pay_2', data: new Date(Date.UTC(2026, 6, 15)), valor: -50.5, descricao: 'Estorno parcial' });
  });

  it('lê DTPOSTED com hora e sufixo de timezone entre colchetes', () => {
    const ofx = `<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260710120000[-3:BRT]
<TRNAMT>100.00
<FITID>abc123
<MEMO>Teste
</STMTTRN>`;
    const [transacao] = parsearOFX(ofx);
    expect(transacao.data).toEqual(new Date(Date.UTC(2026, 6, 10, 12, 0, 0)));
  });

  it('desescapa entidades SGML no memo (&amp; &lt; &gt;)', () => {
    const ofx = `<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260710
<TRNAMT>10.00
<FITID>x
<MEMO>A&amp;B &lt;teste&gt;
</STMTTRN>`;
    const [transacao] = parsearOFX(ofx);
    expect(transacao.descricao).toBe('A&B <teste>');
  });

  it('sem nenhum STMTTRN: devolve lista vazia', () => {
    expect(parsearOFX('OFXHEADER:100\n<OFX></OFX>')).toEqual([]);
  });

  it('rejeita transação sem FITID', () => {
    const ofx = `<STMTTRN>\n<TRNTYPE>CREDIT\n<DTPOSTED>20260710\n<TRNAMT>10.00\n<MEMO>x\n</STMTTRN>`;
    expect(() => parsearOFX(ofx)).toThrow(OFXInvalidoError);
  });

  it('rejeita transação sem TRNAMT', () => {
    const ofx = `<STMTTRN>\n<TRNTYPE>CREDIT\n<DTPOSTED>20260710\n<FITID>x\n<MEMO>y\n</STMTTRN>`;
    expect(() => parsearOFX(ofx)).toThrow(OFXInvalidoError);
  });

  it('rejeita data em formato inválido', () => {
    const ofx = `<STMTTRN>\n<DTPOSTED>não-e-uma-data\n<TRNAMT>10.00\n<FITID>x\n</STMTTRN>`;
    expect(() => parsearOFX(ofx)).toThrow(OFXInvalidoError);
  });

  it('múltiplas transações sem tag de fechamento entre elas (SGML real) ainda são separadas corretamente', () => {
    const ofx = `<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260701
<TRNAMT>100.00
<FITID>t1
<MEMO>Primeira
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260702
<TRNAMT>200.00
<FITID>t2
<MEMO>Segunda`;
    const transacoes = parsearOFX(ofx);
    expect(transacoes.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(transacoes[0].valor).toBe(100);
    expect(transacoes[1].valor).toBe(200);
  });
});
