import { useEffect, useRef, useState } from 'react'
import { AnalyticsEngine, type TrendData, type TrendForecast } from '../../services/bi/analyticsEngine'
import './TrendAnalysisChart.css'

interface TrendAnalysisChartProps {
  data: TrendData[]
  title?: string
  unit?: string
  showForecast?: boolean
}

export function TrendAnalysisChart({
  data,
  title = 'Trend Analysis',
  unit = 'R$',
  showForecast = true,
}: TrendAnalysisChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [forecast, setForecast] = useState<TrendForecast[]>([])

  useEffect(() => {
    if (showForecast) {
      setForecast(AnalyticsEngine.forecastTrend(data, 3))
    }
  }, [data, showForecast])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || data.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Get device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const width = rect.width
    const height = rect.height
    const padding = { top: 40, right: 40, bottom: 40, left: 60 }

    // Clear canvas
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)

    // Dark mode support
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    ctx.fillStyle = isDark ? '#2d2d2d' : '#f9f9f9'
    ctx.fillRect(0, 0, width, height)

    // Calculate scales
    const allValues = [...data.map((d) => d.value), ...forecast.map((f) => f.predicted)]
    const minValue = Math.min(...allValues, 0)
    const maxValue = Math.max(...allValues, 1)
    const valueRange = maxValue - minValue || 1

    const plotWidth = width - padding.left - padding.right
    const plotHeight = height - padding.top - padding.bottom

    // Scale functions
    const scaleX = (index: number) => padding.left + (index / (data.length + forecast.length - 1)) * plotWidth
    const scaleY = (value: number) =>
      height - padding.bottom - ((value - minValue) / valueRange) * plotHeight

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

    // Draw axis labels
    ctx.fillStyle = isDark ? '#b0b0b0' : '#666'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'

    // Y-axis labels
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let i = 0; i <= gridLines; i++) {
      const value = minValue + (i / gridLines) * valueRange
      const y = height - padding.bottom - (i / gridLines) * plotHeight
      ctx.fillText(
        value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : `${(value / 1000).toFixed(0)}K`,
        padding.left - 10,
        y
      )
    }

    // X-axis labels
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    data.forEach((point, idx) => {
      const x = scaleX(idx)
      ctx.fillText(point.period.slice(-2), x, height - padding.bottom + 10)
    })

    forecast.forEach((point, idx) => {
      const x = scaleX(data.length + idx)
      ctx.fillText(point.period, x, height - padding.bottom + 10)
    })

    // Draw data line
    ctx.strokeStyle = '#2196f3'
    ctx.lineWidth = 2
    ctx.beginPath()

    data.forEach((point, idx) => {
      const x = scaleX(idx)
      const y = scaleY(point.value)

      if (idx === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    ctx.stroke()

    // Draw forecast line (dashed)
    if (forecast.length > 0) {
      const lastDataPoint = data[data.length - 1]
      const lastX = scaleX(data.length - 1)
      const lastY = scaleY(lastDataPoint.value)

      ctx.setLineDash([5, 5])
      ctx.strokeStyle = '#ff9800'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(lastX, lastY)

      forecast.forEach((point, idx) => {
        const x = scaleX(data.length + idx)
        const y = scaleY(point.predicted)
        ctx.lineTo(x, y)
      })
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Draw data points
    ctx.fillStyle = '#2196f3'
    data.forEach((_, idx) => {
      const x = scaleX(idx)
      const y = scaleY(data[idx].value)
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fill()
    })

    // Draw forecast points
    ctx.fillStyle = '#ff9800'
    forecast.forEach((point, idx) => {
      const x = scaleX(data.length + idx)
      const y = scaleY(point.predicted)
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fill()
    })

    // Draw title
    ctx.fillStyle = isDark ? '#e0e0e0' : '#333'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(title, width / 2, 20)

    // Draw legend
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = '#2196f3'
    ctx.fillRect(width - 150, 10, 10, 10)
    ctx.fillStyle = isDark ? '#b0b0b0' : '#666'
    ctx.fillText('Historical', width - 135, 18)

    if (forecast.length > 0) {
      ctx.fillStyle = '#ff9800'
      ctx.fillRect(width - 150, 25, 10, 10)
      ctx.fillStyle = isDark ? '#b0b0b0' : '#666'
      ctx.fillText('Forecast', width - 135, 33)
    }
  }, [data, forecast, title])

  return (
    <div className="trend-analysis-chart">
      <canvas ref={canvasRef} className="chart-canvas" />
      {data.length > 0 && (
        <div className="chart-stats">
          <div className="stat">
            <span className="label">Current:</span>
            <span className="value">
              {unit} {data[data.length - 1].value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            </span>
          </div>
          {data[data.length - 1].percentChange !== undefined && (
            <div className="stat">
              <span className="label">MoM Change:</span>
              <span
                className={`value ${data[data.length - 1].percentChange! > 0 ? 'positive' : 'negative'}`}
              >
                {data[data.length - 1].percentChange! > 0 ? '+' : ''}
                {data[data.length - 1].percentChange!.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
