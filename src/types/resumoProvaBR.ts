/**
 * Framework de Resumo de Prova
 * Estrutura estratégica de provas para refutar contestação da parte contrária
 * Parte integral de Hermenêutica Blindada
 */

export interface AnaliseContestacao {
  contestacoesEsperadas: string[]
  areasVulneraveis: string[]
  refutacoesPreemptivas: string[]
}

export interface FatoResmoProva {
  idFato: string
  alegacao: string
  pesoLogico: 'critico' | 'apoio' | 'contextual'
  forcaProva: number // 0-100
  provasApoio: ElementoProva[]
  contraargumentos: EscudoContraargumento[]
  apoioJurisprudencial: CitacaoJurisprudencial[]
}

export interface ElementoProva {
  tipo: 'documental' | 'testemunhal' | 'pericial' | 'digital' | 'circunstancial'
  descricao: string
  referenciaAnexo: string // ANEXO_01, etc
  scorecredibilidade: number // 0-100
  nivelCorroboracao: 'unica' | 'apoiada' | 'multipla'
  interpretacaoHermeneutica?: string // Interpretação jurídica favorável
}

export interface EscudoContraargumento {
  contestacaoEsperada: string
  estrategiaRefutacao: 'direta' | 'contextual' | 'jurisprudencial' | 'processual'
  mecanismoBlindagem: string // Mecanismo de Hermenêutica Blindada
  citacaoApoio?: string
  posicaoSecundaria?: string // Posição de retaguarda se contestado
  scoreForça: number // 0-100
}

export interface CitacaoJurisprudencial {
  numeroAcordao: string // STF ADI 5938, STJ REsp 123456
  tribunal: 'STF' | 'STJ' | 'TJPR' | 'TJSC' | 'TRF4'
  data: Date
  ementa: string
  relevancia: 'vinculante' | 'persuasiva' | 'analogavelmente'
  proposatoCitacao: string // Como a jurisprudência reforça o argumento
}

export interface FrameworkResmoProva {
  idPeticao: string
  resumoExecutivo: ResumoExecutivo
  resumoFatos: FatoResmoProva[]
  analiseContestacao: AnaliseContestacao
  hermenauticaEstrategica: HermenauticaEstrategica
  sintesesnclusiva: SintesesnclusivaConclusiva
  geradoEm: Date
}

export interface ResumoExecutivo {
  argumentoPrincipal: string // Tese central em 1 frase
  provasChave: string[] // 3-5 provas mais fortes
  resultadoEsperado: string // Resultado esperado
  avaliacaoRisco: string // Maiores riscos
  escudoHermenautico: string // Proteção jurídica principal
}

export interface HermenauticaEstrategica {
  abordagemEthos: {
    autoridadeBaseadaEm: string
    marcadoresCredibilidade: string[]
  }
  abordagemPathos: {
    ressonanciaEmocional: string
    argumentosEquidade: string[]
  }
  abordagemLogos: {
    estruturaLogica: string
    cadeiassilogisticas: CadeiasilogisticaBR[]
  }
  abordagemKairos: {
    justificativaOportunidade: string
    oportunidadeJustica: string
  }
}

export interface CadeiasilogisticaBR {
  premissaMaior: string // Regra jurídica
  premissaMenor: string // Fato provado
  conclusao: string // Conclusão obrigatória
  basejurisprudencial?: string
}

export interface SintesesnclusivaConclusiva {
  declaracaoSintese: string // Síntese final dos argumentos
  pedidoPrincipal: string // Pedido com fundamentação
  pedidoAlternativo: string // Pedido subsidiário
  salvaguardasProcessuais: string[] // Proteções procedimentais contra contestação
}

// Template para petição com prova resumida
export interface SecaoResmoProva {
  titulo: string
  conteudo: string
  renderizacaoHtml: string
  markdown: string
}

// Quadro de resposta estratégica a contestações
export interface MatrizRespostaContestacao {
  pontosContestacaoEsperados: string[]
  nossasRefutacoesDiretas: ParRefutacao[]
  armasJurisprudenciais: CitacaoJurisprudencial[]
  salvaguardasProcessuais: SalvaguardaProcessual[]
}

export interface ParRefutacao {
  contestacao: string
  respostadireta: string
  baseLgica: string
  provaApoio: string // Referência ANEXO_XX
  respostaSecundaria?: string
}

export interface SalvaguardaProcessual {
  tipo: 'temporal' | 'formal' | 'substantiva' | 'probatoria'
  descricao: string
  protegeconcra: string
  leiAplicavel: string
}

// Modelo para geração de texto (compatível com Claude API)
export interface PromptGeracaoTextoProva {
  idFato: string
  alegacao: string
  provas: ElementoProva[]
  jurisprudencia: CitacaoJurisprudencial[]
  contestacoesEsperadas: string[]
  contextoHermenautico: string
  tom: 'formal' | 'persuasivo' | 'tecnico'
  formatoSaida: 'paragrafo' | 'listagem' | 'tabela' | 'dialogo'
}

export interface TextoProvaGerado {
  idFato: string
  conteudoGerado: string
  scoreLeibilidade: number // Flesch-Kincaid
  scorepersuasividade: number // 0-100 subjetivo
  coberturajurimetrica: string[] // Qual prong de Ethos/Pathos/Logos/Kairos
  citacoesSugeridas: string[] // Sugestões de citações para reforço
}
