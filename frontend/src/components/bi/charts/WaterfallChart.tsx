/**
 * Waterfall Chart Component
 * Visualiza DRE (Demonstração do Resultado do Exercício)
 * Mostra fluxo de Receita Bruta → Deduções → Custos → Lucro Líquido
 */

import React from 'react';
import { WaterfallChartData } from '../../../types/bi';
import './WaterfallChart.css';

interface WaterfallChartProps {
  data: WaterfallChartData;
  title?: string;
  height?: number;
}

export const WaterfallChart: React.FC<WaterfallChartProps> = ({
  data,
  title = 'Análise de DRE',
  height = 400,
}) => {
  const getBarColor = (stage: any, index: number): string => {
    if (stage.color) return stage.color;
    if (stage.isTotal) return '#3b82f6';
    if (stage.value < 0) return '#ef4444';
    return '#10b981';
  };

  const getPercentageWidth = (value: number, maxValue: number): number => {
    if (maxValue === 0) return 0;
    return (Math.abs(value) / maxValue) * 100;
  };

  const maxValue = Math.max(
    ...data.stages.map((s) => Math.abs(s.value))
  );

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      notation: 'compact',
      compactDisplay: 'short',
    }).format(value);
  };

  return (
    <div className="waterfall-chart">
      {title && <h3 className="chart-title">{title}</h3>}

      <div className="chart-container" style={{ height: `${height}px` }}>
        <div className="waterfall-bars">
          {data.stages.map((stage, index) => (
            <div key={index} className="waterfall-stage">
              <div className="stage-label">{stage.name}</div>

              <div className="stage-bar-container">
                <div
                  className={`stage-bar ${stage.isTotal ? 'is-total' : ''}`}
                  style={{
                    width: `${getPercentageWidth(stage.value, maxValue)}%`,
                    backgroundColor: getBarColor(stage, index),
                    minWidth: '2px',
                  }}
                  title={`${stage.name}: ${formatCurrency(stage.value)}`}
                >
                  {getPercentageWidth(stage.value, maxValue) > 15 && (
                    <span className="stage-value-label">
                      {formatCurrency(stage.value)}
                    </span>
                  )}
                </div>
              </div>

              <div className="stage-value">{formatCurrency(stage.value)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="chart-legend">
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#3b82f6' }}></div>
          <span>Totais</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#10b981' }}></div>
          <span>Receitas</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#ef4444' }}></div>
          <span>Deduções/Custos</span>
        </div>
      </div>
    </div>
  );
};

export default WaterfallChart;
