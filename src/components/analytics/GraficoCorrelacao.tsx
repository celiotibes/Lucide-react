/**
 * Gráfico de Correlação de Fatos
 * Visualiza como cada fato se correlaciona e impacta o score jurimetria geral
 */

import React, { useMemo } from 'react'
import { CORES_JUDICIAIS, ESPACAMENTO_PRE_ATENTIVO, FORCA_PROVA } from '@/utils/sistemaDesignJudicial'
import type { FatoProva, Analisejurimetrica } from '@/types/jurimetriaBR'

interface GraficoCorrelacaoProps {
  fatos: FatoProva[]
  analise: Analisejurimetrica | null
  largura?: number
  altura?: number
}

interface NodoFato {
  id: string
  descricao: string
  certeza: number
  peso: number
  forca: 'alta' | 'moderada' | 'fragil'
  impactoScore: number // 0-100: quanto este fato impacta o score total
}

export function GraficoCorrelacao({
  fatos,
  analise,
  largura = 600,
  altura = 400,
}: GraficoCorrelacaoProps) {
  const nodos: NodoFato[] = useMemo(() => {
    if (!fatos || !analise) return []

    return fatos.map((fato) => {
      const certeza = fato.grauCerteza || 0
      const peso = fato.peso || 1

      let forca: 'alta' | 'moderada' | 'fragil'
      if (certeza >= 80) {
        forca = 'alta'
      } else if (certeza >= 50) {
        forca = 'moderada'
      } else {
        forca = 'fragil'
      }

      // Impacto = (Certeza * Peso) / (número de fatos)
      const impactoScore = (certeza * peso) / Math.max(fatos.length, 1)

      return {
        id: fato.id || `fato-${Math.random()}`,
        descricao: fato.descricao,
        certeza,
        peso,
        forca,
        impactoScore,
      }
    })
  }, [fatos, analise])

  if (nodos.length === 0) {
    return (
      <div style={styles.containerVazio}>
        <p>Nenhum fato para correlacionar. Adicione fatos para visualizar gráfico.</p>
      </div>
    )
  }

  const padding = 40
  const areaLargura = largura - padding * 2
  const areaAltura = altura - padding * 2

  // Escala vertical: impacto de cada fato
  const maxImpacto = Math.max(...nodos.map((n) => n.impactoScore), 1)
  const escalaY = (impacto: number) => areaAltura - (impacto / maxImpacto) * areaAltura

  return (
    <div style={styles.container}>
      <div style={styles.cabecalho}>
        <h4 style={styles.titulo}>📊 Correlação de Fatos e Impacto no Score</h4>
        <p style={styles.descricao}>
          Cada barra mostra quanto cada fato contribui para o score total
        </p>
      </div>

      <svg
        width={largura}
        height={altura}
        style={styles.svg}
        viewBox={`0 0 ${largura} ${altura}`}
      >
        {/* Eixo X */}
        <line
          x1={padding}
          y1={altura - padding}
          x2={largura - padding}
          y2={altura - padding}
          stroke={CORES_JUDICIAIS.cinzaBorda}
          strokeWidth="2"
        />

        {/* Eixo Y */}
        <line
          x1={padding}
          y1={padding}
          x2={padding}
          y2={altura - padding}
          stroke={CORES_JUDICIAIS.cinzaBorda}
          strokeWidth="2"
        />

        {/* Grid horizontal (referência) */}
        {[0.25, 0.5, 0.75, 1].map((pct, idx) => {
          const y = altura - padding - areaAltura * pct
          return (
            <g key={`grid-${idx}`}>
              <line
                x1={padding}
                y1={y}
                x2={largura - padding}
                y2={y}
                stroke={CORES_JUDICIAIS.cinzaBorda}
                strokeWidth="1"
                strokeDasharray="4,4"
                opacity="0.5"
              />
              <text
                x={padding - 35}
                y={y + 4}
                fontSize="10"
                fill={CORES_JUDICIAIS.cinzaTextoSecundario}
              >
                {Math.round(pct * 100)}%
              </text>
            </g>
          )
        })}

        {/* Barras para cada fato */}
        {nodos.map((nodo, idx) => {
          const larguraBarraMax = areaLargura / nodos.length * 0.8
          const espacoBarras = areaLargura / nodos.length
          const x = padding + idx * espacoBarras + espacoBarras * 0.1
          const yAltura = escalaY(nodo.impactoScore)
          const cor = FORCA_PROVA[nodo.forca].cor

          return (
            <g key={nodo.id}>
              {/* Barra */}
              <rect
                x={x}
                y={yAltura}
                width={larguraBarraMax}
                height={altura - padding - yAltura}
                fill={cor}
                opacity="0.8"
                rx="2"
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => {
                  (e.target as SVGElement).setAttribute('opacity', '1')
                }}
                onMouseLeave={(e) => {
                  (e.target as SVGElement).setAttribute('opacity', '0.8')
                }}
              />

              {/* Label do impacto */}
              <text
                x={x + larguraBarraMax / 2}
                y={yAltura - 5}
                fontSize="11"
                fontWeight="bold"
                fill={cor}
                textAnchor="middle"
              >
                {nodo.impactoScore.toFixed(0)}%
              </text>

              {/* Label do fato (rotacionado) */}
              <text
                x={x + larguraBarraMax / 2}
                y={altura - padding + 20}
                fontSize="9"
                fill={CORES_JUDICIAIS.pretoTexto}
                textAnchor="middle"
              >
                F{idx + 1}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Legenda */}
      <div style={styles.legenda}>
        {nodos.map((nodo, idx) => (
          <div key={nodo.id} style={styles.itemLegenda}>
            <span style={styles.numeroLegenda}>F{idx + 1}</span>
            <span style={styles.textoLegenda}>{nodo.descricao.substring(0, 40)}...</span>
            <span
              style={{
                ...styles.certezaLegenda,
                color: FORCA_PROVA[nodo.forca].cor,
              }}
            >
              {nodo.certeza}%
            </span>
          </div>
        ))}
      </div>

      {/* Resumo */}
      <div style={styles.resumo}>
        <div style={styles.resumoItem}>
          <span style={styles.resumoLabel}>Total de Fatos:</span>
          <span style={styles.resumoValor}>{nodos.length}</span>
        </div>
        <div style={styles.resumoItem}>
          <span style={styles.resumoLabel}>Impacto Médio:</span>
          <span style={styles.resumoValor}>
            {(nodos.reduce((sum, n) => sum + n.impactoScore, 0) / nodos.length).toFixed(0)}%
          </span>
        </div>
        <div style={styles.resumoItem}>
          <span style={styles.resumoLabel}>Fato com Maior Impacto:</span>
          <span style={styles.resumoValor}>
            F{nodos.indexOf(nodos.reduce((max, n) => (n.impactoScore > max.impactoScore ? n : max))) + 1}
          </span>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: CORES_JUDICIAIS.brancoFundo,
    border: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    borderRadius: '4px',
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    fontFamily: 'Arial, Helvetica, sans-serif',
  },

  containerVazio: {
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    textAlign: 'center',
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    borderRadius: '4px',
  },

  cabecalho: {
    marginBottom: ESPACAMENTO_PRE_ATENTIVO.grande,
    paddingBottom: ESPACAMENTO_PRE_ATENTIVO.medio,
    borderBottom: `2px solid ${CORES_JUDICIAIS.azulPrincipal}`,
  },

  titulo: {
    margin: '0 0 4px 0',
    color: CORES_JUDICIAIS.azulPrincipal,
    fontSize: '12pt',
    fontWeight: 'bold',
  },

  descricao: {
    margin: 0,
    fontSize: '10pt',
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
  },

  svg: {
    marginBottom: ESPACAMENTO_PRE_ATENTIVO.grande,
    border: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    borderRadius: '4px',
  },

  legenda: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: ESPACAMENTO_PRE_ATENTIVO.medio,
    marginBottom: ESPACAMENTO_PRE_ATENTIVO.grande,
    paddingBottom: ESPACAMENTO_PRE_ATENTIVO.grande,
    borderBottom: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
  },

  itemLegenda: {
    display: 'flex',
    alignItems: 'center',
    gap: ESPACAMENTO_PRE_ATENTIVO.pequeno,
    fontSize: '10pt',
  },

  numeroLegenda: {
    backgroundColor: CORES_JUDICIAIS.azulPrincipal,
    color: CORES_JUDICIAIS.brancoFundo,
    padding: '2px 6px',
    borderRadius: '3px',
    fontWeight: 'bold',
    minWidth: '25px',
    textAlign: 'center',
  },

  textoLegenda: {
    flex: 1,
    color: CORES_JUDICIAIS.pretoTexto,
  },

  certezaLegenda: {
    fontWeight: 'bold',
    minWidth: '40px',
    textAlign: 'right',
  },

  resumo: {
    display: 'flex',
    gap: ESPACAMENTO_PRE_ATENTIVO.grande,
    padding: ESPACAMENTO_PRE_ATENTIVO.medio,
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    borderRadius: '4px',
  },

  resumoItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },

  resumoLabel: {
    fontSize: '10pt',
    fontWeight: 'bold',
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
  },

  resumoValor: {
    fontSize: '14pt',
    fontWeight: 'bold',
    color: CORES_JUDICIAIS.azulPrincipal,
  },
}
