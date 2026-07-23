/**
 * Filter Presets Component
 * Quick preset buttons for common date ranges
 */

import React from 'react';

interface FilterPresetsProps {
  presets: Record<
    string,
    {
      name: string;
      description: string;
      getDateRange: () => { startDate: Date; endDate: Date };
    }
  >;
  onPresetSelect: (presetKey: string) => void;
  selectedPreset?: string;
}

export const FilterPresets: React.FC<FilterPresetsProps> = ({
  presets,
  onPresetSelect,
  selectedPreset,
}) => {
  const presetEntries = Object.entries(presets);

  return (
    <div className="flex flex-wrap gap-2 mt-4 pb-4 border-b border-[rgba(226,232,240,0.1)]">
      <span className="text-[#94a3b8] text-xs font-semibold uppercase self-center">
        Presets:
      </span>

      {presetEntries.map(([key, preset]) => (
        <button
          key={key}
          onClick={() => onPresetSelect(key)}
          className={`
            px-3 py-1 text-xs font-medium rounded-full transition-all
            ${
              selectedPreset === key
                ? 'bg-[#3b82f6] text-white border border-[#3b82f6]'
                : 'bg-[#1a2332] text-[#cbd5e1] border border-[#334155] hover:border-[#3b82f6]'
            }
          `}
          title={preset.description}
        >
          {preset.name}
        </button>
      ))}
    </div>
  );
};

export default FilterPresets;
