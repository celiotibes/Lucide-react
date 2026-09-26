// Tipos compartilhados do roteador de IA multi-provedor.
//
// Objetivo do módulo (src/domain/ia/): permitir alternar entre vários provedores de IA
// (Anthropic/Claude, OpenAI/ChatGPT, Google/Gemini, Ollama local) sem esgotar a cota de um
// só, escalando para um provedor pago apenas quando o caminho barato (OCR local + modelo
// local) não dá conta — e registrando de forma auditável qual provedor decidiu o quê.

export type IdProvedorIA = "anthropic" | "openai" | "google" | "ollama";

export interface RespostaProvedorIA {
  texto: string;
  /** Tokens de entrada/saída quando o provedor os informa na resposta — usados só para a
   * estimativa de custo exibida na tela de configuração (ver proveniencia.ts). Ausente para
   * Ollama (local, sem conceito de custo por token equivalente). */
  tokensEntrada?: number;
  tokensSaida?: number;
}

export interface OpcoesChamadaProvedor {
  modelo: string;
  /** Chave de API do provedor. NUNCA deve vir de uma variável VITE_ (embutida no bundle) —
   * ver o aviso extenso em config.ts sobre de onde isto deve vir em produção. */
  apiKey?: string;
  /** Endpoint HTTP do provedor. Único uso real hoje é Ollama (roda em localhost por padrão),
   * mas também serve para apontar qualquer provedor para um proxy/backend próprio. */
  baseUrl?: string;
  maxTokens?: number;
  sinal?: AbortSignal;
}

/** Contrato único que todo provedor implementa — é o que permite ao roteador tratá-los de
 * forma intercambiável (rodízio, fallback) sem `if` por provedor no resto do sistema. */
export interface DefinicaoProvedorIA {
  id: IdProvedorIA;
  nome: string;
  /** true = roda na máquina do usuário (Ollama): sem custo por token e nenhum dado sai do
   * navegador/host local. false = provedor pago na nuvem — chamas custam e enviam o prompt
   * a um terceiro (por isso o limite de 1000 caracteres e a lista do que nunca é enviado,
   * preservados de classificarComIA.ts). */
  local: boolean;
  modeloPadrao: string;
  chamar: (prompt: string, opcoes: OpcoesChamadaProvedor) => Promise<RespostaProvedorIA>;
}

export type ConfiancaClassificacao = "alta" | "media" | "baixa";

export interface ResultadoClassificacaoIA {
  tipo?: string;
  nomeContraparte?: string;
  confianca?: ConfiancaClassificacao;
  explicacao?: string;
}
