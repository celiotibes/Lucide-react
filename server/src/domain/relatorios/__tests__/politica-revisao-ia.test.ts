/**
 * Testes para Política de Revisão IA
 */

import { describe, it, expect } from 'vitest';
import {
  campoNecessitaRevisao,
  relatarioNecessitaRevisao,
  papelPodeRevisar,
  papelBloqueadoRevisao,
  verificarMudancaThreshold,
  obterPoliticaAtual
} from '../politicaRevisaoIA.js';

describe('PoliticaRevisaoIA', () => {
  describe('campoNecessitaRevisao', () => {
    it('deve retornar true para campos críticos', () => {
      expect(campoNecessitaRevisao('lucroLiquido')).toBe(true);
      expect(campoNecessitaRevisao('receitaTotal')).toBe(true);
      expect(campoNecessitaRevisao('despesaTotal')).toBe(true);
      expect(campoNecessitaRevisao('saldoAtual')).toBe(true);
    });

    it('deve retornar false para campos não-críticos', () => {
      expect(campoNecessitaRevisao('outrosCampo')).toBe(false);
      expect(campoNecessitaRevisao('naoExiste')).toBe(false);
    });
  });

  describe('relatarioNecessitaRevisao', () => {
    it('deve retornar true para relatórios sensíveis', () => {
      expect(relatarioNecessitaRevisao('relatorios/executivo')).toBe(true);
      expect(relatarioNecessitaRevisao('relatorios/dre')).toBe(true);
      expect(relatarioNecessitaRevisao('relatorios/fluxo-caixa')).toBe(true);
    });

    it('deve retornar false para relatórios não-sensíveis', () => {
      expect(relatarioNecessitaRevisao('relatorios/outro')).toBe(false);
    });
  });

  describe('papelPodeRevisar', () => {
    it('deve retornar true para papéis com poder de revisão', () => {
      expect(papelPodeRevisar('administrador')).toBe(true);
      expect(papelPodeRevisar('auditor')).toBe(true);
      expect(papelPodeRevisar('supervisor')).toBe(true);
    });

    it('deve retornar false para papéis sem poder', () => {
      expect(papelPodeRevisar('usuario_operacional')).toBe(false);
      expect(papelPodeRevisar('prestador')).toBe(false);
    });
  });

  describe('papelBloqueadoRevisao', () => {
    it('deve retornar true para papéis bloqueados', () => {
      expect(papelBloqueadoRevisao('usuario_operacional')).toBe(true);
      expect(papelBloqueadoRevisao('prestador')).toBe(true);
    });

    it('deve retornar false para papéis não-bloqueados', () => {
      expect(papelBloqueadoRevisao('administrador')).toBe(false);
      expect(papelBloqueadoRevisao('auditor')).toBe(false);
    });
  });

  describe('verificarMudancaThreshold', () => {
    it('deve detectar mudança > 10% em receitaTotal', () => {
      const resultado = verificarMudancaThreshold(1000, 1150, 'receitaTotal');
      expect(resultado.disparaRevisao).toBe(true);
      expect(resultado.motivo).toBe('mudanca_drástica');
    });

    it('deve detectar mudança > 10% em despesaTotal', () => {
      const resultado = verificarMudancaThreshold(1000, 900, 'despesaTotal');
      expect(resultado.disparaRevisao).toBe(true);
      expect(resultado.motivo).toBe('mudanca_drástica');
    });

    it('deve ignorar mudanças <= 10%', () => {
      const resultado = verificarMudancaThreshold(1000, 1095, 'receitaTotal');
      expect(resultado.disparaRevisao).toBe(false);
    });

    it('deve tratar mudança de 0 como 100%', () => {
      const resultado = verificarMudancaThreshold(0, 100, 'receitaTotal');
      expect(resultado.disparaRevisao).toBe(true);
    });

    it('deve detectar mudança > 15% em margemPropriedade', () => {
      const resultado = verificarMudancaThreshold(1000, 850, 'margemPropriedade');
      expect(resultado.disparaRevisao).toBe(true);
      expect(resultado.motivo).toBe('mudanca_drástica');
    });

    it('deve ignorar mudanças <= 15% em margemPropriedade', () => {
      const resultado = verificarMudancaThreshold(1000, 860, 'margemPropriedade');
      expect(resultado.disparaRevisao).toBe(false);
    });

    it('deve detectar mudança > 20% em saldoAtual', () => {
      const resultado = verificarMudancaThreshold(1000, 750, 'saldoAtual');
      expect(resultado.disparaRevisao).toBe(true);
      expect(resultado.motivo).toBe('mudanca_drástica');
    });

    it('deve ignorar mudanças <= 20% em saldoAtual', () => {
      const resultado = verificarMudancaThreshold(1000, 810, 'saldoAtual');
      expect(resultado.disparaRevisao).toBe(false);
    });
  });

  describe('obterPoliticaAtual', () => {
    it('deve retornar política válida e completa', () => {
      const politica = obterPoliticaAtual();

      expect(politica.versao).toBe('1.0.0');
      expect(politica.ativa).toBe(true);
      expect(Array.isArray(politica.camposCriticos)).toBe(true);
      expect(Array.isArray(politica.relatoriosSensveis)).toBe(true);
      expect(Array.isArray(politica.papeisSemRevisao)).toBe(true);
      expect(Array.isArray(politica.papaisComRevisao)).toBe(true);
      expect(Array.isArray(politica.thresholds)).toBe(true);
      expect(politica.ultimaAtualizacao).toBeTruthy();
    });

    it('deve incluir todos os campos críticos', () => {
      const politica = obterPoliticaAtual();
      const camposCriticos = [
        'lucroLiquido',
        'receitaTotal',
        'despesaTotal',
        'saldoAtual',
        'margemPropriedade',
        'inadimplencia',
        'taxaOcupacao',
        'diasDeCaixaDisponivel'
      ];

      camposCriticos.forEach((campo) => {
        expect(politica.camposCriticos).toContain(campo);
      });
    });

    it('deve incluir todos os relatórios sensíveis', () => {
      const politica = obterPoliticaAtual();
      const relatorios = [
        'relatorios/executivo',
        'relatorios/dre',
        'relatorios/fluxo-caixa',
        'relatorios/margens'
      ];

      relatorios.forEach((rel) => {
        expect(politica.relatoriosSensveis).toContain(rel);
      });
    });
  });
});
