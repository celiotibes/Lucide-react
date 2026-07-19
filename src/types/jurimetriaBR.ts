/**
 * Jurimetria: Análise Quantitativa de Força Probatória
 * Taxa de Cobertura Probatória (TCP), Distribuição de Força, Análise de Gaps
 */

export interface FatoProva {
  idFato: string
  alegacao: string
  tipoProva: 'documental' | 'testemunhal' | 'pericial' | 'digital'
  grauCerteza: number // 0-100
  pesoProva: 'substancial' | 'moderado' | 'fragil'
  fontes: string[] // Anexos que respaldam (ex: ANEXO_01, ANEXO_02)
}

export interface DistribuicaoForcaFatos {
  alta: number // Fatos com 80-100% certeza
  moderada: number // 50-80%
  fragil: number // <50%
}

export interface CorrelacaoArgumentoProva {
  argumento: string
  provasRespaldam: string[]
  fraquesFrentes: string[]
  riscoContraargumento: number // 0-100
  forcaEscudo: number // 0-100 (capacidade de Hermenêutica Blindada)
}

export interface Analisejurimetrica {
  tcp: number // Taxa de Cobertura Probatória (%)
  grauCertezaMedia: number // Média ponderada de certeza
  distribuicaoForcaFatos: DistribuicaoForcaFatos
  matrizArgumentoProva: CorrelacaoArgumentoProva[]
  lacunasRisco: string[] // Lacunas críticas de prova
  scorejurimetrico: number // 0-100 (saúde geral da petição)
  matrizVisual: MatrizProvaVisual[]
}

export interface MatrizProvaVisual {
  numeroLinha: number
  argumento: string
  tipoProva: string
  certeza: string // "85%"
  documentosApoio: string
  barraForca: string // Visual representation (█░░░░░░░░ 35%)
}

// Otimização de mídia para CNNs
export interface AtivomidiaOtimizado {
  nomeArquivoOriginal: string
  nomeArquivoOtimizado: string
  dimensoes: string // "1200x675"
  tamanhoOrigemKb: number
  tamanhoOtimizadoKb: number
  percentualCompressao: number // Porcentagem
  textoOcr: string
  sha256: string
  prontoParaCnn: boolean
  metadados: {
    dataCaptura?: string
    localizacao?: string
    hashAutenticidade: string
  }
}

export interface MetadadosMidia {
  totalAtivos: number
  economiaCompressaoTotal: number
  todosProntosParaCnn: boolean
  ativos: AtivomidiaOtimizado[]
}

// Contingência para anexos ilegíveis
export interface ContingenciaAtivoinlegivel {
  idAnexo: string
  nomeArquivoOriginal: string
  motivoInlegivel: 'corrompido' | 'criptografado' | 'digitalizacaoDanificada' | 'formatoLegado'
  traducaoSemantica: {
    transcricao?: string // Transcrição/resumo amigável para IA
    descricao: string // Descrição textual do conteúdo
    provaAutenticidade: {
      ataNotarial?: string // Referência a ata notarial
      sha256Original: string // Hash do arquivo original
      dataRecuperada: Date
    }
  }
  alternativaAcessibilidade: {
    linkGoogleDrive: string
    descricao: string
    restritoBancada: boolean
  }
  citacaoJurisprudencial?: string // Citação que valida aceitação mesmo ilegível
}

// Anexo com metadata semântica completa
export interface MetadadosAnexo {
  numeroAnexo: string
  nomeArquivo: string
  caminhoArquivo: string
  tamanhoArquivo: number
  tipoArquivo: string
  sha256: string
  registradoEm: string
  idGoogleDrive?: string
  linkGoogleDrive?: string
  permissaoCompartilhamento: {
    papel: 'leitor' | 'editor' | 'comentador'
    tipo: 'dominio' | 'usuario' | 'grupo'
    dominio?: string // ex: tjpr.jus.br
  }
  metadadosSemanticos: {
    tipo: 'documento_estruturado' | 'dados_matematicos' | 'midia_imagem' | 'midia_audio' | 'midia_video' | 'desconhecido'
    relevancia: 'alta' | 'media' | 'baixa'
    fatosCorespondentes: string[] // Link para IdFatos
  }
}

export interface IndiceSemantico {
  metadadosCaso: {
    numeroProcesso: string
    tribunal: 'TJPR' | 'TJSC' | 'TJMT' | 'TJRO' | 'TRF4' | 'JFPR'
    exportadoEm: string
  }
  indiceAnexos: EntradaIndiceSemantico[]
  referenciascruzadas: Record<string, string[]>
  etiquetasSemanticas: string[]
}

export interface EntradaIndiceSemantico {
  idAnexo: string
  nomeArquivo: string
  tipo: string
  hash: string
  link: string
  protocoloCompartilhamento: 'dominio_restrito' | 'publico' | 'privado'
  acessivelPor: string[]
  conteudoExtraido: {
    textoCompleto?: string
    entidades: string[]
    palavraschave: string[]
  }
}
