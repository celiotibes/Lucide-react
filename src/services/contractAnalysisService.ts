// Serviço de Análise de Contratos com IA
// FASE 11: Integração com Claude API real

import type { ExtractedContractData, ContractAnalysis, ContractDocument } from '../types/contracts'
import { ClaudeApiService } from './claudeApiService'

export class ContractAnalysisService {
  // Analisa contrato usando IA (Claude)
  static async analisarContratoComIA(
    _documento: ContractDocument,
    markdownText: string,
  ): Promise<{
    dados: ExtractedContractData
    confianca: number
    erros: string[]
    avisos: string[]
  }> {
    try {
      // Prompt para IA analisar o contrato
      const prompt = this.gerarPromptAnalise(markdownText)

      // Chama Claude API (via MCP ou fetch)
      const resposta = await this.chamarIA(prompt)

      // Parse da resposta JSON
      const dados = this.parseResposta(resposta)
      const confianca = this.calcularConfianca(resposta)
      const erros = this.extrairErros(resposta)
      const avisos = this.extrairAvisos(resposta, dados)

      return {
        dados,
        confianca,
        erros,
        avisos,
      }
    } catch (erro) {
      throw new Error(`Erro na análise: ${erro instanceof Error ? erro.message : 'Desconhecido'}`)
    }
  }

  // Gera prompt estruturado para IA
  private static gerarPromptAnalise(textoContrato: string): string {
    return `Analise o seguinte contrato de aluguel e extraia as informações solicitadas.

CONTRATO:
${textoContrato}

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
  }

  // Chama a IA para análise (FASE 11: Integração com Claude API real)
  private static async chamarIA(prompt: string): Promise<string> {
    try {
      // Tenta usar Claude API real se configurado
      if (ClaudeApiService.isConfigured()) {
        // Extrai apenas o contrato do prompt para passar ao analisarContrato
        const contratoMatch = prompt.match(/CONTRATO:\n([\s\S]*?)\n\nSOLICITAÇÕES/)
        const textoContrato = contratoMatch ? contratoMatch[1] : prompt
        return await ClaudeApiService.analisarContrato(textoContrato)
      }
    } catch (erro) {
      console.warn('Claude API não disponível, usando resposta simulada:', erro)
      // Fall back para resposta simulada se API falhar
    }

    // Fallback para resposta simulada quando API não está configurada
    return this.respostaSimuladoIA(prompt)
  }

  // Resposta simulada da IA (para desenvolvimento)
  private static respostaSimuladoIA(_prompt: string): string {
    // Resposta padrão quando não há integração com IA real
    return JSON.stringify({
      partes: {
        locador: '[Extrair manualmente]',
        locatario: '[Extrair manualmente]',
        imobiliaria: null,
      },
      imovel: {
        endereco: '[Extrair manualmente]',
        complemento: null,
        cep: null,
        cidade: null,
        estado: null,
        tipo: 'apartamento',
      },
      valores: {
        aluguel: null,
        caução: null,
        taxa_administracao: null,
        seguro_incendio: null,
        iptu: null,
        outras_despesas: null,
      },
      datas: {
        data_inicio: null,
        data_fim: null,
        data_renovacao: null,
        dia_vencimento_aluguel: null,
      },
      indices: {
        indice_tipo: null,
        indice_anual: null,
        mes_reajuste: null,
      },
      clausulas: {
        permite_animais: null,
        permite_reforma: null,
        fianca_obrigatoria: null,
        avalista_obrigatorio: null,
        multa_rescisao: null,
        dias_aviso_previo: null,
      },
      custos_obrigatorios: ['Aluguel', 'Condomínio (se houver)', 'IPTU (conforme cláusula)'],
      questoes_validacao: [
        'Confirme o valor exato do aluguel',
        'Confirme o valor da caução',
        'Confirme o tipo de índice de atualização',
        'Confirme as datas de início e término',
        'Confirme restrições (animais, reformas)',
      ],
      confianca_extracao: 45,
      avisos: [
        'Análise sem integração com Claude API - resultados parciais',
        'Configure sua API Key no LLM Config para análise automática em tempo real',
        'Recomenda-se validação manual de todos os dados',
      ],
      resumo:
        'Contrato carregado. Configure Claude API para extração automática de dados com IA em tempo real.',
    })
  }

  // Parse da resposta JSON
  private static parseResposta(resposta: string): ExtractedContractData {
    try {
      const json = JSON.parse(resposta)

      return {
        partes: json.partes || {},
        imovel: json.imovel || {},
        valores: json.valores || {},
        datas: json.datas || {},
        indices: json.indices || {},
        clausulas: json.clausulas || {},
        custos_obrigatorios: json.custos_obrigatorios || [],
        questoes_validacao: json.questoes_validacao || [],
        resumo: json.resumo,
      }
    } catch (erro) {
      throw new Error(`Erro ao fazer parse de resposta: ${erro instanceof Error ? erro.message : 'Desconhecido'}`)
    }
  }

  // Calcula confiança da extração
  private static calcularConfianca(resposta: string): number {
    try {
      const json = JSON.parse(resposta)
      return json.confianca_extracao || 50
    } catch {
      return 30
    }
  }

  // Extrai erros detectados
  private static extrairErros(resposta: string): string[] {
    const erros: string[] = []

    try {
      const json = JSON.parse(resposta)

      // Procura por valores faltantes críticos
      if (!json.partes?.locador) erros.push('Locador não identificado')
      if (!json.partes?.locatario) erros.push('Locatário não identificado')
      if (!json.imovel?.endereco) erros.push('Endereço do imóvel não identificado')
      if (!json.valores?.aluguel) erros.push('Valor do aluguel não identificado')
    } catch {
      erros.push('Erro ao processar resposta da IA')
    }

    return erros
  }

  // Extrai avisos
  private static extrairAvisos(resposta: string, dados: ExtractedContractData): string[] {
    const avisos: string[] = []

    try {
      const json = JSON.parse(resposta)
      if (json.avisos && Array.isArray(json.avisos)) {
        avisos.push(...json.avisos)
      }
    } catch {
      // Continua com análise manual
    }

    // Adiciona avisos próprios
    if (dados.valores?.aluguel && dados.valores.aluguel > 50000) {
      avisos.push('Aluguel acima de R$ 50.000 - Verifique se está correto')
    }

    if (dados.indices?.indice_anual && dados.indices.indice_anual > 20) {
      avisos.push(`Reajuste acima de 20% ao ano (${dados.indices.indice_anual}%) - Incomum`)
    }

    if (dados.clausulas?.fianca_obrigatoria && dados.clausulas?.avalista_obrigatorio) {
      avisos.push('Contrato requer fiança E avalista - Estrutura incomum')
    }

    return avisos
  }

  // Cria análise completa
  static criarAnalise(
    documento: ContractDocument,
    dados: ExtractedContractData,
    confianca: number,
    erros: string[],
    avisos: string[],
    usuario: string,
  ): ContractAnalysis {
    return {
      id: `analise_${Date.now()}`,
      documentId: documento.id,
      dataAnalise: new Date(),
      status: 'concluido',
      dadosExtraidos: dados,
      confiancaExtracao: confianca,
      errosDetectados: erros,
      avisos,
      analista: usuario,
      validado: false,
    }
  }

  // Valida dados extraídos
  static validarDados(dados: ExtractedContractData): { valido: boolean; erros: string[] } {
    const erros: string[] = []

    // Validações
    if (!dados.partes?.locador && !dados.partes?.locatario) {
      erros.push('Pelo menos uma das partes deve ser identificada')
    }

    if (!dados.imovel?.endereco) {
      erros.push('Endereço do imóvel é obrigatório')
    }

    if (dados.valores?.aluguel && dados.valores.aluguel < 100) {
      erros.push('Valor do aluguel parece incorreto (menor que R$ 100)')
    }

    if (dados.valores?.caução && dados.valores.aluguel) {
      const proporcao = dados.valores.caução / dados.valores.aluguel
      if (proporcao > 5 || proporcao < 0.5) {
        erros.push(`Proporção caução/aluguel incomum (${proporcao.toFixed(1)}x)`)
      }
    }

    if (dados.datas?.data_inicio && dados.datas?.data_fim) {
      const inicio = new Date(dados.datas.data_inicio)
      const fim = new Date(dados.datas.data_fim)
      if (inicio >= fim) {
        erros.push('Data de início deve ser anterior à data de término')
      }
    }

    return {
      valido: erros.length === 0,
      erros,
    }
  }
}
