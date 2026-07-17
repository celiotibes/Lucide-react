'use client';

import React from 'react';
import { ChevronRight } from 'lucide-react';

export interface TimelineEvent {
  id: string;
  timestamp: Date;
  title: string;
  description: string;
  status: 'completed' | 'pending' | 'active';
  severity?: 'info' | 'alerta' | 'critico';
  icon?: React.ReactNode;
}

interface TimelineComponentProps {
  events: TimelineEvent[];
  orientation?: 'vertical' | 'horizontal';
  variant?: 'compact' | 'detailed';
}

const getSeverityColor = (severity?: string) => {
  switch (severity) {
    case 'critico':
      return 'from-rose-500 to-red-600';
    case 'alerta':
      return 'from-amber-400 to-orange-500';
    case 'info':
    default:
      return 'from-cyan-500 to-blue-600';
  }
};

const getSeverityBgColor = (severity?: string) => {
  switch (severity) {
    case 'critico':
      return 'bg-rose-500/20 border-rose-500/50';
    case 'alerta':
      return 'bg-amber-500/20 border-amber-500/50';
    case 'info':
    default:
      return 'bg-cyan-500/20 border-cyan-500/50';
  }
};

export function TimelineComponent({
  events,
  orientation = 'vertical',
  variant = 'detailed',
}: TimelineComponentProps) {
  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);

    if (minutes < 1) return 'Agora';
    if (minutes < 60) return `Há ${minutes}m`;
    if (hours < 24) return `Há ${hours}h`;
    return date.toLocaleDateString('pt-BR');
  };

  if (orientation === 'horizontal') {
    return (
      <div className="overflow-x-auto">
        <div className="flex gap-4 pb-4 min-w-min">
          {events.map((event, index) => (
            <div
              key={event.id}
              className="flex flex-col gap-2 min-w-[200px] transition-all duration-300 hover:scale-105"
            >
              <div className={`p-3 rounded-lg border ${getSeverityBgColor(event.severity)} glass`}>
                <div className="flex items-start justify-between mb-2">
                  {event.icon && <div className="w-5 h-5">{event.icon}</div>}
                  <span className="text-xs font-medium text-slate-400">
                    {formatTime(event.timestamp)}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-slate-100 mb-1">{event.title}</h4>
                {variant === 'detailed' && (
                  <p className="text-xs text-slate-400 line-clamp-2">{event.description}</p>
                )}
              </div>
              {index < events.length - 1 && (
                <ChevronRight className="w-4 h-4 text-slate-600 mx-auto" />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-6">
      {/* Linha vertical */}
      <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-cyan-500/50 to-purple-500/50" />

      {events.map((event, index) => (
        <div key={event.id} className="flex gap-4">
          {/* Dot */}
          <div className="relative flex flex-col items-center pt-1 flex-shrink-0">
            <div
              className={`w-4 h-4 rounded-full bg-gradient-to-r ${getSeverityColor(
                event.severity
              )} ring-4 ring-slate-900 animate-pulse-slow`}
            />
            {event.status === 'active' && (
              <div className="absolute inset-0 rounded-full animate-ping bg-cyan-500 opacity-20" />
            )}
          </div>

          {/* Content */}
          <div
            className={`flex-1 pb-6 transition-all duration-300 hover:translate-x-1 ${
              getSeverityBgColor(event.severity)
            } p-4 rounded-lg border backdrop-blur-xl group cursor-pointer`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                {event.icon && <div className="w-5 h-5 text-slate-300">{event.icon}</div>}
                <h3 className="font-semibold text-slate-100 group-hover:text-cyan-400 transition-colors">
                  {event.title}
                </h3>
              </div>
              <span className="text-xs font-medium text-slate-400 whitespace-nowrap">
                {formatTime(event.timestamp)}
              </span>
            </div>

            {variant === 'detailed' && (
              <p className="text-sm text-slate-400 mb-2">{event.description}</p>
            )}

            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full ${
                  event.status === 'completed'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : event.status === 'active'
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : 'bg-slate-500/20 text-slate-400'
                }`}
              >
                {event.status === 'completed'
                  ? '✓ Concluído'
                  : event.status === 'active'
                    ? '⏱ Em Progresso'
                    : '○ Pendente'}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
