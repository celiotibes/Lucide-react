/**
 * Editor Legal Visual
 * Editor de petições com integração TipTap, visualização de matriz de prova e preview em tempo real
 * Suporta validação semântica H1-H6, hermenêutica blindada e export para formatos judiciais
 */

import React, { useCallback, useMemo, useState } from 'react'
import { useEditor, EditorContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { CORES_JUDICIAIS, ESPACAMENTO_PRE_ATENTIVO } from '@/utils/sistemaDesignJudicial'
import { MatrizProvaVisual } from '../visualization/MatrizProvaVisual'
import { ValidadorSemantico } from './ValidadorSemantico'
import { ServicoJurimetriaBR } from '@/services/servicoJurimetriaBR'
import type { FatoProva, Analisejurimetrica } from '@/types/jurimetriaBR'

interface EditorLegalVisualProps {
  titulo?: string
  conteudoInicial?: string
  onMudar?: (html: string) => void
  exibirMatriz?: boolean
  exibirValidador?: boolean
  modoVisualizacao?: 'editor' | 'preview' | 'dualview'
  fatos?: FatoProva[]
}

type TamanhoFonte = 'pequeno' | 'normal' | 'grande'

export function EditorLegalVisual({
  titulo = 'Nova Petição',
  conteudoInicial = '',
  onMudar,
  exibirMatriz = true,
  exibirValidador = true,
  modoVisualizacao = 'dualview',
  fatos = [],
}: EditorLegalVisualProps) {
  const [tamanhoFonte, setTamanhoFonte] = useState<TamanhoFonte>('normal')
  const [modo, setModo] = useState<'editor' | 'preview' | 'dualview'>(modoVisualizacao)
  const [analiseJurimetria, setAnaliseJurimetria] = useState<Analisejurimetrica | null>(null)
  const [errosValidacao, setErrosValidacao] = useState<string[]>([])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4],
        },
      }),
      Link.configure({
        openOnClick: false,
      }),
      Placeholder.configure({
        placeholder: 'Comece a escrever sua petição aqui...',
      }),
    ],
    content: conteudoInicial || this._getTemplateInicial(),
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onMudar?.(html)

      // Análise de jurimetria se houver fatos
      if (fatos.length > 0) {
        const resultado = ServicoJurimetriaBR.analisarJurimetria(fatos)
        setAnaliseJurimetria(resultado)
      }
    },
  })

  const htmlAtual = useMemo(() => editor?.getHTML() || '', [editor?.state.selection])

  const aplicarEstilo = useCallback(
    (comando: string, extras?: any) => {
      if (!editor) return

      switch (comando) {
        case 'bold':
          editor.chain().focus().toggleBold().run()
          break
        case 'italic':
          editor.chain().focus().toggleItalic().run()
          break
        case 'underline':
          editor.chain().focus().toggleUnderline?.().run()
          break
        case 'h1':
          editor.chain().focus().toggleHeading({ level: 1 }).run()
          break
        case 'h2':
          editor.chain().focus().toggleHeading({ level: 2 }).run()
          break
        case 'h3':
          editor.chain().focus().toggleHeading({ level: 3 }).run()
          break
        case 'h4':
          editor.chain().focus().toggleHeading({ level: 4 }).run()
          break
        case 'bullet':
          editor.chain().focus().toggleBulletList().run()
          break
        case 'ordered':
          editor.chain().focus().toggleOrderedList().run()
          break
        case 'blockquote':
          editor.chain().focus().toggleBlockquote().run()
          break
        case 'link':
          const url = window.prompt('Insira a URL:', '')
          if (url) {
            editor.chain().focus().setLink({ href: url }).run()
          }
          break
        case 'removeLink':
          editor.chain().focus().unsetLink().run()
          break
        case 'tamanho':
          setTamanhoFonte(extras.tamanho)
          break
      }
    },
    [editor]
  )

  const exportarHtml = useCallback(() => {
    if (!editor) return
    const html = editor.getHTML()
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `peticao-${new Date().toISOString().split('T')[0]}.html`
    link.click()
  }, [editor])

  const exportarJson = useCallback(() => {
    if (!editor) return
    const conteudo = {
      titulo,
      html: editor.getHTML(),
      json: editor.getJSON(),
      metadados: {
        dataGeracao: new Date().toISOString(),
        jurimetria: analiseJurimetria,
      },
    }
    const blob = new Blob([JSON.stringify(conteudo, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `peticao-${new Date().toISOString().split('T')[0]}.json`
    link.click()
  }, [editor, titulo, analiseJurimetria])

  const reiniciar = useCallback(() => {
    if (!editor) return
    if (window.confirm('Descartar todo o conteúdo? Esta ação não pode ser desfeita.')) {
      editor.chain().focus().clearContent().run()
    }
  }, [editor])

  if (!editor) {
    return <div style={styles.carregando}>Carregando editor...</div>
  }

  const mostrarEditor = modo === 'editor' || modo === 'dualview'
  const mostrarPreview = modo === 'preview' || modo === 'dualview'

  return (
    <div style={styles.container}>
      {/* Cabeçalho */}
      <div style={styles.cabecalho}>
        <h1 style={styles.titulo}>{titulo}</h1>
        <BarraFerramentasEditor
          editor={editor}
          onAplicarEstilo={aplicarEstilo}
          tamanhoFonte={tamanhoFonte}
          onExportarHtml={exportarHtml}
          onExportarJson={exportarJson}
          onReiniciar={reiniciar}
          modo={modo}
          onMudarModo={setModo}
        />
      </div>

      {/* Conteúdo principal */}
      <div style={{ ...styles.conteudo, flexDirection: mostrarEditor && mostrarPreview ? 'row' : 'column' }}>
        {/* Editor */}
        {mostrarEditor && (
          <div style={{ ...styles.painel, width: mostrarPreview ? '50%' : '100%' }}>
            <div style={styles.labelPainel}>✎ EDITOR</div>
            <EditorConteiner
              editor={editor}
              tamanhoFonte={tamanhoFonte}
            />
          </div>
        )}

        {/* Preview */}
        {mostrarPreview && (
          <div style={{ ...styles.painel, width: mostrarEditor ? '50%' : '100%' }}>
            <div style={styles.labelPainel}>👁 PREVIEW</div>
            <PainelPreview html={htmlAtual} tamanhoFonte={tamanhoFonte} />
          </div>
        )}
      </div>

      {/* Validador e Matriz */}
      <div style={styles.rodape}>
        {exibirValidador && (
          <div style={styles.validador}>
            <ValidadorSemantico
              html={htmlAtual}
              exibirDetalhes={true}
              onValidacaoMudar={(valido, avisos, erros) => {
                setErrosValidacao(erros)
              }}
            />
          </div>
        )}

        {exibirMatriz && fatos.length > 0 && (
          <div style={styles.matriz}>
            <MatrizProvaVisual
              analise={analiseJurimetria}
              fatos={fatos}
              exibirDetalhes={true}
              tamanho="normal"
            />
          </div>
        )}
      </div>
    </div>
  )

  function _getTemplateInicial(): string {
    return `
<h1>NOVA PETIÇÃO</h1>
<p>Insira o conteúdo de sua petição aqui. Use os botões de formatação acima para estruturar o texto com headings, listas, links e mais.</p>
<p><strong>Dicas:</strong></p>
<ul>
<li>Use H1 uma única vez para o título principal</li>
<li>Use H2 para seções principais (Fundamentação, etc)</li>
<li>A validação semântica abaixo mostrará sugestões</li>
<li>Exportar em HTML ou JSON quando pronto</li>
</ul>
    `
  }
}

interface BarraFerramentasEditorProps {
  editor: Editor
  onAplicarEstilo: (comando: string, extras?: any) => void
  tamanhoFonte: TamanhoFonte
  onExportarHtml: () => void
  onExportarJson: () => void
  onReiniciar: () => void
  modo: 'editor' | 'preview' | 'dualview'
  onMudarModo: (modo: 'editor' | 'preview' | 'dualview') => void
}

function BarraFerramentasEditor({
  editor,
  onAplicarEstilo,
  tamanhoFonte,
  onExportarHtml,
  onExportarJson,
  onReiniciar,
  modo,
  onMudarModo,
}: BarraFerramentasEditorProps) {
  return (
    <div style={styles.barrFerramentas}>
      {/* Grupo: Formatação de Texto */}
      <div style={styles.grupoFerramenta}>
        <BotaoFormatacao
          ativo={editor.isActive('bold')}
          onClick={() => onAplicarEstilo('bold')}
          titulo="Negrito (Ctrl+B)"
        >
          B
        </BotaoFormatacao>
        <BotaoFormatacao
          ativo={editor.isActive('italic')}
          onClick={() => onAplicarEstilo('italic')}
          titulo="Itálico (Ctrl+I)"
        >
          I
        </BotaoFormatacao>
      </div>

      {/* Grupo: Headings */}
      <div style={styles.grupoFerramenta}>
        <BotaoFormatacao
          ativo={editor.isActive('heading', { level: 1 })}
          onClick={() => onAplicarEstilo('h1')}
          titulo="Heading 1 (Título Principal)"
        >
          H1
        </BotaoFormatacao>
        <BotaoFormatacao
          ativo={editor.isActive('heading', { level: 2 })}
          onClick={() => onAplicarEstilo('h2')}
          titulo="Heading 2 (Seção)"
        >
          H2
        </BotaoFormatacao>
        <BotaoFormatacao
          ativo={editor.isActive('heading', { level: 3 })}
          onClick={() => onAplicarEstilo('h3')}
          titulo="Heading 3 (Subseção)"
        >
          H3
        </BotaoFormatacao>
      </div>

      {/* Grupo: Listas */}
      <div style={styles.grupoFerramenta}>
        <BotaoFormatacao
          ativo={editor.isActive('bulletList')}
          onClick={() => onAplicarEstilo('bullet')}
          titulo="Lista com Bullets"
        >
          •
        </BotaoFormatacao>
        <BotaoFormatacao
          ativo={editor.isActive('orderedList')}
          onClick={() => onAplicarEstilo('ordered')}
          titulo="Lista Numerada"
        >
          1
        </BotaoFormatacao>
      </div>

      {/* Grupo: Bloco */}
      <div style={styles.grupoFerramenta}>
        <BotaoFormatacao
          ativo={editor.isActive('blockquote')}
          onClick={() => onAplicarEstilo('blockquote')}
          titulo="Citação em Bloco"
        >
          "
        </BotaoFormatacao>
        <BotaoFormatacao
          onClick={() => onAplicarEstilo('link')}
          titulo="Inserir Link"
        >
          🔗
        </BotaoFormatacao>
      </div>

      {/* Grupo: Tamanho de Fonte */}
      <div style={styles.grupoFerramenta}>
        <select
          value={tamanhoFonte}
          onChange={(e) => onAplicarEstilo('tamanho', { tamanho: e.target.value })}
          style={styles.selectTamanho}
        >
          <option value="pequeno">Pequeno (10pt)</option>
          <option value="normal">Normal (12pt)</option>
          <option value="grande">Grande (14pt)</option>
        </select>
      </div>

      {/* Grupo: Modo de Visualização */}
      <div style={styles.grupoFerramenta}>
        <BotaoFormatacao
          ativo={modo === 'editor'}
          onClick={() => onMudarModo('editor')}
          titulo="Apenas Editor"
        >
          ✎
        </BotaoFormatacao>
        <BotaoFormatacao
          ativo={modo === 'dualview'}
          onClick={() => onMudarModo('dualview')}
          titulo="Dual View"
        >
          ⊟
        </BotaoFormatacao>
        <BotaoFormatacao
          ativo={modo === 'preview'}
          onClick={() => onMudarModo('preview')}
          titulo="Apenas Preview"
        >
          👁
        </BotaoFormatacao>
      </div>

      {/* Grupo: Ações */}
      <div style={styles.grupoFerramenta}>
        <BotaoFormatacao
          onClick={onExportarHtml}
          titulo="Exportar como HTML"
        >
          HTML
        </BotaoFormatacao>
        <BotaoFormatacao
          onClick={onExportarJson}
          titulo="Exportar como JSON"
        >
          JSON
        </BotaoFormatacao>
        <BotaoFormatacao
          onClick={onReiniciar}
          titulo="Limpar Tudo"
          estilo="perigo"
        >
          ↻
        </BotaoFormatacao>
      </div>
    </div>
  )
}

interface BotaoFormatacaoProps {
  ativo?: boolean
  onClick: () => void
  titulo: string
  children: React.ReactNode
  estilo?: 'normal' | 'perigo'
}

function BotaoFormatacao({
  ativo = false,
  onClick,
  titulo,
  children,
  estilo = 'normal',
}: BotaoFormatacaoProps) {
  const ehPerigo = estilo === 'perigo'

  return (
    <button
      onClick={onClick}
      title={titulo}
      style={{
        ...styles.botao,
        backgroundColor: ativo
          ? CORES_JUDICIAIS.azulPrincipal
          : ehPerigo
            ? CORES_JUDICIAIS.vermelhoCritico
            : CORES_JUDICIAIS.brancoFundo,
        color: ativo || ehPerigo ? CORES_JUDICIAIS.brancoFundo : CORES_JUDICIAIS.pretoTexto,
        borderColor: ehPerigo ? CORES_JUDICIAIS.vermelhoCritico : CORES_JUDICIAIS.cinzaBorda,
      }}
    >
      {children}
    </button>
  )
}

interface EditorConteinereProps {
  editor: Editor
  tamanhoFonte: TamanhoFonte
}

function EditorConteiner({ editor, tamanhoFonte }: EditorConteinereProps) {
  const tamanhoFonteMap = {
    pequeno: '10pt',
    normal: '12pt',
    grande: '14pt',
  }

  return (
    <div
      style={{
        ...styles.editorConteiner,
        fontSize: tamanhoFonteMap[tamanhoFonte],
      }}
    >
      <EditorContent editor={editor} />
    </div>
  )
}

interface PainelPreviewProps {
  html: string
  tamanhoFonte: TamanhoFonte
}

function PainelPreview({ html, tamanhoFonte }: PainelPreviewProps) {
  const tamanhoFonteMap = {
    pequeno: '10pt',
    normal: '12pt',
    grande: '14pt',
  }

  return (
    <div
      style={{
        ...styles.previewConteiner,
        fontSize: tamanhoFonteMap[tamanhoFonte],
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: CORES_JUDICIAIS.brancoFundo,
    fontFamily: 'Arial, Helvetica, sans-serif',
  },

  cabecalho: {
    backgroundColor: CORES_JUDICIAIS.azulPrincipal,
    color: CORES_JUDICIAIS.brancoFundo,
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    borderBottom: `2px solid ${CORES_JUDICIAIS.azulEscuro}`,
  },

  titulo: {
    margin: '0 0 12px 0',
    fontSize: '18pt',
    fontWeight: 'bold',
  },

  barrFerramentas: {
    display: 'flex',
    gap: ESPACAMENTO_PRE_ATENTIVO.pequeno,
    flexWrap: 'wrap',
  },

  grupoFerramenta: {
    display: 'flex',
    gap: ESPACAMENTO_PRE_ATENTIVO.pequeno,
    borderRight: `1px solid rgba(255,255,255,0.2)`,
    paddingRight: ESPACAMENTO_PRE_ATENTIVO.pequeno,
  },

  botao: {
    padding: '6px 10px',
    border: `1px solid`,
    borderRadius: '3px',
    backgroundColor: CORES_JUDICIAIS.brancoFundo,
    color: CORES_JUDICIAIS.pretoTexto,
    cursor: 'pointer',
    fontSize: '11pt',
    fontWeight: '500',
    transition: 'all 0.2s ease',
  },

  selectTamanho: {
    padding: '6px 8px',
    border: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    borderRadius: '3px',
    fontSize: '10pt',
    backgroundColor: CORES_JUDICIAIS.brancoFundo,
    cursor: 'pointer',
  },

  conteudo: {
    display: 'flex',
    flex: 1,
    gap: ESPACAMENTO_PRE_ATENTIVO.medio,
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    overflow: 'hidden',
  },

  painel: {
    display: 'flex',
    flexDirection: 'column',
    border: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    borderRadius: '4px',
    overflow: 'hidden',
    backgroundColor: CORES_JUDICIAIS.brancoFundo,
  },

  labelPainel: {
    padding: ESPACAMENTO_PRE_ATENTIVO.medio,
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
    borderBottom: `1px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    fontSize: '10pt',
    fontWeight: 'bold',
    color: CORES_JUDICIAIS.azulPrincipal,
  },

  editorConteiner: {
    flex: 1,
    overflow: 'auto',
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    fontFamily: 'Arial, Helvetica, sans-serif',
    lineHeight: 1.5,
  },

  previewConteiner: {
    flex: 1,
    overflow: 'auto',
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    fontFamily: 'Arial, Helvetica, sans-serif',
    lineHeight: 1.5,
    backgroundColor: CORES_JUDICIAIS.cinzaPaginaBg,
  },

  rodape: {
    borderTop: `2px solid ${CORES_JUDICIAIS.cinzaBorda}`,
    padding: ESPACAMENTO_PRE_ATENTIVO.grande,
    maxHeight: '40vh',
    overflowY: 'auto',
    display: 'grid',
    gridTemplateColumns: 'auto auto',
    gap: ESPACAMENTO_PRE_ATENTIVO.grande,
  },

  validador: {
    minWidth: '300px',
  },

  matriz: {
    minWidth: '300px',
  },

  carregando: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    fontSize: '14pt',
    color: CORES_JUDICIAIS.azulPrincipal,
    fontFamily: 'Arial, Helvetica, sans-serif',
  },
}
