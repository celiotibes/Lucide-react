import { describe, expect, it } from 'vitest';
import { selecionarProvedor } from './policy';

describe('selecionarProvedor', () => {
  it('roteia leitura de medidor para Gemini Flash-Lite pago, com fallback Claude Haiku', () => {
    const decisao = selecionarProvedor({ task: 'leitura_medidor_energia', contemDadosPessoais: true });
    expect(decisao.primary.provider).toBe('gemini');
    expect(decisao.primary.tierGratuita).toBe(false);
    expect(decisao.fallback?.provider).toBe('claude');
  });

  it('roteia OCR de nota fiscal igual à leitura de medidor', () => {
    const decisao = selecionarProvedor({ task: 'ocr_nota_fiscal', contemDadosPessoais: true });
    expect(decisao.primary.model).toBe('gemini-2.5-flash-lite');
  });

  it('roteia redação jurídica para Claude Sonnet sem fallback automático', () => {
    const decisao = selecionarProvedor({ task: 'redacao_documento_juridico', contemDadosPessoais: true });
    expect(decisao.primary.provider).toBe('claude');
    expect(decisao.primary.model).toBe('claude-sonnet-5');
    expect(decisao.fallback).toBeUndefined();
  });

  it('roteia extração de dados de contrato para Claude Sonnet sem fallback automático', () => {
    const decisao = selecionarProvedor({ task: 'extracao_dados_contrato', contemDadosPessoais: true });
    expect(decisao.primary.provider).toBe('claude');
    expect(decisao.primary.model).toBe('claude-sonnet-5');
    expect(decisao.fallback).toBeUndefined();
  });

  it('roteia pergunta livre sobre documento para Claude Sonnet sem fallback automático', () => {
    const decisao = selecionarProvedor({ task: 'pergunta_livre_documento', contemDadosPessoais: true });
    expect(decisao.primary.provider).toBe('claude');
    expect(decisao.primary.model).toBe('claude-sonnet-5');
    expect(decisao.fallback).toBeUndefined();
  });

  it('roteia triagem de SAC para Gemini Flash-Lite, não Grok', () => {
    const decisao = selecionarProvedor({ task: 'triagem_sac_whatsapp', contemDadosPessoais: false });
    expect(decisao.primary.provider).toBe('gemini');
  });

  it('roteia classificação de extrato histórico para Claude Haiku quando não há hardware próprio', () => {
    const decisao = selecionarProvedor({
      task: 'classificacao_extrato_historico',
      contemDadosPessoais: true,
      hardwareOllamaDisponivel: false,
    });
    expect(decisao.primary.provider).toBe('claude');
    expect(decisao.primary.model).toBe('claude-haiku-4-5');
  });

  it('usa Ollama local para extrato histórico quando hardware próprio está disponível', () => {
    const decisao = selecionarProvedor({
      task: 'classificacao_extrato_historico',
      contemDadosPessoais: true,
      hardwareOllamaDisponivel: true,
    });
    expect(decisao.primary.provider).toBe('ollama');
    expect(decisao.fallback?.provider).toBe('claude');
  });

  it('bloqueia roteamento de credit scoring para qualquer provedor de IA', () => {
    expect(() => selecionarProvedor({ task: 'credit_scoring', contemDadosPessoais: true })).toThrowError(
      /não pode ser roteada para IA generativa/,
    );
  });

  it('bloqueia camada gratuita quando a tarefa envolve dado pessoal', () => {
    // Simula uma tentativa de reconfigurar a política para camada gratuita:
    // o teste real de bloqueio está no comportamento da própria função com um
    // provedor cuja tierGratuita seja true. Como a política atual nunca usa
    // camada gratuita por padrão, validamos a garantia via um cenário direto:
    // nenhuma decisão retornada pode ter tierGratuita = true quando
    // contemDadosPessoais é true.
    const tarefas: Array<Parameters<typeof selecionarProvedor>[0]['task']> = [
      'leitura_medidor_energia',
      'ocr_nota_fiscal',
      'redacao_documento_juridico',
      'triagem_sac_whatsapp',
      'classificacao_extrato_historico',
    ];
    for (const task of tarefas) {
      const decisao = selecionarProvedor({ task, contemDadosPessoais: true });
      expect(decisao.primary.tierGratuita).toBe(false);
      if (decisao.fallback) expect(decisao.fallback.tierGratuita).toBe(false);
    }
  });

  it('lança erro para tarefa desconhecida em vez de escolher um provedor arbitrário', () => {
    // @ts-expect-error - testando entrada inválida deliberadamente
    expect(() => selecionarProvedor({ task: 'tarefa_inexistente', contemDadosPessoais: false })).toThrow();
  });

  it('ignora hardwareOllamaDisponivel em tarefas onde essa flag não se aplica', () => {
    // A flag só deveria ter efeito em classificacao_extrato_historico; para
    // qualquer outra tarefa, marcá-la não pode desviar o roteamento para
    // Ollama por engano.
    const decisao = selecionarProvedor({
      task: 'leitura_medidor_energia',
      contemDadosPessoais: true,
      hardwareOllamaDisponivel: true,
    });
    expect(decisao.primary.provider).toBe('gemini');
  });

  it('sempre retorna um motivo não vazio, para toda tarefa permitida (auditabilidade)', () => {
    const tarefasPermitidas: Array<Parameters<typeof selecionarProvedor>[0]['task']> = [
      'leitura_medidor_energia',
      'ocr_nota_fiscal',
      'redacao_documento_juridico',
      'triagem_sac_whatsapp',
      'classificacao_extrato_historico',
    ];
    for (const task of tarefasPermitidas) {
      const decisao = selecionarProvedor({ task, contemDadosPessoais: false });
      expect(decisao.motivo.length).toBeGreaterThan(20);
    }
  });

  it('bloqueia credit scoring mesmo com hardware Ollama disponível (a flag não abre exceção)', () => {
    expect(() =>
      selecionarProvedor({ task: 'credit_scoring', contemDadosPessoais: false, hardwareOllamaDisponivel: true }),
    ).toThrowError(/não pode ser roteada para IA generativa/);
  });
});
