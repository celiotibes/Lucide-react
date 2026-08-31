// Regras de roteamento de IA por tarefa. Cada decisão está justificada em
// docs/07-selecao-de-ia-e-custos.md — este arquivo é a versão executável
// daquela análise, não uma escolha nova. Mudar uma linha aqui sem atualizar
// o doc (ou vice-versa) é considerado um bug de processo.

import type { ModelRef, ProviderId, RoutingDecision, TaskRequestContext, TaskType } from './types';

const GEMINI_FLASH_LITE_PAGO: ModelRef = {
  provider: 'gemini',
  model: 'gemini-2.5-flash-lite',
  tierGratuita: false,
};

const CLAUDE_HAIKU: ModelRef = {
  provider: 'claude',
  model: 'claude-haiku-4-5',
  tierGratuita: false,
};

const CLAUDE_SONNET: ModelRef = {
  provider: 'claude',
  model: 'claude-sonnet-5',
  tierGratuita: false,
};

const OLLAMA_LOCAL: ModelRef = {
  provider: 'ollama',
  model: 'qwen3-vl:8b',
  tierGratuita: false, // não é "gratuito" no sentido de treino de dados de terceiro; custo é o hardware
};

/** Tarefas que este gateway se recusa a rotear para IA generativa, e por quê. */
const TAREFAS_BLOQUEADAS: Partial<Record<TaskType, string>> = {
  credit_scoring:
    'Credit scoring é um problema de classificação estatística sobre dados estruturados, ' +
    'não uma tarefa de linguagem natural. Usar um LLM aqui trocaria um modelo auditável e ' +
    'explicável (exigência do Art. 20 da LGPD para decisão automatizada) por uma caixa-preta. ' +
    'Ver docs/07-selecao-de-ia-e-custos.md, seção "Credit scoring do inquilino".',
};

function decisaoBase(task: TaskType, ctx: TaskRequestContext): RoutingDecision {
  switch (task) {
    case 'leitura_medidor_energia':
    case 'ocr_nota_fiscal':
      return {
        primary: GEMINI_FLASH_LITE_PAGO,
        fallback: CLAUDE_HAIKU,
        motivo:
          'OCR estruturado de baixo custo por chamada; camada paga do Gemini não treina com os ' +
          'dados enviados (diferente da camada gratuita). Confirmação humana continua obrigatória ' +
          'antes de qualquer fatura — este gateway só acelera a leitura, nunca decide sozinho.',
      };

    case 'redacao_documento_juridico':
      return {
        primary: CLAUDE_SONNET,
        motivo:
          'Volume baixo (~20 documentos/mês) e custo de erro alto (cláusula mal redigida em ' +
          'documento com efeito jurídico). Sem fallback automático: revisão humana/jurídica é ' +
          'sempre obrigatória antes de assinatura, então um "plano B" automatizado não agrega.',
      };

    case 'triagem_sac_whatsapp':
      return {
        primary: GEMINI_FLASH_LITE_PAGO,
        fallback: CLAUDE_HAIKU,
        motivo:
          'Mesmo provedor já usado para OCR, reduzindo superfícies a manter. Grok 4.1 Fast é ' +
          'competitivo em preço para texto puro, mas não compensa integrar um quarto provedor ' +
          'para economizar frações de centavo no volume atual — revisitar se o volume de ' +
          'mensagens passar de milhares por dia.',
      };

    case 'extracao_dados_contrato':
      return {
        primary: CLAUDE_SONNET,
        motivo:
          'Extração estruturada de valores (aluguel, caução, custos obrigatórios, índice de ' +
          'reajuste) a partir do texto do contrato convertido para Markdown. Mesmo raciocínio de ' +
          'redacao_documento_juridico: volume baixo, custo de erro alto (valor errado de aluguel ' +
          'vira fatura errada), e o resultado SEMPRE aguarda validação humana antes de preencher ' +
          'o cadastro do contrato (nunca é gravado direto) — um "plano B" automatizado não agrega. ' +
          'Sem fallback automático pelo mesmo motivo.',
      };

    case 'pergunta_livre_documento':
      return {
        primary: CLAUDE_SONNET,
        motivo:
          'Pergunta livre em texto sobre um documento de contrato/aditivo/comunicação já convertido para ' +
          'Markdown — mesmo risco de redacao_documento_juridico e extracao_dados_contrato: uma resposta errada ' +
          'sobre cláusula contratual pode levar o operador a uma decisão errada. Sem fallback automático pelo ' +
          'mesmo motivo dessas duas tarefas.',
      };

    case 'classificacao_extrato_historico':
      if (ctx.hardwareOllamaDisponivel) {
        return {
          primary: OLLAMA_LOCAL,
          fallback: CLAUDE_HAIKU,
          motivo:
            'Hardware ocioso disponível: custo marginal zero e nenhum dado sai do seu ambiente. ' +
            'Fallback para Claude Haiku se a classificação local tiver baixa confiança.',
        };
      }
      return {
        primary: CLAUDE_HAIKU,
        motivo:
          'Sem hardware próprio disponível, montar infraestrutura de inferência local para um ' +
          'processo pontual de reconstituição não compensa. Claude API nunca treina com dados ' +
          'em nenhum tier — postura de privacidade forte sem custo de infraestrutura. Resultado ' +
          'sempre em staging, nunca postado direto na DRE oficial (ver docs/01, item 8).',
      };

    default:
      // Nunca deveria chegar aqui: credit_scoring é barrado antes de decisaoBase() ser chamada.
      throw new Error(`Tarefa sem política de roteamento definida: ${task}`);
  }
}

export function selecionarProvedor(ctx: TaskRequestContext): RoutingDecision {
  const bloqueio = TAREFAS_BLOQUEADAS[ctx.task];
  if (bloqueio) {
    throw new Error(`Tarefa "${ctx.task}" não pode ser roteada para IA generativa: ${bloqueio}`);
  }

  const decisao = decisaoBase(ctx.task, ctx);

  if (ctx.contemDadosPessoais) {
    for (const ref of [decisao.primary, decisao.fallback].filter(Boolean) as ModelRef[]) {
      if (ref.tierGratuita) {
        throw new Error(
          `Bloqueado: a tarefa "${ctx.task}" envolve dado pessoal, mas o modelo ${ref.provider}/` +
            `${ref.model} está configurado na camada gratuita, que treina com o conteúdo enviado ` +
            '(risco de LGPD). Configure a chave com faturamento ativo. Ver docs/07-selecao-de-ia-e-custos.md.',
        );
      }
    }
  }

  return decisao;
}

export function listarProvedoresConhecidos(): ProviderId[] {
  return ['gemini', 'claude', 'ollama'];
}
