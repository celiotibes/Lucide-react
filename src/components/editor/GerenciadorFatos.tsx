/**
 * Gerenciador de Fatos
 * Interface para adicionar, editar e remover fatos (FatoProva) com validação de força probatória
 */

import React, { useState, useCallback } from 'react'
import { CORES_JUDICIAIS, FORCA_PROVA, ESPACAMENTO_PRE_ATENTIVO } from '@/utils/sistemaDesignJudicial'
import type { FatoProva } from '@/types/jurimetriaBR'

interface GerenciadorFatosProps {
  fatos: FatoProva[]
  onAtualizarFatos: (fatos: FatoProva[]) => void
  expandido?: boolean
}

interface FormularioFato {
  descricao: string
  grauCerteza: number
  peso: number
  fontes: string[]
  observacoes: string
}

const GRAU_CERTEZA_PRESETS = [
  { label: 'Altamente Provável (80-100%)', valor: 90 },
  { label: 'Moderadamente Provável (50-80%)', valor: 65 },
  { label: 'Fracamente Provável (<50%)', valor: 35 },
]

export function GerenciadorFatos({
  fatos,
  onAtualizarFatos,
  expandido = false,
}: GerenciadorFatosProps) {
  const [formulario, setFormulario] = useState<FormularioFato>({
    descricao: '',
    grauCerteza: 65,
    peso: 1,
    fontes: [''],
    observacoes: '',
  })
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [mostrarFormulario, setMostrarFormulario] = useState(false)

  const adicionarFato = useCallback(() => {
    if (!formulario.descricao.trim()) {
      alert('Descrição do fato é obrigatória')
      return
    }

    const novoFato: FatoProva = {
      id: editandoId || `fato-${Date.now()}`,
      descricao: formulario.descricao,
      tipo: 'fato_provavel', // Tipo padrão
      grauCerteza: formulario.grauCerteza,
      peso: formulario.peso,
      fontes: formulario.fontes.filter((f) => f.trim()),
      observacoes: formulario.observacoes,
    }

    if (editandoId) {
      // Atualizar fato existente
      onAtualizarFatos(fatos.map((f) => (f.id === editandoId ? novoFato : f)))
      setEditandoId(null)
    } else {
      // Adicionar novo fato
      onAtualizarFatos([...fatos, novoFato])
    }

    setFormulario({
      descricao: '',
      grauCerteza: 65,
      peso: 1,
      fontes: [''],
      observacoes: '',
    })
    setMostrarFormulario(false)
  }, [formulario, editandoId, fatos, onAtualizarFatos])

  const editarFato = useCallback(
    (fato: FatoProva) => {
      setFormulario({
        descricao: fato.descricao,
        grauCerteza: fato.grauCerteza,
        peso: fato.peso || 1,
        fontes: fato.fontes || [''],
        observacoes: fato.observacoes || '',
      })
      setEditandoId(fato.id || null)
      setMostrarFormulario(true)
    },
    []
  )

  const removerFato = useCallback(
    (id: string) => {
      if (window.confirm('Remover este fato?')) {
        onAtualizarFatos(fatos.filter((f) => f.id !== id))
      }
    },
    [fatos, onAtualizarFatos]
  )

  const cancelarEdicao = useCallback(() => {
    setFormulario({
      descricao: '',
      grauCerteza: 65,
      peso: 1,
      fontes: [''],
      observacoes: '',
    })
    setEditandoId(null)
    setMostrarFormulario(false)
  }, [])

  const atualizarFonte = (idx: number, valor: string) => {
    const novasFontes = [...formulario.fontes]
    novasFontes[idx] = valor
    setFormulario({ ...formulario, fontes: novasFontes })
  }

  const adicionarFonteVazia = () => {
    setFormulario({
      ...formulario,
      fontes: [...formulario.fontes, ''],
    })
  }

  const removerFonte = (idx: number) => {
    const novasFontes = formulario.fontes.filter((_, i) => i !== idx)
    setFormulario({ ...formulario, fontes: novasFontes })
  }

  if (!expandido) {
    return (
      <div style={styles.containerCompacto}>
        <div style={styles.cabecalhoCompacto}>
          <span>📊 {fatos.length} fatos</span>
          <button
            onClick={() => setMostrarFormulario(!mostrarFormulario)}
            style={styles.botaoCompacto}
          >
            {mostrarFormulario ? '−' : '+'}
          </button>
        </div>

        {mostrarFormulario && (
          <div style={styles.containerFormulario}>{_renderFormulario()}</div>
        )}

        {fatos.length > 0 && (
          <div style={styles.listaCompacta}>
            {fatos.map((fato) => (
              <ItemFatoCompacto
                key={fato.id}
                fato={fato}
                onEditar={editarFato}
                onRemover={removerFato}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.cabecalho}>
        <h3 style={styles.titulo}>Gerenciador de Fatos Probatórios</h3>
        <span style={styles.contagem}>{fatos.length} fato(s)</span>
      </div>

      {fatos.length > 0 && (
        <div style={styles.listaFatos}>
          {fatos.map((fato) => (
            <ItemFato
              key={fato.id}
              fato={fato}
              onEditar={editarFato}
              onRemover={removerFato}
            />
          ))}
        </div>
      )}

      {mostrarFormulario ? (
        <div style={styles.containerFormulario}>{_renderFormulario()}</div>
      ) : (
        <button
          onClick={() => setMostrarFormulario(true)}
          style={styles.botaoAdicionar}
        >
          + Adicionar Fato Probatório
        </button>
      )}
    </div>
  )

  function _renderFormulario() {
    return (
      <div style={styles.formulario}>
        <h4 style={styles.tituloFormulario}>
          {editandoId ? 'Editar Fato' : 'Novo Fato Probatório'}
        </h4>

        <div style={styles.grupoFormulario}>
          <label style={styles.label}>Descrição do Fato *</label>
          <textarea
            value={formulario.descricao}
            onChange={(e) =>
              setFormulario({ ...formulario, descricao: e.target.value })
            }
            placeholder="Ex: O réu assinou o contrato em 15 de janeiro de 2024"
            style={styles.textarea}
            rows={3}
          />
        </div>

        <div style={styles.grupoFormulario}>
          <label style={styles.label}>Grau de Certeza: {formulario.grauCerteza}%</label>
          <input
            type="range"
            min="0"
            max="100"
            value={formulario.grauCerteza}
            onChange={(e) =>
              setFormulario({
                ...formulario,
                grauCerteza: parseInt(e.target.value),
              })
            }
            style={styles.slider}
          />
          <div style={styles.presetsGrau}>
            {GRAU_CERTEZA_PRESETS.map((preset) => (
              <button
                key={preset.valor}
                onClick={() =>
                  setFormulario({
                    ...formulario,
                    grauCerteza: preset.valor,
                  })
                }
                style={{
                  ...styles.presetBotao,
                  backgroundColor:
                    formulario.grauCerteza === preset.valor
                      ? CORES_JUDICIAIS.azulPrincipal
                      : CORES_JUDICIAIS.cinzaPaginaBg,
                  color:
                    formulario.grauCerteza === preset.valor
                      ? CORES_JUDICIAIS.brancoFundo
                      : CORES_JUDICIAIS.pretoTexto,
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.grupoFormulario}>
          <label style={styles.label}>Peso do Fato (1-5)</label>
          <input
            type="number"
            min="1"
            max="5"
            value={formulario.peso}
            onChange={(e) =>
              setFormulario({
                ...formulario,
                peso: parseInt(e.target.value) || 1,
              })
            }
            style={styles.input}
          />
          <span style={styles.descricaoAjuda}>
            Maior número = maior importância para a tese
          </span>
        </div>

        <div style={styles.grupoFormulario}>
          <label style={styles.label}>Fontes / Documentação</label>
          {formulario.fontes.map((fonte, idx) => (
            <div key={idx} style={styles.containerFonte}>
              <input
                type="text"
                value={fonte}
                onChange={(e) => atualizarFonte(idx, e.target.value)}
                placeholder={`Fonte ${idx + 1} (ex: Contrato de 15/01/2024, Foto, Testemunha João)`}
                style={styles.inputFonte}
              />
              {formulario.fontes.length > 1 && (
                <button
                  onClick={() => removerFonte(idx)}
                  style={styles.botaoRemoverFonte}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            onClick={adicionarFonteVazia}
            style={styles.botaoAdicionarFonte}
          >
            + Adicionar Fonte
          </button>
        </div>

        <div style={styles.grupoFormulario}>
          <label style={styles.label}>Observações (opcional)</label>
          <textarea
            value={formulario.observacoes}
            onChange={(e) =>
              setFormulario({ ...formulario, observacoes: e.target.value })
            }
            placeholder="Notas adicionais sobre este fato"
            style={{ ...styles.textarea, minHeight: '60px' }}
            rows={2}
          />
        </div>

        <div style={styles.acoesFormulario}>
          <button onClick={adicionarFato} style={styles.botaoSalvar}>
            {editandoId ? '✓ Atualizar' : '✓ Adicionar'} Fato
          </button>
          <button onClick={cancelarEdicao} style={styles.botaoCancelar}>
            Cancelar
          </button>
        </div>
      </div>
    )
  }
}

interface ItemFatoProps {
  fato: FatoProva
  onEditar: (fato: FatoProva) => void
  onRemover: (id: string) => void
}

function ItemFato({ fato, onEditar, onRemover }: ItemFatoProps) {
  let forcaClasse: 'alta' | 'moderada' | 'fragil'
  if (fato.grauCerteza >= 80) {
    forcaClasse = 'alta'
  } else if (fato.grauCerteza >= 50) {
    forcaClasse = 'moderada'
  } else {
    forcaClasse = 'fragil'
  }

  const config = FORCA_PROVA[forcaClasse]

  return (
    <div
      style={{
        ...styles.itemFato,
        borderLeftColor: config.cor,
      }}
    >
      <div style={styles.headerItemFato}>
        <div style={styles.forcaIcone}>
          <span style={{ color: config.cor, fontSize: '18px' }}>
            {config.icone}
          </span>
          <span style={{ color: config.cor, fontSize: '9pt', fontWeight: 'bold' }}>
            {forcaClasse.toUpperCase()}
          </span>
        </div>
        <div style={styles.descricaoItemFato}>
          <p style={styles.descricaoTexto}>{fato.descricao}</p>
          {fato.observacoes && (
            <p style={styles.observacoesTexto}>Nota: {fato.observacoes}</p>
          )}
        </div>
        <div style={styles.botoesItemFato}>
          <button
            onClick={() => onEditar(fato)}
            style={styles.botaoItem}
            title="Editar"
          >
            ✎
          </button>
          <button
            onClick={() => onRemover(fato.id || '')}
            style={{ ...styles.botaoItem, color: CORES_JUDICIAIS.vermelhoCritico }}
            title="Remover"
          >
            ✕
          </button>
        </div>
      </div>

      <div style={styles.detalhesItemFato}>
        <div style={styles.detalhe}>
          <span style={styles.etiqueta}>Certeza:</span>
          <span style={{ color: config.cor, fontWeight: 'bold' }}>
            {fato.grauCerteza}%
          </span>
        </div>
        <div style={styles.detalhe}>
          <span style={styles.etiqueta}>Peso:</span>
          <span>{fato.peso || 1}/5</span>
        </div>
        <div style={styles.detalhe}>
          <span style={styles.etiqueta}>Fontes:</span>
          <span>{(fato.fontes?.length || 0)}</span>
        </div>
      </div>
    </div>
  )
}

interface ItemFatoCompactoProps {
  fato: FatoProva
  onEditar: (fato: FatoProva) => void
  onRemover: (id: string) => void
}

function ItemFatoCompacto({ fato, onEditar, onRemover }: ItemFatoCompactoProps) {
  let forcaClasse: 'alta' | 'moderada' | 'fragil'
  if (fato.grauCerteza >= 80) {
    forcaClasse = 'alta'
  } else if (fato.grauCerteza >= 50) {
    forcaClasse = 'moderada'
  } else {
    forcaClasse = 'fragil'
  }

  const config = FORCA_PROVA[forcaClasse]

  return (
    <div
      style={{
        ...styles.itemFatoCompacto,
        backgroundColor: config.corFundo,
        borderLeftColor: config.cor,
      }}
    >
      <div style={styles.textoCompacto}>
        <span style={{ color: config.cor, fontWeight: 'bold' }}>
          {config.icone}
        </span>
        <span style={styles.descricaoCompacta}>{fato.descricao}</span>
        <span style={styles.certezaCompacta}>{fato.grauCerteza}%</span>
      </div>
      <div style={styles.botoeCompactos}>
        <button
          onClick={() => onEditar(fato)}
          style={styles.botaoCompactoItem}
        >
          ✎
        </button>
        <button
          onClick={() => onRemover(fato.id || '')}
          style={styles.botaoCompactoItem}
        >
          ✕
        </button>
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
    fontSize: '11pt',
  },

  containerCompacto: {
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    border: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    borderRadius: '4px',
    padding: ESPACAMENTO_PRE_ATENTIVO.medio,
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: '11pt',
  },

  cabecalho: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: ESPACAMENTO_PRE_ATENTIVO.grande,
    paddingBottom: ESPACAMENTO_PRE_ATENTIVO.medio,
    borderBottom: `2px solid ${CORES_JUDICIAIS.azulPrincipal}`,
  },

  cabecalhoCompacto: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: ESPACAMENTO_PRE_ATENTIVO.medio,
    fontSize: '10pt',
    fontWeight: 'bold',
    color: CORES_JUDICIAIS.azulPrincipal,
  },

  titulo: {
    margin: 0,
    color: CORES_JUDICIAIS.azulPrincipal,
    fontSize: '12pt',
    fontWeight: 'bold',
  },

  contagem: {
    backgroundColor: CORES_JUDICIAIS.azulPrincipal,
    color: CORES_JUDICIAIS.brancoFundo,
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '10pt',
    fontWeight: 'bold',
  },

  listaFatos: {
    display: 'flex',
    flexDirection: 'column',
    gap: ESPACAMENTO_PRE_ATENTIVO.medio,
    marginBottom: ESPACAMENTO_PRE_ATENTIVO.grande,
  },

  listaCompacta: {
    display: 'flex',
    flexDirection: 'column',
    gap: ESPACAMENTO_PRE_ATENTIVO.pequeno,
    marginTop: ESPACAMENTO_PRE_ATENTIVO.medio,
  },

  itemFato: {
    borderLeft: '4px solid',
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    padding: ESPACAMENTO_PRE_ATENTIVO.medio,
    borderRadius: '4px',
    display: 'flex',
    flexDirection: 'column',
    gap: ESPACAMENTO_PRE_ATENTIVO.medio,
  },

  itemFatoCompacto: {
    borderLeft: '3px solid',
    padding: `${ESPACAMENTO_PRE_ATENTIVO.pequeno} ${ESPACAMENTO_PRE_ATENTIVO.medio}`,
    borderRadius: '3px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '10pt',
  },

  headerItemFato: {
    display: 'flex',
    gap: ESPACAMENTO_PRE_ATENTIVO.medio,
    alignItems: 'flex-start',
  },

  forcaIcone: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    minWidth: '40px',
  },

  descricaoItemFato: {
    flex: 1,
  },

  descricaoTexto: {
    margin: 0,
    fontWeight: '500',
    color: CORES_JUDICIAIS.pretoTexto,
  },

  observacoesTexto: {
    margin: '4px 0 0 0',
    fontSize: '10pt',
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
    fontStyle: 'italic',
  },

  botoesItemFato: {
    display: 'flex',
    gap: '4px',
  },

  botaoItem: {
    padding: '4px 8px',
    backgroundColor: CORES_JUDICIAIS.brancoFundo,
    border: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '10pt',
    color: CORES_JUDICIAIS.azulPrincipal,
  },

  detalhesItemFato: {
    display: 'flex',
    gap: ESPACAMENTO_PRE_ATENTIVO.grande,
    fontSize: '10pt',
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
    borderTop: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    paddingTop: ESPACAMENTO_PRE_ATENTIVO.pequeno,
  },

  detalhe: {
    display: 'flex',
    gap: '4px',
  },

  etiqueta: {
    fontWeight: 'bold',
  },

  textoCompacto: {
    display: 'flex',
    gap: ESPACAMENTO_PRE_ATENTIVO.pequeno,
    alignItems: 'center',
    flex: 1,
  },

  descricaoCompacta: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  certezaCompacta: {
    backgroundColor: CORES_JUDICIAIS.brancoFundo,
    padding: '2px 6px',
    borderRadius: '3px',
    fontWeight: 'bold',
    fontSize: '9pt',
  },

  botoeCompactos: {
    display: 'flex',
    gap: '4px',
  },

  botaoCompactoItem: {
    padding: '2px 6px',
    backgroundColor: CORES_JUDICIAIS.brancoFundo,
    border: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    borderRadius: '2px',
    cursor: 'pointer',
    fontSize: '9pt',
  },

  containerFormulario: {
    backgroundColor: CORES_JUDICIAIS.brancoFundo,
    border: `1px solid ${CORES_JUDICIAIS.azulPrincipal}`,
    borderRadius: '4px',
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    marginBottom: ESPACAMENTO_PRE_ATENTIVO.grande,
  },

  formulario: {
    display: 'flex',
    flexDirection: 'column',
    gap: ESPACAMENTO_PRE_ATENTIVO.medio,
  },

  tituloFormulario: {
    margin: 0,
    color: CORES_JUDICIAIS.azulPrincipal,
    fontSize: '12pt',
    fontWeight: 'bold',
    borderBottom: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    paddingBottom: ESPACAMENTO_PRE_ATENTIVO.pequeno,
  },

  grupoFormulario: {
    display: 'flex',
    flexDirection: 'column',
    gap: ESPACAMENTO_PRE_ATENTIVO.pequeno,
  },

  label: {
    fontWeight: 'bold',
    fontSize: '10pt',
    color: CORES_JUDICIAIS.azulPrincipal,
  },

  input: {
    padding: ESPACAMENTO_PRE_ATENTIVO.pequeno,
    border: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    borderRadius: '3px',
    fontSize: '10pt',
  },

  textarea: {
    padding: ESPACAMENTO_PRE_ATENTIVO.pequeno,
    border: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    borderRadius: '3px',
    fontSize: '10pt',
    fontFamily: 'Arial, sans-serif',
    lineHeight: 1.4,
    resize: 'vertical',
  },

  slider: {
    width: '100%',
    cursor: 'pointer',
  },

  presetsGrau: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: ESPACAMENTO_PRE_ATENTIVO.pequeno,
  },

  presetBotao: {
    padding: '4px 8px',
    border: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '9pt',
    transition: 'all 0.2s',
  },

  descricaoAjuda: {
    fontSize: '9pt',
    color: CORES_JUDICIAIS.cinzaTextoSecundario,
    fontStyle: 'italic',
  },

  containerFonte: {
    display: 'flex',
    gap: ESPACAMENTO_PRE_ATENTIVO.pequeno,
    marginBottom: ESPACAMENTO_PRE_ATENTIVO.pequeno,
  },

  inputFonte: {
    flex: 1,
    padding: ESPACAMENTO_PRE_ATENTIVO.pequeno,
    border: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    borderRadius: '3px',
    fontSize: '10pt',
  },

  botaoRemoverFonte: {
    padding: '4px 8px',
    backgroundColor: CORES_JUDICIAIS.vermelhoCritico,
    color: CORES_JUDICIAIS.brancoFundo,
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '10pt',
  },

  botaoAdicionarFonte: {
    padding: '4px 8px',
    backgroundColor: CORES_JUDICIAIS.azulClaro,
    color: CORES_JUDICIAIS.brancoFundo,
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '10pt',
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
    fontSize: '11pt',
    fontWeight: 'bold',
  },

  botaoCancelar: {
    padding: '8px 16px',
    backgroundColor: CORES_JUDICIAIS.cinzaBorda,
    color: CORES_JUDICIAIS.pretoTexto,
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '11pt',
  },

  botaoAdicionar: {
    width: '100%',
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    backgroundColor: CORES_JUDICIAIS.azulPrincipal,
    color: CORES_JUDICIAIS.brancoFundo,
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '11pt',
    fontWeight: 'bold',
  },

  botaoCompacto: {
    backgroundColor: CORES_JUDICIAIS.azulPrincipal,
    color: CORES_JUDICIAIS.brancoFundo,
    border: 'none',
    borderRadius: '3px',
    padding: '2px 8px',
    cursor: 'pointer',
    fontSize: '12pt',
    fontWeight: 'bold',
  },
}
