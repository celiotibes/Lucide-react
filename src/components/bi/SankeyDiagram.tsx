import type { SankeyNode, SankeyLink } from '../../types/financial'
import './SankeyDiagram.css'

interface SankeyDiagramProps {
  nodes: SankeyNode[]
  links: SankeyLink[]
  width?: number
  height?: number
}

export function SankeyDiagram({ nodes, links, width = 800, height = 400 }: SankeyDiagramProps) {
  // Calculate node positions
  const nodeHeight = 30
  const nodeWidth = 80
  const marginLeft = 60
  const marginRight = 60
  const marginTop = 40
  const marginBottom = 40

  const sourceNodes = nodes.filter((_, i) => links.some((l) => l.source === i))
  const targetNodes = nodes.filter((_, i) => links.some((l) => l.target === i))

  const getNodeX = (index: number): number => {
    if (links.some((l) => l.source === index)) {
      return marginLeft
    }
    return width - marginRight - nodeWidth
  }

  const getNodeY = (index: number): number => {
    if (links.some((l) => l.source === index)) {
      const pos = sourceNodes.indexOf(nodes[index])
      return marginTop + pos * ((height - marginTop - marginBottom) / Math.max(sourceNodes.length - 1, 1))
    }
    const pos = targetNodes.indexOf(nodes[index])
    return marginTop + pos * ((height - marginTop - marginBottom) / Math.max(targetNodes.length - 1, 1))
  }

  // Calculate total flow for scaling
  const totalFlow = links.reduce((sum, link) => sum + link.value, 0)

  // Generate color palette
  const colors = ['#4caf50', '#2196f3', '#ff9800', '#f44336', '#9c27b0', '#00bcd4']

  return (
    <div className="sankey-diagram-container">
      <h3>💧 Fluxo de Caixa (Sankey)</h3>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="sankey-svg">
        {/* Draw links */}
        {links.map((link, idx) => {
          // Node references stored for potential future use (hover effects, etc)
          void nodes[link.source]
          void nodes[link.target]
          const sourceY = getNodeY(link.source) + nodeHeight / 2
          const targetY = getNodeY(link.target) + nodeHeight / 2
          const sourceX = getNodeX(link.source) + nodeWidth
          const targetX = getNodeX(link.target)

          // Calculate path width based on value
          const pathHeight = Math.max(1, (link.value / totalFlow) * 50)

          // Create Bezier curve
          const cp1x = sourceX + (targetX - sourceX) * 0.25
          const cp2x = sourceX + (targetX - sourceX) * 0.75

          return (
            <g key={`link-${idx}`} className="sankey-link">
              {/* Upper curve */}
              <path
                d={`M ${sourceX} ${sourceY - pathHeight / 2}
                   C ${cp1x} ${sourceY - pathHeight / 2},
                   ${cp2x} ${targetY - pathHeight / 2},
                   ${targetX} ${targetY - pathHeight / 2}`}
                fill="none"
                stroke={colors[idx % colors.length]}
                strokeWidth={Math.max(1, pathHeight)}
                opacity="0.6"
              />
              {/* Lower curve */}
              <path
                d={`M ${sourceX} ${sourceY + pathHeight / 2}
                   C ${cp1x} ${sourceY + pathHeight / 2},
                   ${cp2x} ${targetY + pathHeight / 2},
                   ${targetX} ${targetY + pathHeight / 2}`}
                fill="none"
                stroke={colors[idx % colors.length]}
                strokeWidth={Math.max(1, pathHeight)}
                opacity="0.6"
              />
              {/* Fill between curves */}
              <path
                d={`M ${sourceX} ${sourceY - pathHeight / 2}
                   C ${cp1x} ${sourceY - pathHeight / 2},
                   ${cp2x} ${targetY - pathHeight / 2},
                   ${targetX} ${targetY - pathHeight / 2}
                   L ${targetX} ${targetY + pathHeight / 2}
                   C ${cp2x} ${targetY + pathHeight / 2},
                   ${cp1x} ${sourceY + pathHeight / 2},
                   ${sourceX} ${sourceY + pathHeight / 2}
                   Z`}
                fill={colors[idx % colors.length]}
                opacity="0.3"
              />
              {/* Value label */}
              <text
                x={(sourceX + targetX) / 2}
                y={(sourceY + targetY) / 2}
                textAnchor="middle"
                fontSize="11"
                fill="#333"
                fontWeight="600"
              >
                R$ {(link.value / 1000).toFixed(0)}k
              </text>
            </g>
          )
        })}

        {/* Draw nodes */}
        {nodes.map((node, idx) => {
          const x = getNodeX(idx)
          const y = getNodeY(idx)
          const nodeColor = colors[idx % colors.length]

          return (
            <g key={`node-${idx}`} className="sankey-node">
              <rect
                x={x}
                y={y}
                width={nodeWidth}
                height={nodeHeight}
                fill={nodeColor}
                rx="4"
                opacity="0.8"
              />
              <text
                x={x + nodeWidth / 2}
                y={y + nodeHeight / 2}
                textAnchor="middle"
                dy="0.3em"
                fontSize="12"
                fill="white"
                fontWeight="600"
              >
                {node.name}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="sankey-legend">
        <p className="legend-title">Legenda de Fluxo:</p>
        <ul>
          <li>Origem (esquerda): Fontes de recursos (receitas, aportes)</li>
          <li>Destino (direita): Aplicação de recursos (despesas, investimentos)</li>
          <li>Largura das linhas: Proporção do valor</li>
        </ul>
      </div>
    </div>
  )
}
