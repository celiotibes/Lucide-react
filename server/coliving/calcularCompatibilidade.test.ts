import { describe, expect, it } from 'vitest';
import { calcularCompatibilidade, type PerfilConvivencia } from './calcularCompatibilidade';

function perfil(sobrescritas: Partial<PerfilConvivencia> = {}): PerfilConvivencia {
  return {
    v1Limpeza: 2,
    v2Ruido: 2,
    v3Rotina: 2,
    v4Fumo: 2,
    v5Pets: 2,
    v6Dieta: 1,
    v7Conflito: 2,
    temPet: false,
    quadroAlergico: 'nenhuma',
    ...sobrescritas,
  };
}

describe('calcularCompatibilidade', () => {
  it('vetores idênticos: score 100, sem pontos de atrito nem alertas', () => {
    const resultado = calcularCompatibilidade(perfil(), perfil());
    expect(resultado.scoreGeral).toBe(100);
    expect(resultado.classificacao).toBe('alta_compatibilidade');
    expect(resultado.pontosAtrito).toHaveLength(0);
    expect(resultado.alertasCriticos).toHaveLength(0);
  });

  it('reproduz o caso real anonimizado: divergência de limpeza, pets neutralizado, cruzamento com saúde', () => {
    const candidatoA = perfil({ v1Limpeza: 2, v2Ruido: 3, v3Rotina: 2, v4Fumo: 2, v5Pets: 2, v7Conflito: 3, quadroAlergico: 'respiratoria' });
    const candidatoB = perfil({ v1Limpeza: 1, v2Ruido: 3, v3Rotina: 2, v4Fumo: 2, v5Pets: 3, v7Conflito: 3, quadroAlergico: 'nenhuma' });

    const resultado = calcularCompatibilidade(candidatoA, candidatoB);

    expect(resultado.scoreGeral).toBeCloseTo(86.36, 1);
    expect(resultado.classificacao).toBe('alta_compatibilidade');
    expect(resultado.pontosAtrito).toHaveLength(1);
    expect(resultado.pontosAtrito[0].variavel).toBe('limpeza');
    // pets diverge (2 vs 3) mas nenhum dos dois possui pet -> neutralizado, sem alerta
    expect(resultado.alertasCriticos.some((a) => a.tipo === 'pets')).toBe(false);
    // alergia respiratória de A cruzada com limpeza básica de B -> alerta de saúde
    expect(resultado.alertasCriticos).toHaveLength(1);
    expect(resultado.alertasCriticos[0].tipo).toBe('saude');
  });

  it('fumo: níveis 1 e 3 geram incompatibilidade crítica', () => {
    const resultado = calcularCompatibilidade(perfil({ v4Fumo: 1 }), perfil({ v4Fumo: 3 }));
    expect(resultado.alertasCriticos).toHaveLength(1);
    expect(resultado.alertasCriticos[0]).toMatchObject({ tipo: 'fumo' });
    expect(resultado.alertasCriticos[0].descricao).toMatch(/crítica/);
  });

  it('fumo: níveis 1 e 2 geram só um alerta moderado, não crítico', () => {
    const resultado = calcularCompatibilidade(perfil({ v4Fumo: 1 }), perfil({ v4Fumo: 2 }));
    expect(resultado.alertasCriticos).toHaveLength(1);
    expect(resultado.alertasCriticos[0].descricao).not.toMatch(/crítica/);
  });

  it('pets: intolerância severa declarada por um lado e o outro possui pet -> crítico', () => {
    const resultado = calcularCompatibilidade(perfil({ v5Pets: 1 }), perfil({ temPet: true, v5Pets: 3 }));
    expect(resultado.alertasCriticos).toHaveLength(1);
    expect(resultado.alertasCriticos[0]).toMatchObject({ tipo: 'pets' });
    expect(resultado.alertasCriticos[0].descricao).toMatch(/crítica/);
  });

  it('pets: nenhum dos dois possui animal -> filtro neutralizado mesmo com níveis diferentes', () => {
    const resultado = calcularCompatibilidade(perfil({ v5Pets: 1 }), perfil({ v5Pets: 3 }));
    expect(resultado.alertasCriticos.some((a) => a.tipo === 'pets')).toBe(false);
  });

  it('pets: um possui animal e o outro declara tolerância restrita -> alerta não crítico', () => {
    const resultado = calcularCompatibilidade(perfil({ temPet: true, v5Pets: 3 }), perfil({ v5Pets: 2 }));
    expect(resultado.alertasCriticos).toHaveLength(1);
    expect(resultado.alertasCriticos[0].descricao).not.toMatch(/crítica/);
  });

  it('classificação: score baixo cai em atrito_relevante ou baixa_compatibilidade', () => {
    const resultado = calcularCompatibilidade(
      perfil({ v1Limpeza: 3, v2Ruido: 3, v3Rotina: 1, v7Conflito: 3 }),
      perfil({ v1Limpeza: 1, v2Ruido: 1, v3Rotina: 3, v7Conflito: 1 }),
    );
    expect(resultado.scoreGeral).toBeLessThan(40);
    expect(resultado.classificacao).toBe('baixa_compatibilidade');
  });

  it('pontos de atrito vêm ordenados por severidade (peso × desvio) decrescente', () => {
    const resultado = calcularCompatibilidade(
      perfil({ v1Limpeza: 1, v6Dieta: 3 }),
      perfil({ v1Limpeza: 3, v6Dieta: 1 }),
    );
    // limpeza tem peso 3 e desvio 2 (severidade 6); dieta tem peso 1 e desvio 2 (severidade 2)
    expect(resultado.pontosAtrito[0].variavel).toBe('limpeza');
    expect(resultado.pontosAtrito.at(-1)?.variavel).toBe('dieta');
  });
});
