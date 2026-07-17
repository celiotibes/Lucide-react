/**
 * Sankey Diagram Component
 * Visualiza fluxo de caixa: origem (receitas) e destino (despesas)
 */

import React, { useMemo } from 'react';
import { SankeyChartData } from '../../../types/bi';
import './SankeyChart.css';

interface SankeyChartProps {
  data: SankeyChartData;
  title?: string;
  width?: number;
  height?: number;
}

export const SankeyChart: React.FC<SankeyChartProps> = ({
  data,
  title = 'Fluxo de Caixa',
  width = 800,
  height = 500,
}) => {
  const svgWidth = width;
  const svgHeight = height;
  const margin = { top: 20, right: 160, bottom: 20, left: 20 };

  const innerWidth = svgWidth - margin.left - margin.right;
  const innerHeight = svgHeight - margin.top - margin.bottom;

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      notation: 'compact',
    }).format(value);
  };

  const totalFlow = useMemo(() => {
    return data.links.reduce((sum, link) => sum + link.value, 0);
  }, [data.links]);

  const nodePositions = useMemo(() => {
    const sourceNode = data.nodes[0];
    const positions: Record<number, { x: number; y: number; width: number; height: number }> = {};

    // Posiciona nó de origem à esquerda
    positions[0] = {
      x: margin.left + 20,
      y: margin.top + innerHeight / 2 - 20,
      width: 40,
      height: 40,
    };

    // Distribui nós de destino à direita
    const destNodes = data.nodes.length - 1;
    const spacing = innerHeight / (destNodes + 1);

    for (let i = 1; i < data.nodes.length; i++) {
      positions[i] = {
        x: margin.left + innerWidth - 40,
        y: margin.top + spacing * i - 20,
        width: 40,
        height: 40,
      };
    }

    return positions;
  }, [data.nodes.length, innerWidth, innerHeight, margin]);

  const getNodeColor = (nodeIndex: number): string => {
    if (nodeIndex === 0) return '#3b82f6'; // Blue para origem
    const category = data.nodes[nodeIndex].category;
    if (category === 'revenue') return '#10b981'; // Green
    return '#ef4444'; // Red para despesas
  };

  const getLinkPath = (sourceIdx: number, targetIdx: number): string => {
    const source = nodePositions[sourceIdx];
    const target = nodePositions[targetIdx];

    const sx = source.x + source.width;
    const sy = source.y + source.height / 2;
    const tx = target.x;
    const ty = target.y + target.height / 2;

    const controlX = (sx + tx) / 2;

    return `M ${sx},${sy} C ${controlX},${sy} ${controlX},${ty} ${tx},${ty}`;
  };

  const getLinkOpacity = (linkValue: number): number => {
    return Math.max(0.3, Math.min(1, linkValue / (totalFlow / data.links.length)));
  };

  return (
    <div className="sankey-chart">
      {title && <h3 className="chart-title">{title}</h3>}

      <div className="sankey-container">
        <svg width={svgWidth} height={svgHeight} className="sankey-svg">
          {/* Links (conexões entre nós) */}
          <defs>
            <linearGradient id="linkGradient-0" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.5" />
            </linearGradient>
          </defs>

          {data.links.map((link, idx) => (
            <path
              key={`link-${idx}`}
              d={getLinkPath(link.source, link.target)}
              stroke={`url(#linkGradient-${link.source})`}
              strokeWidth={Math.max(2, (link.value / totalFlow) * 30)}
              opacity={getLinkOpacity(link.value)}
              fill="none"
              className="sankey-link"
            />
          ))}

          {/* Nós */}
          {data.nodes.map((node, idx) => {
            const pos = nodePositions[idx];
            const color = getNodeColor(idx);

            return (
              <g key={`node-${idx}`} className="sankey-node">
                <circle
                  cx={pos.x + pos.width / 2}
                  cy={pos.y + pos.height / 2}
                  r={20}
                  fill={color}
                  opacity="0.9"
                  className="node-circle"
                />
                <text
                  x={pos.x + pos.width / 2 + 30}
                  y={pos.y + pos.height / 2}
                  textAnchor="start"
                  dominantBaseline="middle"
                  className="node-label"
                >
                  {node.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="sankey-details">
        <div className="details-column">
          <h4>Origem do Fluxo</h4>
          <div className="flow-item">
            <div className="flow-color" style={{ backgroundColor: '#3b82f6' }}></div>
            <span>{data.nodes[0].name}</span>
            <span className="flow-value">{formatCurrency(totalFlow)}</span>
          </div>
        </div>

        <div className="details-column">
          <h4>Destinos do Fluxo</h4>
          {data.links.map((link, idx) => (
            <div key={`detail-${idx}`} className="flow-item">
              <div
                className="flow-color"
                style={{
                  backgroundColor:
                    data.nodes[link.target].category === 'revenue' ? '#10b981' : '#ef4444',
                }}
              ></div>
              <span>{data.nodes[link.target].name}</span>
              <span className="flow-value">{formatCurrency(link.value)}</span>
              <span className="flow-percentage">
                ({((link.value / totalFlow) * 100).toFixed(1)}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SankeyChart;
