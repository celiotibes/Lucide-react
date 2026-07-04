/**
 * Serviço Assistente IA
 * Integração com Claude API para análise jurídica avançada
 * Sugestão de hermenêutica, previsão de contestações, blindagem preemptiva
 */

import type { FatoProva, AnalisejurimetricaResult } from '@/types/jurimetriaBR'

export interface PropostaHermenautica {
  ethos: string // Argumento de credibilidade
  pathos: string // Argumento emocional/justiça
  logos: string // Argumento lógico
  kairos: string // Argumento de oportunidade
}

export interface ContestacaoEsperada {
  titulo: string
  probabilidade: 'alta' | 'media' | 'baixa'
  descricao: string
  contraproposta: string // Nossa resposta
  citacaoJurisprudencia: string // Jurisprudência que nos protege
}

export interface SugestaoBlindagem {
  fato: string
  risco: string
  estrategia: string
  documentacaoSugerida: string[]
}

export interface ResumoExecutivoGerado {
  tesecentral: string
  pontosFortes: string[]
  pontosFrageis: string[]
  estrategiaGeral: string
  chavedeSucesso: string
}

export class ServicoAssistenteIA {
  private static apiKey: string = process.env.VITE_CLAUDE_API_KEY || ''
  private static baseUrl: string = 'https://api.anthropic.com/v1'

  /**
   * Gera proposta de hermenêutica blindada com os 4 pilares
   */
  static async gerarHermenauticaBlindada(
    fatos: FatoProva[],
    analise: AnalisejurimetricaResult,
    tituloAcao: string
  ): Promise<PropostaHermenautica> {
    const prompt = this._construirPromptHermenautica(fatos, analise, tituloAcao)

    const resposta = await this._chamarClaudeAPI(prompt)

    // Parse resposta JSON
    const hermenautica = JSON.parse(resposta) as PropostaHermenautica

    return hermenautica
  }

  /**
   * Prediz contestações esperadas e gera respostas
   */
  static async preverContestacoes(
    fatos: FatoProva[],
    analise: AnalisejurimetricaResult,
    teseAutor: string
  ): Promise<ContestacaoEsperada[]> {
    const prompt = this._construirPromptContestacoes(fatos, analise, teseAutor)

    const resposta = await this._chamarClaudeAPI(prompt)

    // Parse resposta JSON (array)
    const contestacoes = JSON.parse(resposta) as ContestacaoEsperada[]

    return contestacoes
  }

  /**
   * Gera sugestões de blindagem para pontos frágeis
   */
  static async gerarSugestoesBlindagem(
    fatos: FatoProva[],
    analise: AnalisejurimetricaResult,
    lacunasIdentificadas: any[]
  ): Promise<SugestaoBlindagem[]> {
    const prompt = this._construirPromptBlindagem(fatos, analise, lacunasIdentificadas)

    const resposta = await this._chamarClaudeAPI(prompt)

    // Parse resposta JSON (array)
    const sugestoes = JSON.parse(resposta) as SugestaoBlindagem[]

    return sugestoes
  }

  /**
   * Gera resumo executivo completo
   */
  static async gerarResumoExecutivo(
    fatos: FatoProva[],
    analise: AnalisejurimetricaResult,
    objetivoAcao: string
  ): Promise<ResumoExecutivoGerado> {
    const prompt = this._construirPromptResumo(fatos, analise, objetivoAcao)

    const resposta = await this._chamarClaudeAPI(prompt)

    // Parse resposta JSON
    const resumo = JSON.parse(resposta) as ResumoExecutivoGerado

    return resumo
  }

  /**
   * Análise crítica de petição existente
   */
  static async analisarCriticaPeticao(htmlPeticao: string): Promise<{
    forcasIdentificadas: string[]
    fraquezasIdentificadas: string[]
    sugestoesImprovement: string[]
    riscosProcessuais: string[]
  }> {
    const prompt = `
Analyze this legal petition for judicial strategy and structure. Identify:

1. Strengths in argumentation
2. Weaknesses that could be exploited
3. Improvement suggestions
4. Procedural risks

Return JSON with keys: forcasIdentificadas, fraquezasIdentificadas, sugestoesImprovement, riscosProcessuais

PETITION HTML:
${htmlPeticao}

Respond ONLY with valid JSON.
    `

    const resposta = await this._chamarClaudeAPI(prompt)
    return JSON.parse(resposta)
  }

  // ==================== PROMPTS ====================

  private static _construirPromptHermenautica(
    fatos: FatoProva[],
    analise: AnalisejurimetricaResult,
    tituloAcao: string
  ): string {
    const fatosTexto = fatos
      .map(
        (f, idx) =>
          `F${idx + 1}: ${f.descricao} (Certeza: ${f.grauCerteza}%, Peso: ${f.peso || 1}/5)`
      )
      .join('\n')

    return `
You are a expert Brazilian judicial strategist specialized in creating "Hermenêutica Blindada" (Armored Hermeneutics) - a sophisticated argumentation framework with 4 pillars.

Case: ${tituloAcao}
Score: ${analise.scorejurimetrico?.toFixed(0) || 'N/A'}/100
Facts:
${fatosTexto}

Create a Hermenêutica Blindada proposal with exactly 4 pillars:

1. ETHOS (Credibility/Authority): Build authority through proven facts and expert testimony
2. PATHOS (Justice/Emotion): Appeal to justice and fairness principles
3. LOGOS (Logic/Reason): Construct irrefutable logical chain (Major Premise → Minor Premise → Conclusion)
4. KAIROS (Timing/Opportunity): Emphasize temporal urgency and opportunity costs

Return ONLY this JSON:
{
  "ethos": "1-2 paragraph argument focusing on credibility",
  "pathos": "1-2 paragraph argument focusing on justice appeal",
  "logos": "1-2 paragraph argument with logical structure",
  "kairos": "1-2 paragraph argument with timing/opportunity"
}
    `
  }

  private static _construirPromptContestacoes(
    fatos: FatoProva[],
    analise: AnalisejurimetricaResult,
    teseAutor: string
  ): string {
    const fatosTexto = fatos
      .map(
        (f, idx) =>
          `F${idx + 1}: ${f.descricao} (Certeza: ${f.grauCerteza}%)`
      )
      .join('\n')

    return `
Predict likely contestations (challenges) to this legal thesis and prepare responses.

Author's Thesis: ${teseAutor}

Supporting Facts:
${fatosTexto}

Strength Score: ${analise.scorejurimetrico?.toFixed(0) || 'N/A'}/100
Proof Gaps: ${analise.lacunas?.length || 0}

Predict 3-5 likely contestations and for each provide:
- Probability (alta/media/baixa)
- Our preemptive response with jurisprudence

Return ONLY this JSON array:
[
  {
    "titulo": "Expected contestation claim",
    "probabilidade": "alta|media|baixa",
    "descricao": "What opponent will likely argue",
    "contraproposta": "Our counter-argument (2-3 sentences)",
    "citacaoJurisprudencia": "Relevant case law supporting our position"
  }
]
    `
  }

  private static _construirPromptBlindagem(
    fatos: FatoProva[],
    analise: AnalisejurimetricaResult,
    lacunasIdentificadas: any[]
  ): string {
    const lacunasTexto =
      lacunasIdentificadas?.map((l) => `- ${l.fato}: ${l.risco}`).join('\n') ||
      'Nenhuma lacuna crítica'

    return `
Generate strategic reinforcement suggestions for weak points in this case.

Identified Gaps/Risks:
${lacunasTexto}

Score: ${analise.scorejurimetrico?.toFixed(0) || 'N/A'}/100
Proof Coverage: ${analise.tcp?.toFixed(1) || 'N/A'}%

For each gap, provide:
1. Suggested reinforcement strategy
2. Documentation types to gather
3. Witness types to interview
4. Jurisprudence to cite

Return ONLY this JSON array:
[
  {
    "fato": "Weak fact/gap",
    "risco": "Why it's risky",
    "estrategia": "How to reinforce (2-3 sentences)",
    "documentacaoSugerida": ["Document type 1", "Document type 2"]
  }
]
    `
  }

  private static _construirPromptResumo(
    fatos: FatoProva[],
    analise: AnalisejurimetricaResult,
    objetivoAcao: string
  ): string {
    const fatosTexto = fatos
      .map((f, idx) => `F${idx + 1}: ${f.descricao}`)
      .join('\n')

    return `
Generate an executive summary of this case.

Objective: ${objetivoAcao}
Facts:
${fatosTexto}

Analysis: Score ${analise.scorejurimetrico?.toFixed(0)}/100, Coverage ${analise.tcp?.toFixed(1)}%

Provide executive summary with:
- Central thesis (1 sentence)
- Key strengths (3-4)
- Fragile points (2-3)
- Overall strategy
- Key to success

Return ONLY this JSON:
{
  "tesecentral": "One sentence core argument",
  "pontosFortes": ["Strength 1", "Strength 2", "Strength 3"],
  "pontosFrageis": ["Weakness 1", "Weakness 2"],
  "estrategiaGeral": "Overall approach in 2-3 sentences",
  "chavedeSucesso": "Most critical factor for winning"
}
    `
  }

  // ==================== API CALL ====================

  private static async _chamarClaudeAPI(prompt: string): Promise<string> {
    if (!this.apiKey) {
      // Modo offline: retornar mock response
      return this._gerarMockResponse(prompt)
    }

    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-8',
          max_tokens: 2000,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = (await response.json()) as any
      return data.content[0].text
    } catch (erro) {
      console.error('Erro ao chamar Claude API:', erro)
      // Fallback para mock
      return this._gerarMockResponse(prompt)
    }
  }

  private static _gerarMockResponse(prompt: string): string {
    // Mock responses para modo offline
    if (prompt.includes('Hermenêutica')) {
      return JSON.stringify({
        ethos:
          'A credibilidade desta demanda repousa em provas documentais contemporâneas, assinadas e datadas, acompanhadas de suas fontes originais. Testemunhas idôneas corroboram os fatos alegados.',
        pathos:
          'A justiça exige o cumprimento de obrigações livremente assumidas. Permitir o enriquecimento sem causa violaria princípios fundamentais do Estado de Direito.',
        logos:
          'Lei aplicável estabelece X. Fatos provados demonstram Y. Logo, conclusão Z é inevitável. O silogismo jurídico é irrepreensível.',
        kairos:
          'A tempestividade desta ação preserva as provas, evita que testemunhas se tornem indisponíveis, e protege as expectativas legítimas do autor.',
      })
    }

    if (prompt.includes('contestação')) {
      return JSON.stringify([
        {
          titulo: 'Desafio à credibilidade das provas documentais',
          probabilidade: 'media',
          descricao:
            'Réu pode questionar autenticidade dos documentos apresentados',
          contraproposta:
            'Jurisprudência pacífica reconhece presunção de credibilidade de documentos originais contemporâneos. Ônus de impugnação é do réu.',
          citacaoJurisprudencia:
            'STJ Súmula 149: A falsificação do documento deve ser alegada e provada por quem a sustenta',
        },
        {
          titulo: 'Insuficiência de prova em um ou mais fatos',
          probabilidade: 'baixa',
          descricao: 'Réu pode alegar que prova não atinge patamar mínimo',
          contraproposta:
            'Padrão aplicável é preponderância da prova, não certeza absoluta. Múltiplas fontes corroboram cada fato.',
          citacaoJurisprudencia:
            'CPC 375: Cabia ao réu impugnar especificamente cada afirmação de fato.',
        },
      ])
    }

    if (prompt.includes('blindagem')) {
      return JSON.stringify([
        {
          fato: 'Fato crítico 1',
          risco: 'Insuficiência de documentação',
          estrategia:
            'Buscar documentos originais, extratos contábeis, e-mails contemporâneos que fortaleçam a prova.',
          documentacaoSugerida: [
            'Documentos originais',
            'Correspondência eletrônica',
            'Extratos contábeis',
          ],
        },
      ])
    }

    if (prompt.includes('resumo')) {
      return JSON.stringify({
        tesecentral:
          'A obrigação contratualmente assumida deve ser cumprida conforme acordado pelas partes.',
        pontosFortes: [
          'Contrato original assinado',
          'Múltiplas testemunhas confirmam execução parcial',
          'Documentação contemporânea',
        ],
        pontosFrageis: ['Um fato carece de corroboração adicional'],
        estrategiaGeral:
          'Enfatizar a clareza do contrato e a boa-fé do autor, reforçando com documentação contemporânea.',
        chavedeSucesso:
          'Demonstrar que réu tinha plena consciência da obrigação e a descumpriu deliberadamente.',
      })
    }

    return JSON.stringify({
      error: 'Resposta não configurada para este prompt',
    })
  }
}
