/**
 * Lucide-react: Plataforma de Pesquisa Jurídica e Editor de Petições
 * FASE 4.2 - Frontend Integration with 4-Tier LLM Stack + Research Hub
 */

import { useState, useCallback, useEffect } from 'react'
import { Dashboard } from './components/dashboard/Dashboard'
import { DocumentManager } from './components/documents/DocumentManager'
import { MobileNav } from './components/mobile/MobileNav'
import { LoginRegister } from './components/auth/LoginRegister'
import { useAuth } from './hooks/useAuth'
import { AdvancedSearchDocuments } from './components/search/AdvancedSearchDocuments'
import { EditorLegalVisual } from './components/editor/EditorLegalVisual'
import { EditorWorkspace } from './components/editor/EditorWorkspace'
import { GerenciadorFatos } from './components/editor/GerenciadorFatos'
import { FormularioCálculos } from './components/FormularioCálculos'
import { ResearchHub } from './components/research/ResearchHub'
import { LLMConfigPanel } from './components/llm/LLMConfigPanel'
import { LLMTestPanel } from './components/llm/LLMTestPanel'
import { RAGAnalysisPanel } from './components/rag/RAGAnalysisPanel'
import { PetitionTransformerPanel } from './components/petitionTransformer/PetitionTransformerPanel'
import { JurisprudenceTimeline } from './components/timeline/JurisprudenceTimeline'
import { StrategicAnalysisPanel } from './components/analysis/StrategicAnalysisPanel'
import { OutcomePredictorPanel } from './components/prediction/OutcomePredictorPanel'
import { TemplateMatchingPanel } from './components/templates/TemplateMatchingPanel'
import { AdvancedSearchUI } from './components/search/AdvancedSearchUI'
import { AIProviderStats } from './components/aiOptimization/AIProviderStats'
import { ImportExportPanel } from './components/documents/ImportExportPanel'
import { TemplateManager } from './components/templates/TemplateManager'
import { DocumentSharingManager } from './components/sharing/DocumentSharingManager'
import { PDFExportPanel } from './components/pdfExport/PDFExportPanel'
import { AnnotationsPanel } from './components/annotations/AnnotationsPanel'
import { NotificationContainer } from './components/notifications/NotificationContainer'
import { AnalyticsDashboard } from './components/analytics/AnalyticsDashboard'
import { ReportBuilder } from './components/reports/ReportBuilder'
import { GoogleDriveSync } from './components/googleDrive/GoogleDriveSync'
import { GmailIntegration } from './components/gmail/GmailIntegration'
import { PWAPrompt } from './components/pwa/PWAPrompt'
import { CORES_JUDICIAIS } from './utils/sistemaDesignJudicial'
import type { FatoProva } from './types/jurimetriaBR'
import { aiProviderCache } from './services/aiProviderCache'
import { useAIProviderAlerts } from './hooks/useAIProviderAlerts'
import { useBudgetAlerts } from './hooks/useBudgetAlerts'
import './App.css'
import './App.mobile.css'

function App() {
  const { estaLogado, usuario, logout, carregando } = useAuth()
  const [fatos, setFatos] = useState<FatoProva[]>([])
  const [_htmlAtual, _setHtmlAtual] = useState<string>('')
  const [tituloDocumento, setTituloDocumento] = useState('Nova Petição Judicial')
  const [documentoAtual, setDocumentoAtual] = useState<{ id: string; tipo: 'editor-novo' | 'editor' | 'analise' | 'transformacao' } | null>(null)

  // FASE 7.4: Toast notifications para alertas do AI Provider
  useAIProviderAlerts()

  // FASE 8: Budget tracking e alertas de custo
  useBudgetAlerts()
  const [paginaAtiva, setPaginaAtiva] = useState<'dashboard' | 'documents' | 'document-search' | 'editor' | 'editor-novo' | 'calculadores' | 'pesquisa' | 'llm-config' | 'llm-test' | 'rag-analysis' | 'petition-transformer' | 'timeline' | 'strategic-analysis' | 'outcome-prediction' | 'template-matching' | 'advanced-search' | 'search-manager' | 'import-export' | 'templates' | 'sharing' | 'pdf-export' | 'annotations' | 'analytics' | 'reports' | 'google-drive' | 'gmail' | 'ai-optimization'>('dashboard')

  const atualizarFatos = useCallback((novosFatos: FatoProva[]) => {
    setFatos(novosFatos)
  }, [])

  const atualizarHtml = useCallback((novoHtml: string) => {
    _setHtmlAtual(novoHtml)
  }, [])

  // Preaquecimento de cache na inicialização
  useEffect(() => {
    if (estaLogado) {
      aiProviderCache.warmupCache()
    }
  }, [estaLogado])

  // Mostrar tela de carregamento
  if (carregando) {
    return (
      <div style={styles.app}>
        <div style={styles.loadingScreen}>
          <h2>⏳ Carregando...</h2>
        </div>
      </div>
    )
  }

  // Mostrar tela de login se não estiver autenticado
  if (!estaLogado) {
    return <LoginRegister onLoginSuccess={() => window.location.reload()} />
  }

  return (
    <div style={styles.app}>
      {/* Cabeçalho principal */}
      <header style={styles.header}>
        <MobileNav
          paginaAtiva={paginaAtiva}
          onNavegar={(pagina) => setPaginaAtiva(pagina as any)}
          versao="FASE 4.2 - Frontend LLM"
        />
        <div style={styles.logo}>
          ⚖️ Lucide-react
        </div>
        <div style={styles.headerTitulo}>
          <h1 style={styles.h1}>
            {paginaAtiva === 'dashboard'
              ? '⚖️ Lucide-react'
              : paginaAtiva === 'documents'
                ? '📄 Gerenciador de Documentos'
                : paginaAtiva === 'document-search'
                  ? '🔍 Busca Avançada de Documentos'
                  : paginaAtiva === 'editor'
                  ? 'Editor Visual de Petições Judiciais'
                  : paginaAtiva === 'editor-novo'
                    ? 'Editor Sprint 5 - Gerenciamento Completo'
                    : paginaAtiva === 'calculadores'
                      ? 'Calculadores Jurídicos'
                      : paginaAtiva === 'pesquisa'
                        ? 'Centro de Pesquisa Jurídica'
                        : paginaAtiva === 'llm-config'
                          ? 'Configuração 4-Tier LLM'
                          : paginaAtiva === 'llm-test'
                            ? 'Teste de Roteamento LLM'
                            : paginaAtiva === 'rag-analysis'
                              ? 'Análise RAG de Petições'
                              : paginaAtiva === 'petition-transformer'
                                ? 'Transformador de Petições Autônomo'
                                : paginaAtiva === 'timeline'
                                  ? 'Evolução da Jurisprudência'
                                  : paginaAtiva === 'strategic-analysis'
                                    ? 'Análise Estratégica & Blindagem'
                                    : paginaAtiva === 'outcome-prediction'
                                      ? 'Preditor de Resultado'
                                      : paginaAtiva === 'template-matching'
                                        ? 'Correspondência de Modelos Jurídicos'
                                        : paginaAtiva === 'import-export'
                                          ? '📤📥 Import/Export'
                                          : paginaAtiva === 'templates'
                                            ? '📋 Templates de Documentos'
                                            : paginaAtiva === 'sharing'
                                              ? '🔗 Compartilhar Documentos'
                                              : paginaAtiva === 'pdf-export'
                                                ? '📄 PDF Export Avançado'
                                                : paginaAtiva === 'annotations'
                                                  ? '📝 Anotações e Comentários'
                                                  : paginaAtiva === 'analytics'
                                                    ? '📊 Analytics Dashboard'
                                                    : paginaAtiva === 'reports'
                                                      ? '📄 Gerador de Relatórios'
                                                      : paginaAtiva === 'google-drive'
                                                        ? '🔗 Google Drive Sync'
                                                        : paginaAtiva === 'gmail'
                                                          ? '📧 Gmail Integration'
                                                          : paginaAtiva === 'search-manager'
                                                            ? '🔎 Gerenciador de Buscas'
                                                            : paginaAtiva === 'ai-optimization'
                                                              ? '⚡ Otimização de Provedores IA'
                                                              : 'Busca Avançada Jurídica'}
          </h1>
          <p style={styles.subtitulo}>
            {paginaAtiva === 'dashboard'
              ? 'Plataforma integrada de pesquisa jurídica, análise e edição de petições'
              : paginaAtiva === 'documents'
                ? 'Crie, abra e organize seus documentos jurídicos com auto-save e versionamento'
                : paginaAtiva === 'document-search'
                  ? 'Busca full-text com filtros avançados, ordenação e histórico de buscas'
                  : paginaAtiva === 'editor'
                  ? 'Plataforma integrada com análise de jurimetria e hermenêutica blindada'
                  : paginaAtiva === 'editor-novo'
                    ? 'Edição completa com auto-save, export multi-formato, anexos inteligentes, ementa automática e versionamento'
                    : paginaAtiva === 'calculadores'
                      ? 'Cálculos especializados: Dano Material, Pensão Alimentícia e Dano Moral'
                      : paginaAtiva === 'pesquisa'
                        ? 'Pesquisa jurídica com Legal Data Hunter e PubMed'
                        : paginaAtiva === 'llm-config'
                          ? 'Configure API keys para Claude, Groq, Gemini e Ollama'
                          : paginaAtiva === 'llm-test'
                            ? 'Teste diferentes estratégias de roteamento LLM'
                            : paginaAtiva === 'rag-analysis'
                              ? 'Análise profunda de petições com busca de jurisprudência e detecção de conflitos'
                              : paginaAtiva === 'petition-transformer'
                                ? 'Upload automático com análise inteligente, aprimoramento com IA e exportação multi-formato'
                                : paginaAtiva === 'timeline'
                                  ? 'Visualize como a jurisprudência evolui sobre temas específicos ao longo do tempo'
                                  : paginaAtiva === 'strategic-analysis'
                                    ? 'Detecção de fraquezas jurídicas e blindagem contra contra-argumentos'
                                    : paginaAtiva === 'outcome-prediction'
                                      ? 'Calcule a probabilidade de sucesso da sua petição com análise profunda'
                                      : paginaAtiva === 'template-matching'
                                        ? 'Encontre modelos jurídicos bem-sucedidos similares à sua petição'
                                        : paginaAtiva === 'import-export'
                                          ? 'Faça backup, compartilhe e restaure seus documentos'
                                          : paginaAtiva === 'templates'
                                            ? 'Crie e gerencie templates reutilizáveis para seus documentos'
                                            : paginaAtiva === 'sharing'
                                              ? 'Compartilhe seus documentos por link ou email com controle de permissões'
                                              : paginaAtiva === 'pdf-export'
                                                ? 'Exporte documentos como PDF com múltiplas opções de customização'
                                                : paginaAtiva === 'annotations'
                                                  ? 'Gerencie anotações, comentários e markups em seus documentos'
                                                  : paginaAtiva === 'analytics'
                                                    ? 'Visualize estatísticas de uso, custos de IA e produtividade'
                                                    : paginaAtiva === 'reports'
                                                      ? 'Crie relatórios customizáveis em múltiplos formatos'
                                                      : paginaAtiva === 'google-drive'
                                                        ? 'Sincronize seus documentos na nuvem, faça backups e restaure dados'
                                                        : paginaAtiva === 'gmail'
                                                          ? 'Integre suas mensagens de email e extraia referências jurídicas automaticamente'
                                                          : paginaAtiva === 'search-manager'
                                                            ? 'Gerencie buscas salvas, histórico e estatísticas de pesquisa'
                                                            : paginaAtiva === 'ai-optimization'
                                                              ? 'Otimize custos de IA com roteamento automático por provedor'
                                                              : 'Pesquise jurisprudência, legislação e doutrina em múltiplas jurisdições'}
          </p>
        </div>
        <div style={styles.navButtons}>
          <button
            onClick={() => setPaginaAtiva('dashboard')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'dashboard' ? styles.navButtonAtivo : {}),
            }}
          >
            🏠 Home
          </button>
          <button
            onClick={() => setPaginaAtiva('documents')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'documents' ? styles.navButtonAtivo : {}),
            }}
          >
            📄 Documentos
          </button>
          <button
            onClick={() => setPaginaAtiva('document-search')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'document-search' ? styles.navButtonAtivo : {}),
            }}
          >
            🔍 Busca
          </button>
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
          <button
            onClick={() => setPaginaAtiva('llm-config')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'llm-config' ? styles.navButtonAtivo : {}),
            }}
          >
            ⚙️ LLM Config
          </button>
          <button
            onClick={() => setPaginaAtiva('llm-test')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'llm-test' ? styles.navButtonAtivo : {}),
            }}
          >
            🧪 LLM Test
          </button>
          <button
            onClick={() => setPaginaAtiva('rag-analysis')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'rag-analysis' ? styles.navButtonAtivo : {}),
            }}
          >
            📊 RAG Analysis
          </button>
          <button
            onClick={() => setPaginaAtiva('petition-transformer')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'petition-transformer' ? styles.navButtonAtivo : {}),
            }}
          >
            🚀 Transformador
          </button>
          <button
            onClick={() => setPaginaAtiva('timeline')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'timeline' ? styles.navButtonAtivo : {}),
            }}
          >
            📈 Timeline
          </button>
          <button
            onClick={() => setPaginaAtiva('strategic-analysis')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'strategic-analysis' ? styles.navButtonAtivo : {}),
            }}
          >
            🛡️ Blindagem
          </button>
          <button
            onClick={() => setPaginaAtiva('outcome-prediction')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'outcome-prediction' ? styles.navButtonAtivo : {}),
            }}
          >
            🔮 Predição
          </button>
          <button
            onClick={() => setPaginaAtiva('template-matching')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'template-matching' ? styles.navButtonAtivo : {}),
            }}
          >
            📚 Modelos
          </button>
          <button
            onClick={() => setPaginaAtiva('advanced-search' | 'search-manager')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'advanced-search' | 'search-manager' ? styles.navButtonAtivo : {}),
            }}
          >
            🔎 Avançada
          </button>
          <button
            onClick={() => setPaginaAtiva('import-export')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'import-export' ? styles.navButtonAtivo : {}),
            }}
          >
            📤📥 Import/Export
          </button>
          <button
            onClick={() => setPaginaAtiva('templates')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'templates' ? styles.navButtonAtivo : {}),
            }}
          >
            📋 Templates
          </button>
          <button
            onClick={() => setPaginaAtiva('sharing')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'sharing' ? styles.navButtonAtivo : {}),
            }}
          >
            🔗 Compartilhar
          </button>
          <button
            onClick={() => setPaginaAtiva('pdf-export')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'pdf-export' ? styles.navButtonAtivo : {}),
            }}
          >
            📄 PDF Export
          </button>
          <button
            onClick={() => setPaginaAtiva('annotations')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'annotations' ? styles.navButtonAtivo : {}),
            }}
          >
            📝 Anotações
          </button>
          <button
            onClick={() => setPaginaAtiva('analytics')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'analytics' ? styles.navButtonAtivo : {}),
            }}
          >
            📊 Analytics
          </button>
          <button
            onClick={() => setPaginaAtiva('reports')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'reports' ? styles.navButtonAtivo : {}),
            }}
          >
            📄 Relatórios
          </button>
          <button
            onClick={() => setPaginaAtiva('google-drive')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'google-drive' ? styles.navButtonAtivo : {}),
            }}
          >
            🔗 Google Drive
          </button>
          <button
            onClick={() => setPaginaAtiva('gmail')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'gmail' ? styles.navButtonAtivo : {}),
            }}
          >
            📧 Gmail
          </button>
          <button
            onClick={() => setPaginaAtiva('search-manager')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'search-manager' ? styles.navButtonAtivo : {}),
            }}
          >
            🔎 Buscas
          </button>
          <button
            onClick={() => setPaginaAtiva('ai-optimization')}
            style={{
              ...styles.navButton,
              ...(paginaAtiva === 'ai-optimization' ? styles.navButtonAtivo : {}),
            }}
          >
            ⚡ IA Otimizada
          </button>
        </div>
        <div style={styles.versao}>
          <span style={{ display: 'block', marginBottom: '4px' }}>FASE 4.2 - Frontend LLM</span>
          {usuario && (
            <div style={styles.usuarioInfo}>
              <span style={{ fontSize: '10px', opacity: 0.9 }}>👤 {usuario.nome}</span>
              <button
                onClick={logout}
                style={styles.btnLogout}
              >
                🚪 Sair
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Conteúdo principal */}
      <div style={styles.layoutPrincipal}>
        {paginaAtiva === 'dashboard' && (
          <main style={styles.mainFullWidth}>
            <Dashboard
              onNavegar={(pagina) => setPaginaAtiva(pagina as any)}
              onAbrirDocumento={(docId) => {
                console.log('Abrindo documento:', docId)
                setPaginaAtiva('editor-novo')
              }}
            />
          </main>
        )}

        {paginaAtiva === 'documents' && (
          <main style={styles.mainFullWidth}>
            <DocumentManager
              onAbrirDocumento={(docId) => {
                console.log('Abrindo documento:', docId)
                setDocumentoAtual({ id: docId, tipo: 'editor-novo' })
                setPaginaAtiva('editor-novo')
              }}
              onCriarNovo={(tipo) => {
                console.log('Criando novo documento:', tipo)
                setDocumentoAtual(null)
                setPaginaAtiva(tipo)
              }}
            />
          </main>
        )}

        {paginaAtiva === 'document-search' && (
          <main style={styles.mainFullWidth}>
            <AdvancedSearchDocuments
              onSelecionarDocumento={(docId) => {
                console.log('Abrindo documento:', docId)
                setDocumentoAtual({ id: docId, tipo: 'editor-novo' })
                setPaginaAtiva('editor-novo')
              }}
            />
          </main>
        )}

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
            <EditorWorkspace
              documentId={documentoAtual?.id}
              tipoDocumento="editor-novo"
              onClose={() => {
                setDocumentoAtual(null)
                setPaginaAtiva('documents')
              }}
            />
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

        {paginaAtiva === 'llm-config' && (
          <main style={styles.mainFullWidth}>
            <LLMConfigPanel />
          </main>
        )}

        {paginaAtiva === 'llm-test' && (
          <main style={styles.mainFullWidth}>
            <LLMTestPanel />
          </main>
        )}

        {paginaAtiva === 'rag-analysis' && (
          <main style={styles.mainFullWidth}>
            <RAGAnalysisPanel />
          </main>
        )}

        {paginaAtiva === 'petition-transformer' && (
          <main style={styles.mainFullWidth}>
            <PetitionTransformerPanel />
          </main>
        )}

        {paginaAtiva === 'timeline' && (
          <main style={styles.mainFullWidth}>
            <JurisprudenceTimeline />
          </main>
        )}

        {paginaAtiva === 'strategic-analysis' && (
          <main style={styles.mainFullWidth}>
            <StrategicAnalysisPanel />
          </main>
        )}

        {paginaAtiva === 'outcome-prediction' && (
          <main style={styles.mainFullWidth}>
            <OutcomePredictorPanel />
          </main>
        )}

        {paginaAtiva === 'template-matching' && (
          <main style={styles.mainFullWidth}>
            <TemplateMatchingPanel />
          </main>
        )}

        {paginaAtiva === 'advanced-search' | 'search-manager' && (
          <main style={styles.mainFullWidth}>
            <AdvancedSearchPanel />
          </main>
        )}

        {paginaAtiva === 'import-export' && (
          <main style={styles.mainFullWidth}>
            <ImportExportPanel
              onImportSucesso={() => {
                setPaginaAtiva('documents')
              }}
            />
          </main>
        )}

        {paginaAtiva === 'templates' && (
          <main style={styles.mainFullWidth}>
            <TemplateManager />
          </main>
        )}

        {paginaAtiva === 'sharing' && (
          <main style={styles.mainFullWidth}>
            <DocumentSharingManager />
          </main>
        )}

        {paginaAtiva === 'pdf-export' && (
          <main style={styles.mainFullWidth}>
            <PDFExportPanel />
          </main>
        )}

        {paginaAtiva === 'annotations' && (
          <main style={styles.mainFullWidth}>
            <AnnotationsPanel
              documentoId={documentoAtual?.id || ''}
              nomeDocumento={tituloDocumento}
              autorAtual={usuario?.nome}
            />
          </main>
        )}

        {paginaAtiva === 'analytics' && (
          <main style={styles.mainFullWidth}>
            <AnalyticsDashboard />
          </main>
        )}

        {paginaAtiva === 'reports' && (
          <main style={styles.mainFullWidth}>
            <ReportBuilder />
          </main>
        )}

        {paginaAtiva === 'google-drive' && (
          <main style={styles.mainFullWidth}>
            <GoogleDriveSync />
          </main>
        )}

        {paginaAtiva === 'gmail' && (
          <main style={styles.mainFullWidth}>
            <GmailIntegration />
          </main>
        )}

        {paginaAtiva === 'search-manager' && (
          <main style={styles.mainFullWidth}>
            <AdvancedSearchUI />
          </main>
        )}

        {paginaAtiva === 'ai-optimization' && (
          <main style={styles.mainFullWidth}>
            <AIProviderStats />
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

      {/* Notificações Globais */}
      <NotificationContainer />

      {/* PWA Install & Update Prompts */}
      <PWAPrompt />
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

  loadingScreen: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    color: '#666',
  },

  usuarioInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    alignItems: 'flex-end',
  },

  btnLogout: {
    background: 'rgba(255, 255, 255, 0.2)',
    color: 'white',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '4px',
    fontSize: '9pt',
    padding: '4px 8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  } as React.CSSProperties,
}

export default App
