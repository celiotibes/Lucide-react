/**
 * Lucide-react: Plataforma de Pesquisa Jurídica e Editor de Petições
 * FASE 4.2 - Frontend Integration with 4-Tier LLM Stack + Research Hub
 */

import { useState, useCallback } from 'react'
import { EditorLegalVisual } from './components/editor/EditorLegalVisual'
import { EditorWorkspace } from './components/editor/EditorWorkspace'
import { GerenciadorFatos } from './components/editor/GerenciadorFatos'
import { FormularioCálculos } from './components/FormularioCálculos'
import { ResearchHub } from './components/research/ResearchHub'
import { CORES_JUDICIAIS } from './utils/sistemaDesignJudicial'
import type { FatoProva } from './types/jurimetriaBR'
import './App.css'

function App() {
  const [fatos, setFatos] = useState<FatoProva[]>([])
  const [htmlAtual, setHtmlAtual] = useState<string>('')
  const [tituloDocumento, setTituloDocumento] = useState('Nova Petição Judicial')
  const [paginaAtiva, setPaginaAtiva] = useState<'editor' | 'editor-novo' | 'calculadores' | 'pesquisa'>('editor')

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
          <h1 style={styles.h1}>
            {paginaAtiva === 'editor'
              ? 'Editor Visual de Petições Judiciais'
              : paginaAtiva === 'calculadores'
                ? 'Calculadores Jurídicos'
                : 'Centro de Pesquisa 4-Tier LLM'}
          </h1>
          <p style={styles.subtitulo}>
            {paginaAtiva === 'editor'
              ? 'Plataforma integrada com análise de jurimetria e hermenêutica blindada'
              : paginaAtiva === 'calculadores'
                ? 'Cálculos especializados: Dano Material, Pensão Alimentícia e Dano Moral'
                : 'Pesquisa inteligente com roteamento automático (Claude, Groq, Gemini, Ollama)'}
          </p>
        </div>
        <div style={styles.navButtons}>
          <button
            onClick={() => setPaginaAtiva('editor')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'editor' ? styles.navButtonAtivo : {}),
            }}
          >
            📝 Editor
          </button>
          <button
            onClick={() => setPaginaAtiva('editor-novo')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'editor-novo' ? styles.navButtonAtivo : {}),
            }}
          >
            ✏️ Editor Sprint 5
          </button>
          <button
            onClick={() => setPaginaAtiva('calculadores')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'calculadores' ? styles.navButtonAtivo : {}),
            }}
          >
            🧮 Calculadores
          </button>
          <button
            onClick={() => setPaginaAtiva('pesquisa')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'pesquisa' ? styles.navButtonAtivo : {}),
            }}
          >
            🔍 Pesquisa
          </button>
        </div>
        <div style={styles.versao}>
          FASE 4.2 - Frontend LLM
        </div>
      </header>

      {/* Conteúdo principal */}
      <div style={styles.layoutPrincipal}>
        {paginaAtiva === 'editor' && (
          <>
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
          </>
        )}

        {paginaAtiva === 'editor-novo' && (
          <main style={styles.mainFullWidth}>
            <EditorWorkspace />
          </main>
        )}

        {paginaAtiva === 'calculadores' && (
          <main style={styles.mainFullWidth}>
            <FormularioCálculos />
          </main>
        )}

        {paginaAtiva === 'pesquisa' && (
          <main style={styles.mainFullWidth}>
            <ResearchHub />
          </main>
        )}
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

  navButtons: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },

  navButton: {
    padding: '6px 12px',
    backgroundColor: 'rgba(255,255,255,0.2)',
    color: 'white',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '4px',
    fontSize: '12pt',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },

  navButtonAtivo: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    border: '1px solid white',
    fontWeight: 'bold',
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

  mainFullWidth: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px',
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
