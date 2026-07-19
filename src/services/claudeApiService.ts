// FASE 11: Claude API Integration via MCP
// Service for calling Claude API for contract analysis and other AI tasks

export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ClaudeResponse {
  content: string
  stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence'
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

export class ClaudeApiService {
  private static apiKey = import.meta.env.VITE_CLAUDE_API_KEY || ''
  private static model = 'claude-opus-4-1'
  private static apiUrl = 'https://api.anthropic.com/v1/messages'
  private static timeout = 60000 // 60s timeout for analysis

  /**
   * Calls Claude API with a prompt and returns structured response
   */
  static async callApi(
    prompt: string,
    systemPrompt?: string,
    maxTokens = 4096,
  ): Promise<ClaudeResponse> {
    const messages: ClaudeMessage[] = [{ role: 'user', content: prompt }]

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    }

    const body = {
      model: this.model,
      max_tokens: maxTokens,
      messages,
      ...(systemPrompt && { system: systemPrompt }),
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Claude API error: ${error.error?.message || response.statusText}`)
      }

      const data = await response.json()

      return {
        content: data.content[0].text,
        stopReason: data.stop_reason,
        usage: data.usage,
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Claude API request timeout (60s)')
        }
        throw error
      }
      throw new Error('Unknown error calling Claude API')
    }
  }

  /**
   * Analyzes contract markdown and extracts structured data
   * Specifically designed for contract analysis with JSON response
   */
  static async analisarContrato(markdownText: string): Promise<string> {
    const systemPrompt = `Você é um especialista em análise de contratos imobiliários brasileiros.
Sua tarefa é extrair informações estruturadas de contratos de aluguel.
Responda SEMPRE em JSON válido, sem markdown, sem explicações adicionais.`

    const prompt = `Analise o seguinte contrato de aluguel e extraia as informações solicitadas.

CONTRATO:
${markdownText}

SOLICITAÇÕES DE EXTRAÇÃO (retorne JSON estruturado):

1. PARTES DO CONTRATO
   - Locador (proprietário)
   - Locatário (inquilino)
   - Imobiliária (se houver)

2. DADOS DO IMÓVEL
   - Endereço completo
   - Tipo (apartamento, casa, etc)
   - CEP
   - Cidade
   - Estado

3. VALORES MONETÁRIOS (procure por R$ ou valores em português)
   - Aluguel mensal
   - Caução/Depósito caução
   - Taxa de administração
   - Seguro incêndio
   - IPTU (se pago pelo locatário)
   - Outras despesas

4. DATAS IMPORTANTES
   - Data de início (vigência)
   - Data de término
   - Data de renovação/reajuste
   - Dia de vencimento do aluguel (1º, 5º, 10º, etc)

5. ÍNDICES DE ATUALIZAÇÃO
   - Tipo de índice (IPCA, IGP-M, outra)
   - Percentual anual de reajuste
   - Mês do reajuste

6. CLÁUSULAS IMPORTANTES
   - Permite animais de estimação? (sim/não)
   - Permite reforma/pintura? (sim/não)
   - Fiança obrigatória? (sim/não)
   - Avalista obrigatório? (sim/não)
   - Multa por rescisão antecipada (valor ou %)
   - Dias de aviso prévio necessários

7. CUSTOS OBRIGATÓRIOS PREVISTOS
   - Liste todos os custos que o locatário deve arcar

RESPONDA EM JSON VÁLIDO COM A SEGUINTE ESTRUTURA:
{
  "partes": {
    "locador": "...",
    "locatario": "...",
    "imobiliaria": "..."
  },
  "imovel": {
    "endereco": "...",
    "complemento": "...",
    "cep": "...",
    "cidade": "...",
    "estado": "...",
    "tipo": "..."
  },
  "valores": {
    "aluguel": número,
    "caução": número,
    "taxa_administracao": número,
    "seguro_incendio": número,
    "iptu": número,
    "outras_despesas": número
  },
  "datas": {
    "data_inicio": "YYYY-MM-DD ou null",
    "data_fim": "YYYY-MM-DD ou null",
    "data_renovacao": "YYYY-MM-DD ou null",
    "dia_vencimento_aluguel": número (1-31) ou null
  },
  "indices": {
    "indice_tipo": "IPCA|IGP-M|outro|null",
    "indice_anual": número (%) ou null,
    "mes_reajuste": número (1-12) ou null
  },
  "clausulas": {
    "permite_animais": boolean ou null,
    "permite_reforma": boolean ou null,
    "fianca_obrigatoria": boolean ou null,
    "avalista_obrigatorio": boolean ou null,
    "multa_rescisao": número ou null,
    "dias_aviso_previo": número ou null
  },
  "custos_obrigatorios": ["custo1", "custo2", ...],
  "questoes_validacao": ["pergunta1 para validação manual", "pergunta2", ...],
  "confianca_extracao": número (0-100),
  "avisos": ["aviso1", "aviso2", ...],
  "resumo": "breve resumo do contrato"
}

IMPORTANTE:
- Use null para valores não encontrados
- Converta valores monetários para números (remova R$, .)
- Converta datas para formato ISO (YYYY-MM-DD)
- Se o contrato não for de aluguel residencial, indique isso em avisos
- Gere questões para validação manual quando houver ambiguidade
- Retorne APENAS JSON, sem markdown ou explicação adicional`

    const response = await this.callApi(prompt, systemPrompt, 4096)
    return response.content
  }

  /**
   * Compares two contract versions for renewal analysis
   */
  static async compararRenovacao(
    contratoOriginal: string,
    contratoRenovado: string,
  ): Promise<string> {
    const prompt = `Compare os dois contratos de aluguel abaixo e identifique as mudanças principais, especialmente em relação a:
- Valores de aluguel e reajuste
- Datas de início e fim
- Índices de atualização
- Mudanças em cláusulas importantes
- Alterações em custos obrigatórios

CONTRATO ORIGINAL:
${contratoOriginal}

CONTRATO RENOVADO:
${contratoRenovado}

Forneça análise em JSON com:
{
  "mudancas_principais": [...],
  "aluguel_anterior": número,
  "aluguel_novo": número,
  "percentual_aumento": número,
  "indice_aplicado": "...",
  "questoes_atencao": [...],
  "recomendacoes": [...]
}`

    const response = await this.callApi(prompt)
    return response.content
  }

  /**
   * Calculates IPCA adjustment for contracts
   */
  static async calcularIPCA(
    dataInicio: string,
    dataFim: string,
    valorOriginal: number,
  ): Promise<string> {
    const prompt = `Calcule a atualização IPCA para:
- Período: ${dataInicio} a ${dataFim}
- Valor original: R$ ${valorOriginal.toFixed(2)}

Retorne em JSON:
{
  "valor_original": número,
  "indice_ipca": número,
  "percentual_acumulado": número,
  "valor_atualizado": número,
  "detalhes": "explicação do cálculo"
}`

    const response = await this.callApi(prompt)
    return response.content
  }

  /**
   * Validates if API key is configured
   */
  static isConfigured(): boolean {
    return !!this.apiKey && this.apiKey !== ''
  }

  /**
   * Sets API key (for runtime configuration)
   */
  static setApiKey(key: string): void {
    this.apiKey = key
  }
}
