/**
 * Gerenciador de Templates
 * Interface para criar, editar, deletar e usar templates de documentos
 */

import { useState } from 'react'
import { useTemplate } from '../../hooks/useTemplate'
import type { TemplateDocumento } from '../../types/template'
import './TemplateManager.css'

interface TemplateManagerProps {
  onUsarTemplate?: (template: TemplateDocumento) => void
}

const categorias = ['editorial', 'contrato', 'petição', 'parecer', 'memorando', 'outro']
const areas = ['civil', 'penal', 'trabalhista', 'tributária', 'administrativo', 'ambiental']

export function TemplateManager({ onUsarTemplate }: TemplateManagerProps) {
  const {
    templates,
    carregando,
    erro,
    sucesso,
    criarTemplate,
    atualizar,
    deletar,
    pesquisar,
    obterPorCategoria,
    obterPorArea,
    obterMaisUsados,
    usar,
    limparMensagens,
  } = useTemplate()

  const [abaSelecionada, setAbaSelecionada] = useState<'meus-templates' | 'criar' | 'pesquisar'>('meus-templates')
  const [filtroCategoria, setFiltroCategoria] = useState<string>('')
  const [filtroArea, setFiltroArea] = useState<string>('')
  const [termoPesquisa, setTermoPesquisa] = useState('')
  const [templateEditando, setTemplateEditando] = useState<TemplateDocumento | null>(null)

  const [novoTemplate, setNovoTemplate] = useState({
    nome: '',
    descricao: '',
    categoria: 'outro' as const,
    areaJuridica: 'civil' as const,
    conteudo: '',
    tags: '',
  })

  const obterTemplatesExibir = () => {
    if (filtroCategoria) {
      return obterPorCategoria(filtroCategoria)
    }
    if (filtroArea) {
      return obterPorArea(filtroArea)
    }
    if (termoPesquisa) {
      return pesquisar(termoPesquisa)
    }
    return templates
  }

  const handleCriarTemplate = () => {
    if (!novoTemplate.nome.trim()) {
      alert('Nome do template é obrigatório')
      return
    }

    const doc = {
      titulo: novoTemplate.nome,
      descricao: novoTemplate.descricao,
      categoria: novoTemplate.categoria,
      areaJuridica: novoTemplate.areaJuridica,
      conteudo: novoTemplate.conteudo,
      tags: novoTemplate.tags.split(',').map(t => t.trim()).filter(t => t),
    }

    const resultado = criarTemplate(doc)
    if (resultado.sucesso) {
      setNovoTemplate({
        nome: '',
        descricao: '',
        categoria: 'outro',
        areaJuridica: 'civil',
        conteudo: '',
        tags: '',
      })
      setAbaSelecionada('meus-templates')
    }
  }

  const handleAtualizarTemplate = () => {
    if (!templateEditando) return

    atualizar(templateEditando.id, {
      nome: templateEditando.nome,
      descricao: templateEditando.descricao,
      categoria: templateEditando.categoria,
      areaJuridica: templateEditando.areaJuridica,
      tags: templateEditando.tags,
    })

    setTemplateEditando(null)
  }

  const handleUsarTemplate = (template: TemplateDocumento) => {
    usar(template.id)
    if (onUsarTemplate) {
      onUsarTemplate(template)
    }
  }

  const templatesExibir = obterTemplatesExibir()
  const maisUsados = obterMaisUsados(5)

  return (
    <div className="template-manager">
      <div className="template-header">
        <h2>📋 Gerenciador de Templates</h2>
        <p>Crie e gerencie templates reutilizáveis para seus documentos</p>
      </div>

      {erro && <div className="alert alert-erro">⚠️ {erro}</div>}
      {sucesso && <div className="alert alert-sucesso">✓ {sucesso}</div>}

      {/* Abas */}
      <div className="template-tabs">
        <button
          className={`tab-btn ${abaSelecionada === 'meus-templates' ? 'ativo' : ''}`}
          onClick={() => {
            setAbaSelecionada('meus-templates')
            limparMensagens()
          }}
        >
          📚 Meus Templates
        </button>
        <button
          className={`tab-btn ${abaSelecionada === 'criar' ? 'ativo' : ''}`}
          onClick={() => {
            setAbaSelecionada('criar')
            limparMensagens()
          }}
        >
          ➕ Criar Template
        </button>
        <button
          className={`tab-btn ${abaSelecionada === 'pesquisar' ? 'ativo' : ''}`}
          onClick={() => {
            setAbaSelecionada('pesquisar')
            limparMensagens()
          }}
        >
          🔍 Pesquisar
        </button>
      </div>

      {/* Aba Meus Templates */}
      {abaSelecionada === 'meus-templates' && (
        <div className="template-section">
          <div className="template-filtros">
            <select
              value={filtroCategoria}
              onChange={(e) => {
                setFiltroCategoria(e.target.value)
                setFiltroArea('')
              }}
              className="filtro-select"
            >
              <option value="">Todas as categorias</option>
              {categorias.map(cat => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>

            <select
              value={filtroArea}
              onChange={(e) => {
                setFiltroArea(e.target.value)
                setFiltroCategoria('')
              }}
              className="filtro-select"
            >
              <option value="">Todas as áreas</option>
              {areas.map(area => (
                <option key={area} value={area}>
                  {area.charAt(0).toUpperCase() + area.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {carregando ? (
            <div className="loading">⏳ Carregando templates...</div>
          ) : templatesExibir.length === 0 ? (
            <div className="empty-state">
              <p>Nenhum template encontrado. Comece criando um novo!</p>
            </div>
          ) : (
            <div className="template-grid">
              {templatesExibir.map(template => (
                <div key={template.id} className="template-card">
                  <div className="template-header-card">
                    <h3>{template.nome}</h3>
                    <span className="template-categoria">{template.categoria}</span>
                  </div>

                  <div className="template-meta">
                    <span className="meta-item">📂 {template.areaJuridica}</span>
                    <span className="meta-item">📊 {template.vezes_usado} usos</span>
                  </div>

                  <p className="template-descricao">{template.descricao || 'Sem descrição'}</p>

                  {template.tags.length > 0 && (
                    <div className="template-tags">
                      {template.tags.map((tag, idx) => (
                        <span key={idx} className="tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="template-actions">
                    <button
                      onClick={() => handleUsarTemplate(template)}
                      className="btn-usar"
                      title="Usar este template para criar novo documento"
                    >
                      ✓ Usar
                    </button>
                    <button
                      onClick={() => setTemplateEditando(template)}
                      className="btn-editar"
                      title="Editar template"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Tem certeza que deseja deletar este template?')) {
                          deletar(template.id)
                        }
                      }}
                      className="btn-deletar"
                      title="Deletar template"
                    >
                      🗑️ Deletar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {maisUsados.length > 0 && (
            <div className="mais-usados">
              <h4>⭐ Mais Usados</h4>
              <div className="mais-usados-list">
                {maisUsados.map(template => (
                  <div
                    key={template.id}
                    className="mais-usado-item"
                    onClick={() => handleUsarTemplate(template)}
                  >
                    <span className="nome">{template.nome}</span>
                    <span className="usos">{template.vezes_usado} usos</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Aba Criar Template */}
      {abaSelecionada === 'criar' && (
        <div className="template-section criar-template">
          <div className="form-group">
            <label>Nome do Template *</label>
            <input
              type="text"
              value={novoTemplate.nome}
              onChange={(e) => setNovoTemplate({ ...novoTemplate, nome: e.target.value })}
              placeholder="Ex: Petição Cível"
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>Descrição</label>
            <textarea
              value={novoTemplate.descricao}
              onChange={(e) => setNovoTemplate({ ...novoTemplate, descricao: e.target.value })}
              placeholder="Descreva o propósito deste template..."
              className="form-textarea"
              rows={2}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Categoria</label>
              <select
                value={novoTemplate.categoria}
                onChange={(e) =>
                  setNovoTemplate({
                    ...novoTemplate,
                    categoria: e.target.value as any,
                  })
                }
                className="form-select"
              >
                {categorias.map(cat => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Área Jurídica</label>
              <select
                value={novoTemplate.areaJuridica}
                onChange={(e) =>
                  setNovoTemplate({
                    ...novoTemplate,
                    areaJuridica: e.target.value as any,
                  })
                }
                className="form-select"
              >
                {areas.map(area => (
                  <option key={area} value={area}>
                    {area.charAt(0).toUpperCase() + area.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Tags (separadas por vírgula)</label>
            <input
              type="text"
              value={novoTemplate.tags}
              onChange={(e) => setNovoTemplate({ ...novoTemplate, tags: e.target.value })}
              placeholder="Ex: urgente, importante, recurso"
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>Conteúdo do Template</label>
            <textarea
              value={novoTemplate.conteudo}
              onChange={(e) => setNovoTemplate({ ...novoTemplate, conteudo: e.target.value })}
              placeholder="Cole ou digite o conteúdo padrão do template..."
              className="form-textarea template-content"
              rows={10}
            />
          </div>

          <button onClick={handleCriarTemplate} className="btn-criar-template">
            ➕ Criar Template
          </button>
        </div>
      )}

      {/* Aba Pesquisar */}
      {abaSelecionada === 'pesquisar' && (
        <div className="template-section pesquisar-section">
          <div className="search-box">
            <input
              type="text"
              value={termoPesquisa}
              onChange={(e) => setTermoPesquisa(e.target.value)}
              placeholder="Pesquise por nome, descrição ou tags..."
              className="search-input"
              autoFocus
            />
          </div>

          {termoPesquisa && (
            <div className="search-resultados">
              {templatesExibir.length === 0 ? (
                <div className="empty-state">
                  <p>Nenhum template encontrado para "{termoPesquisa}"</p>
                </div>
              ) : (
                <div className="template-grid">
                  {templatesExibir.map(template => (
                    <div key={template.id} className="template-card">
                      <div className="template-header-card">
                        <h3>{template.nome}</h3>
                        <span className="template-categoria">{template.categoria}</span>
                      </div>

                      <div className="template-meta">
                        <span className="meta-item">📂 {template.areaJuridica}</span>
                        <span className="meta-item">📊 {template.vezes_usado} usos</span>
                      </div>

                      <p className="template-descricao">{template.descricao || 'Sem descrição'}</p>

                      <div className="template-actions">
                        <button
                          onClick={() => handleUsarTemplate(template)}
                          className="btn-usar"
                        >
                          ✓ Usar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal de Edição */}
      {templateEditando && (
        <div className="modal-overlay" onClick={() => setTemplateEditando(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Editar Template</h3>

            <div className="form-group">
              <label>Nome</label>
              <input
                type="text"
                value={templateEditando.nome}
                onChange={(e) =>
                  setTemplateEditando({ ...templateEditando, nome: e.target.value })
                }
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label>Descrição</label>
              <textarea
                value={templateEditando.descricao}
                onChange={(e) =>
                  setTemplateEditando({ ...templateEditando, descricao: e.target.value })
                }
                className="form-textarea"
                rows={2}
              />
            </div>

            <div className="modal-actions">
              <button onClick={handleAtualizarTemplate} className="btn-salvar">
                💾 Salvar
              </button>
              <button onClick={() => setTemplateEditando(null)} className="btn-cancelar">
                ✕ Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
