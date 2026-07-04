/**
 * Painel Assistente IA
 * Interface para geração automática de hermenêutica, previsão de contestações e blindagem
 */

import React, { useState, useCallback } from 'react'
import {
  ServicoAssistenteIA,
  type PropostaHermenautica,
  type ContestacaoEsperada,
  type SugestaoBlindagem,
  type ResumoExecutivoGerado,
} from '@/services/servicoAssistenteIA'
import { CORES_JUDICIAIS, ESPACAMENTO_PRE_ATENTIVO, HERMENAUTICA_PILARES } from '@/utils/sistemaDesignJudicial'
import type { FatoProva, AnalisejurimetricaResult } from '@/types/jurimetriaBR'

interface PainelAssistenteIAProps {
  fatos: FatoProva[]
  analise: AnalisejurimetricaResult | null
  tituloAcao?: string
  teseAutor?: string
  onGenarHermenautica?: (hermenautica: PropostaHermenautica) => void
}

type TarefaAtiva =
  | 'hermenautica'
  | 'contestacoes'
  | 'blindagem'
  | 'resumo'
  | null

interface EstadoTarefa {
  carregando: boolean
  erro: string | null
  resultado: any
}

export function PainelAssistenteIA({
  fatos,
  analise,
  tituloAcao = 'Ação Judicial',
  teseAutor = '',
  onGenarHermenautica,
}: PainelAssistenteIAProps) {
  const [tarefaAtiva, setTarefaAtiva] = useState<TarefaAtiva>(null)
  const [tarefas, setTarefas] = useState<Record<TarefaAtiva, EstadoTarefa>>({
    hermenautica: { carregando: false, erro: null, resultado: null },
    contestacoes: { carregando: false, erro: null, resultado: null },
    blindagem: { carregando: false, erro: null, resultado: null },
    resumo: { carregando: false, erro: null, resultado: null },
  })

  const executarTarefa = useCallback(
    async (tarefa: TarefaAtiva) => {
      if (!analise || fatos.length === 0) {
        alert('Adicione fatos e analise-os antes de usar o assistente')
        return
      }

      setTarefaAtiva(tarefa)
      setTarefas((prev) => ({
        ...prev,
        [tarefa]: { carregando: true, erro: null, resultado: null },
      }))

      try {
        let resultado
        switch (tarefa) {
          case 'hermenautica':
            resultado = await ServicoAssistenteIA.gerarHermenauticaBlindada(
              fatos,
              analise,
              tituloAcao
            )
            onGenarHermenautica?.(resultado)
            break
          case 'contestacoes':
            resultado = await ServicoAssistenteIA.preverContestacoes(
              fatos,
              analise,
              teseAutor
            )
            break
          case 'blindagem':
            resultado = await ServicoAssistenteIA.gerarSugestoesBlindagem(
              fatos,
              analise,
              analise.lacunas || []
            )
            break
          case 'resumo':
            resultado = await ServicoAssistenteIA.gerarResumoExecutivo(
              fatos,
              analise,
              tituloAcao
            )
            break
        }

        setTarefas((prev) => ({
          ...prev,
          [tarefa]: { carregando: false, erro: null, resultado },
        }))
      } catch (erro) {
        setTarefas((prev) => ({
          ...prev,
          [tarefa]: {
            carregando: false,
            erro: `Erro ao processar: ${erro instanceof Error ? erro.message : 'Desconhecido'}`,
            resultado: null,
          },
        }))
      }
    },
    [fatos, analise, tituloAcao, teseAutor, onGenarHermenautica]
  )

  const estadoTarefaAtual = tarefaAtiva ? tarefas[tarefaAtiva] : null

  return (
    <div style={styles.container}>
      <div style={styles.cabecalho}>
        <h3 style={styles.titulo}>🤖 Assistente IA Jurídico</h3>
        <p style={styles.descricao}>
          Análise inteligente com Claude AI para hermenêutica, contestações e blindagem
        </p>
      </div>

      {/* Menu de tarefas */}
      <div style={styles.menuTarefas}>
        <BotaoTarefa
          ativo={tarefaAtiva === 'hermenautica'}
          carregando={tarefas.hermenautica.carregando}
          onClick={() => executarTarefa('hermenautica')}
        >
          📚 Hermenêutica Blindada
        </BotaoTarefa>

        <BotaoTarefa
          ativo={tarefaAtiva === 'contestacoes'}
          carregando={tarefas.contestacoes.carregando}
          onClick={() => executarTarefa('contestacoes')}
        >
          ⚔️ Contestações Previstas
        </BotaoTarefa>

        <BotaoTarefa
          ativo={tarefaAtiva === 'blindagem'}
          carregando={tarefas.blindagem.carregando}
          onClick={() => executarTarefa('blindagem')}
        >
          🛡️ Blindagem Estratégica
        </BotaoTarefa>

        <BotaoTarefa
          ativo={tarefaAtiva === 'resumo'}
          carregando={tarefas.resumo.carregando}
          onClick={() => executarTarefa('resumo')}
        >
          📝 Resumo Executivo
        </BotaoTarefa>
      </div>

      {/* Conteúdo por tarefa */}
      <div style={styles.conteudo}>
        {estadoTarefaAtual?.carregando && <TeladeCarregamento />}

        {estadoTarefaAtual?.erro && (
          <div style={styles.erro}>
            <strong>Erro:</strong> {estadoTarefaAtual.erro}
          </div>
        )}

        {!estadoTarefaAtual?.carregando && tarefaAtiva === 'hermenautica' && estadoTarefaAtual?.resultado && (
          <HermenauticaBlindada resultado={estadoTarefaAtual.resultado} />
        )}

        {!estadoTarefaAtual?.carregando &&
          tarefaAtiva === 'contestacoes' &&
          estadoTarefaAtual?.resultado && (
            <ContestacoesPrevistas resultado={estadoTarefaAtual.resultado} />
          )}

        {!estadoTarefaAtual?.carregando &&
          tarefaAtiva === 'blindagem' &&
          estadoTarefaAtual?.resultado && (
            <BlindagemEstrategica resultado={estadoTarefaAtual.resultado} />
          )}

        {!estadoTarefaAtual?.carregando &&
          tarefaAtiva === 'resumo' &&
          estadoTarefaAtual?.resultado && (
            <ResumoExecutivo resultado={estadoTarefaAtual.resultado} />
          )}

        {!tarefaAtiva && (
          <div style={styles.vazio}>
            <p>Clique em uma tarefa acima para gerar análise com IA</p>
          </div>
        )}
      </div>

      {/* Aviso sobre API */}
      <div style={styles.aviso}>
        <p style={styles.avisTexto}>
          ⚠️ Funciona em modo offline com sugestões padrão. Configure VITE_CLAUDE_API_KEY para Claude API
          real.
        </p>
      </div>
    </div>
  )
}

interface BotaoTarefaProps {
  ativo: boolean
  carregando: boolean
  onClick: () => void
  children: React.ReactNode
}

function BotaoTarefa({ ativo, carregando, onClick, children }: BotaoTarefaProps) {
  return (
    <button
      onClick={onClick}
      disabled={carregando}
      style={{
        ...styles.botaoTarefa,
        backgroundColor: ativo ? CORES_JUDICIAIS.azulPrincipal : CORES_JUDICIAIS.cinzaPaginaBg,
        color: ativo ? CORES_JUDICIAIS.brancoFundo : CORES_JUDICIAIS.pretoTexto,
        opacity: carregando ? 0.6 : 1,
        cursor: carregando ? 'wait' : 'pointer',
      }}
    >
      {carregando ? '⏳ Analisando...' : children}
    </button>
  )
}

function TeladeCarregamento() {
  return (
    <div style={styles.carregando}>
      <div style={styles.spinner} />
      <p>Analisando com IA...</p>
    </div>
  )
}

interface HermenauticaBlindadaProps {
  resultado: any
}

function HermenauticaBlindada({ resultado }: HermenauticaBlindadaProps) {
  return (
    <div style={styles.secaoResultado}>
      <h4 style={styles.tituloResultado}>📚 Hermenêutica Blindada Gerada</h4>

      {Object.entries(HERMENAUTICA_PILARES).map(([chave, pilar]) => (
        <div
          key={chave}
          style={{
            ...styles.pilar,
            borderLeftColor: pilar.cor,
          }}
        >
          <h5 style={{ ...styles.tituloPilar, color: pilar.cor }}>
            {pilar.titulo}
          </h5>
          <p style={styles.descricaoPilar}>
            {resultado[chave] || pilar.descricao}
          </p>
        </div>
      ))}
    </div>
  )
}

interface ContestacesPrevistaasProps {
  resultado: ContestacaoEsperada[]
}

function ContestacoesPrevistas({ resultado }: ContestacesPrevistaasProps) {
  return (
    <div style={styles.secaoResultado}>
      <h4 style={styles.tituloResultado}>⚔️ Contestações Esperadas e Respostas</h4>

      {resultado.map((contestacao, idx) => (
        <div key={idx} style={styles.contestacao}>
          <div style={styles.headerContestacao}>
            <h5 style={styles.tituloContestacao}>{contestacao.titulo}</h5>
            <span
              style={{
                ...styles.probabilidade,
                backgroundColor:
                  contestacao.probabilidade === 'alta'
                    ? CORES_JUDICIAIS.vermelhoCritico
                    : contestacao.probabilidade === 'media'
                      ? CORES_JUDICIAIS.amareloAviso
                      : CORES_JUDICIAIS.verdeApoio,
              }}
            >
              {contestacao.probabilidade.toUpperCase()}
            </span>
          </div>
          <p style={styles.descricaoContestacao}>{contestacao.descricao}</p>

          <div style={styles.boxResposta}>
            <h6 style={styles.labelResposta}>Nossa Resposta:</h6>
            <p style={styles.textoResposta}>{contestacao.contraproposta}</p>
          </div>

          <div style={styles.boxJurisprudencia}>
            <h6 style={styles.labelJurisprudencia}>🔗 Jurisprudência:</h6>
            <p style={styles.textoJurisprudencia}>{contestacao.citacaoJurisprudencia}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

interface BlindagemEstrategicaProps {
  resultado: SugestaoBlindagem[]
}

function BlindagemEstrategica({ resultado }: BlindagemEstrategicaProps) {
  return (
    <div style={styles.secaoResultado}>
      <h4 style={styles.tituloResultado}>🛡️ Sugestões de Blindagem Estratégica</h4>

      {resultado.map((sugestao, idx) => (
        <div key={idx} style={styles.sugestaoBlindagem}>
          <h5 style={styles.tituloSugestao}>{sugestao.fato}</h5>
          <p style={styles.risco}>
            <strong>⚠️ Risco:</strong> {sugestao.risco}
          </p>

          <div style={styles.boxEstrategia}>
            <h6 style={styles.labelEstrategia}>Estratégia de Reforço:</h6>
            <p style={styles.textoEstrategia}>{sugestao.estrategia}</p>
          </div>

          <div style={styles.boxDocumentacao}>
            <h6 style={styles.labelDocumentacao}>📋 Documentação Sugerida:</h6>
            <ul style={styles.listaDocumentacao}>
              {sugestao.documentacaoSugerida.map((doc, jdx) => (
                <li key={jdx} style={styles.itemDocumentacao}>
                  {doc}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  )
}

interface ResumoExecutivoProps {
  resultado: ResumoExecutivoGerado
}

function ResumoExecutivo({ resultado }: ResumoExecutivoProps) {
  return (
    <div style={styles.secaoResultado}>
      <h4 style={styles.tituloResultado}>📝 Resumo Executivo</h4>

      <div style={styles.tesecentral}>
        <h5 style={styles.labelTese}>Tese Central:</h5>
        <p style={styles.textoTese}>{resultado.tesecentral}</p>
      </div>

      <div style={styles.gridResumo}>
        <div style={styles.cardResumo}>
          <h5 style={{ ...styles.labelCard, color: CORES_JUDICIAIS.verdeApoio }}>
            ✓ Pontos Fortes
          </h5>
          <ul style={styles.listaResumo}>
            {resultado.pontosFortes.map((ponto, idx) => (
              <li key={idx}>{ponto}</li>
            ))}
          </ul>
        </div>

        <div style={styles.cardResumo}>
          <h5 style={{ ...styles.labelCard, color: CORES_JUDICIAIS.vermelhoCritico }}>
            ⚠️ Pontos Frágeis
          </h5>
          <ul style={styles.listaResumo}>
            {resultado.pontosFrageis.map((ponto, idx) => (
              <li key={idx}>{ponto}</li>
            ))}
          </ul>
        </div>
      </div>

      <div style={styles.estrategiaGeral}>
        <h5 style={styles.labelEstrategia}>Estratégia Geral:</h5>
        <p style={styles.textoEstrategia}>{resultado.estrategiaGeral}</p>
      </div>

      <div style={styles.chaveSucesso}>
        <h5 style={styles.labelChave}>🔑 Chave do Sucesso:</h5>
        <p style={styles.textoChave}>{resultado.chavedeSucesso}</p>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: CORES_JUDICIAIS.brancoFundo,
    border: `2px solid ${CORES_JUDICIAIS.azulPrincipal}`,
    borderRadius: '4px',
    fontFamily: 'Arial, Helvetica, sans-serif',
    overflow: 'hidden',
  },

  cabecalho: {
    backgroundColor: CORES_JUDICIAIS.azulPrincipal,
    color: CORES_JUDICIAIS.brancoFundo,
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
  },

  titulo: {
    margin: '0 0 4px 0',
    fontSize: '14pt',
    fontWeight: 'bold',
  },

  descricao: {
    margin: 0,
    fontSize: '10pt',
    opacity: 0.9,
  },

  menuTarefas: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: ESPACAMENTO_PRE_ATENTIVO.media,
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    borderBottom: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
  },

  botaoTarefa: {
    padding: ESPACAMENTO_PRE_ATENTIVO.media,
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '11pt',
    transition: 'all 0.2s ease',
  },

  conteudo: {
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    minHeight: '300px',
  },

  vazio: {
    textAlign: 'center',
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
  },

  carregando: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '300px',
    gap: ESPACAMENTO_PRE_ATENTIVO.grande,
  },

  spinner: {
    width: '40px',
    height: '40px',
    border: `3px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    borderTopColor: CORES_JUDICIAIS.azulPrincipal,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },

  erro: {
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    backgroundColor: '#FFEBEE',
    border: `1px solid ${CORES_JUDICIAIS.vermelhoCritico}`,
    borderRadius: '4px',
    color: CORES_JUDICIAIS.vermelhoCritico,
  },

  secaoResultado: {
    display: 'flex',
    flexDirection: 'column',
    gap: ESPACAMENTO_PRE_ATENTIVO.grande,
  },

  tituloResultado: {
    margin: '0 0 12px 0',
    color: CORES_JUDICIAIS.azulPrincipal,
    fontSize: '12pt',
    fontWeight: 'bold',
  },

  pilar: {
    borderLeft: '4px solid',
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    borderRadius: '4px',
  },

  tituloPilar: {
    margin: '0 0 8px 0',
    fontSize: '12pt',
    fontWeight: 'bold',
  },

  descricaoPilar: {
    margin: 0,
    fontSize: '11pt',
    lineHeight: 1.6,
    color: CORES_JUDICIAIS.pretoTexto,
  },

  contestacao: {
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    borderRadius: '4px',
    marginBottom: ESPACAMENTO_PRE_ATENTIVO.grande,
  },

  headerContestacao: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: ESPACAMENTO_PRE_ATENTIVO.media,
  },

  tituloContestacao: {
    margin: 0,
    color: CORES_JUDICIAIS.azulPrincipal,
    fontSize: '11pt',
    fontWeight: 'bold',
  },

  probabilidade: {
    padding: '2px 8px',
    borderRadius: '3px',
    color: CORES_JUDICIAIS.brancoFundo,
    fontSize: '9pt',
    fontWeight: 'bold',
  },

  descricaoContestacao: {
    margin: '0 0 10px 0',
    fontSize: '10pt',
    color: CORES_JUDICIAIS.pretoTexto,
  },

  boxResposta: {
    backgroundColor: CORES_JUDICIAIS.brancoFundo,
    padding: ESPACAMENTO_PRE_ATENTIVO.media,
    borderRadius: '3px',
    borderLeft: `3px solid ${CORES_JUDICIAIS.verdeApoio}`,
    marginBottom: ESPACAMENTO_PRE_ATENTIVO.media,
  },

  labelResposta: {
    margin: '0 0 4px 0',
    fontSize: '10pt',
    fontWeight: 'bold',
    color: CORES_JUDICIAIS.verdeApoio,
  },

  textoResposta: {
    margin: 0,
    fontSize: '10pt',
    lineHeight: 1.5,
    color: CORES_JUDICIAIS.pretoTexto,
  },

  boxJurisprudencia: {
    backgroundColor: CORES_JUDICIAIS.brancoFundo,
    padding: ESPACAMENTO_PRE_ATENTIVO.media,
    borderRadius: '3px',
    borderLeft: `3px solid ${CORES_JUDICIAIS.azulPrincipal}`,
  },

  labelJurisprudencia: {
    margin: '0 0 4px 0',
    fontSize: '10pt',
    fontWeight: 'bold',
    color: CORES_JUDICIAIS.azulPrincipal,
  },

  textoJurisprudencia: {
    margin: 0,
    fontSize: '10pt',
    lineHeight: 1.5,
    fontStyle: 'italic',
    color: CORES_JUDICIAIS.pretoTexto,
  },

  sugestaoBlindagem: {
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    borderRadius: '4px',
    marginBottom: ESPACAMENTO_PRE_ATENTIVO.grande,
    borderLeft: `4px solid ${CORES_JUDICIAIS.vermelhoArgumento}`,
  },

  tituloSugestao: {
    margin: '0 0 8px 0',
    color: CORES_JUDICIAIS.azulPrincipal,
    fontSize: '11pt',
    fontWeight: 'bold',
  },

  risco: {
    margin: '0 0 10px 0',
    fontSize: '10pt',
    color: CORES_JUDICIAIS.vermelhoCritico,
  },

  boxEstrategia: {
    backgroundColor: CORES_JUDICIAIS.brancoFundo,
    padding: ESPACAMENTO_PRE_ATENTIVO.media,
    borderRadius: '3px',
    marginBottom: ESPACAMENTO_PRE_ATENTIVO.media,
  },

  labelEstrategia: {
    margin: '0 0 4px 0',
    fontSize: '10pt',
    fontWeight: 'bold',
    color: CORES_JUDICIAIS.azulPrincipal,
  },

  textoEstrategia: {
    margin: 0,
    fontSize: '10pt',
    lineHeight: 1.5,
    color: CORES_JUDICIAIS.pretoTexto,
  },

  boxDocumentacao: {
    backgroundColor: CORES_JUDICIAIS.brancoFundo,
    padding: ESPACAMENTO_PRE_ATENTIVO.media,
    borderRadius: '3px',
  },

  labelDocumentacao: {
    margin: '0 0 8px 0',
    fontSize: '10pt',
    fontWeight: 'bold',
    color: CORES_JUDICIAIS.azulPrincipal,
  },

  listaDocumentacao: {
    margin: 0,
    paddingLeft: '20px',
  },

  itemDocumentacao: {
    fontSize: '10pt',
    marginBottom: '4px',
    color: CORES_JUDICIAIS.pretoTexto,
  },

  tesecentral: {
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    borderRadius: '4px',
    borderLeft: `4px solid ${CORES_JUDICIAIS.azulPrincipal}`,
  },

  labelTese: {
    margin: '0 0 8px 0',
    fontSize: '11pt',
    fontWeight: 'bold',
    color: CORES_JUDICIAIS.azulPrincipal,
  },

  textoTese: {
    margin: 0,
    fontSize: '11pt',
    lineHeight: 1.6,
    color: CORES_JUDICIAIS.pretoTexto,
  },

  gridResumo: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: ESPACAMENTO_PRE_ATENTIVO.media,
  },

  cardResumo: {
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    borderRadius: '4px',
  },

  labelCard: {
    margin: '0 0 8px 0',
    fontSize: '11pt',
    fontWeight: 'bold',
  },

  listaResumo: {
    margin: 0,
    paddingLeft: '20px',
  },

  chaveSucesso: {
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    backgroundColor: '#FFF8E1',
    border: `1px solid ${CORES_JUDICIAIS.amareloAviso}`,
    borderRadius: '4px',
  },

  labelChave: {
    margin: '0 0 8px 0',
    fontSize: '11pt',
    fontWeight: 'bold',
    color: CORES_JUDICIAIS.amareloAviso},

  textoChave: {
    margin: 0,
    fontSize: '11pt',
    lineHeight: 1.6,
    color: CORES_JUDICIAIS.pretoTexto,
  },

  aviso: {
    backgroundColor: '#FFF3E0',
    border: `1px solid ${CORES_JUDICIAIS.amareloAviso}`,
    borderTop: 'none',
    padding: ESPACAMENTO_PRE_ATENTIVO.media,
    fontSize: '10pt',
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
  },

  avisTexto: {
    margin: 0,
  },
}
