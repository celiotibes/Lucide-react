/**
 * Heat Map de Lacunas Probatórias
 * Visualiza distribuição de riscos e lacunas no caso
 */

import React, { useMemo } from 'react'
import { CORES_JUDICIAIS, ESPACAMENTO_PRE_ATENTIVO } from '@/utils/sistemaDesignJudicial'
import type { AnalisejurimetricaResult } from '@/types/jurimetriaBR'

interface HeatmapLacunasProps {
  analise: AnalisejurimetricaResult | null
  largura?: number
  altura?: number
}

interface CelulaRisco {
  id: string
  fato: string
  nivelRisco: 'critico' | 'alto' | 'moderado' | 'baixo'
  descricaoRisco: string
  sugestao: string
  intensidade: number // 0-100
}

export function HeatmapLacunas({
  analise,
  largura = 800,
  altura = 300,
}: HeatmapLacunasProps) {
  const celulas: CelulaRisco[] = useMemo(() => {
    if (!analise || !analise.lacunas || analise.lacunas.length === 0) {
      return []
    }

    return analise.lacunas.map((lacuna, idx) => {
      let nivelRisco: 'critico' | 'alto' | 'moderado' | 'baixo'
      let intensidade: number

      if (lacuna.risco.toLowerCase().includes('crítico')) {
        nivelRisco = 'critico'
        intensidade = 100
      } else if (lacuna.risco.toLowerCase().includes('alto')) {
        nivelRisco = 'alto'
        intensidade = 70
      } else if (lacuna.risco.toLowerCase().includes('moderado')) {
        nivelRisco = 'moderado'
        intensidade = 40
      } else {
        nivelRisco = 'baixo'
        intensidade = 20
      }

      return {
        id: `lacuna-${idx}`,
        fato: lacuna.fato,
        nivelRisco,
        descricaoRisco: lacuna.risco,
        sugestao: lacuna.sugestao,
        intensidade,
      }
    })
  }, [analise])

  if (celulas.length === 0) {
    return (
      <div style={styles.containerVazio}>
        <p>🟢 Nenhuma lacuna identificada. Caso com força probatória completa!</p>
      </div>
    )
  }

  const padding = 40
  const celulaLargura = (largura - padding * 2) / Math.max(celulas.length, 1) - 2
  const celulaAltura = altura - padding * 2

  const getCor = (nivelRisco: string): string => {
    switch (nivelRisco) {
      case 'critico':
        return CORES_JUDICIAIS.vermelhoCritico
      case 'alto':
        return CORES_JUDICIAIS.vermelhoArgumento
      case 'moderado':
        return CORES_JUDICIAIS.amareloAviso
      case 'baixo':
        return CORES_JUDICIAIS.verdeApoio
      default:
        return CORES_JUDICIAIS.cinzaBorda
    }
  }

  const contarPorNivel = {
    critico: celulas.filter((c) => c.nivelRisco === 'critico').length,
    alto: celulas.filter((c) => c.nivelRisco === 'alto').length,
    moderado: celulas.filter((c) => c.nivelRisco === 'moderado').length,
    baixo: celulas.filter((c) => c.nivelRisco === 'baixo').length,
  }

  return (
    <div style={styles.container}>
      <div style={styles.cabecalho}>
        <h4 style={styles.titulo}>🔥 Heat Map de Lacunas Probatórias</h4>
        <p style={styles.descricao}>
          Intensidade de riscos identificados no caso (quanto mais quente, maior o risco)
        </p>
      </div>

      {/* Escala de cores */}
      <div style={styles.escala}>
        <div style={{ ...styles.itemEscala, backgroundColor: CORES_JUDICIAIS.verdeApoio }}>
          <span>Baixo</span>
          <span style={styles.valueEscala}>0-25%</span>
        </div>
        <div style={{ ...styles.itemEscala, backgroundColor: CORES_JUDICIAIS.amareloAviso }}>
          <span>Moderado</span>
          <span style={styles.valueEscala}>25-50%</span>
        </div>
        <div style={{ ...styles.itemEscala, backgroundColor: CORES_JUDICIAIS.vermelhoArgumento }}>
          <span>Alto</span>
          <span style={styles.valueEscala}>50-75%</span>
        </div>
        <div style={{ ...styles.itemEscala, backgroundColor: CORES_JUDICIAIS.vermelhoCritico }}>
          <span>Crítico</span>
          <span style={styles.valueEscala}>75-100%</span>
        </div>
      </div>

      {/* Heat map */}
      <svg width={largura} height={altura} style={styles.svg}>
        {/* Eixo Y labels */}
        <text x={15} y={padding - 10} fontSize="10" fontWeight="bold" fill={CORES_JUDICIAIS.cinzaTextoSecundario}>
          Risco
        </text>

        {/* Grid e células */}
        {celulas.map((celula, idx) => {
          const x = padding + idx * (celulaLargura + 2)
          const corBase = getCor(celula.nivelRisco)

          // Criar gradiente de cor baseado na intensidade
          const corAlpha = `${corBase}99` // Adiciona transparência

          return (
            <g key={celula.id}>
              {/* Célula do heat map */}
              <rect
                x={x}
                y={padding}
                width={celulaLargura}
                height={celulaAltura}
                fill={corBase}
                opacity={celula.intensidade / 100}
                stroke={CORES_JUDICIAIS.cinzaBorda}
                strokeWidth="1"
                rx="2"
                style={{ cursor: 'pointer' }}
              />

              {/* Valor da intensidade */}
              <text
                x={x + celulaLargura / 2}
                y={padding + celulaAltura / 2 + 4}
                fontSize="12"
                fontWeight="bold"
                fill={celula.intensidade > 50 ? CORES_JUDICIAIS.brancoFundo : CORES_JUDICIAIS.pretoTexto}
                textAnchor="middle"
              >
                {celula.intensidade}%
              </text>

              {/* Label do fato (rotacionado) */}
              <text
                x={x + celulaLargura / 2}
                y={altura - 10}
                fontSize="8"
                fill={CORES_JUDICIAIS.cinzaTextoSecundario}
                textAnchor="middle"
              >
                F{idx + 1}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Detalhes das lacunas */}
      <div style={styles.detalhes}>
        <div style={styles.resumoRiscos}>
          <div style={{ ...styles.resumoItem, borderLeftColor: CORES_JUDICIAIS.vermelhoCritico }}>
            <span style={styles.label}>🔴 Crítico</span>
            <span style={styles.valor}>{contarPorNivel.critico}</span>
          </div>
          <div style={{ ...styles.resumoItem, borderLeftColor: CORES_JUDICIAIS.vermelhoArgumento }}>
            <span style={styles.label}>🟠 Alto</span>
            <span style={styles.valor}>{contarPorNivel.alto}</span>
          </div>
          <div style={{ ...styles.resumoItem, borderLeftColor: CORES_JUDICIAIS.amareloAviso }}>
            <span style={styles.label}>🟡 Moderado</span>
            <span style={styles.valor}>{contarPorNivel.moderado}</span>
          </div>
          <div style={{ ...styles.resumoItem, borderLeftColor: CORES_JUDICIAIS.verdeApoio }}>
            <span style={styles.label}>🟢 Baixo</span>
            <span style={styles.valor}>{contarPorNivel.baixo}</span>
          </div>
        </div>

        <div style={styles.listaLacunas}>
          {celulas.map((celula, idx) => (
            <div key={celula.id} style={styles.itemLacuna}>
              <div
                style={{
                  ...styles.indicadorRisco,
                  backgroundColor: getCor(celula.nivelRisco),
                }}
              />
              <div style={styles.conteudoLacuna}>
                <div style={styles.fatoLacuna}>
                  <span style={styles.numeroFato}>F{idx + 1}</span>
                  <span style={styles.nomeRisco}>{celula.nivelRisco.toUpperCase()}</span>
                </div>
                <p style={styles.descricaoLacunaTexto}>{celula.descricaoRisco}</p>
                <p style={styles.sugestaoTexto}>💡 {celula.sugestao}</p>
              </div>
            </div>
          ))}
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
    color: CORES_JUDICIAIS.verdeApoio,
    backgroundColor: '#E8F5E9',
    borderRadius: '4px',
    fontSize: '12pt',
    fontWeight: 'bold',
  },

  cabecalho: {
    marginBottom: ESPACAMENTO_PRE_ATENTIVO.grande,
    paddingBottom: ESPACAMENTO_PRE_ATENTIVO.media,
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

  escala: {
    display: 'flex',
    gap: ESPACAMENTO_PRE_ATENTIVO.media,
    marginBottom: ESPACAMENTO_PRE_ATENTIVO.grande,
    justifyContent: 'center',
  },

  itemEscala: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '8px 12px',
    borderRadius: '4px',
    color: CORES_JUDICIAIS.brancoFundo,
    fontSize: '10pt',
    fontWeight: 'bold',
    minWidth: '100px',
  },

  valueEscala: {
    fontSize: '9pt',
    opacity: 0.9,
    marginTop: '2px',
  },

  svg: {
    border: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    borderRadius: '4px',
    marginBottom: ESPACAMENTO_PRE_ATENTIVO.grande,
  },

  detalhes: {
    display: 'flex',
    flexDirection: 'column',
    gap: ESPACAMENTO_PRE_ATENTIVO.grande,
  },

  resumoRiscos: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: ESPACAMENTO_PRE_ATENTIVO.media,
  },

  resumoItem: {
    borderLeft: '4px solid',
    padding: ESPACAMENTO_PRE_ATENTIVO.media,
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    borderRadius: '3px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },

  label: {
    fontSize: '10pt',
    fontWeight: 'bold',
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
  },

  valor: {
    fontSize: '20pt',
    fontWeight: 'bold',
    color: CORES_JUDICIAIS.azulPrincipal,
    marginTop: '4px',
  },

  listaLacunas: {
    display: 'flex',
    flexDirection: 'column',
    gap: ESPACAMENTO_PRE_ATENTIVO.media,
    paddingTop: ESPACAMENTO_PRE_ATENTIVO.grande,
    borderTop: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
  },

  itemLacuna: {
    display: 'flex',
    gap: ESPACAMENTO_PRE_ATENTIVO.media,
    padding: ESPACAMENTO_PRE_ATENTIVO.media,
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    borderRadius: '4px',
  },

  indicadorRisco: {
    minWidth: '4px',
    borderRadius: '2px',
  },

  conteudoLacuna: {
    flex: 1,
  },

  fatoLacuna: {
    display: 'flex',
    gap: ESPACAMENTO_PRE_ATENTIVO.pequeno,
    alignItems: 'center',
    marginBottom: '4px',
  },

  numeroFato: {
    backgroundColor: CORES_JUDICIAIS.azulPrincipal,
    color: CORES_JUDICIAIS.brancoFundo,
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '10pt',
    fontWeight: 'bold',
  },

  nomeRisco: {
    fontSize: '10pt',
    fontWeight: 'bold',
    color: CORES_JUDICIAIS.cinzaTextoSecundario},

  descricaoLacunaTexto: {
    margin: '4px 0',
    fontSize: '10pt',
    color: CORES_JUDICIAIS.pretoTexto,
    lineHeight: 1.4,
  },

  sugestaoTexto: {
    margin: '4px 0 0 0',
    fontSize: '10pt',
    color: CORES_JUDICIAIS.verdeApoio,
    fontWeight: '500',
    lineHeight: 1.4,
  },
}
