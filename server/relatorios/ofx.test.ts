import { describe, expect, it } from 'vitest';
import { gerarOFX, type TransacaoOFX } from './ofx';

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
