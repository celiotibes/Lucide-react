'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { getStatusColor, getPreclusaoColor } from '@/lib/design-system/colors';

type StatusType =
  | 'pendente'
  | 'orcado'
  | 'aprovado'
  | 'rejeitado'
  | 'agendado'
  | 'em_execucao'
  | 'concluido'
  | 'desistido'
  | 'success'
  | 'warning'
  | 'error'
  | 'info';

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: StatusType;
  size?: 'sm' | 'md' | 'lg';
  diasUteis?: number | null;
  icon?: React.ReactNode;
}

const STATUS_LABELS: Record<StatusType, string> = {
  pendente: 'Pendente',
  orcado: 'Orçado',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  agendado: 'Agendado',
  em_execucao: 'Em Execução',
  concluido: 'Concluído',
  desistido: 'Desistido',
  success: 'Sucesso',
  warning: 'Aviso',
  error: 'Erro',
  info: 'Informação',
};

export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, size = 'md', diasUteis, icon, className, ...props }, ref) => {
    let backgroundColor = getStatusColor(status);
    const label = STATUS_LABELS[status];

    // Override color if diasUteis is provided (for preclusão countdown)
    if (diasUteis !== undefined && diasUteis !== null) {
      backgroundColor = getPreclusaoColor(diasUteis);
    }

    const sizeStyles = {
      sm: 'text-xs px-2 py-1',
      md: 'text-sm px-3 py-1.5',
      lg: 'text-base px-4 py-2',
    };

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-2 rounded-full font-medium transition-all duration-200',
          'text-white shadow-sm',
          sizeStyles[size],
          className
        )}
        style={{ backgroundColor }}
        {...props}
      >
        {icon && <span className="flex-shrink-0">{icon}</span>}
        <span>{label}</span>
      </span>
    );
  }
);

StatusBadge.displayName = 'StatusBadge';

/**
 * Alert Badge - For urgent situations
 */
export const AlertBadge = React.forwardRef<
  HTMLSpanElement,
  Omit<StatusBadgeProps, 'status'> & {
    type?: 'error' | 'warning' | 'info' | 'success';
    text?: string;
  }
>(({ type = 'info', text, icon, className, ...props }, ref) => {
  const colorMap = {
    error: '#f44336',
    warning: '#ff9800',
    info: '#2196f3',
    success: '#4caf50',
  };

  const iconMap = {
    error: '🚨',
    warning: '⚠️',
    info: 'ℹ️',
    success: '✓',
  };

  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full',
        'text-white shadow-sm animate-pulse',
        className
      )}
      style={{ backgroundColor: colorMap[type] }}
      {...props}
    >
      <span className="text-lg">{icon || iconMap[type]}</span>
      <span>{text}</span>
    </span>
  );
});

AlertBadge.displayName = 'AlertBadge';

/**
 * Progress Badge - Shows progress/completion status
 */
export const ProgressBadge = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & {
    percentage: number;
    label?: string;
  }
>(({ percentage, label, className, ...props }, ref) => {
  let color = '#4caf50'; // success
  if (percentage < 25) color = '#f44336'; // error
  else if (percentage < 50) color = '#ff9800'; // warning
  else if (percentage < 75) color = '#ffc107'; // info

  return (
    <span
      ref={ref}
      className={cn('inline-flex flex-col items-center gap-1', className)}
      {...props}
    >
      <div className="w-12 h-12 rounded-full flex items-center justify-center border-4" style={{ borderColor: color }}>
        <span className="text-sm font-bold" style={{ color }}>
          {percentage}%
        </span>
      </div>
      {label && <span className="text-xs font-medium text-neutral-600">{label}</span>}
    </span>
  );
});

ProgressBadge.displayName = 'ProgressBadge';
