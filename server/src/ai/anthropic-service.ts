/**
 * Anthropic AI Service — wrapper ao redor do SDK de Claude
 * Fornece métodos para análise de transações, categorização e detecção de anomalias
 *
 * Usa vision API para análise de recibos e text API para contexto contábil
 */

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../services/logger-service.js";
import {
  SYSTEM_PROMPT_CATEGORIZATION,
  SYSTEM_PROMPT_ANOMALY_DETECTION,
  SYSTEM_PROMPT_RECEIPT_ANALYSIS,
  SYSTEM_PROMPT_CASH_FLOW_ADVICE,
} from "./prompts.js";

export interface TransactionData {
  id?: number;
  descricao: string;
  valor: number;
  data: string;
  tipo_fluxo: "entrada" | "saida";
  beneficiario?: string;
  metodo_pagamento?: string;
  categoria_atual?: string;
}

export interface CategorizationResult {
  categoria: string;
  confianca: number;
  motivo: string;
  subcategorias_alternativas?: string[];
  flags?: string[];
}

export interface AnomalyResult {
  is_anomaly: boolean;
  anomaly_score: number;
  detected_issues: Array<{
    type: "magnitude" | "frequency" | "pattern" | "beneficiary" | "security";
    severity: "low" | "medium" | "high" | "critical";
    description: string;
    evidence: string;
  }>;
  recommendation: string;
  related_transactions?: number[];
}

export interface ReceiptData {
  vendor: string;
  vendor_cnpj?: string;
  data: string;
  itens?: Array<{
    descricao: string;
    quantidade: number;
    valor_unitario: number;
    valor_total: number;
  }>;
  valor_total: number;
  categoria_primaria: string;
  metodo_pagamento?: string;
  confianca: number;
  avisos: string[];
}

export interface CashFlowAnalysis {
  periodo: string;
  receita_media_mensal: number;
  despesa_media_mensal: number;
  margem_liquida: number;
  sazonalidade: {
    detectada: boolean;
    picos?: string[];
    vales?: string[];
  };
  oportunidades: Array<{
    tipo: "reducao_custos" | "aumento_receita" | "investimento";
    descricao: string;
    impacto_estimado: number;
    prioridade: "alta" | "media" | "baixa";
  }>;
  alertas: Array<{
    tipo: "liquidez" | "crescimento" | "eficiencia";
    mensagem: string;
  }>;
  score_saude_financeira: number;
}

export class AnthropicAIService {
  private client: Anthropic;
  private model: string = "claude-3-5-sonnet-20241022";
  private modelVision: string = "claude-3-5-sonnet-20241022"; // Vision-capable model

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error("ANTHROPIC_API_KEY não configurada em variáveis de ambiente");
    }
    this.client = new Anthropic({ apiKey: key });
  }

  /**
   * Analisa uma transação e sugere categoria contábil
   * Leva em conta histórico e keywords para melhor precisão
   */
  async categorizeTransaction(
    transaction: TransactionData,
    historicalContext?: {
      ultima_categoria?: string;
      categorias_similares?: string[];
      media_valor_categoria?: number;
    }
  ): Promise<CategorizationResult> {
    try {
      const contextStr = historicalContext
        ? `Histórico: categoria anterior: ${historicalContext.ultima_categoria}, categorias similares: ${historicalContext.categorias_similares?.join(", ")}, valor médio: R$ ${historicalContext.media_valor_categoria}`
        : "Sem histórico anterior.";

      const userPrompt = `
Categorize esta transação:
- Descrição: ${transaction.descricao}
- Valor: R$ ${transaction.valor.toFixed(2)}
- Data: ${transaction.data}
- Fluxo: ${transaction.tipo_fluxo}
- Beneficiário: ${transaction.beneficiario || "N/A"}
- ${contextStr}

Responda APENAS em JSON válido, sem explicações adicionais.`;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 500,
        system: SYSTEM_PROMPT_CATEGORIZATION,
        messages: [{ role: "user", content: userPrompt }],
      });

      const jsonStr = this.extractJSON(response.content[0]);
      const result: CategorizationResult = JSON.parse(jsonStr);

      logger.info("[AI] Transação categorizada", {
        transacaoId: transaction.id,
        categoria: result.categoria,
        confianca: result.confianca,
      });

      return result;
    } catch (error) {
      logger.error("[AI] Erro ao categorizar transação", {
        transacaoId: transaction.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Detecta anomalias em uma transação usando análise estatística + IA
   */
  async detectAnomaly(
    transaction: TransactionData,
    historicalData: {
      transacoes_similares_ultimos_30d?: number;
      valor_medio_categoria?: number;
      valor_maximo_categoria?: number;
      desvio_padrao?: number;
      ultimas_transacoes?: TransactionData[];
    }
  ): Promise<AnomalyResult> {
    try {
      const userPrompt = `
Analise esta transação para detectar anomalias:
- Descrição: ${transaction.descricao}
- Valor: R$ ${transaction.valor.toFixed(2)}
- Data: ${transaction.data}
- Fluxo: ${transaction.tipo_fluxo}

Contexto histórico:
- Transações similares últimos 30d: ${historicalData.transacoes_similares_ultimos_30d || 0}
- Valor médio: R$ ${historicalData.valor_medio_categoria?.toFixed(2) || "N/A"}
- Valor máximo anterior: R$ ${historicalData.valor_maximo_categoria?.toFixed(2) || "N/A"}
- Desvio padrão: R$ ${historicalData.desvio_padrao?.toFixed(2) || "N/A"}

Responda APENAS em JSON válido.`;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 800,
        system: SYSTEM_PROMPT_ANOMALY_DETECTION,
        messages: [{ role: "user", content: userPrompt }],
      });

      const jsonStr = this.extractJSON(response.content[0]);
      const result: AnomalyResult = JSON.parse(jsonStr);

      logger.info("[AI] Anomalia detectada", {
        transacaoId: transaction.id,
        isAnomaly: result.is_anomaly,
        score: result.anomaly_score,
      });

      return result;
    } catch (error) {
      logger.error("[AI] Erro ao detectar anomalia", {
        transacaoId: transaction.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Analisa imagem de recibo usando Claude Vision
   * Extrai dados estruturados (vendor, valor, itens, etc)
   */
  async analyzeReceipt(
    imageBase64: string,
    imageMediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg"
  ): Promise<ReceiptData> {
    try {
      const userPrompt = `
Analise esta imagem de recibo/nota fiscal e extraia os dados em JSON.

Instruções:
- Extraia: vendor/fornecedor, data, valor total, itens (se visível)
- Inclua CNPJ se visível
- Categorize o tipo de despesa
- Indique confiança em percentual
- Liste avisos se a imagem estiver ruim ou ilegível

Responda APENAS em JSON válido.`;

      const response = await this.client.messages.create({
        model: this.modelVision,
        max_tokens: 1000,
        system: SYSTEM_PROMPT_RECEIPT_ANALYSIS,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: imageMediaType,
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: userPrompt,
              },
            ],
          },
        ],
      });

      const jsonStr = this.extractJSON(response.content[0]);
      const result: ReceiptData = JSON.parse(jsonStr);

      logger.info("[AI] Recibo analisado", {
        vendor: result.vendor,
        valor: result.valor_total,
        confianca: result.confianca,
      });

      return result;
    } catch (error) {
      logger.error("[AI] Erro ao analisar recibo", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Analisa fluxo de caixa e fornece recomendações
   * Identifica padrões, sazonalidade e oportunidades
   */
  async analyzeCashFlow(
    transactions: TransactionData[],
    period: { desde: string; ate: string }
  ): Promise<CashFlowAnalysis> {
    try {
      // Calcula agregações básicas
      const receitas = transactions
        .filter((t) => t.tipo_fluxo === "entrada")
        .reduce((sum, t) => sum + t.valor, 0);
      const despesas = transactions
        .filter((t) => t.tipo_fluxo === "saida")
        .reduce((sum, t) => sum + t.valor, 0);
      const meses = new Set(transactions.map((t) => t.data.substring(0, 7)));

      const userPrompt = `
Analise o fluxo de caixa para o período ${period.desde} a ${period.ate}:

Transações (amostra de ${transactions.length}):
${transactions
  .slice(0, 20)
  .map((t) => `- ${t.data} [${t.tipo_fluxo}] R$ ${t.valor.toFixed(2)} - ${t.descricao}`)
  .join("\n")}

Agregados:
- Total receitas: R$ ${receitas.toFixed(2)}
- Total despesas: R$ ${despesas.toFixed(2)}
- Meses analisados: ${meses.size}

Forneça análise em JSON com: sazonalidade, oportunidades de otimização, alertas de liquidez, score de saúde.
Responda APENAS em JSON válido.`;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1500,
        system: SYSTEM_PROMPT_CASH_FLOW_ADVICE,
        messages: [{ role: "user", content: userPrompt }],
      });

      const jsonStr = this.extractJSON(response.content[0]);
      const result: CashFlowAnalysis = JSON.parse(jsonStr);

      logger.info("[AI] Fluxo de caixa analisado", {
        periodo: `${period.desde} a ${period.ate}`,
        receita_media: result.receita_media_mensal,
        score_saude: result.score_saude_financeira,
      });

      return result;
    } catch (error) {
      logger.error("[AI] Erro ao analisar fluxo de caixa", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Chat interativo sobre dados financeiros
   * Permite perguntas livres com contexto contábil
   */
  async financialChat(
    query: string,
    conversationHistory?: Array<{ role: string; content: string }>
  ): Promise<string> {
    try {
      const systemPrompt = `Você é um consultor financeiro especializado em contabilidade brasileira.
Responda perguntas sobre finanças, imposto, contabilidade e estratégia financeira com clareza e precisão.
Quando apropriado, cite números e exemplos concretos do contexto do usuário.
Sempre recomende confirmação com um contador ou advogado para questões complexas.`;

      const messages = conversationHistory
        ? conversationHistory.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }))
        : [];

      messages.push({ role: "user", content: query });

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1000,
        system: systemPrompt,
        messages,
      });

      const answer = response.content[0].type === "text" ? response.content[0].text : "";

      logger.info("[AI] Chat respondido", {
        queryLength: query.length,
        responseLength: answer.length,
      });

      return answer;
    } catch (error) {
      logger.error("[AI] Erro no chat financeiro", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Helper: extrai JSON de uma resposta de Claude
   * Lida com respostas que incluem ```json ... ``` ou JSON puro
   */
  private extractJSON(content: Anthropic.ContentBlock): string {
    if (content.type !== "text") {
      throw new Error("Resposta de Claude não contém texto");
    }

    let text = content.text;

    // Tenta remover markdown code blocks se presentes
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      text = jsonMatch[1];
    }

    // Valida e limpa
    text = text.trim();
    if (!text.startsWith("{")) {
      // Tenta encontrar JSON dentro da resposta
      const bracketIndex = text.indexOf("{");
      if (bracketIndex === -1) {
        throw new Error("Nenhum JSON encontrado na resposta de Claude");
      }
      text = text.substring(bracketIndex);
    }

    return text;
  }
}

// Singleton instance
let serviceInstance: AnthropicAIService | null = null;

export function getAnthropicService(): AnthropicAIService {
  if (!serviceInstance) {
    serviceInstance = new AnthropicAIService();
  }
  return serviceInstance;
}

export function initializeAnthropicService(apiKey?: string): AnthropicAIService {
  serviceInstance = new AnthropicAIService(apiKey);
  return serviceInstance;
}
