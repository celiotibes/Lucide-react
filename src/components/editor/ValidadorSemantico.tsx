/**
 * Validador Semântico HTML
 * Validação em tempo real da estrutura HTML de acordo com padrões judiciais
 */

import React, { useEffect, useState } from 'react'
import { CORES_JUDICIAIS, ESPACAMENTO_PRE_ATENTIVO, validarSemanticaBasica } from '@/utils/sistemaDesignJudicial'

interface ValidadorSemanticoProps {
  html: string
  onValidacaoMudar?: (valido: boolean, avisos: string[], erros: string[]) => void
  exibirDetalhes?: boolean
}

interface EstadoValidacao {
  valido: boolean
  avisos: string[]
  erros: string[]
  ultimaVerificacao: Date | null
}

export function ValidadorSemantico({
  html,
  onValidacaoMudar,
  exibirDetalhes = true,
}: ValidadorSemanticoProps) {
  const [validacao, setValidacao] = useState<EstadoValidacao>({
    valido: true,
    avisos: [],
    erros: [],
    ultimaVerificacao: null,
  })

  useEffect(() => {
    // Debounce de 500ms
    const timer = setTimeout(() => {
      const resultado = validarSemanticaBasica(html)
      setValidacao({
        valido: resultado.valido,
        avisos: resultado.avisos,
        erros: resultado.erros,
        ultimaVerificacao: new Date(),
      })

      onValidacaoMudar?.(resultado.valido, resultado.avisos, resultado.erros)
    }, 500)

    return () => clearTimeout(timer)
  }, [html, onValidacaoMudar])

  if (!exibirDetalhes || (validacao.avisos.length === 0 && validacao.erros.length === 0)) {
    // Mostrar apenas ícone de status
    return (
      <div style={styles.statusIndicador}>
        {validacao.valido ? (
          <>
            <span style={styles.iconValido}>✓</span>
            <span style={styles.textValido}>HTML válido</span>
          </>
        ) : (
          <>
            <span style={styles.iconErro}>✗</span>
            <span style={styles.textErro}>HTML com problemas</span>
          </>
        )}
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.cabecalho}>
        <h4 style={styles.titulo}>
          {validacao.valido ? '✓ Validação' : '✗ Validação'}
        </h4>
        <span style={styles.timestamp}>
          {validacao.ultimaVerificacao?.toLocaleTimeString('pt-BR')}
        </span>
      </div>

      {validacao.erros.length > 0 && (
        <div style={{ ...styles.secao, borderColor: CORES_JUDICIAIS.vermelhoCritico }}>
          <h5 style={{ ...styles.tituloSecao, color: CORES_JUDICIAIS.vermelhoCritico }}>
            ✗ Erros ({validacao.erros.length})
          </h5>
          <ul style={styles.lista}>
            {validacao.erros.map((erro, idx) => (
              <li key={idx} style={{ ...styles.item, color: CORES_JUDICIAIS.vermelhoCritico }}>
                {erro}
              </li>
            ))}
          </ul>
        </div>
      )}

      {validacao.avisos.length > 0 && (
        <div style={{ ...styles.secao, borderColor: CORES_JUDICIAIS.amareloAviso }}>
          <h5 style={{ ...styles.tituloSecao, color: CORES_JUDICIAIS.amareloAviso }}>
            ⚠ Avisos ({validacao.avisos.length})
          </h5>
          <ul style={styles.lista}>
            {validacao.avisos.map((aviso, idx) => (
              <li key={idx} style={{ ...styles.item, color: CORES_JUDICIAIS.amareloAviso }}>
                {aviso}
              </li>
            ))}
          </ul>
        </div>
      )}

      {validacao.erros.length === 0 && validacao.avisos.length === 0 && (
        <div
          style={{
            ...styles.secao,
            borderColor: CORES_JUDICIAIS.verdeApoio,
            backgroundColor: '#E8F5E9',
          }}
        >
          <p style={{ color: CORES_JUDICIAIS.verdeApoio, margin: 0 }}>
            ✓ Documento sem erros de validação semântica
          </p>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    border: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    borderRadius: '4px',
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    fontSize: '11pt',
    fontFamily: 'Arial, Helvetica, sans-serif',
  },

  statusIndicador: {
    display: 'flex',
    alignItems: 'center',
    gap: ESPACAMENTO_PRE_ATENTIVO.pequeno,
    padding: ESPACAMENTO_PRE_ATENTIVO.medio,
    borderRadius: '4px',
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
  },

  iconValido: {
    color: CORES_JUDICIAIS.verdeApoio,
    fontSize: '14pt',
    fontWeight: 'bold',
  },

  textValido: {
    color: CORES_JUDICIAIS.verdeApoio,
    fontWeight: '500',
  },

  iconErro: {
    color: CORES_JUDICIAIS.vermelhoCritico,
    fontSize: '14pt',
    fontWeight: 'bold',
  },

  textErro: {
    color: CORES_JUDICIAIS.vermelhoCritico,
    fontWeight: '500',
  },

  cabecalho: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: ESPACAMENTO_PRE_ATENTIVO.medio,
    paddingBottom: ESPACAMENTO_PRE_ATENTIVO.medio,
    borderBottom: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
  },

  titulo: {
    margin: 0,
    fontSize: '12pt',
    fontWeight: 'bold',
    color: CORES_JUDICIAIS.azulPrincipal,
  },

  timestamp: {
    fontSize: '10pt',
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
  },

  secao: {
    borderLeft: '4px solid',
    padding: ESPACAMENTO_PRE_ATENTIVO.medio,
    marginBottom: ESPACAMENTO_PRE_ATENTIVO.medio,
    backgroundColor: CORES_JUDICIAIS.brancoFundo,
    borderRadius: '2px',
  },

  tituloSecao: {
    margin: '0 0 8px 0',
    fontSize: '11pt',
    fontWeight: 'bold',
  },

  lista: {
    margin: 0,
    paddingLeft: '20px',
    listStyle: 'disc',
  },

  item: {
    marginBottom: '4px',
    fontSize: '10pt',
    lineHeight: 1.4,
  },
}
