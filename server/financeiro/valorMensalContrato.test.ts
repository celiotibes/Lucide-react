import { describe, expect, it } from 'vitest';
import { calcularValorMensalContrato, type ComponenteMensal } from './valorMensalContrato';

describe('calcularValorMensalContrato', () => {
  it('reproduz o contrato real do Apto 503 Central Station: comodato fixo somado ao aluguel', () => {
    // aluguel R$1.300,00 + comodato de móveis R$350,00 fixo à parte = R$1.650,00,
    // confirmado batendo o subtotal do contrato real (docs/11, item "1 aluguel" da caução).
    const componentes: ComponenteMensal[] = [
      { tipo: 'comodato_moveis', descricao: 'Comodato de móveis', natureza: 'valor_fixo', valorFixo: 350 },
    ];
    const resultado = calcularValorMensalContrato(1300, componentes);
    expect(resultado.valorTotal).toBe(1650);
    expect(resultado.itens).toEqual([
      { descricao: 'Aluguel', valor: 1300 },
      { descricao: 'Comodato de móveis', valor: 350 },
    ]);
    expect(resultado.faltantes).toEqual([]);
  });

  it('componente percentual_do_aluguel NÃO soma ao total — só decompõe o aluguel-base (Life Space, comodato "já incluído")', () => {
    const componentes: ComponenteMensal[] = [
      { tipo: 'comodato_moveis', descricao: 'Comodato de móveis (15%, incluído no aluguel)', natureza: 'percentual_do_aluguel', percentual: 0.15 },
    ];
    const resultado = calcularValorMensalContrato(1000, componentes);
    expect(resultado.valorTotal).toBe(1000); // total inalterado — o percentual já estava dentro do aluguel
    expect(resultado.itens).toEqual([
      { descricao: 'Aluguel', valor: 850 },
      { descricao: 'Comodato de móveis (15%, incluído no aluguel)', valor: 150 },
    ]);
  });

  it('componente percentual_do_aluguel decompõe o total mesmo com dois componentes somados a 100% (Sala Comercial: vaga 10% + aluguel 90%)', () => {
    const componentes: ComponenteMensal[] = [
      { tipo: 'vaga_garagem', descricao: 'Vaga de garagem (10% do valor locatício)', natureza: 'percentual_do_aluguel', percentual: 0.1 },
    ];
    const resultado = calcularValorMensalContrato(1360, componentes);
    expect(resultado.valorTotal).toBe(1360);
    expect(resultado.itens).toEqual([
      { descricao: 'Aluguel', valor: 1224 },
      { descricao: 'Vaga de garagem (10% do valor locatício)', valor: 136 },
    ]);
  });

  it('repassado_variavel soma ao total quando o valor do mês é informado', () => {
    const componentes: ComponenteMensal[] = [
      { tipo: 'iptu_repassado', descricao: 'IPTU (repassado, 1/12)', natureza: 'repassado_variavel', valorRepassadoMes: 83.33 },
      { tipo: 'condominio_repassado', descricao: 'Condomínio', natureza: 'repassado_variavel', valorRepassadoMes: 450 },
    ];
    const resultado = calcularValorMensalContrato(1000, componentes);
    expect(resultado.valorTotal).toBe(1533.33);
    expect(resultado.faltantes).toEqual([]);
  });

  it('repassado_variavel sem valor do mês é reportado em faltantes, não estimado nem ignorado', () => {
    const componentes: ComponenteMensal[] = [
      { tipo: 'iptu_repassado', descricao: 'IPTU', natureza: 'repassado_variavel', valorRepassadoMes: null },
    ];
    const resultado = calcularValorMensalContrato(1000, componentes);
    expect(resultado.valorTotal).toBe(1000); // componente faltante não entra no total
    expect(resultado.faltantes).toEqual([{ tipo: 'iptu_repassado', motivo: 'repassado_sem_valor_do_mes' }]);
    expect(resultado.itens.find((i) => i.descricao === 'IPTU')).toBeUndefined();
  });

  it('combina as três naturezas no mesmo contrato sem confundir aditivo com decomposição', () => {
    const componentes: ComponenteMensal[] = [
      { tipo: 'vaga_garagem', descricao: 'Vaga', natureza: 'valor_fixo', valorFixo: 200 },
      { tipo: 'comodato_moveis', descricao: 'Comodato', natureza: 'percentual_do_aluguel', percentual: 0.15 },
      { tipo: 'iptu_repassado', descricao: 'IPTU', natureza: 'repassado_variavel', valorRepassadoMes: 100 },
    ];
    const resultado = calcularValorMensalContrato(1000, componentes);
    // total = 1000 (aluguel, já incluindo o comodato de 15%) + 200 (vaga fixa) + 100 (IPTU) = 1300
    expect(resultado.valorTotal).toBe(1300);
  });

  it('nenhum componente: total é só o aluguel-base', () => {
    const resultado = calcularValorMensalContrato(1500, []);
    expect(resultado.valorTotal).toBe(1500);
    expect(resultado.itens).toEqual([{ descricao: 'Aluguel', valor: 1500 }]);
    expect(resultado.faltantes).toEqual([]);
  });

  it('rejeita valorAluguel zero ou negativo', () => {
    expect(() => calcularValorMensalContrato(0, [])).toThrow();
    expect(() => calcularValorMensalContrato(-100, [])).toThrow();
  });
});
