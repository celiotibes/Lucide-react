/**
 * Lucide-react: Plataforma de Pesquisa Jurídica e Editor de Petições
 * FASE 3A - Visual Law Editor com Integração TipTap e Análise de Jurimetria
 */

import { useState, useCallback } from 'react'
import { EditorLegalVisual } from './components/editor/EditorLegalVisual'
import { GerenciadorFatos } from './components/editor/GerenciadorFatos'
import { CORES_JUDICIAIS } from './utils/sistemaDesignJudicial'
import type { FatoProva } from './types/jurimetriaBR'
import './App.css'

function App() {
  const [fatos, setFatos] = useState<FatoProva[]>([])
  const [htmlAtual, setHtmlAtual] = useState<string>('')
  const [tituloDocumento, setTituloDocumento] = useState('Nova Petição Judicial')

  const atualizarFatos = useCallback((novosFatos: FatoProva[]) => {
    setFatos(novosFatos)
  }, [])

  const atualizarHtml = useCallback((novoHtml: string) => {
    setHtmlAtual(novoHtml)
  }, [])

  return (
    <div style={styles.app}>
      {/* Cabeçalho principal */}
      <header style={styles.header}>
        <div style={styles.logo}>
          ⚖️ Lucide-react
        </div>
        <div style={styles.headerTitulo}>
          <h1 style={styles.h1}>Editor Visual de Petições Judiciais</h1>
          <p style={styles.subtitulo}>Plataforma integrada com análise de jurimetria e hermenêutica blindada</p>
        </div>
        <div style={styles.versao}>
          FASE 3A - Visual Law
        </div>
      </header>

      {/* Conteúdo principal - Layout com sidebar e editor */}
      <div style={styles.layoutPrincipal}>
        {/* Sidebar - Gerenciador de Fatos */}
        <aside style={styles.sidebar}>
          <GerenciadorFatos
            fatos={fatos}
            onAtualizarFatos={atualizarFatos}
            expandido={true}
          />
        </aside>

        {/* Editor - Conteúdo principal */}
        <main style={styles.main}>
          <EditorLegalVisual
            titulo={tituloDocumento}
            conteudoInicial=""
            onMudar={atualizarHtml}
            exibirMatriz={true}
            exibirValidador={true}
            modoVisualizacao="dualview"
            fatos={fatos}
          />
        </main>
      </div>

      {/* Rodapé */}
      <footer style={styles.footer}>
        <p>
          Lucide-react © 2024 • Plataforma de pesquisa jurídica integrada com Legal Data Hunter,
          PubMed, Google Drive e análises avançadas de jurimetria
        </p>
        <p style={styles.footerSecundario}>
          Tecnologias: React 19 + TypeScript + TipTap + Vite • Tribunais suportados: TJPR, TJSC,
          TJMT, TJRO, TRF4, JFPR
        </p>
      </footer>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: '#FAFAFA',
    fontFamily: 'Arial, Helvetica, sans-serif',
  },

  header: {
    backgroundColor: CORES_JUDICIAIS.azulPrincipal,
    color: CORES_JUDICIAIS.brancoFundo,
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    borderBottom: `3px solid ${CORES_JUDICIAIS.vermelhoArgumento}`,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },

  logo: {
    fontSize: '20pt',
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
  },

  headerTitulo: {
    flex: 1,
  },

  h1: {
    margin: '0 0 4px 0',
    fontSize: '16pt',
    fontWeight: 'bold',
  },

  subtitulo: {
    margin: 0,
    fontSize: '11pt',
    opacity: 0.9,
  },

  versao: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '10pt',
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
  },

  layoutPrincipal: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    gap: '0',
  },

  sidebar: {
    width: '320px',
    borderRight: `2px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    overflowY: 'auto',
    padding: '16px',
    backgroundColor: CORES_JUDICIAIS.brancoFundo,
  },

  main: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },

  footer: {
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
    padding: '12px 24px',
    borderTop: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    fontSize: '10pt',
    textAlign: 'center',
  },

  footerSecundario: {
    margin: '4px 0 0 0',
    fontSize: '9pt',
    opacity: 0.8,
  },
}

export default App
