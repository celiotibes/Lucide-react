/**
 * TemplateSelector Component
 * Modal for selecting document template
 */

import { ALL_TEMPLATES } from '../../constants/documentTemplates'
import type { TemplateType } from '../../types/editor'

interface TemplateSelectorProps {
  onSelect: (type: TemplateType) => void
}

export function TemplateSelector({ onSelect }: TemplateSelectorProps) {
  const templates = Object.values(ALL_TEMPLATES)

  return (
    <div className="template-selector">
      <div className="template-header">
        <h1>✏️ Editor de Peças Jurídicas</h1>
        <p>Selecione um template para começar</p>
      </div>

      <div className="template-grid">
        {templates.map((template) => (
          <button
            key={template.id}
            className="template-card"
            onClick={() => onSelect(template.type)}
          >
            <h3>{template.name}</h3>
            <p>{template.description}</p>
            <div className="template-sections">
              {template.sections.length} seções
            </div>
            <span className="arrow">→</span>
          </button>
        ))}
      </div>
    </div>
  )
}
