/**
 * Transformation Progress Component
 * Shows step-by-step progress of petition transformation
 */

import { TransformationStep } from '../../types/petitionTransformer'
import type { TransformationProgress } from '../../types/petitionTransformer'
import './TransformationProgress.css'

interface TransformationProgressProps {
  progress: TransformationProgress | null
  isComplete: boolean
}

const STEP_LABELS: Record<string, { label: string; emoji: string }> = {
  parse: { label: 'Analisando', emoji: '📄' },
  analyze: { label: 'Avaliando', emoji: '🔍' },
  'detect-issues': { label: 'Detectando problemas', emoji: '⚠️' },
  enhance: { label: 'Aprimorando', emoji: '✨' },
  'generate-summary': { label: 'Gerando resumo', emoji: '📝' },
  'apply-design': { label: 'Aplicando design', emoji: '🎨' },
  export: { label: 'Exportando', emoji: '📤' },
}

const STEP_ORDER = [
  'parse',
  'analyze',
  'detect-issues',
  'enhance',
  'generate-summary',
  'apply-design',
  'export',
]

export function TransformationProgress({ progress, isComplete }: TransformationProgressProps) {
  if (!progress) {
    return null
  }

  const currentStepIndex = STEP_ORDER.indexOf(progress.currentStep || '')
  const completionPercentage = Math.max(0, Math.min(100, progress.progressPercentage || 0))

  return (
    <div className="transformation-progress">
      <div className="progress-header">
        <h3>⚙️ Transformando Petição</h3>
        <span className="progress-percent">{completionPercentage}%</span>
      </div>

      <div className="progress-bar-container">
        <div className="progress-bar-background">
          <div
            className="progress-bar-fill"
            style={{ width: `${completionPercentage}%` }}
          />
        </div>
      </div>

      <div className="progress-message">
        <p>{progress.message}</p>
        {progress.estimatedTimeRemaining > 0 && (
          <span className="time-remaining">
            ⏱️ ~{Math.ceil(progress.estimatedTimeRemaining / 1000)}s restantes
          </span>
        )}
      </div>

      <div className="steps-container">
        {STEP_ORDER.map((step, index) => {
          const stepConfig = STEP_LABELS[step]
          const isCompleted = index < currentStepIndex || (index === currentStepIndex && isComplete)
          const isCurrent = index === currentStepIndex && !isComplete
          const isPending = index > currentStepIndex

          return (
            <div
              key={step}
              className={`step ${isCompleted ? 'completed' : isCurrent ? 'current' : 'pending'}`}
            >
              <div className="step-indicator">
                {isCompleted ? (
                  <span className="step-icon">✓</span>
                ) : isCurrent ? (
                  <span className="step-icon loading">{stepConfig.emoji}</span>
                ) : (
                  <span className="step-icon">{index + 1}</span>
                )}
              </div>
              <div className="step-label">{stepConfig.label}</div>
            </div>
          )
        })}
      </div>

      {isComplete && (
        <div className="completion-message">
          <p className="success-message">✨ Transformação concluída com sucesso!</p>
        </div>
      )}
    </div>
  )
}
