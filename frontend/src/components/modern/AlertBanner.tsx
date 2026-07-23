import React, { useState } from 'react';
import { AlertTriangle, AlertCircle, X } from 'lucide-react';

export interface AlertBannerAlert {
  id: string;
  severity: 'critical' | 'high' | 'warning' | 'info';
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface AlertBannerProps {
  alerts: AlertBannerAlert[];
  onClose?: (id: string) => void;
  maxVisible?: number;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  alerts,
  onClose,
  maxVisible = 3,
}) => {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  if (alerts.length === 0) {
    return null;
  }

  const visibleAlerts = alerts.filter((a) => !dismissed.has(a.id)).slice(0, maxVisible);

  const handleClose = (id: string) => {
    setDismissed((prev) => new Set([...prev, id]));
    onClose?.(id);
  };

  const getSeverityStyles = (
    severity: string
  ): { bg: string; border: string; icon: React.ReactNode; textColor: string } => {
    switch (severity) {
      case 'critical':
        return {
          bg: 'bg-red-900',
          border: 'border-l-4 border-red-600',
          icon: <AlertTriangle className="w-5 h-5 text-red-400" />,
          textColor: 'text-red-100',
        };
      case 'high':
        return {
          bg: 'bg-orange-900',
          border: 'border-l-4 border-orange-600',
          icon: <AlertTriangle className="w-5 h-5 text-orange-400" />,
          textColor: 'text-orange-100',
        };
      case 'warning':
        return {
          bg: 'bg-yellow-900',
          border: 'border-l-4 border-yellow-600',
          icon: <AlertCircle className="w-5 h-5 text-yellow-400" />,
          textColor: 'text-yellow-100',
        };
      default:
        return {
          bg: 'bg-blue-900',
          border: 'border-l-4 border-blue-600',
          icon: <AlertCircle className="w-5 h-5 text-blue-400" />,
          textColor: 'text-blue-100',
        };
    }
  };

  return (
    <div className="space-y-2 mb-4">
      {visibleAlerts.map((alert) => {
        const styles = getSeverityStyles(alert.severity);

        return (
          <div
            key={alert.id}
            className={`${styles.bg} ${styles.border} rounded-lg p-4 flex items-start gap-3`}
          >
            <div className="flex-shrink-0 mt-0.5">{styles.icon}</div>

            <div className="flex-1">
              <h3 className={`font-semibold ${styles.textColor}`}>{alert.title}</h3>
              <p className="text-sm text-[#cbd5e1] mt-1">{alert.message}</p>

              {alert.action && (
                <button
                  onClick={alert.action.onClick}
                  className="mt-2 text-sm font-medium text-[#3b82f6] hover:text-[#60a5fa] transition-colors"
                >
                  {alert.action.label}
                </button>
              )}
            </div>

            <button
              onClick={() => handleClose(alert.id)}
              className="flex-shrink-0 text-[#94a3b8] hover:text-[#f1f5f9] transition-colors p-1"
              aria-label="Fechar alerta"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        );
      })}

      {dismissed.size > 0 && (
        <div className="text-xs text-[#94a3b8] text-center">
          {dismissed.size} alerta{dismissed.size !== 1 ? 's' : ''} descartado
          {dismissed.size !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};

export default AlertBanner;
