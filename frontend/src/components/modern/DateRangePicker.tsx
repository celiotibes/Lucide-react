/**
 * Date Range Picker Component
 * Custom date range selector with modern styling
 */

import React, { useState } from 'react';

interface DateRangePickerProps {
  startDate: Date;
  endDate: Date;
  onDateChange: (startDate: Date, endDate: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  label?: string;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onDateChange,
  minDate,
  maxDate,
  label = 'Período',
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStart = new Date(e.target.value);
    if (newStart <= endDate) {
      onDateChange(newStart, endDate);
    }
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEnd = new Date(e.target.value);
    if (newEnd >= startDate) {
      onDateChange(startDate, newEnd);
    }
  };

  const getDaysDifference = (): number => {
    const time = endDate.getTime() - startDate.getTime();
    return Math.ceil(time / (1000 * 3600 * 24));
  };

  const quickRanges = [
    { label: 'Hoje', days: 0 },
    { label: 'Últimos 7 dias', days: 7 },
    { label: 'Últimos 30 dias', days: 30 },
    { label: 'Últimos 90 dias', days: 90 },
  ];

  const handleQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    onDateChange(start, end);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-[#243549] border border-[#334155] text-[#f1f5f9] rounded-lg hover:border-[#3b82f6] transition-colors text-sm"
      >
        <span>📅</span>
        <span>{formatDate(startDate)} → {formatDate(endDate)}</span>
        <span className="text-[#94a3b8] text-xs">({getDaysDifference()} dias)</span>
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 z-50 bg-[#243549] border border-[#334155] rounded-lg p-4 shadow-xl backdrop-blur-sm min-w-[350px]">
          {/* Quick Range Buttons */}
          <div className="mb-4">
            <p className="text-[#cbd5e1] text-xs font-semibold mb-2 uppercase">
              Atalhos
            </p>
            <div className="grid grid-cols-2 gap-2">
              {quickRanges.map((range) => (
                <button
                  key={range.label}
                  onClick={() => {
                    handleQuickRange(range.days);
                    setIsOpen(false);
                  }}
                  className="px-3 py-2 text-xs text-[#cbd5e1] bg-[#1a2332] hover:bg-[#3b82f6] hover:text-white rounded transition-colors"
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-[#334155] my-4" />

          {/* Custom Date Inputs */}
          <div className="space-y-3">
            <div>
              <label className="text-[#cbd5e1] text-xs font-semibold mb-1 block">
                Data Início
              </label>
              <input
                type="date"
                value={formatDate(startDate)}
                onChange={handleStartDateChange}
                min={minDate ? formatDate(minDate) : undefined}
                className="w-full px-3 py-2 bg-[#1a2332] border border-[#334155] text-[#f1f5f9] rounded text-sm hover:border-[#3b82f6] focus:outline-none focus:border-[#3b82f6]"
              />
            </div>

            <div>
              <label className="text-[#cbd5e1] text-xs font-semibold mb-1 block">
                Data Fim
              </label>
              <input
                type="date"
                value={formatDate(endDate)}
                onChange={handleEndDateChange}
                max={maxDate ? formatDate(maxDate) : undefined}
                className="w-full px-3 py-2 bg-[#1a2332] border border-[#334155] text-[#f1f5f9] rounded text-sm hover:border-[#3b82f6] focus:outline-none focus:border-[#3b82f6]"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setIsOpen(false)}
              className="flex-1 px-3 py-2 bg-[#3b82f6] text-white rounded text-sm hover:bg-[#1e40af] transition-colors font-medium"
            >
              Aplicar
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="flex-1 px-3 py-2 bg-[#1a2332] text-[#cbd5e1] rounded text-sm hover:bg-[#334155] transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateRangePicker;
