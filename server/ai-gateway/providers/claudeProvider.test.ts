import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const criarMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class AnthropicMock {
    messages = { create: criarMock };
  },
}));

describe('extrairDadosEstruturados', () => {
  const ambienteOriginal = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    criarMock.mockReset();
    process.env.ANTHROPIC_API_KEY = 'chave-de-teste';
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = ambienteOriginal;
  });

  it('devolve os dados extraídos quando a resposta tem um bloco de texto JSON válido', async () => {
    criarMock.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"valorAluguel": 1200.5}' }],
    });

    const { extrairDadosEstruturados } = await import('./claudeProvider');
    const resultado = await extrairDadosEstruturados<{ valorAluguel: number }>({
      modelo: 'claude-sonnet-5',
      sistema: 'Extraia os dados do contrato.',
      texto: '# Contrato...',
      schema: { type: 'object', properties: { valorAluguel: { type: 'number' } } },
    });

    expect(resultado.sucesso).toBe(true);
    expect(resultado.dados).toEqual({ valorAluguel: 1200.5 });
  });

  it('devolve falha explícita quando stop_reason é refusal', async () => {
    criarMock.mockResolvedValue({ stop_reason: 'refusal', content: [] });

    const { extrairDadosEstruturados } = await import('./claudeProvider');
    const resultado = await extrairDadosEstruturados({
      modelo: 'claude-sonnet-5',
      sistema: 'sistema',
      texto: 'texto',
      schema: {},
    });

    expect(resultado.sucesso).toBe(false);
    expect(resultado.erro).toContain('refusal');
  });

  it('devolve falha explícita quando a resposta não tem bloco de texto', async () => {
    criarMock.mockResolvedValue({ stop_reason: 'end_turn', content: [] });

    const { extrairDadosEstruturados } = await import('./claudeProvider');
    const resultado = await extrairDadosEstruturados({
      modelo: 'claude-sonnet-5',
      sistema: 'sistema',
      texto: 'texto',
      schema: {},
    });

    expect(resultado.sucesso).toBe(false);
    expect(resultado.erro).toContain('bloco de texto');
  });

  it('devolve falha explícita quando o texto não é um JSON válido', async () => {
    criarMock.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'isto não é json' }],
    });

    const { extrairDadosEstruturados } = await import('./claudeProvider');
    const resultado = await extrairDadosEstruturados({
      modelo: 'claude-sonnet-5',
      sistema: 'sistema',
      texto: 'texto',
      schema: {},
    });

    expect(resultado.sucesso).toBe(false);
    expect(resultado.erro).toBeTruthy();
  });

  it('devolve falha explícita quando ANTHROPIC_API_KEY não está configurada', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const { extrairDadosEstruturados } = await import('./claudeProvider');
    const resultado = await extrairDadosEstruturados({
      modelo: 'claude-sonnet-5',
      sistema: 'sistema',
      texto: 'texto',
      schema: {},
    });

    expect(resultado.sucesso).toBe(false);
    expect(resultado.erro).toContain('ANTHROPIC_API_KEY');
    expect(criarMock).not.toHaveBeenCalled();
  });
});

describe('responderPergunta', () => {
  const ambienteOriginal = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    criarMock.mockReset();
    process.env.ANTHROPIC_API_KEY = 'chave-de-teste';
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = ambienteOriginal;
  });

  it('devolve a resposta em texto quando a chamada tem sucesso', async () => {
    criarMock.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Sim, a cláusula 8.2 prevê multa rescisória de 3 aluguéis.' }],
    });

    const { responderPergunta } = await import('./claudeProvider');
    const resultado = await responderPergunta({
      modelo: 'claude-sonnet-5',
      sistema: 'Responda com base só no texto do contrato.',
      texto: '# Contrato...',
      pergunta: 'Existe cláusula de multa rescisória?',
    });

    expect(resultado.sucesso).toBe(true);
    expect(resultado.resposta).toContain('multa rescisória');
  });

  it('devolve falha explícita quando stop_reason é refusal', async () => {
    criarMock.mockResolvedValue({ stop_reason: 'refusal', content: [] });

    const { responderPergunta } = await import('./claudeProvider');
    const resultado = await responderPergunta({
      modelo: 'claude-sonnet-5',
      sistema: 'sistema',
      texto: 'texto',
      pergunta: 'pergunta',
    });

    expect(resultado.sucesso).toBe(false);
    expect(resultado.erro).toContain('refusal');
  });

  it('devolve falha explícita quando a resposta não tem bloco de texto', async () => {
    criarMock.mockResolvedValue({ stop_reason: 'end_turn', content: [] });

    const { responderPergunta } = await import('./claudeProvider');
    const resultado = await responderPergunta({
      modelo: 'claude-sonnet-5',
      sistema: 'sistema',
      texto: 'texto',
      pergunta: 'pergunta',
    });

    expect(resultado.sucesso).toBe(false);
    expect(resultado.erro).toContain('bloco de texto');
  });

  it('devolve falha explícita quando ANTHROPIC_API_KEY não está configurada', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const { responderPergunta } = await import('./claudeProvider');
    const resultado = await responderPergunta({
      modelo: 'claude-sonnet-5',
      sistema: 'sistema',
      texto: 'texto',
      pergunta: 'pergunta',
    });

    expect(resultado.sucesso).toBe(false);
    expect(resultado.erro).toContain('ANTHROPIC_API_KEY');
    expect(criarMock).not.toHaveBeenCalled();
  });
});
