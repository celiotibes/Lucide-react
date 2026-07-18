// Tipos do gateway de IA. Ver docs/07-selecao-de-ia-e-custos.md para a
// análise que embasa cada decisão de roteamento codificada em policy.ts.

export type TaskType =
  | 'leitura_medidor_energia'
  | 'ocr_nota_fiscal'
  | 'redacao_documento_juridico'
  | 'triagem_sac_whatsapp'
  | 'classificacao_extrato_historico'
  | 'credit_scoring';

export type ProviderId = 'gemini' | 'claude' | 'ollama';

export interface ModelRef {
  provider: ProviderId;
  model: string;
  /** Camada gratuita (ex.: Google AI Studio sem faturamento) treina com os dados enviados. */
  tierGratuita: boolean;
}

export interface RoutingDecision {
  primary: ModelRef;
  fallback?: ModelRef;
  /** Por que esta decisão foi tomada — para auditoria, não é só metadado decorativo. */
  motivo: string;
}

export interface TaskRequestContext {
  task: TaskType;
  /**
   * Marque true sempre que o conteúdo enviado identifica uma pessoa física
   * (foto de medidor de um imóvel habitado, extrato bancário, CPF, nome de
   * inquilino/investidor). Isso é o gatilho do bloqueio de camada gratuita.
   */
  contemDadosPessoais: boolean;
  /**
   * Só relevante para 'classificacao_extrato_historico': autoriza o uso de
   * Ollama local em vez de API paga, e só deve ser true se você já possuir
   * hardware ocioso rodando o modelo — ver doc 07 ("Ressalva sobre Ollama").
   */
  hardwareOllamaDisponivel?: boolean;
}
