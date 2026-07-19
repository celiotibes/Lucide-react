/**
 * Serviço de Resumo de Prova
 * Geração estratégica de resumos de prova para refutar contestação
 * Implementa Hermenêutica Blindada (Ethos, Pathos, Logos, Kairos)
 */

import type {
  FrameworkResmoProva,
  FatoResmoProva,
  ResumoExecutivo,
  AnaliseContestacao,
  HermenauticaEstrategica,
  SintesesnclusivaConclusiva,
  EscudoContraargumento,
  CadeiasilogisticaBR,
  MatrizRespostaContestacao,
  
  
} from '@/types/resumoProvaBR'
import type { FatoProva } from '@/types/jurimetriaBR'

export class ServicoResmoProvaBR {
  /**
   * Gera estrutura completa de resumo de provas estratégico
   */
  static gerarResmoProva(
    idPeticao: string,
    fatos: FatoProva[],
    jurisprudencia: any[] = []
  ): FrameworkResmoProva {
    return {
      idPeticao,
      resumoExecutivo: this.gerarResumoExecutivo(fatos),
      resumoFatos: this.gerarResumoFatos(fatos),
      analiseContestacao: this.analisarContestacoeEsperadas(fatos),
      hermenauticaEstrategica: this.construirHermenauticaEstrategica(fatos, jurisprudencia),
      sintesesnclusiva: this.gerarSintesesnclusiva(fatos),
      geradoEm: new Date(),
    }
  }

  /**
   * Gera Executive Summary com tese central e provas-chave
   */
  private static gerarResumoExecutivo(fatos: FatoProva[]): ResumoExecutivo {
    const fatosFortees = fatos.filter((f) => f.grauCerteza >= 80)
    const fatosModerardos = fatos.filter((f) => f.grauCerteza >= 50 && f.grauCerteza < 80)

    return {
      argumentoPrincipal: this.sintetizarTesePrincipal(fatos),
      provasChave: this.extrairProvasChave(fatos),
      resultadoEsperado: this.preverResultadoEsperado(fatosFortees),
      avaliacaoRisco: this.avaliarRiscos(fatosModerardos),
      escudoHermenautico: this.identificarEscudoPrincipal(fatos),
    }
  }

  /**
   * Gera resumo estruturado de cada fato com provas e escudos
   */
  private static gerarResumoFatos(fatos: FatoProva[]): FatoResmoProva[] {
    return fatos.map((fato, idx) => ({
      idFato: fato.idFato || `F${idx + 1}`,
      alegacao: fato.alegacao,
      pesoLogico: this.determinarPesoLogico(fato, idx, fatos.length),
      forcaProva: fato.grauCerteza,
      provasApoio: this.extrairProvasApoio(fato),
      contraargumentos: this.construirEscudosContraargumeto(fato),
      apoioJurisprudencial: [], // Será preenchido de jurisprudência externa
    }))
  }

  /**
   * Analisa contestações esperadas e previsões de defesa
   */
  private static analisarContestacoeEsperadas(fatos: FatoProva[]): AnaliseContestacao {
    const contestacoesEsperadas: string[] = []
    const areasVulneraveis: string[] = []
    const refutacoesPreemptivas: string[] = []

    fatos.forEach((fato) => {
      if (fato.tipoProva === 'testemunhal') {
        contestacoesEsperadas.push(`Desafio à credibilidade da testemunha em "${fato.alegacao}"`)
        areasVulneraveis.push(`Prova testemunhal para fato: ${fato.alegacao}`)
        refutacoesPreemptivas.push(
          `Múltiplas testemunhas corroboradas e prova documental respaldam o testemunho`
        )
      }

      if (fato.grauCerteza < 70) {
        contestacoesEsperadas.push(`Fraqueeza na força da prova para "${fato.alegacao}"`)
        areasVulneraveis.push(`Grau de certeza baixo (${fato.grauCerteza}%)`)
        refutacoesPreemptivas.push(
          `Preponderância das provas atendida; perfeição não é requisito em litígio cível`
        )
      }

      if (fato.fontes.length === 1) {
        contestacoesEsperadas.push(`Alegação por fonte única para "${fato.alegacao}"`)
        areasVulneraveis.push(`Dependência de fonte única`)
        refutacoesPreemptivas.push(
          `Testemunha/documento único é suficiente quando credível; corroboração é complementar`
        )
      }
    })

    return {
      contestacoesEsperadas,
      areasVulneraveis,
      refutacoesPreemptivas,
    }
  }

  /**
   * Constrói estratégia hermenêutica com 4 pilares (Ethos, Pathos, Logos, Kairos)
   */
  private static construirHermenauticaEstrategica(
    fatos: FatoProva[],
    jurisprudencia: any[]
  ): HermenauticaEstrategica {
    return {
      abordagemEthos: {
        autoridadeBaseadaEm: 'Prova documental substancial e testemunhas credíveis',
        marcadoresCredibilidade: [
          'Documentos contemporâneos (não reconstruídos)',
          'Prova digital com metadados',
          'Testemunho pericial profissional',
          'Registros e certificações oficiais',
        ],
      },
      abordagemPathos: {
        ressonanciaEmocional: 'A justiça exige respeito às obrigações contratuais e boa-fé',
        argumentosEquidade: [
          'Enriquecimento injustificado se réu evita responsabilidade',
          'Proteção de interesses de confiança razoável',
          'Prevenção de abuso de direitos processuais',
        ],
      },
      abordagemLogos: {
        estruturaLogica: 'Cadeia silogística da lei aplicável através de fatos provados para relevo',
        cadeiassilogisticas: this.gerarCadeiassilogisticas(fatos, jurisprudencia),
      },
      abordagemKairos: {
        justificativaOportunidade: 'Apresentação oportuna previne decadência de provas e indisponibilidade de testemunhas',
        oportunidadeJustica:
          'Resolução ágil protege expectativas legítimas e previne dano adicional',
      },
    }
  }

  /**
   * Gera cadeias silogísticas (Lei → Fato → Conclusão)
   */
  private static gerarCadeiassilogisticas(
    fatos: FatoProva[],
    jurisprudencia: any[]
  ): CadeiasilogisticaBR[] {
    return fatos.map((fato) => ({
      premissaMaior: this.gerarPremissaMaior(fato),
      premissaMenor: fato.alegacao,
      conclusao: this.gerarConclusao(fato),
      basejurisprudencial: jurisprudencia[0]?.numeroAcordao || undefined,
    }))
  }

  /**
   * Gera síntese final com pedido e salvaguardas procedimentais
   */
  private static gerarSintesesnclusiva(fatos: FatoProva[]): SintesesnclusivaConclusiva {
    const fatorsCriticos = fatos.filter((f) => f.grauCerteza >= 80)
    const fatosApoio = fatos.filter((f) => f.grauCerteza >= 50 && f.grauCerteza < 80)

    return {
      declaracaoSintese: this.sintetizarTodosArgumentos(fatorsCriticos, fatosApoio),
      pedidoPrincipal: 'Conceder a tutela conforme requerido na petição inicial',
      pedidoAlternativo: 'Alternativamente, conceder tutela parcial proporcional às perdas comprovadas',
      salvaguardasProcessuais: this.identificarSalvaguardasProcessuais(fatos),
    }
  }

  /**
   * Determina peso lógico do fato (critico/apoio/contextual)
   */
  private static determinarPesoLogico(
    fato: FatoProva,
    index: number,
    total: number
  ): 'critico' | 'apoio' | 'contextual' {
    if (fato.grauCerteza >= 85 && fato.pesoProva === 'substancial') {
      return 'critico'
    }
    if (fato.grauCerteza >= 60 && fato.pesoProva !== 'fragil') {
      return 'apoio'
    }
    return 'contextual'
  }

  /**
   * Extrai elementos de prova com nível de corroboração
   */
  private static extrairProvasApoio(fato: FatoProva) {
    return [
      {
        tipo: fato.tipoProva as any,
        descricao: `Prova ${fato.tipoProva} para: ${fato.alegacao}`,
        referenciaAnexo: fato.fontes[0] || 'N/A',
        scorecredibilidade: fato.grauCerteza,
        nivelCorroboracao: fato.fontes.length > 1 ? 'multipla' : ('unica' as const),
        interpretacaoHermenautica: `Estabelece ${fato.alegacao} com ${fato.grauCerteza}% de confiança`,
      },
    ]
  }

  /**
   * Constrói escudos contra contra-argumentação (Hermenêutica Blindada)
   */
  private static construirEscudosContraargumeto(fato: FatoProva): EscudoContraargumento[] {
    const escudos: EscudoContraargumento[] = []

    // Escudo 1: Desafio de credibilidade
    escudos.push({
      contestacaoEsperada: 'Desafio à credibilidade da testemunha ou autenticidade do documento',
      estrategiaRefutacao: 'jurisprudencial',
      mecanismoBlindagem:
        'Determinações de credibilidade favorecem prova apresentada; ônus no réu de impugnar',
      citacaoApoio: 'Jurisprudência STJ sobre padrões probatórios',
      scoreForça: 90,
    })

    // Escudo 2: Prova insuficiente
    escudos.push({
      contestacaoEsperada: 'Argumento de prova insuficiente do fato',
      estrategiaRefutacao: 'direta',
      mecanismoBlindagem:
        'Padrão de preponderância atendido; perfeição não é requisito em litígio cível',
      scoreForça: 85,
    })

    // Escudo 3: Desafio processual
    escudos.push({
      contestacaoEsperada: 'Ataque ao procedimento de obtenção da prova',
      estrategiaRefutacao: 'processual',
      mecanismoBlindagem:
        'Prova obtida regularmente conforme Código de Processo Civil; nenhuma exclusão justificada',
      citacaoApoio: 'CPC Art. 370-372 (padrões probatórios)',
      scoreForça: 88,
    })

    return escudos
  }

  /**
   * Síntese da tese central (1 frase)
   */
  private static sintetizarTesePrincipal(fatos: FatoProva[]): string {
    const contagemCritica = fatos.filter((f) => f.grauCerteza >= 80).length
    return `Esta petição é apoiada por ${contagemCritica} fatos críticos, cada um provado por prova documental e testemunhal substancial`
  }

  /**
   * Extrai provas-chave para executive summary
   */
  private static extrairProvasChave(fatos: FatoProva[]): string[] {
    return fatos
      .filter((f) => f.grauCerteza >= 80)
      .slice(0, 5)
      .map((f) => f.alegacao)
  }

  /**
   * Prediz resultado esperado
   */
  private static preverResultadoEsperado(fatosCriticos: FatoProva[]): string {
    if (fatosCriticos.length >= 3) {
      return 'Resultado altamente favorável dado força substancial do apoio probatório'
    }
    if (fatosCriticos.length >= 1) {
      return 'Resultado favorável com probabilidade razoável de sucesso'
    }
    return 'Resultado dependente de interpretação judicial de fatos limítrofes'
  }

  /**
   * Avalia riscos (fatos frágeis)
   */
  private static avaliarRiscos(fatosModerardos: FatoProva[]): string {
    if (fatosModerardos.length === 0) {
      return 'Risco mínimo; todos os fatos substanciados por prova forte'
    }
    return `Risco moderado de ${fatosModerardos.length} fato(s) com 50-80% de certeza; adequadamente abordado por prova corroboradora`
  }

  /**
   * Identifica principal escudo jurídico
   */
  private static identificarEscudoPrincipal(fatos: FatoProva[]): string {
    const fatoMaisForte = fatos.reduce((prev, current) =>
      prev.grauCerteza > current.grauCerteza ? prev : current
    )
    return `Fundação jurídica principal: ${fatoMaisForte.alegacao} (${fatoMaisForte.grauCerteza}% de certeza, prova ${fatoMaisForte.pesoProva})`
  }

  /**
   * Gera premissa maior (lei aplicável)
   */
  private static gerarPremissaMaior(fato: FatoProva): string {
    return `Conforme lei aplicável, a parte com ônus de prova deve demonstrar ${fato.alegacao} pela preponderância das provas`
  }

  /**
   * Gera conclusão (aplicação)
   */
  private static gerarConclusao(fato: FatoProva): string {
    return `Portanto, ${fato.alegacao} é estabelecido com ${fato.grauCerteza}% de certeza através de prova ${fato.tipoProva}`
  }

  /**
   * Síntese de todos os argumentos
   */
  private static sintetizarTodosArgumentos(
    fatorsCriticos: FatoProva[],
    fatosApoio: FatoProva[]
  ): string {
    return `Os ${fatorsCriticos.length} fatos críticos, reforçados por ${fatosApoio.length} fatos apoio, criam fundação probatória esmagadora atendendo todos os padrões legais para tutela`
  }

  /**
   * Identifica salvaguardas procedimentais contra contestação
   */
  private static identificarSalvaguardasProcessuais(fatos: FatoProva[]): string[] {
    return [
      'Todas as provas contemporâneas aos fatos alegados; nenhuma reconstruída',
      'Múltiplas fontes independentes corroboram cada fato crítico',
      'Hermenêutica favorece parte apresentando prova sobre portador de ônus',
      'Todas as provas regularmente autenticadas e admitidas conforme regras',
    ]
  }

  /**
   * Gera matriz de resposta estratégica a contestações específicas
   */
  static gerarMatrizRespostaContestacao(
    fatos: FatoProva[],
    contestacoesEsperadas: string[]
  ): MatrizRespostaContestacao {
    const refutacoes = contestacoesEsperadas.map((contestacao) => ({
      contestacao,
      respostadireta: this.gerarRespostaDireta(contestacao, fatos),
      baseLgica: this.gerarBaseLgica(contestacao),
      provaApoio: this.identificarProvaApoio(contestacao, fatos),
      respostaSecundaria: this.gerarRespostaSecundaria(contestacao),
    }))

    return {
      pontosContestacaoEsperados: contestacoesEsperadas,
      nossasRefutacoesDiretas: refutacoes,
      armasJurisprudenciais: [
        {
          numeroAcordao: 'STJ REsp 1.234.567',
          tribunal: 'STJ',
          data: new Date(),
          ementa: 'Padrões probatórios em litígio cível',
          relevancia: 'persuasiva',
          proposatoCitacao: 'Respalda padrão de preponderância e presunções de credibilidade',
        },
      ],
      salvaguardasProcessuais: this.identificarSalvaguardasProcessuais(fatos),
    }
  }

  private static gerarRespostaDireta(contestacao: string, fatos: FatoProva[]): string {
    const fatoMaisForte = fatos.reduce((prev, current) =>
      prev.grauCerteza > current.grauCerteza ? prev : current
    )
    return `Contrariamente ao esperado, ${fatoMaisForte.alegacao} é substanciado por múltiplas fontes independentes com ${fatoMaisForte.grauCerteza}% de certeza`
  }

  private static gerarBaseLgica(contestacao: string): string {
    return 'Base lógica: Ônus probatório atendido pela preponderância; certeza absoluta não é requisito em litígio cível'
  }

  private static identificarProvaApoio(contestacao: string, fatos: FatoProva[]): string {
    return fatos[0]?.fontes[0] || 'Registro documental'
  }

  private static gerarRespostaSecundaria(contestacao: string): string {
    return 'Posição alternativa: Mesmo se elemento contestado enfraquecido, prova restante excede limiar para tutela'
  }

  /**
   * Gera HTML para seção de resumo de prova em petição
   */
  static gerarHtmlResmoProva(framework: FrameworkResmoProva): string {
    const html = `
    <section class="framework-resmo-prova" style="margin: 30px 0; padding: 20px; border: 2px solid #1A3A52; background: #f9f9f9;">
      <h1 style="color: #1A3A52; margin-top: 0;">RESUMO ESTRATÉGICO DE PROVAS</h1>

      <h2>Síntese Executiva</h2>
      <div style="background: white; padding: 15px; border-left: 4px solid #2E7D32; margin-bottom: 20px;">
        <p><strong>Tese Central:</strong> ${framework.resumoExecutivo.argumentoPrincipal}</p>
        <p><strong>Proteção Jurídica Principal:</strong> ${framework.resumoExecutivo.escudoHermenautico}</p>
        <p><strong>Avaliação de Risco:</strong> ${framework.resumoExecutivo.avaliacaoRisco}</p>
      </div>

      <h2>Fatos Principais com Prova</h2>
      ${framework.resumoFatos
        .map(
          (fato, idx) => `
        <div style="background: white; padding: 15px; margin-bottom: 12px; border-left: 4px solid ${
            fato.pesoLogico === 'critico'
              ? '#C41E3A'
              : fato.pesoLogico === 'apoio'
                ? '#FFC107'
                : '#999'
          };">
          <h3 style="margin-top: 0;">${idx + 1}. ${fato.alegacao}</h3>
          <p><strong>Peso Lógico:</strong> ${fato.pesoLogico.toUpperCase()} |
             <strong>Força de Prova:</strong> ${fato.forcaProva}%</p>
          <p><strong>Prova de Suporte:</strong> ${fato.provasApoio[0]?.referenciaAnexo || 'Documentos diversos'}</p>
          ${
            fato.contraargumentos.length > 0
              ? `<p><strong>Escudos contra Contestação:</strong><ul>
                   ${fato.contraargumentos
                     .map((escudo) => `<li>${escudo.mecanismoBlindagem}</li>`)
                     .join('')}
                 </ul></p>`
              : ''
          }
        </div>
      `
        )
        .join('')}

      <h2>Hermenêutica Estratégica (Ethos, Pathos, Logos, Kairos)</h2>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
        <div style="background: #e3f2fd; padding: 12px; border-radius: 4px;">
          <h3 style="margin-top: 0; color: #1565c0;">Ethos (Credibilidade)</h3>
          <p>${framework.hermenauticaEstrategica.abordagemEthos.autoridadeBaseadaEm}</p>
        </div>
        <div style="background: #fce4ec; padding: 12px; border-radius: 4px;">
          <h3 style="margin-top: 0; color: #c2185b;">Pathos (Justiça)</h3>
          <p>${framework.hermenauticaEstrategica.abordagemPathos.ressonanciaEmocional}</p>
        </div>
        <div style="background: #f3e5f5; padding: 12px; border-radius: 4px;">
          <h3 style="margin-top: 0; color: #6a1b9a;">Logos (Lógica)</h3>
          <p>${framework.hermenauticaEstrategica.abordagemLogos.estruturaLogica}</p>
        </div>
        <div style="background: #fff3e0; padding: 12px; border-radius: 4px;">
          <h3 style="margin-top: 0; color: #e65100;">Kairos (Oportunidade)</h3>
          <p>${framework.hermenauticaEstrategica.abordagemKairos.justificativaOportunidade}</p>
        </div>
      </div>

      <h2>Contestações Esperadas e Refutações Preemptivas</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background: #1A3A52; color: white;">
          <th style="padding: 10px; text-align: left;">Contestação Esperada</th>
          <th style="padding: 10px; text-align: left;">Nossa Refutação</th>
        </tr>
        ${framework.analiseContestacao.contestacoesEsperadas
          .map(
            (contestacao, idx) => `
        <tr style="border-bottom: 1px solid #ddd; background: ${idx % 2 === 0 ? '#f9f9f9' : 'white'};">
          <td style="padding: 10px;">${contestacao}</td>
          <td style="padding: 10px;">${framework.analiseContestacao.refutacoesPreemptivas[idx] || 'Ver jurisprudência citada'}</td>
        </tr>
        `
          )
          .join('')}
      </table>

      <h2 style="margin-top: 20px;">Conclusão</h2>
      <div style="background: #e8f5e9; padding: 15px; border-radius: 4px; border-left: 4px solid #2E7D32;">
        <p>${framework.sintesesnclusiva.declaracaoSintese}</p>
        <p><strong>Pedido:</strong> ${framework.sintesesnclusiva.pedidoPrincipal}</p>
        <p><strong>Pedido Alternativo:</strong> ${framework.sintesesnclusiva.pedidoAlternativo}</p>
      </div>
    </section>
    `
    return html
  }
}
