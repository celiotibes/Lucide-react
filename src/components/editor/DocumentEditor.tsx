/**
 * DocumentEditor Component
 * Main text editing area with formatting
 */

interface DocumentEditorProps {
  content: string
  onChange: (content: string) => void
}

export function DocumentEditor({ content, onChange }: DocumentEditorProps) {
  return (
    <div className="document-editor-container">
      <div className="editor-toolbar">
        <div className="toolbar-group">
          <button title="Negrito" className="toolbar-btn">
            <strong>B</strong>
          </button>
          <button title="Itálico" className="toolbar-btn">
            <em>I</em>
          </button>
          <button title="Sublinhado" className="toolbar-btn">
            <u>U</u>
          </button>
        </div>

        <div className="toolbar-group">
          <select title="Alinhamento" className="toolbar-select">
            <option value="left">Esquerda</option>
            <option value="center">Centro</option>
            <option value="right">Direita</option>
            <option value="justify">Justificado</option>
          </select>
        </div>

        <div className="toolbar-group">
          <select title="Estilo" className="toolbar-select">
            <option value="normal">Normal</option>
            <option value="heading1">Título 1</option>
            <option value="heading2">Título 2</option>
            <option value="paragraph">Parágrafo</option>
          </select>
        </div>
      </div>

      <textarea
        className="document-editor"
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Comece a escrever sua petição jurídica...&#10;&#10;Dicas:&#10;- Use Templates para começar&#10;- Pesquise jurisprudência na barra lateral&#10;- Use a IA para sugestões de melhoria"
        spellCheck="true"
      />

      <div className="editor-stats">
        <span>📊 {content.length} caracteres</span>
        <span>📝 {content.split(/\s+/).filter((w) => w).length} palavras</span>
        <span>⏱️ {Math.ceil(content.split(/\s+/).length / 200)} min. de leitura</span>
      </div>
    </div>
  )
}
