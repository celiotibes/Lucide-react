/**
 * Timeline de Eventos
 * Visualiza cronologicamente os eventos do caso com correlação a fatos probatórios
 */

import React, { useState, useMemo } from 'react'
import { CORES_JUDICIAIS, ESPACAMENTO_PRE_ATENTIVO } from '@/utils/sistemaDesignJudicial'
import type { FatoProva } from '@/types/jurimetriaBR'

interface EventoCaso {
  id: string
  data: string // YYYY-MM-DD
  titulo: string
  descricao: string
  tipo: 'contrato' | 'comunicacao' | 'testemunha' | 'documento' | 'acao' | 'marco'
  fatoAssociado?: string // ID do fato associado
  importancia: 'alta' | 'media' | 'baixa'
}

interface TimelineEventosProps {
  fatos: FatoProva[]
  eventos?: EventoCaso[]
  onAdicionarEvento?: (evento: EventoCaso) => void
}

export function TimelineEventos({
  fatos,
  eventos = [],
  onAdicionarEvento,
}: TimelineEventosProps) {
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [novoEvento, setNovoEvento] = useState<Partial<EventoCaso>>({
    data: new Date().toISOString().split('T')[0],
    titulo: '',
    descricao: '',
    tipo: 'documento',
    importancia: 'media',
  })

  const eventosOrdenados = useMemo(() => {
    return [...eventos].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
  }, [eventos])

  const getCorEvento = (tipo: string): string => {
    switch (tipo) {
      case 'contrato':
        return CORES_JUDICIAIS.azulPrincipal
      case 'comunicacao':
        return CORES_JUDICIAIS.verdeApoio
      case 'testemunha':
        return CORES_JUDICIAIS.amareloAviso
      case 'documento':
        return CORES_JUDICIAIS.cinzaBorda
      case 'acao':
        return CORES_JUDICIAIS.vermelhoArgumento
      case 'marco':
        return CORES_JUDICIAIS.azulClaro
      default:
        return CORES_JUDICIAIS.cinzaBorda
    }
  }

  const getIconeEvento = (tipo: string): string => {
    switch (tipo) {
      case 'contrato':
        return '📋'
      case 'comunicacao':
        return '💬'
      case 'testemunha':
        return '👤'
      case 'documento':
        return '📄'
      case 'acao':
        return '⚡'
      case 'marco':
        return '🚩'
      default:
        return '●'
    }
  }

  const adicionarEvento = () => {
    if (!novoEvento.titulo || !novoEvento.data) {
      alert('Preencha ao menos título e data')
      return
    }

    const evento: EventoCaso = {
      id: `evento-${Date.now()}`,
      data: novoEvento.data || '',
      titulo: novoEvento.titulo || '',
      descricao: novoEvento.descricao || '',
      tipo: (novoEvento.tipo as EventoCaso['tipo']) || 'documento',
      fatoAssociado: novoEvento.fatoAssociado,
      importancia: (novoEvento.importancia as EventoCaso['importancia']) || 'media',
    }

    onAdicionarEvento?.(evento)

    setNovoEvento({
      data: new Date().toISOString().split('T')[0],
      titulo: '',
      descricao: '',
      tipo: 'documento',
      importancia: 'media',
    })
    setMostrarFormulario(false)
  }

  if (eventosOrdenados.length === 0 && !mostrarFormulario) {
    return (
      <div style={styles.containerVazio}>
        <p>Nenhum evento adicionado. Clique abaixo para criar uma timeline do caso.</p>
        <button
          onClick={() => setMostrarFormulario(true)}
          style={styles.botaoAdicionarEvento}
        >
          + Adicionar Primeiro Evento
        </button>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.cabecalho}>
        <h4 style={styles.titulo}>📅 Timeline de Eventos do Caso</h4>
        <button
          onClick={() => setMostrarFormulario(!mostrarFormulario)}
          style={styles.botaoAdicionarCompacto}
        >
          {mostrarFormulario ? '−' : '+'} Evento
        </button>
      </div>

      {mostrarFormulario && (
        <div style={styles.formulario}>
          <h5 style={styles.tituloFormulario}>Novo Evento</h5>

          <div style={styles.linhaFormulario}>
            <div style={styles.grupoFormulario}>
              <label style={styles.label}>Data *</label>
              <input
                type="date"
                value={novoEvento.data || ''}
                onChange={(e) => setNovoEvento({ ...novoEvento, data: e.target.value })}
                style={styles.input}
              />
            </div>

            <div style={styles.grupoFormulario}>
              <label style={styles.label}>Tipo</label>
              <select
                value={novoEvento.tipo || 'documento'}
                onChange={(e) => setNovoEvento({ ...novoEvento, tipo: e.target.value as any })}
                style={styles.select}
              >
                <option value="contrato">📋 Contrato</option>
                <option value="comunicacao">💬 Comunicação</option>
                <option value="testemunha">👤 Testemunha</option>
                <option value="documento">📄 Documento</option>
                <option value="acao">⚡ Ação</option>
                <option value="marco">🚩 Marco</option>
              </select>
            </div>

            <div style={styles.grupoFormulario}>
              <label style={styles.label}>Importância</label>
              <select
                value={novoEvento.importancia || 'media'}
                onChange={(e) => setNovoEvento({ ...novoEvento, importancia: e.target.value as any })}
                style={styles.select}
              >
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="baixa">Baixa</option>
              </select>
            </div>
          </div>

          <div style={styles.grupoFormulario}>
            <label style={styles.label}>Título *</label>
            <input
              type="text"
              value={novoEvento.titulo || ''}
              onChange={(e) => setNovoEvento({ ...novoEvento, titulo: e.target.value })}
              placeholder="Ex: Assinatura do contrato"
              style={styles.input}
            />
          </div>

          <div style={styles.grupoFormulario}>
            <label style={styles.label}>Descrição</label>
            <textarea
              value={novoEvento.descricao || ''}
              onChange={(e) => setNovoEvento({ ...novoEvento, descricao: e.target.value })}
              placeholder="Detalhes adicionais"
              style={{ ...styles.textarea, minHeight: '60px' }}
              rows={2}
            />
          </div>

          <div style={styles.grupoFormulario}>
            <label style={styles.label}>Associar a Fato (opcional)</label>
            <select
              value={novoEvento.fatoAssociado || ''}
              onChange={(e) => setNovoEvento({ ...novoEvento, fatoAssociado: e.target.value })}
              style={styles.select}
            >
              <option value="">— Nenhum —</option>
              {fatos.map((fato, idx) => (
                <option key={fato.id} value={fato.id}>
                  F{idx + 1}: {fato.descricao.substring(0, 40)}...
                </option>
              ))}
            </select>
          </div>

          <div style={styles.acoesFormulario}>
            <button onClick={adicionarEvento} style={styles.botaoSalvar}>
              ✓ Adicionar
            </button>
            <button
              onClick={() => setMostrarFormulario(false)}
              style={styles.botaoCancelar}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {eventosOrdenados.length > 0 && (
        <div style={styles.timelineContainer}>
          {eventosOrdenados.map((evento, idx) => {
            const data = new Date(evento.data)
            const dataFormatada = data.toLocaleDateString('pt-BR')

            return (
              <div key={evento.id} style={styles.itemTimeline}>
                {/* Linha vertical */}
                {idx < eventosOrdenados.length - 1 && (
                  <div style={styles.linhaVertical} />
                )}

                {/* Ponto do evento */}
                <div
                  style={{
                    ...styles.pontoDados,
                    backgroundColor: getCorEvento(evento.tipo),
                    borderColor: CORES_JUDICIAIS.cinzaBorda,
                  }}
                  title={`${evento.tipo} - ${dataFormatada}`}
                >
                  <span style={styles.iconeEvento}>{getIconeEvento(evento.tipo)}</span>
                </div>

                {/* Conteúdo do evento */}
                <div style={styles.conteudoEvento}>
                  <div style={styles.headerEvento}>
                    <h5 style={styles.tituloEvento}>{evento.titulo}</h5>
                    <span style={styles.dataEvento}>{dataFormatada}</span>
                  </div>

                  {evento.descricao && (
                    <p style={styles.descricaoEvento}>{evento.descricao}</p>
                  )}

                  <div style={styles.metadadosEvento}>
                    <span style={{...styles.badge, backgroundColor: getCorEvento(evento.tipo)}}>
                      {evento.tipo}
                    </span>
                    <span
                      style={{
                        ...styles.badge,
                        backgroundColor:
                          evento.importancia === 'alta'
                            ? CORES_JUDICIAIS.vermelhoCritico
                            : evento.importancia === 'media'
                              ? CORES_JUDICIAIS.amareloAviso
                              : CORES_JUDICIAIS.verdeApoio,
                      }}
                    >
                      {evento.importancia.charAt(0).toUpperCase() + evento.importancia.slice(1)}
                    </span>

                    {evento.fatoAssociado && (
                      <span style={styles.badgeAssociacao}>
                        🔗 Associado a fato
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
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
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: ESPACAMENTO_PRE_ATENTIVO.grande,
    paddingBottom: ESPACAMENTO_PRE_ATENTIVO.medio,
    borderBottom: `2px solid ${CORES_JUDICIAIS.azulPrincipal}`,
  },

  titulo: {
    margin: 0,
    color: CORES_JUDICIAIS.azulPrincipal,
    fontSize: '12pt',
    fontWeight: 'bold',
  },

  botaoAdicionarCompacto: {
    padding: '6px 12px',
    backgroundColor: CORES_JUDICIAIS.azulPrincipal,
    color: CORES_JUDICIAIS.brancoFundo,
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '11pt',
    fontWeight: 'bold',
  },

  botaoAdicionarEvento: {
    marginTop: ESPACAMENTO_PRE_ATENTIVO.grande,
    padding: ESPACAMENTO_PRE_ATENTIVO.medio,
    backgroundColor: CORES_JUDICIAIS.azulPrincipal,
    color: CORES_JUDICIAIS.brancoFundo,
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '11pt',
    fontWeight: 'bold',
  },

  formulario: {
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    border: `1px solid ${CORES_JUDICIAIS.azulPrincipal}`,
    borderRadius: '4px',
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    marginBottom: ESPACAMENTO_PRE_ATENTIVO.grande,
    display: 'flex',
    flexDirection: 'column',
    gap: ESPACAMENTO_PRE_ATENTIVO.medio,
  },

  tituloFormulario: {
    margin: 0,
    color: CORES_JUDICIAIS.azulPrincipal,
    fontSize: '11pt',
    fontWeight: 'bold',
  },

  linhaFormulario: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: ESPACAMENTO_PRE_ATENTIVO.medio,
  },

  grupoFormulario: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },

  label: {
    fontSize: '10pt',
    fontWeight: 'bold',
    color: CORES_JUDICIAIS.azulPrincipal,
  },

  input: {
    padding: ESPACAMENTO_PRE_ATENTIVO.pequeno,
    border: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    borderRadius: '3px',
    fontSize: '10pt',
    fontFamily: 'Arial, sans-serif',
  },

  select: {
    padding: ESPACAMENTO_PRE_ATENTIVO.pequeno,
    border: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    borderRadius: '3px',
    fontSize: '10pt',
    fontFamily: 'Arial, sans-serif',
  },

  textarea: {
    padding: ESPACAMENTO_PRE_ATENTIVO.pequeno,
    border: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    borderRadius: '3px',
    fontSize: '10pt',
    fontFamily: 'Arial, sans-serif',
    resize: 'vertical',
  },

  acoesFormulario: {
    display: 'flex',
    gap: ESPACAMENTO_PRE_ATENTIVO.medio,
    justifyContent: 'flex-end',
    paddingTop: ESPACAMENTO_PRE_ATENTIVO.medio,
    borderTop: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
  },

  botaoSalvar: {
    padding: '8px 16px',
    backgroundColor: CORES_JUDICIAIS.verdeApoio,
    color: CORES_JUDICIAIS.brancoFundo,
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '10pt',
  },

  botaoCancelar: {
    padding: '8px 16px',
    backgroundColor: CORES_JUDICIAIS.cinzaBorda,
    color: CORES_JUDICIAIS.pretoTexto,
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '10pt',
  },

  timelineContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: ESPACAMENTO_PRE_ATENTIVO.medio,
    position: 'relative',
    paddingLeft: '60px',
  },

  itemTimeline: {
    position: 'relative',
    display: 'flex',
    gap: ESPACAMENTO_PRE_ATENTIVO.grande,
  },

  linhaVertical: {
    position: 'absolute',
    left: '11px',
    top: '30px',
    bottom: '-30px',
    width: '2px',
    backgroundColor: CORES_JUDICIAIS.cinzaBorda,
  },

  pontoDados: {
    position: 'absolute',
    left: '0',
    top: '4px',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    border: '3px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CORES_JUDICIAIS.brancoFundo,
  },

  iconeEvento: {
    fontSize: '12pt',
  },

  conteudoEvento: {
    flex: 1,
    padding: ESPACAMENTO_PRE_ATENTIVO.medio,
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    borderRadius: '4px',
    border: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
  },

  headerEvento: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: '8px',
    paddingBottom: '8px',
    borderBottom: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
  },

  tituloEvento: {
    margin: 0,
    color: CORES_JUDICIAIS.azulPrincipal,
    fontSize: '11pt',
    fontWeight: 'bold',
  },

  dataEvento: {
    fontSize: '10pt',
    color: CORES_JUDICIAIS.cinzaTextoSecundario},

  descricaoEvento: {
    margin: '8px 0',
    fontSize: '10pt',
    color: CORES_JUDICIAIS.pretoTexto,
    lineHeight: 1.4,
  },

  metadadosEvento: {
    display: 'flex',
    gap: ESPACAMENTO_PRE_ATENTIVO.pequeno,
    flexWrap: 'wrap',
  },

  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '3px',
    fontSize: '9pt',
    fontWeight: 'bold',
    color: CORES_JUDICIAIS.brancoFundo,
    textTransform: 'capitalize',
  },

  badgeAssociacao: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '3px',
    fontSize: '9pt',
    fontWeight: 'bold',
    backgroundColor: CORES_JUDICIAIS.azulClaro,
    color: CORES_JUDICIAIS.brancoFundo,
  },
}
