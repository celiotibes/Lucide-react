/**
 * Serviço de Correspondência de Modelos
 * Encontra modelos jurídicos similares baseado em conteúdo da petição
 * Suporta dados reais via Legal Data Hunter ou mock para desenvolvimento
 */

import type {
  ModeloJuridico,
  ResultadoCorrespondencia,
  CorrespondenciaSecao,
  BuscaTemplateParams,
  BibliotecaModelos,
} from '../types/templateMatching'
import { obterLDH } from './legalDataHunterService'
import type { JurisprudenciaResultado } from '../types/legalDataHunter'

export class ServicoCorrespondenciaModelos {
  /**
   * Buscar modelos correspondentes com suporte a dados reais via Legal Data Hunter
   */
  async buscarModelos(
    conteudoPeticao: string,
    parametrosBusca: BuscaTemplateParams
  ): Promise<ResultadoCorrespondencia[]> {
    try {
      let modelos: ModeloJuridico[] = []

      // Tentar usar dados reais via Legal Data Hunter
      const usarDadosReais = import.meta.env.VITE_LEGAL_DATA_HUNTER_API_KEY ? true : false

      if (usarDadosReais) {
        try {
          const ldh = obterLDH()
          const jurisprudencia = await ldh.buscarJurisprudencia({
            texto: conteudoPeticao,
            jurisdicoes: ['BR'],
            areaJuridica: parametrosBusca.areaJuridica,
            limite: 10,
          })

          modelos = jurisprudencia
            .map((j) => this.converterJurisprudenciaParaModelo(j))
            .filter((m) => m !== null) as ModeloJuridico[]
        } catch (erroLDH) {
          console.warn('Erro ao buscar dados reais, usando mock:', erroLDH)
          modelos = await this.obterBibliotecaModelos(parametrosBusca)
        }
      } else {
        modelos = await this.obterBibliotecaModelos(parametrosBusca)
      }

      // Extrair palavras-chave da petição
      const palavrasChavePeticao = this.extrairPalavrasChave(conteudoPeticao)

      // Calcular pontuação para cada modelo
      const correspondencias = modelos.map((modelo) =>
        this.calcularCorrespondencia(
          conteudoPeticao,
          modelo,
          palavrasChavePeticao,
          parametrosBusca
        )
      )

      // Ordenar por pontuação decrescente
      return correspondencias.sort((a, b) => b.pontuacao - a.pontuacao).slice(0, 5)
    } catch (erro) {
      console.error('Erro ao buscar modelos:', erro)
      throw new Error('Falha ao buscar modelos jurídicos')
    }
  }

  /**
   * Converter resultado de jurisprudência para modelo jurídico
   */
  private converterJurisprudenciaParaModelo(
    jurisprudencia: JurisprudenciaResultado
  ): ModeloJuridico | null {
    if (!jurisprudencia.ementa) return null

    return {
      id: jurisprudencia.id,
      titulo: jurisprudencia.ementa.substring(0, 100),
      descricao: jurisprudencia.ementa,
      areaJuridica: 'civil',
      tribunal: jurisprudencia.tribunal,
      resultado: jurisprudencia.resultado,
      dataDecisao: jurisprudencia.dataDecisao,
      argumentosPrincipais: jurisprudencia.fundamentosLegais.slice(0, 3),
      estrutura: [
        {
          tipo: 'introducao',
          conteudo: `Processo nº ${jurisprudencia.numeroProcesso}`,
          palavrasChave: ['processo', 'jurisprudencia'],
          importancia: 'alta',
        },
        {
          tipo: 'argumentacao',
          conteudo: jurisprudencia.ementa,
          palavrasChave: jurisprudencia.fundamentosLegais,
          importancia: 'alta',
        },
      ],
      taxaSucesso: jurisprudencia.resultado === 'favoravel' ? 85 : 40,
      citacoes: jurisprudencia.citacoes,
      tags: [
        jurisprudencia.resultado,
        jurisprudencia.tribunal.toLowerCase(),
        ...(jurisprudencia.fundamentosLegais || []),
      ],
    }
  }

  /**
   * Obter biblioteca de modelos (dados simulados)
   */
  private async obterBibliotecaModelos(_parametros: BuscaTemplateParams): Promise<ModeloJuridico[]> {
    // Simulação de biblioteca de modelos
    return [
      {
        id: 'mod-001',
        titulo: 'Ação de Cobrança - Inadimplência Contratual',
        descricao: 'Modelo bem-sucedido para cobranças de valores contratuais',
        areaJuridica: 'civil',
        tribunal: 'TJ-SP',
        resultado: 'favoravel',
        dataDecisao: new Date(2023, 5, 15),
        argumentosPrincipais: [
          'Descumprimento claro de obrigação contratual',
          'Juros de mora aplicáveis conforme lei',
          'Prescrição não configurada',
        ],
        estrutura: [
          {
            tipo: 'introducao',
            conteudo: 'Apresenta-se ação de cobrança...',
            palavrasChave: ['cobrança', 'débito', 'contrato'],
            importancia: 'alta',
          },
          {
            tipo: 'fundamentos',
            conteudo: 'Lei 10.406/2002 (CC) Arts. 586-587...',
            palavrasChave: ['lei', 'contrato', 'obrigação'],
            importancia: 'alta',
          },
          {
            tipo: 'argumentacao',
            conteudo: 'É incontroverso o débito...',
            palavrasChave: ['documentação', 'prova', 'evidente'],
            importancia: 'alta',
          },
        ],
        taxaSucesso: 92,
        citacoes: ['STJ REsp 1.234.567/SP', 'CC Art. 586'],
        tags: ['cobrança', 'inadimplência', 'contrato', 'sucesso-alto'],
      },
      {
        id: 'mod-002',
        titulo: 'Ação de Danos Morais - Violação de Direitos',
        descricao: 'Estratégia consolidada para danos morais com alta taxa de sucesso',
        areaJuridica: 'civil',
        tribunal: 'TJ-SP',
        resultado: 'favoravel',
        dataDecisao: new Date(2023, 8, 20),
        argumentosPrincipais: [
          'Abuso de direito consumidor',
          'Violação de dignidade da pessoa',
          'Falha na prestação de serviço',
        ],
        estrutura: [
          {
            tipo: 'introducao',
            conteudo: 'Promove-se ação de indenização por danos morais...',
            palavrasChave: ['danos', 'morais', 'indenização'],
            importancia: 'alta',
          },
          {
            tipo: 'argumentacao',
            conteudo: 'O sofrimento causado é evidente e documentado...',
            palavrasChave: ['dano', 'sofrimento', 'injusto'],
            importancia: 'alta',
          },
        ],
        taxaSucesso: 88,
        citacoes: ['CC Art. 186', 'STF RE 9.876.543/DF'],
        tags: ['danos-morais', 'direitos-violados', 'consumidor', 'sucesso-alto'],
      },
      {
        id: 'mod-003',
        titulo: 'Ação Trabalhista - Rescisão Indevida',
        descricao: 'Modelo para demissões sem justa causa com reintegração',
        areaJuridica: 'trabalhista',
        tribunal: 'TRT',
        resultado: 'favoravel',
        dataDecisao: new Date(2023, 11, 5),
        argumentosPrincipais: [
          'Dispensa arbitrária',
          'Violação de direitos fundamentais',
          'Falta de motivação legal',
        ],
        estrutura: [],
        taxaSucesso: 85,
        citacoes: ['CLT Art. 5º', 'OJ 25 SBDI-I'],
        tags: ['trabalhista', 'rescisao', 'direitos-trabalhistas', 'sucesso-alto'],
      },
      {
        id: 'mod-004',
        titulo: 'Ação de Nulidade de Contrato - Vício de Consentimento',
        descricao: 'Estratégia para contratos assinados sob coação ou erro',
        areaJuridica: 'civil',
        tribunal: 'TJ-SP',
        resultado: 'desfavoravel',
        dataDecisao: new Date(2023, 3, 10),
        argumentosPrincipais: [
          'Vício de consentimento',
          'Erro escusável',
          'Falta de transparência',
        ],
        estrutura: [],
        taxaSucesso: 45,
        citacoes: ['CC Arts. 138-144'],
        tags: ['contratos', 'vicio', 'nulidade', 'sucesso-baixo'],
      },
    ]
  }

  /**
   * Extrair palavras-chave do conteúdo
   */
  private extrairPalavrasChave(conteudo: string): string[] {
    // Palavras-chave comuns em petições jurídicas
    const padroesChave = [
      /\b(responsabilidade|culpa|dolo|negligência|imperícia)\b/gi,
      /\b(contrato|acordo|pacto|compromisso)\b/gi,
      /\b(obrigação|dever|direito|prerrogativa)\b/gi,
      /\b(danos|prejuízo|indenização|compensação)\b/gi,
      /\b(lei|artigo|código|norma|regulamento)\b/gi,
      /\b(tribunal|juiz|processo|ação)\b/gi,
    ]

    const palavrasEncontradas = new Set<string>()

    padroesChave.forEach((padrao) => {
      let correspondencia
      while ((correspondencia = padrao.exec(conteudo)) !== null) {
        palavrasEncontradas.add(correspondencia[1].toLowerCase())
      }
    })

    return Array.from(palavrasEncontradas).slice(0, 10)
  }

  /**
   * Calcular correspondência entre petição e modelo
   */
  private calcularCorrespondencia(
    conteudoPeticao: string,
    modelo: ModeloJuridico,
    palavrasChavePeticao: string[],
    _parametros: BuscaTemplateParams
  ): ResultadoCorrespondencia {
    // Calcular similaridade de palavras-chave
    const palavrasModelo = modelo.argumentosPrincipais
      .join(' ')
      .toLowerCase()
      .split(/\s+/)

    const palavrasComuns = palavrasChavePeticao.filter((palavra) =>
      palavrasModelo.some((pm) => pm.includes(palavra) || palavra.includes(pm))
    ).length

    const pontuacaoSimilaridade = (palavrasComuns / Math.max(1, palavrasChavePeticao.length)) * 50

    // Adicionar pontuação de taxa de sucesso
    const pontuacaoSucesso = modelo.taxaSucesso / 2

    // Calcular correspondência de seções
    const secoesCorespondentes = modelo.estrutura.map((secao) => ({
      secaoModelo: secao,
      tipoSecao: secao.tipo,
      relevancia: Math.random() * 100,
      sugestoes: [
        `Incluir ${secao.tipo} como no modelo`,
        `Enfatizar: ${secao.palavrasChave.slice(0, 2).join(', ')}`,
      ],
    }))

    // Pontuação final
    const pontuacaoFinal = pontuacaoSimilaridade + pontuacaoSucesso

    return {
      modeloId: modelo.id,
      titulo: modelo.titulo,
      pontuacao: Math.round(pontuacaoFinal),
      similares: Math.floor(Math.random() * 50) + 10,
      secoesCorespondentes,
      argumentosAplicaveis: modelo.argumentosPrincipais.slice(0, 3),
      recomendacoes: [
        `Usar estrutura de ${modelo.titulo}`,
        `Modelar argumentação conforme jurisprudência`,
        `Incluir citações: ${modelo.citacoes.slice(0, 2).join(', ')}`,
      ],
      estruturaSugerida: modelo.estrutura.map((s) => `${s.tipo}: ${s.conteudo.substring(0, 40)}...`),
    }
  }

  /**
   * Obter estatísticas da biblioteca
   */
  async obterEstatisticas(): Promise<BibliotecaModelos> {
    const modelos = await this.obterBibliotecaModelos({})

    const taxaSucesso =
      modelos.reduce((soma, m) => soma + m.taxaSucesso, 0) / Math.max(1, modelos.length)

    const modelosPorArea: Record<string, number> = {}
    const modelosPorTribunal: Record<string, number> = {}

    modelos.forEach((modelo) => {
      modelosPorArea[modelo.areaJuridica] = (modelosPorArea[modelo.areaJuridica] || 0) + 1
      modelosPorTribunal[modelo.tribunal] = (modelosPorTribunal[modelo.tribunal] || 0) + 1
    })

    return {
      totalModelos: modelos.length,
      modelosPorArea,
      modelosPorTribunal,
      taxaSucessoMedia: Math.round(taxaSucesso),
    }
  }
}

export const servicoCorrespondenciaModelos = new ServicoCorrespondenciaModelos()
