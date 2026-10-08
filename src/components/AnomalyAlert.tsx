import React, { useState, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import './AnomalyAlert.css';

export interface Anomaly {
  id: string;
  type: 'warning' | 'error' | 'info';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  category: string;
  data?: Record<string, any>;
  actionUrl?: string;
  actionLabel?: string;
}

interface AnomalyAlertProps {
  anomalies: Anomaly[];
  onDismiss?: (anomalyId: string) => void;
  onAction?: (anomalyId: string) => Promise<void>;
  maxVisibleCount?: number;
}

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical':
      return '#dc2626';
    case 'high':
      return '#ef4444';
    case 'medium':
      return '#f59e0b';
    case 'low':
      return '#3b82f6';
    default:
      return '#6b7280';
  }
};

const getSeverityIcon = (type: string) => {
  switch (type) {
    case 'error':
      return AlertTriangle;
    case 'warning':
      return AlertTriangle;
    case 'info':
      return AlertCircle;
    default:
      return Info;
  }
};

export const AnomalyAlert: React.FC<AnomalyAlertProps> = ({
  anomalies,
  onDismiss,
  onAction,
  maxVisibleCount = 5
}) => {
  const { effectiveTheme } = useTheme();
  const [visibleAnomalies, setVisibleAnomalies] = useState(
    new Set(anomalies.slice(0, maxVisibleCount).map(a => a.id))
  );
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleDismiss = useCallback((anomalyId: string) => {
    setVisibleAnomalies(prev => {
      const newSet = new Set(prev);
      newSet.delete(anomalyId);
      return newSet;
    });
    onDismiss?.(anomalyId);
  }, [onDismiss]);

  const handleAction = useCallback(async (anomalyId: string) => {
    if (!onAction) return;

    setActionLoading(anomalyId);
    try {
      await onAction(anomalyId);
    } catch (error) {
      console.error('Error handling anomaly action:', error);
    } finally {
      setActionLoading(null);
    }
  }, [onAction]);

  const visibleItems = anomalies.filter(a => visibleAnomalies.has(a.id));

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <div className={`anomaly-alert anomaly-alert--${effectiveTheme}`}>
      {visibleItems.length > maxVisibleCount && (
        <div className="anomaly-alert__summary">
          <AlertCircle size={18} />
          <span>{visibleItems.length} anomalias detectadas</span>
        </div>
      )}

      <div className="anomaly-alert__container">
        {visibleItems.map(anomaly => {
          const IconComponent = getSeverityIcon(anomaly.type);
          const severityColor = getSeverityColor(anomaly.severity);

          return (
            <div
              key={anomaly.id}
              className={`anomaly-alert__item anomaly-alert__item--${anomaly.severity}`}
            >
              <div
                className="anomaly-alert__icon"
                style={{ color: severityColor }}
              >
                <IconComponent size={20} />
              </div>

              <div className="anomaly-alert__content">
                <div className="anomaly-alert__header">
                  <h4 className="anomaly-alert__title">{anomaly.title}</h4>
                  <span className="anomaly-alert__category">{anomaly.category}</span>
                </div>

                <p className="anomaly-alert__description">{anomaly.description}</p>

                {anomaly.data && Object.keys(anomaly.data).length > 0 && (
                  <div className="anomaly-alert__data">
                    {Object.entries(anomaly.data).map(([key, value]) => (
                      <div key={key} className="anomaly-alert__data-item">
                        <span className="anomaly-alert__data-key">{key}:</span>
                        <span className="anomaly-alert__data-value">
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="anomaly-alert__timestamp">
                  {new Date(anomaly.timestamp).toLocaleString('pt-BR')}
                </div>
              </div>

              <div className="anomaly-alert__actions">
                {anomaly.actionUrl && anomaly.actionLabel && (
                  <button
                    className="anomaly-alert__action-btn"
                    onClick={() => handleAction(anomaly.id)}
                    disabled={actionLoading === anomaly.id}
                  >
                    {actionLoading === anomaly.id ? 'Processando...' : anomaly.actionLabel}
                  </button>
                )}

                <button
                  className="anomaly-alert__close-btn"
                  onClick={() => handleDismiss(anomaly.id)}
                  title="Descartar"
                  aria-label="Descartar alerta"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
