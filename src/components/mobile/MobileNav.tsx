/**
 * Navegação Mobile
 * Drawer sidebar para navegação otimizada em dispositivos móveis
 */

import { useState } from 'react'
import './MobileNav.css'

interface MobileNavProps {
  paginaAtiva: string
  onNavegar: (pagina: string) => void
  versao: string
}

export function MobileNav({ paginaAtiva, onNavegar, versao }: MobileNavProps) {
  const [drawerAberto, setDrawerAberto] = useState(false)

  const navItems = [
    { id: 'dashboard', label: '🏠 Home', icon: '🏠' },
    { id: 'documents', label: '📄 Documentos', icon: '📄' },
    { id: 'editor-novo', label: '✏️ Editor', icon: '✏️' },
    { id: 'calculadores', label: '🧮 Calculadores', icon: '🧮' },
    { id: 'pesquisa', label: '🔍 Pesquisa', icon: '🔍' },
    { id: 'timeline', label: '📈 Timeline', icon: '📈' },
    { id: 'strategic-analysis', label: '🛡️ Blindagem', icon: '🛡️' },
    { id: 'outcome-prediction', label: '🔮 Predição', icon: '🔮' },
    { id: 'template-matching', label: '📚 Modelos', icon: '📚' },
  ]

  const handleNavegar = (pagina: string) => {
    onNavegar(pagina)
    setDrawerAberto(false)
  }

  return (
    <>
      {/* Botão de menu hambúrguer */}
      <button
        className="mobile-menu-btn"
        onClick={() => setDrawerAberto(!drawerAberto)}
        aria-label="Abrir menu"
      >
        ☰
      </button>

      {/* Overlay */}
      {drawerAberto && (
        <div
          className="mobile-drawer-overlay"
          onClick={() => setDrawerAberto(false)}
        />
      )}

      {/* Drawer */}
      <nav className={`mobile-drawer ${drawerAberto ? 'aberto' : ''}`}>
        <div className="drawer-header">
          <div className="drawer-logo">⚖️ Lucide</div>
          <button
            className="drawer-close"
            onClick={() => setDrawerAberto(false)}
            aria-label="Fechar menu"
          >
            ✕
          </button>
        </div>

        <div className="drawer-nav-items">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`drawer-nav-item ${paginaAtiva === item.id ? 'ativo' : ''}`}
              onClick={() => handleNavegar(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="drawer-footer">
          <span className="drawer-versao">{versao}</span>
        </div>
      </nav>
    </>
  )
}
