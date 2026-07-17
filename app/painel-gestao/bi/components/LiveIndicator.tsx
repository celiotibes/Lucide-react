'use client';

import { useRealtime } from './RealtimeProvider';
import { CheckCircle2, AlertCircle, Activity } from 'lucide-react';

interface LiveIndicatorProps {
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'icon' | 'badge' | 'pill';
}

export function LiveIndicator({
  showLabel = true,
  size = 'md',
  variant = 'badge',
}: LiveIndicatorProps) {
  const { isConnected, lastUpdate, hasNewData } = useRealtime();

  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  const textSize = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  if (variant === 'icon') {
    return (
      <div className="flex items-center gap-2">
        <div className={`relative ${sizeClasses[size]}`}>
          <div
            className={`${sizeClasses[size]} rounded-full bg-green-400 absolute inset-0 animate-pulse`}
          />
          <div className={`${sizeClasses[size]} rounded-full bg-green-500`} />
        </div>
        {showLabel && (
          <span className={`${textSize[size]} text-green-700 dark:text-green-400 font-medium`}>
            {isConnected ? 'Conectado' : 'Desconectado'}
          </span>
        )}
      </div>
    );
  }

  if (variant === 'pill') {
    return (
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-xs font-semibold ${
          isConnected
            ? 'bg-gradient-to-r from-green-500 to-emerald-600'
            : 'bg-gradient-to-r from-gray-400 to-gray-500'
        }`}
      >
        <div className={`${sizeClasses[size]} rounded-full ${isConnected ? 'bg-white/30 animate-pulse' : 'bg-white/20'}`} />
        {isConnected ? 'Dados ao Vivo' : 'Offline'}
        {hasNewData && <span className="ml-1 animate-bounce">●</span>}
      </div>
    );
  }

  // Default: badge
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-medium ${
      isConnected
        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
        : 'bg-gray-50 dark:bg-gray-900/20 text-gray-700 dark:text-gray-400 border border-gray-200 dark:border-gray-800'
    }`}>
      {isConnected ? (
        <>
          <div className="relative w-2 h-2">
            <div className="w-2 h-2 rounded-full bg-green-500 absolute inset-0 animate-pulse" />
            <div className="w-2 h-2 rounded-full bg-green-600" />
          </div>
          Conectado
        </>
      ) : (
        <>
          <AlertCircle className="w-3 h-3" />
          Offline
        </>
      )}
      {hasNewData && (
        <span className="ml-1 inline-flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce" />
          Atualizando
        </span>
      )}
      {lastUpdate && showLabel && (
        <span className="text-xs opacity-75">
          {lastUpdate.table}: {lastUpdate.action}
        </span>
      )}
    </div>
  );
}

/**
 * Componente que mostra quando dados foram atualizados
 */
export function LastUpdatedLabel({ timestamp?: Date; loading?: boolean }) {
  if (!timestamp) {
    return (
      <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
        <Activity className="w-3 h-3" />
        Carregando...
      </span>
    );
  }

  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);

  let label = '';
  if (diffSecs < 60) {
    label = 'Agora mesmo';
  } else if (diffMins < 60) {
    label = `Há ${diffMins} min`;
  } else {
    label = `Às ${timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  return (
    <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
      <CheckCircle2 className="w-3 h-3 text-green-600 dark:text-green-400" />
      {label}
    </span>
  );
}
