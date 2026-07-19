/**
 * Dashboard Analytics
 * Consolidação de todas as visualizações analíticas em um único painel
 */

import React, { useState, useCallback } from 'react'
import { GraficoCorrelacao } from './GraficoCorrelacao'
import { HeatmapLacunas } from './HeatmapLacunas'
import { TimelineEventos } from './TimelineEventos'
import { CORES_JUDICIAIS, ESPACAMENTO_PRE_ATENTIVO } from '@/utils/sistemaDesignJudicial'
import type { FatoProva, Analisejurimetrica } from '@/types/jurimetriaBR'

interface EventoCaso {
  id: string
  data: string
  titulo: string
  descricao: string
  tipo: 'contrato' | 'comunicacao' | 'testemunha' | 'documento' | 'acao' | 'marco'
  fatoAssociado?: string
  importancia: 'alta' | 'media' | 'baixa'
}

interface DashboardAnalyticsProps {
  fatos: FatoProva[]
  analise: Analisejurimetrica | null
  onExportarDados?: (dados: any) => void
}

type TipoVisualizacao = 'correlacao' | 'heatmap' | 'timeline' | 'resumo'

export function DashboardAnalytics({
  fatos,
  analise,
  onExportarDados,
}: DashboardAnalyticsProps) {
  const [visualizacaoAtiva, setVisualizacaoAtiva] = useState<TipoVisualizacao>('resumo')
  const [eventos, setEventos] = useState<EventoCaso[]>([])

  const adicionarEvento = useCallback((evento: EventoCaso) => {
    setEventos((prev) => [...prev, evento])
  }, [])

  const exportarDashboard = useCallback(() => {
    const dados = {
      dataExportacao: new Date().toISOString(),
      resumo: {
        totalFatos: fatos.length,
        scoreJurimetria: analise?.scorejurimetrico || 0,
        tcp: analise?.tcp || 0,
        certezaMedia: analise?.certezaMedia || 0,
        lacunas: analise?.lacunas?.length || 0,
      },
      fatos,
      analise,
      eventos,
    }

    const blob = new Blob([JSON.stringify(dados, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `dashboard-analise-${new Date().toISOString().split('T')[0]}.json`
    link.click()

    onExportarDados?.(dados)
  }, [fatos, analise, eventos, onExportarDados])

  const imprimirDashboard = useCallback(() => {
    window.print()
  }, [])

  return (
    <div style={styles.container}>
      {/* Cabeçalho */}
      <div style={styles.cabecalho}>
        <div>
          <h2 style={styles.titulo}>📊 Dashboard Analítico</h2>
          <p style={styles.subtitulo}>Análise completa da força probatória e riscos do caso</p>
        </div>

        <div style={styles.acoesHeader}>
          <button onClick={exportarDashboard} style={styles.botaoAcao}>
            ⬇️ Exportar JSON
          </button>
          <button onClick={imprimirDashboard} style={styles.botaoAcao}>
            🖨️ Imprimir
          </button>
        </div>
      </div>

      {/* Abas de navegação */}
      <div style={styles.abas}>
        <BotaoAba
          ativo={visualizacaoAtiva === 'resumo'}
          onClick={() => setVisualizacaoAtiva('resumo')}
        >
          📋 Resumo Executivo
        </BotaoAba>
        <BotaoAba
          ativo={visualizacaoAtiva === 'correlacao'}
          onClick={() => setVisualizacaoAtiva('correlacao')}
        >
          📊 Correlação
        </BotaoAba>
        <BotaoAba
          ativo={visualizacaoAtiva === 'heatmap'}
          onClick={() => setVisualizacaoAtiva('heatmap')}
        >
          🔥 Heat Map
        </BotaoAba>
        <BotaoAba
          ativo={visualizacaoAtiva === 'timeline'}
          onClick={() => setVisualizacaoAtiva('timeline')}
        >
          📅 Timeline
        </BotaoAba>
      </div>

      {/* Conteúdo */}
      <div style={styles.conteudo}>
        {visualizacaoAtiva === 'resumo' && (
          <ResumoExecutivo fatos={fatos} analise={analise} eventos={eventos} />
        )}

        {visualizacaoAtiva === 'correlacao' && (
          <GraficoCorrelacao fatos={fatos} analise={analise} largura={1000} altura={400} />
        )}

        {visualizacaoAtiva === 'heatmap' && (
          <HeatmapLacunas analise={analise} largura={1000} altura={300} />
        )}

        {visualizacaoAtiva === 'timeline' && (
          <TimelineEventos
            fatos={fatos}
            eventos={eventos}
            onAdicionarEvento={adicionarEvento}
          />
        )}
      </div>

      {/* Rodapé com links rápidos */}
      <div style={styles.rodape}>
        <span style={styles.rodapeTexto}>
          {fatos.length} fatos • {eventos.length} eventos • Score {analise?.scorejurimetrico?.toFixed(0) || 'N/A'}
        </span>
      </div>
    </div>
  )
}

interface BotaoAbaProps {
  ativo: boolean
  onClick: () => void
  children: React.ReactNode
}

function BotaoAba({ ativo, onClick, children }: BotaoAbaProps) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.botaoAba,
        borderBottomColor: ativo ? CORES_JUDICIAIS.azulPrincipal : 'transparent',
        borderBottomWidth: ativo ? '3px' : '1px',
        color: ativo ? CORES_JUDICIAIS.azulPrincipal : CORES_JUDICIAIS.cinzaTextoSecundario,
        fontWeight: ativo ? 'bold' : 'normal',
      }}
    >
      {children}
    </button>
  )
}

interface ResumoExecutivoProps {
  fatos: FatoProva[]
  analise: Analisejurimetrica | null
  eventos: EventoCaso[]
}

function ResumoExecutivo({ fatos, analise, eventos }: ResumoExecutivoProps) {
  if (!analise) {
    return (
      <div style={styles.vazio}>
        <p>Nenhuma análise disponível. Adicione fatos para gerar o resumo.</p>
      </div>
    )
  }

  const getStatusScore = (
    score: number
  ): { label: string; cor: string } => {
    if (score >= 80) return { label: 'Excelente', cor: CORES_JUDICIAIS.verdeApoio }
    if (score >= 60) return { label: 'Bom', cor: CORES_JUDICIAIS.azulPrincipal }
    if (score >= 40) return { label: 'Moderado', cor: CORES_JUDICIAIS.amareloAviso }
    return { label: 'Crítico', cor: CORES_JUDICIAIS.vermelhoCritico }
  }

  const status = getStatusScore(analise.scorejurimetrico || 0)

  return (
    <div style={styles.resumoContainer}>
      {/* Grid de métricas principais */}
      <div style={styles.gridMetricas}>
        <CartaoMetrica
          titulo="Score Jurimetria"
          valor={analise.scorejurimetrico?.toFixed(0) || 'N/A'}
          unidade="/100"
          cor={status.cor}
          status={status.label}
        />

        <CartaoMetrica
          titulo="Taxa de Cobertura"
          valor={analise.tcp?.toFixed(1) || 'N/A'}
          unidade="%"
          cor={CORES_JUDICIAIS.azulPrincipal}
          descricao="Fatos com prova"
        />

        <CartaoMetrica
          titulo="Certeza Média"
          valor={analise.certezaMedia?.toFixed(0) || 'N/A'}
          unidade="%"
          cor={CORES_JUDICIAIS.verdeApoio}
          descricao="Força de prova"
        />

        <CartaoMetrica
          titulo="Lacunas"
          valor={String(analise.lacunas?.length || 0)}
          unidade="identificadas"
          cor={
            (analise.lacunas?.length || 0) > 0
              ? CORES_JUDICIAIS.amareloAviso
              : CORES_JUDICIAIS.verdeApoio
          }
          descricao={
            (analise.lacunas?.length || 0) === 0 ? 'Nenhuma' : 'Ver detalhes'
          }
        />
      </div>

      {/* Análise de Fatos */}
      <div style={styles.secao}>
        <h4 style={styles.tituloSecao}>📋 Análise de Fatos</h4>
        <div style={styles.analiseGrid}>
          <div style={styles.itemAnalise}>
            <span style={styles.labelAnalise}>Total de Fatos</span>
            <span style={styles.valorAnalise}>{fatos.length}</span>
          </div>
          <div style={styles.itemAnalise}>
            <span style={styles.labelAnalise}>Com Prova Alta</span>
            <span style={styles.valorAnalise}>
              {fatos.filter((f) => f.grauCerteza >= 80).length}
            </span>
          </div>
          <div style={styles.itemAnalise}>
            <span style={styles.labelAnalise}>Com Prova Moderada</span>
            <span style={styles.valorAnalise}>
              {fatos.filter((f) => f.grauCerteza >= 50 && f.grauCerteza < 80).length}
            </span>
          </div>
          <div style={styles.itemAnalise}>
            <span style={styles.labelAnalise}>Com Prova Frágil</span>
            <span style={styles.valorAnalise}>
              {fatos.filter((f) => f.grauCerteza < 50).length}
            </span>
          </div>
        </div>
      </div>

      {/* Cronologia */}
      <div style={styles.secao}>
        <h4 style={styles.tituloSecao}>📅 Cronologia</h4>
        <div style={styles.cronologia}>
          <div style={styles.itemCronologia}>
            <span style={styles.labelCronologia}>Total de Eventos</span>
            <span style={styles.valorCronologia}>{eventos.length}</span>
          </div>
          {eventos.length > 0 && (
            <>
              <div style={styles.itemCronologia}>
                <span style={styles.labelCronologia}>Evento Mais Antigo</span>
                <span style={styles.valorCronologia}>
                  {new Date(eventos[0].data).toLocaleDateString('pt-BR')}
                </span>
              </div>
              <div style={styles.itemCronologia}>
                <span style={styles.labelCronologia}>Evento Mais Recente</span>
                <span style={styles.valorCronologia}>
                  {new Date(eventos[eventos.length - 1].data).toLocaleDateString('pt-BR')}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Recomendações */}
      <div style={styles.secao}>
        <h4 style={styles.tituloSecao}>💡 Recomendações</h4>
        <ul style={styles.listaRecomendacoes}>
          {analise.scorejurimetrico && analise.scorejurimetrico < 50 && (
            <li style={styles.recomendacao}>
              Score crítico ({analise.scorejurimetrico.toFixed(0)}/100). Reforce provas em fatos frágeis.
            </li>
          )}

          {analise.lacunas && analise.lacunas.length > 0 && (
            <li style={styles.recomendacao}>
              {analise.lacunas.length} lacuna(s) identificada(s). Consulte heat map para detalhes.
            </li>
          )}

          {analise.tcp && analise.tcp < 100 && (
            <li style={styles.recomendacao}>
              Taxa de cobertura em {analise.tcp.toFixed(1)}%. Alguns fatos carecem de prova.
            </li>
          )}

          {fatos.filter((f) => f.grauCerteza < 50).length > 0 && (
            <li style={styles.recomendacao}>
              {fatos.filter((f) => f.grauCerteza < 50).length} fato(s) com prova frágil. Fortaleça antes do recurso.
            </li>
          )}

          {analise.scorejurimetrico && analise.scorejurimetrico >= 80 && (
            <li style={styles.recomendacao}>
              ✓ Caso com força probatória excelente. Pronto para fase de hermenêutica blindada.
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}

interface CartaoMetricaProps {
  titulo: string
  valor: string
  unidade?: string
  cor: string
  status?: string
  descricao?: string
}

function CartaoMetrica({
  titulo,
  valor,
  unidade,
  cor,
  status,
  descricao,
}: CartaoMetricaProps) {
  return (
    <div
      style={{
        ...styles.cartaoMetrica,
        borderLeftColor: cor,
      }}
    >
      <p style={styles.tituloMetrica}>{titulo}</p>
      <div style={styles.valorMetrica}>
        <span style={{ ...styles.numeroMetrica, color: cor }}>{valor}</span>
        {unidade && <span style={styles.unidadeMetrica}>{unidade}</span>}
      </div>
      {status && <p style={{ ...styles.statusMetrica, color: cor }}>{status}</p>}
      {descricao && <p style={styles.descricaoMetrica}>{descricao}</p>}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: CORES_JUDICIAIS.brancoFundo,
    border: `2px solid ${CORES_JUDICIAIS.azulPrincipal}`,
    borderRadius: '4px',
    overflow: 'hidden',
    fontFamily: 'Arial, Helvetica, sans-serif',
  },

  cabecalho: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: CORES_JUDICIAIS.azulPrincipal,
    color: CORES_JUDICIAIS.brancoFundo,
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    borderBottom: `2px solid ${CORES_JUDICIAIS.vermelhoArgumento}`,
  },

  titulo: {
    margin: '0 0 4px 0',
    fontSize: '16pt',
    fontWeight: 'bold',
  },

  subtitulo: {
    margin: 0,
    fontSize: '10pt',
    opacity: 0.9,
  },

  acoesHeader: {
    display: 'flex',
    gap: ESPACAMENTO_PRE_ATENTIVO.medio,
  },

  botaoAcao: {
    padding: '8px 16px',
    backgroundColor: CORES_JUDICIAIS.brancoFundo,
    color: CORES_JUDICIAIS.azulPrincipal,
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '10pt',
  },

  abas: {
    display: 'flex',
    borderBottom: `2px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    padding: '0 ' + ESPACAMENTO_PRE_ATENTIVO.grande,
  },

  botaoAba: {
    padding: ESPACAMENTO_PRE_ATENTIVO.medio,
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '1px solid transparent',
    cursor: 'pointer',
    fontSize: '11pt',
    transition: 'all 0.2s ease',
  },

  conteudo: {
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    minHeight: '400px',
  },

  rodape: {
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    borderTop: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    padding: ESPACAMENTO_PRE_ATENTIVO.medio,
    textAlign: 'center',
    fontSize: '10pt',
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
  },

  rodapeTexto: {
    fontWeight: '500',
  },

  vazio: {
    textAlign: 'center',
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
  },

  resumoContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: ESPACAMENTO_PRE_ATENTIVO.grande,
  },

  gridMetricas: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: ESPACAMENTO_PRE_ATENTIVO.medio,
  },

  cartaoMetrica: {
    borderLeft: '4px solid',
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    borderRadius: '4px',
  },

  tituloMetrica: {
    margin: '0 0 8px 0',
    fontSize: '11pt',
    fontWeight: 'bold',
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
  },

  valorMetrica: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
    marginBottom: '8px',
  },

  numeroMetrica: {
    fontSize: '24pt',
    fontWeight: 'bold',
  },

  unidadeMetrica: {
    fontSize: '11pt',
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
  },

  statusMetrica: {
    margin: '0 0 4px 0',
    fontSize: '10pt',
    fontWeight: 'bold',
  },

  descricaoMetrica: {
    margin: 0,
    fontSize: '9pt',
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
  },

  secao: {
    paddingTop: ESPACAMENTO_PRE_ATENTIVO.grande,
    borderTop: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
  },

  tituloSecao: {
    margin: '0 0 12px 0',
    color: CORES_JUDICIAIS.azulPrincipal,
    fontSize: '12pt',
    fontWeight: 'bold',
  },

  analiseGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: ESPACAMENTO_PRE_ATENTIVO.medio,
  },

  itemAnalise: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: ESPACAMENTO_PRE_ATENTIVO.medio,
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    borderRadius: '4px',
  },

  labelAnalise: {
    fontSize: '10pt',
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
    fontWeight: '500',
  },

  valorAnalise: {
    fontSize: '18pt',
    fontWeight: 'bold',
    color: CORES_JUDICIAIS.azulPrincipal,
  },

  cronologia: {
    display: 'flex',
    gap: ESPACAMENTO_PRE_ATENTIVO.medio,
  },

  itemCronologia: {
    flex: 1,
    padding: ESPACAMENTO_PRE_ATENTIVO.medio,
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    borderRadius: '4px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },

  labelCronologia: {
    fontSize: '10pt',
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
    fontWeight: '500',
  },

  valorCronologia: {
    fontSize: '12pt',
    fontWeight: 'bold',
    color: CORES_JUDICIAIS.azulPrincipal,
  },

  listaRecomendacoes: {
    margin: 0,
    paddingLeft: '20px',
    listStyle: 'disc',
  },

  recomendacao: {
    marginBottom: '8px',
    fontSize: '11pt',
    color: CORES_JUDICIAIS.pretoTexto,
    lineHeight: 1.5,
  },
}
