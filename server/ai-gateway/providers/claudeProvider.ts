// Primeira implementação HTTP real do ai-gateway (README.md deste diretório
// dizia explicitamente que os adapters ficariam para quando entrassem em uso
// real). Dois usos hoje: extração estruturada de dados de contrato (Fase 4,
// output_config.format/json_schema) e pergunta livre sobre um documento
// (Fase 7, resposta em texto simples).
//
// Este módulo NUNCA decide sozinho: quem chama é responsável por tratar o
// resultado como proposta sujeita a validação do operador (ver
// server/documentos/extrairDadosContrato.ts) — nunca grava direto no
// cadastro do contrato.

import Anthropic from '@anthropic-ai/sdk';

let cliente: Anthropic | null = null;

function obterCliente(): Anthropic {
  if (!cliente) {
    const chave = process.env.ANTHROPIC_API_KEY;
    if (!chave) {
      throw new Error('ANTHROPIC_API_KEY não configurada no ambiente.');
    }
    cliente = new Anthropic({ apiKey: chave });
  }
  return cliente;
}

export interface ResultadoExtracaoIA<T> {
  sucesso: boolean;
  dados?: T;
  erro?: string;
}

export interface ParametrosExtracaoEstruturada {
  modelo: string;
  sistema: string;
  texto: string;
  schema: Record<string, unknown>;
}

export async function extrairDadosEstruturados<T>(
  params: ParametrosExtracaoEstruturada,
): Promise<ResultadoExtracaoIA<T>> {
  try {
    const resposta = await obterCliente().messages.create({
      model: params.modelo,
      max_tokens: 8000,
      system: params.sistema,
      messages: [{ role: 'user', content: params.texto }],
      output_config: {
        format: { type: 'json_schema', schema: params.schema },
      },
    });

    if (resposta.stop_reason === 'refusal') {
      return { sucesso: false, erro: 'O modelo recusou a solicitação (stop_reason=refusal).' };
    }

    const blocoTexto = resposta.content.find(
      (bloco): bloco is Anthropic.TextBlock => bloco.type === 'text',
    );
    if (!blocoTexto) {
      return { sucesso: false, erro: 'Resposta da IA não contém bloco de texto com o JSON esperado.' };
    }

    const dados = JSON.parse(blocoTexto.text) as T;
    return { sucesso: true, dados };
  } catch (erro) {
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido ao chamar a API da Claude',
    };
  }
}

export interface ResultadoRespostaIA {
  sucesso: boolean;
  resposta?: string;
  erro?: string;
}

export interface ParametrosPerguntaLivre {
  modelo: string;
  sistema: string;
  texto: string;
  pergunta: string;
}

/**
 * Pergunta livre em texto sobre um documento (Fase 7) — sem
 * output_config.format porque a resposta é prosa, não um objeto
 * estruturado. Mesma disciplina do resto do gateway: nunca decide nada
 * sozinho, só devolve texto para o operador ler.
 */
export async function responderPergunta(params: ParametrosPerguntaLivre): Promise<ResultadoRespostaIA> {
  try {
    const resposta = await obterCliente().messages.create({
      model: params.modelo,
      max_tokens: 2000,
      system: params.sistema,
      messages: [{ role: 'user', content: `${params.texto}\n\n---\n\nPergunta: ${params.pergunta}` }],
    });

    if (resposta.stop_reason === 'refusal') {
      return { sucesso: false, erro: 'O modelo recusou a solicitação (stop_reason=refusal).' };
    }

    const blocoTexto = resposta.content.find(
      (bloco): bloco is Anthropic.TextBlock => bloco.type === 'text',
    );
    if (!blocoTexto) {
      return { sucesso: false, erro: 'Resposta da IA não contém bloco de texto.' };
    }

    return { sucesso: true, resposta: blocoTexto.text };
  } catch (erro) {
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido ao chamar a API da Claude',
    };
  }
}
