/**
 * Category Filter Component
 * Multi-select filter for categories/departments
 */

import React, { useState } from 'react';

interface Category {
  id: string;
  name: string;
  icon?: string;
  color?: string;
}

interface CategoryFilterProps {
  categories: Category[];
  selectedCategories: string[];
  onCategoryChange: (categoryIds: string[]) => void;
  label?: string;
  placeholder?: string;
}

export const CategoryFilter: React.FC<CategoryFilterProps> = ({
  categories,
  selectedCategories,
  onCategoryChange,
  label = 'Categorias',
  placeholder = 'Selecione categorias...',
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggleCategory = (categoryId: string) => {
    const isSelected = selectedCategories.includes(categoryId);
    if (isSelected) {
      onCategoryChange(selectedCategories.filter((id) => id !== categoryId));
    } else {
      onCategoryChange([...selectedCategories, categoryId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedCategories.length === categories.length) {
      onCategoryChange([]);
    } else {
      onCategoryChange(categories.map((cat) => cat.id));
    }
  };

  const selectedCount = selectedCategories.length;
  const selectedNames = categories
    .filter((cat) => selectedCategories.includes(cat.id))
    .map((cat) => cat.name)
    .join(', ');

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-[#243549] border border-[#334155] text-[#f1f5f9] rounded-lg hover:border-[#3b82f6] transition-colors text-sm"
      >
        <span>🏷️</span>
        <span>
          {selectedCount === 0
            ? placeholder
            : `${selectedCount} categor${selectedCount === 1 ? 'ia' : 'ias'}`}
        </span>
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 z-50 bg-[#243549] border border-[#334155] rounded-lg p-4 shadow-xl backdrop-blur-sm min-w-[300px]">
          {/* Select All Button */}
          <button
            onClick={handleSelectAll}
            className="w-full px-3 py-2 text-xs text-[#cbd5e1] bg-[#1a2332] hover:bg-[#3b82f6] hover:text-white rounded mb-3 transition-colors font-medium"
          >
            {selectedCount === categories.length
              ? '✓ Desselecionar Todos'
              : '◯ Selecionar Todos'}
          </button>

          {/* Divider */}
          <div className="border-t border-[#334155] my-2 mb-3" />

          {/* Category List */}
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {categories.map((category) => {
              const isSelected = selectedCategories.includes(category.id);
              return (
                <button
                  key={category.id}
                  onClick={() => handleToggleCategory(category.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                    isSelected
                      ? 'bg-[#3b82f6] text-white'
                      : 'bg-[#1a2332] text-[#cbd5e1] hover:bg-[#334155]'
                  }`}
                >
                  <span className="text-lg">
                    {isSelected ? '✓' : '○'}
                  </span>
                  {category.icon && <span className="text-lg">{category.icon}</span>}
                  <span className="flex-1 text-left font-medium">{category.name}</span>
                  {category.color && (
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                  )}
                </button>
              );
            })}
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

          {/* Selected Summary */}
          {selectedCount > 0 && (
            <div className="mt-3 pt-3 border-t border-[#334155]">
              <p className="text-[#94a3b8] text-xs">
                <strong>{selectedCount}</strong> categor{selectedCount === 1 ? 'ia' : 'ias'} selecionada{selectedCount === 1 ? '' : 's'}
              </p>
              {selectedCount <= 3 && (
                <p className="text-[#cbd5e1] text-xs mt-1 line-clamp-2">
                  {selectedNames}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CategoryFilter;
