/**
 * Filter Pills Component
 * Visual indicators for active filters with clear options
 */

import React from 'react';

interface FilterPill {
  id: string;
  label: string;
  icon?: string;
  onClear: () => void;
}

interface FilterPillsProps {
  filters: FilterPill[];
  onClearAll?: () => void;
  showClearAll?: boolean;
}

export const FilterPills: React.FC<FilterPillsProps> = ({
  filters,
  onClearAll,
  showClearAll = true,
}) => {
  if (filters.length === 0 && !showClearAll) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mt-4 pb-4 border-b border-[rgba(226,232,240,0.1)]">
      <span className="text-[#94a3b8] text-xs font-semibold uppercase">Filtros Ativos:</span>

      {filters.map((filter) => (
        <div
          key={filter.id}
          className="flex items-center gap-2 px-3 py-1 bg-[#3b82f6]/10 border border-[#3b82f6] text-[#3b82f6] rounded-full text-xs font-medium hover:bg-[#3b82f6]/20 transition-colors"
        >
          {filter.icon && <span>{filter.icon}</span>}
          <span>{filter.label}</span>
          <button
            onClick={filter.onClear}
            className="ml-1 hover:text-[#1e40af] transition-colors"
            title={`Remover ${filter.label}`}
          >
            ✕
          </button>
        </div>
      ))}

      {filters.length > 0 && showClearAll && onClearAll && (
        <button
          onClick={onClearAll}
          className="ml-2 px-3 py-1 text-xs text-[#94a3b8] hover:text-[#ef4444] hover:bg-[#ef4444]/10 rounded-full transition-colors"
        >
          Limpar Tudo
        </button>
      )}
    </div>
  );
};

export default FilterPills;
