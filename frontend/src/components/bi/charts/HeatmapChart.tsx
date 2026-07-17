/**
 * Heatmap Chart Component
 * Visualiza matriz de rentabilidade, consumo de orçamento por centro de custo
 */

import React from 'react';
import { HeatmapChartData } from '../../../types/bi';
import './HeatmapChart.css';

interface HeatmapChartProps {
  data: HeatmapChartData;
  title?: string;
  colorScheme?: 'default' | 'diverging';
}

export const HeatmapChart: React.FC<HeatmapChartProps> = ({
  data,
  title = 'Mapa de Calor - Consumo de Orçamento',
  colorScheme = 'default',
}) => {
  const getHeatColor = (value: number, max: number, min: number): string => {
    // Normalizar valor entre 0 e 1
    const normalized = (value - min) / (max - min);

    if (colorScheme === 'diverging') {
      // Cores: Vermelho (baixo) -> Amarelo (médio) -> Verde (alto)
      if (normalized < 0.5) {
        // Vermelho para Amarelo
        const r = Math.round(255);
        const g = Math.round(255 * (normalized * 2));
        const b = 0;
        return `rgb(${r}, ${g}, ${b})`;
      } else {
        // Amarelo para Verde
        const r = Math.round(255 * (1 - (normalized - 0.5) * 2));
        const g = 255;
        const b = 0;
        return `rgb(${r}, ${g}, ${b})`;
      }
    }

    // Default: Azul para Vermelho
    const r = Math.round(255 * normalized);
    const g = Math.round(100 * (1 - normalized));
    const b = Math.round(200 * (1 - normalized));
    return `rgb(${r}, ${g}, ${b})`;
  };

  const getAllValues = (): number[] => {
    return data.series.flatMap((s) => s.data);
  };

  const values = getAllValues();
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);

  const formatValue = (value: number): string => {
    if (Math.abs(value) >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(value) >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toFixed(0);
  };

  const rowHeight = 40;
  const colWidth = Math.max(80, 120 / Math.max(data.categories.length, 1));

  return (
    <div className="heatmap-chart">
      {title && <h3 className="chart-title">{title}</h3>}

      <div className="heatmap-container">
        <div className="heatmap-table">
          {/* Header Row */}
          <div className="heatmap-header-row">
            <div className="heatmap-cell header-cell" style={{ minWidth: '150px' }}>
              Categoria
            </div>
            {data.categories.map((category, idx) => (
              <div
                key={`header-${idx}`}
                className="heatmap-cell header-cell"
                style={{ minWidth: `${colWidth}px` }}
              >
                <span className="category-label" title={category}>
                  {category}
                </span>
              </div>
            ))}
          </div>

          {/* Data Rows */}
          {data.series.map((series, seriesIdx) => (
            <div key={`series-${seriesIdx}`} className="heatmap-data-row">
              <div className="heatmap-cell row-label" style={{ minWidth: '150px' }}>
                <span className="row-name" title={series.name}>
                  {series.name}
                </span>
              </div>

              {series.data.map((value, colIdx) => {
                const color = getHeatColor(value, maxValue, minValue);
                const textColor = value > (maxValue + minValue) / 2 ? 'white' : '#111827';

                return (
                  <div
                    key={`cell-${seriesIdx}-${colIdx}`}
                    className="heatmap-cell data-cell"
                    style={{
                      backgroundColor: color,
                      minWidth: `${colWidth}px`,
                      color: textColor,
                    }}
                    title={`${series.name} - ${data.categories[colIdx]}: ${formatValue(value)}`}
                  >
                    <span className="cell-value">{formatValue(value)}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="heatmap-legend">
        <div className="legend-label">Escala de Cores:</div>
        <div className="legend-gradient">
          <div className="gradient-bar"></div>
          <div className="gradient-labels">
            <span>{formatValue(minValue)}</span>
            <span>{formatValue((maxValue + minValue) / 2)}</span>
            <span>{formatValue(maxValue)}</span>
          </div>
        </div>
      </div>

      <div className="heatmap-stats">
        <div className="stat-item">
          <span className="stat-label">Mínimo:</span>
          <span className="stat-value">{formatValue(minValue)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Máximo:</span>
          <span className="stat-value">{formatValue(maxValue)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Média:</span>
          <span className="stat-value">
            {formatValue(values.reduce((a, b) => a + b, 0) / values.length)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default HeatmapChart;
