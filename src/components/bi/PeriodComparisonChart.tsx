import { useEffect, useRef } from 'react'
import { type PeriodComparison } from '../../services/bi/analyticsEngine'
import './PeriodComparisonChart.css'

interface PeriodComparisonChartProps {
  comparisons: PeriodComparison[]
  unit?: string
}

export function PeriodComparisonChart({
  comparisons,
  unit = 'R$',
}: PeriodComparisonChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || comparisons.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const width = rect.width
    const height = rect.height
    const padding = { top: 40, right: 40, bottom: 40, left: 60 }

    // Dark mode
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    ctx.fillStyle = isDark ? '#2d2d2d' : '#f9f9f9'
    ctx.fillRect(0, 0, width, height)

    // Calculate scales
    const values = comparisons.flatMap((c) => [c.value1, c.value2])
    const maxValue = Math.max(...values, 1)

    const plotWidth = width - padding.left - padding.right
    const plotHeight = height - padding.top - padding.bottom
    const barWidth = plotWidth / (comparisons.length * 2.5)
    const barGap = barWidth * 0.5

    // Draw grid
    ctx.strokeStyle = isDark ? '#404040' : '#e0e0e0'
    ctx.lineWidth = 1
    const gridLines = 5

    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (i / gridLines) * plotHeight
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(width - padding.right, y)
      ctx.stroke()
    }

    // Draw axes
    ctx.strokeStyle = isDark ? '#666' : '#333'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(padding.left, padding.top)
    ctx.lineTo(padding.left, height - padding.bottom)
    ctx.lineTo(width - padding.right, height - padding.bottom)
    ctx.stroke()

    // Y-axis labels
    ctx.fillStyle = isDark ? '#b0b0b0' : '#666'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'

    for (let i = 0; i <= gridLines; i++) {
      const value = (i / gridLines) * maxValue
      const y = height - padding.bottom - (i / gridLines) * plotHeight
      ctx.fillText(
        value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : `${(value / 1000).toFixed(0)}K`,
        padding.left - 10,
        y
      )
    }

    // Draw bars
    let currentX = padding.left + barGap

    comparisons.forEach((comparison) => {
      const scaleY = (value: number) => height - padding.bottom - (value / maxValue) * plotHeight

      // Value 1 bar (blue)
      ctx.fillStyle = '#2196f3'
      const height1 = scaleY(0) - scaleY(comparison.value1)
      ctx.fillRect(currentX, scaleY(comparison.value1), barWidth, height1)
      currentX += barWidth + barGap

      // Value 2 bar (green/red based on trend)
      ctx.fillStyle = comparison.trend === 'increase' ? '#4caf50' : '#f44336'
      const height2 = scaleY(0) - scaleY(comparison.value2)
      ctx.fillRect(currentX, scaleY(comparison.value2), barWidth, height2)
      currentX += barWidth + barGap * 2

      // Label
      ctx.fillStyle = isDark ? '#b0b0b0' : '#666'
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const labelX = currentX - barWidth - barGap * 1.5
      ctx.fillText(comparison.metric, labelX, height - padding.bottom + 10)
    })

    // Legend
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'

    ctx.fillStyle = '#2196f3'
    ctx.fillRect(width - 200, 10, 10, 10)
    ctx.fillStyle = isDark ? '#b0b0b0' : '#666'
    ctx.fillText(comparisons[0]?.period1 || 'Period 1', width - 185, 18)

    ctx.fillStyle = '#4caf50'
    ctx.fillRect(width - 200, 25, 10, 10)
    ctx.fillStyle = isDark ? '#b0b0b0' : '#666'
    ctx.fillText(comparisons[0]?.period2 || 'Period 2', width - 185, 33)
  }, [comparisons])

  return (
    <div className="period-comparison-chart">
      <canvas ref={canvasRef} className="comparison-canvas" />
      {comparisons.length > 0 && (
        <div className="comparison-details">
          {comparisons.map((comp, idx) => (
            <div key={idx} className="comparison-row">
              <div className="metric-name">{comp.metric}</div>
              <div className="metric-values">
                <span className="value">{unit} {comp.value1.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                <span className="arrow">→</span>
                <span className="value">{unit} {comp.value2.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className={`change ${comp.trend}`}>
                {comp.trend === 'increase' ? '↑' : comp.trend === 'decrease' ? '↓' : '→'}
                {Math.abs(comp.percentChange).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
