import { useEffect, useRef } from 'react'
import type { WaterfallStep } from '../../types/financial'
import './WaterfallChart.css'

interface WaterfallChartProps {
  data: WaterfallStep[]
  height?: number
}

export function WaterfallChart({ data, height = 400 }: WaterfallChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current || !data.length) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.offsetWidth * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    const padding = { top: 40, right: 40, bottom: 60, left: 60 }
    const chartWidth = canvas.offsetWidth - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    // Find min and max values for scaling
    const allValues = data.map((d) => d.value)
    const maxValue = Math.max(...allValues)
    const minValue = Math.min(...allValues, 0)
    const range = maxValue - minValue
    const scale = chartHeight / (range || 1)

    // Dimensions
    const barWidth = Math.max(chartWidth / (data.length * 1.5), 30)
    const spacing = (chartWidth - barWidth * data.length) / (data.length - 1)

    // Draw grid lines
    ctx.strokeStyle = '#e0e0e0'
    ctx.lineWidth = 1
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (chartHeight / 5) * i
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(canvas.offsetWidth - padding.right, y)
      ctx.stroke()
    }

    // Draw bars and labels
    let currentY = padding.top + chartHeight - (0 - minValue) * scale

    data.forEach((step, index) => {
      const x = padding.left + index * (barWidth + spacing)
      const barHeight = step.value * scale
      const barStartY = currentY - barHeight

      // Draw bar
      ctx.fillStyle = step.color || (step.isTotal ? '#4caf50' : '#2196f3')
      ctx.fillRect(x, barStartY, barWidth, barHeight)

      // Draw border
      ctx.strokeStyle = '#333'
      ctx.lineWidth = 1
      ctx.strokeRect(x, barStartY, barWidth, barHeight)

      // Draw value label on bar
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 12px Arial'
      ctx.textAlign = 'center'
      const labelY = barStartY + barHeight / 2 + 5
      const displayValue = `R$ ${(step.value / 1000).toFixed(0)}k`
      ctx.fillText(displayValue, x + barWidth / 2, labelY)

      // Draw step name
      ctx.fillStyle = '#333'
      ctx.font = '12px Arial'
      ctx.textAlign = 'center'
      const textY = padding.top + chartHeight + 20
      const maxLabelWidth = barWidth + spacing
      wrapText(ctx, step.name, x + barWidth / 2, textY, maxLabelWidth)

      if (!step.isTotal) {
        // Draw connector line to next bar
        if (index < data.length - 1) {
          const nextBarX = x + barWidth + spacing
          ctx.strokeStyle = '#999'
          ctx.lineWidth = 1
          ctx.setLineDash([3, 3])
          ctx.beginPath()
          ctx.moveTo(x + barWidth, barStartY)
          ctx.lineTo(nextBarX, barStartY)
          ctx.stroke()
          ctx.setLineDash([])
        }
      }

      // Update position for next bar
      if (!step.isTotal) {
        currentY = barStartY
      }
    })

    // Draw axes
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(padding.left, padding.top)
    ctx.lineTo(padding.left, padding.top + chartHeight)
    ctx.lineTo(canvas.offsetWidth - padding.right, padding.top + chartHeight)
    ctx.stroke()

    // Draw y-axis labels
    ctx.fillStyle = '#666'
    ctx.font = '11px Arial'
    ctx.textAlign = 'right'
    for (let i = 0; i <= 5; i++) {
      const value = minValue + (range / 5) * i
      const y = padding.top + chartHeight - (value - minValue) * scale
      const label = `R$ ${(value / 1000).toFixed(0)}k`
      ctx.fillText(label, padding.left - 10, y + 4)
    }

    function wrapText(
      context: CanvasRenderingContext2D,
      text: string,
      x: number,
      y: number,
      maxWidth: number
    ) {
      const words = text.split(' ')
      let line = ''
      const lineHeight = 14

      for (let n = 0; n < words.length; n++) {
        const testLine = line + (line ? ' ' : '') + words[n]
        const metrics = context.measureText(testLine)
        if (metrics.width > maxWidth && n > 0) {
          context.fillText(line, x, y)
          line = words[n]
          y += lineHeight
        } else {
          line = testLine
        }
      }
      context.fillText(line, x, y)
    }
  }, [data, height])

  return (
    <div className="waterfall-chart-container">
      <h3>📊 Análise de DRE (Cascata)</h3>
      <canvas
        ref={canvasRef}
        className="waterfall-canvas"
        style={{
          width: '100%',
          height: `${height}px`,
          border: '1px solid #e0e0e0',
          borderRadius: '8px',
        }}
      />
    </div>
  )
}
