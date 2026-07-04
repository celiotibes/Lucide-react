/**
 * Matriz de Prova Visual
 * Visualização em tempo real da força probatória com cores e barras de progresso
 * Conforme cálculo de Jurimetria (TCP, Certeza, Score)
 */

import React, { useMemo } from 'react'
import { CORES_JUDICIAIS, FORCA_PROVA, ESPACAMENTO_PRE_ATENTIVO } from '@/utils/sistemaDesignJudicial'
import type { FatoProva, AnalisejurimetricaResult } from '@/types/jurimetriaBR'

interface MatrizProvaVisualProps {
  analise: AnalisejurimetricaResult | null
  fatos?: FatoProva[]
  exibirDetalhes?: boolean
  tamanho?: 'compacto' | 'normal' | 'expandido'
}

interface LinhaMatriz {
  id: string
  fato: string
  certeza: number
  peso: number
  forca: 'alta' | 'moderada' | 'fragil'
  icone: string
  fontesContagem: number
  observacoes?: string
}

export function MatrizProvaVisual({
  analise,
  fatos,
  exibirDetalhes = true,
  tamanho = 'normal',
}: MatrizProvaVisualProps) {
  const linhas: LinhaMatriz[] = useMemo(() => {
    if (!analise || !analise.fatos) return []

    return analise.fatos.map((fato) => {
      const certeza = fato.grauCerteza
      let forca: 'alta' | 'moderada' | 'fragil'

      if (certeza >= 80) {
        forca = 'alta'
      } else if (certeza >= 50) {
        forca = 'moderada'
      } else {
        forca = 'fragil'
      }

      return {
        id: fato.id || `fato-${Math.random()}`,
        fato: fato.descricao,
        certeza,
        peso: fato.peso || 1,
        forca,
        icone: FORCA_PROVA[forca].icone,
        fontesContagem: (fato.fontes?.length || 0),
        observacoes: fato.observacoes,
      }
    })
  }, [analise])

  if (!analise || linhas.length === 0) {
    return (
      <div style={styles.containerVazio}>
        <p>Nenhum fato adicionado ainda. Comece a inserir fatos da causa para visualizar a matriz.</p>
      </div>
    )
  }

  const cssCompacto = tamanho === 'compacto'
  const cssExpandido = tamanho === 'expandido'

  return (
    <div style={styles.container}>
      <div style={styles.cabecalho}>
        <h3 style={styles.titulo}>Matriz de Força Probatória</h3>
        <div style={styles.metricas}>
          <MetricaScore valor={analise.scorejurimetrico || 0} />
          <MetricaTCP valor={analise.tcp || 0} />
          <MetricaCerteza valor={analise.certezaMedia || 0} />
        </div>
      </div>

      <div style={styles.tabelaConteiner}>
        <table style={styles.tabela}>
          <thead style={styles.thead}>
            <tr>
              <th style={{ ...styles.th, width: cssCompacto ? '20%' : '25%' }}>Força</th>
              <th style={{ ...styles.th, width: cssCompacto ? '45%' : '45%' }}>Fato Provado</th>
              <th style={{ ...styles.th, width: cssCompacto ? '20%' : '15%' }}>Certeza</th>
              <th style={{ ...styles.th, width: cssCompacto ? '15%' : '15%' }}>Fontes</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, idx) => (
              <LinhaFato
                key={linha.id}
                linha={linha}
                indice={idx}
                expanded={cssExpandido}
                compacto={cssCompacto}
                exibirDetalhes={exibirDetalhes}
              />
            ))}
          </tbody>
        </table>
      </div>

      {exibirDetalhes && analise.lacunas && analise.lacunas.length > 0 && (
        <div style={styles.secaoLacunas}>
          <h4 style={styles.tituloLacunas}>⚠️ Lacunas Identificadas</h4>
          <ul style={styles.listaLacunas}>
            {analise.lacunas.map((lacuna, idx) => (
              <li key={idx} style={styles.itemLacuna}>
                <strong>{lacuna.fato}:</strong> {lacuna.risco} - {lacuna.sugestao}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

interface LinhaFatoProps {
  linha: LinhaMatriz
  indice: number
  expanded: boolean
  compacto: boolean
  exibirDetalhes: boolean
}

function LinhaFato({
  linha,
  indice,
  expanded,
  compacto,
  exibirDetalhes,
}: LinhaFatoProps) {
  const config = FORCA_PROVA[linha.forca]
  const alternada = indice % 2 === 0

  return (
    <>
      <tr
        style={{
          ...styles.tr,
          backgroundColor: alternada ? '#FAFAFA' : CORES_JUDICIAIS.brancoFundo,
        }}
      >
        <td style={{ ...styles.td, borderLeftColor: config.cor }}>
          <div style={styles.forcaConteiner}>
            <span style={{ color: config.cor, fontSize: compacto ? '14px' : '16px' }}>
              {linha.icone}
            </span>
            <span style={{ fontSize: '11px', color: CORES_JUDICIAIS.cinzaTextoSecundario }}>
              {linha.forca.toUpperCase()}
            </span>
          </div>
        </td>

        <td style={styles.td}>
          <div style={styles.fatoTexto}>
            <span style={styles.fatoDescricao}>{linha.fato}</span>
            {expanded && linha.observacoes && (
              <span style={styles.observacoes}>Nota: {linha.observacoes}</span>
            )}
          </div>
        </td>

        <td style={styles.td}>
          <div style={styles.barraConteiner}>
            <div
              style={{
                ...styles.barra,
                width: `${linha.certeza}%`,
                backgroundColor: config.cor,
              }}
            />
          </div>
          <span style={styles.percentual}>{linha.certeza}%</span>
        </td>

        <td style={styles.tdCentrado}>
          <span style={styles.fontes}>
            {linha.fontesContagem > 0 ? `${linha.fontesContagem}x` : '—'}
          </span>
        </td>
      </tr>
    </>
  )
}

interface MetricaProps {
  valor: number
}

function MetricaScore({ valor }: MetricaProps) {
  let cor = CORES_JUDICIAIS.verdeApoio
  let label = 'Excelente'

  if (valor < 40) {
    cor = CORES_JUDICIAIS.vermelhoCritico
    label = 'Crítico'
  } else if (valor < 60) {
    cor = CORES_JUDICIAIS.amareloAviso
    label = 'Atenção'
  } else if (valor < 80) {
    cor = CORES_JUDICIAIS.azulPrincipal
    label = 'Bom'
  }

  return (
    <div style={styles.metrica}>
      <div
        style={{
          ...styles.metricaValor,
          color: cor,
        }}
      >
        {valor.toFixed(0)}
      </div>
      <div style={styles.metricaLabel}>Score Jurimetria</div>
      <div style={{ ...styles.metricaStatus, color: cor }}>{label}</div>
    </div>
  )
}

function MetricaTCP({ valor }: MetricaProps) {
  return (
    <div style={styles.metrica}>
      <div style={styles.metricaValor}>{valor.toFixed(1)}%</div>
      <div style={styles.metricaLabel}>Cobertura</div>
      <div style={styles.metricaStatus}>de Fatos</div>
    </div>
  )
}

function MetricaCerteza({ valor }: MetricaProps) {
  return (
    <div style={styles.metrica}>
      <div style={styles.metricaValor}>{valor.toFixed(0)}%</div>
      <div style={styles.metricaLabel}>Certeza</div>
      <div style={styles.metricaStatus}>Média</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    border: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    borderRadius: '4px',
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    backgroundColor: CORES_JUDICIAIS.brancoFundo,
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: '12pt',
  },

  containerVazio: {
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    borderRadius: '4px',
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
    textAlign: 'center',
  },

  cabecalho: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: ESPACAMENTO_PRE_ATENTIVO.grande,
    paddingBottom: ESPACAMENTO_PRE_ATENTIVO.media,
    borderBottom: `2px solid ${CORES_JUDICIAIS.azulPrincipal}`,
  },

  titulo: {
    margin: '0',
    color: CORES_JUDICIAIS.azulPrincipal,
    fontSize: '14pt',
    fontWeight: 'bold',
  },

  metricas: {
    display: 'flex',
    gap: ESPACAMENTO_PRE_ATENTIVO.grande,
    justifyContent: 'flex-end',
  },

  metrica: {
    textAlign: 'center',
    minWidth: '80px',
  },

  metricaValor: {
    fontSize: '18pt',
    fontWeight: 'bold',
    marginBottom: '4px',
  },

  metricaLabel: {
    fontSize: '10pt',
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
    fontWeight: 'normal',
  },

  metricaStatus: {
    fontSize: '9pt',
    fontWeight: 'bold',
    marginTop: '2px',
  },

  tabelaConteiner: {
    overflowX: 'auto',
    marginBottom: ESPACAMENTO_PRE_ATENTIVO.grande,
  },

  tabela: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '11pt',
  },

  thead: {
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    borderBottom: `2px solid ${CORES_JUDICIAIS.azulPrincipal}`,
  },

  th: {
    padding: ESPACAMENTO_PRE_ATENTIVO.media,
    textAlign: 'left',
    fontWeight: 'bold',
    color: CORES_JUDICIAIS.azulPrincipal,
    fontSize: '11pt',
  },

  tr: {
    borderBottom: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
  },

  td: {
    padding: ESPACAMENTO_PRE_ATENTIVO.media,
    borderLeft: `4px solid transparent`,
    verticalAlign: 'middle',
  },

  tdCentrado: {
    padding: ESPACAMENTO_PRE_ATENTIVO.media,
    textAlign: 'center',
  },

  forcaConteiner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
  },

  fatoTexto: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },

  fatoDescricao: {
    fontWeight: '500',
    color: CORES_JUDICIAIS.pretoTexto,
  },

  observacoes: {
    fontSize: '10pt',
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
    fontStyle: 'italic',
  },

  barraConteiner: {
    width: '100%',
    height: '20px',
    backgroundColor: '#E0E0E0',
    borderRadius: '2px',
    overflow: 'hidden',
    marginBottom: '4px',
  },

  barra: {
    height: '100%',
    transition: 'width 0.3s ease',
  },

  percentual: {
    fontSize: '10pt',
    fontWeight: 'bold',
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
  },

  fontes: {
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '10pt',
    fontWeight: '500',
    color: CORES_JUDICIAIS.azulPrincipal,
  },

  secaoLacunas: {
    backgroundColor: '#FFF8E1',
    border: `1px solid ${CORES_JUDICIAIS.amareloAviso}`,
    borderRadius: '4px',
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    marginTop: ESPACAMENTO_PRE_ATENTIVO.grande,
  },

  tituloLacunas: {
    margin: '0 0 8px 0',
    color: CORES_JUDICIAIS.amareloAviso,
    fontSize: '12pt',
    fontWeight: 'bold',
  },

  listaLacunas: {
    margin: 0,
    paddingLeft: '20px',
    listStyle: 'disc',
  },

  itemLacuna: {
    marginBottom: '6px',
    fontSize: '11pt',
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
    lineHeight: 1.4,
  },
}
