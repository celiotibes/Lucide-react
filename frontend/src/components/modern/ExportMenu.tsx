/**
 * Export Menu Component
 * Provides quick access to export functionality
 */

import React, { useState } from 'react';
import { FinancialKPIs } from '../../types/bi';
import { useExportKPIs } from '../../hooks';

interface ExportMenuProps {
  kpis: FinancialKPIs;
  filters: {
    startDate: Date;
    endDate: Date;
    categories: string[];
  };
  title?: string;
}

export const ExportMenu: React.FC<ExportMenuProps> = ({
  kpis,
  filters,
  title = 'Export',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { exportToCSV, exportToJSON, exportToTSV, copyToClipboard } = useExportKPIs();

  const handleExportCSV = () => {
    const filename = `kpis-${filters.startDate.toISOString().split('T')[0]}-to-${filters.endDate.toISOString().split('T')[0]}.csv`;
    exportToCSV(kpis, filters, filename);
    setIsOpen(false);
  };

  const handleExportJSON = () => {
    const filename = `kpis-${filters.startDate.toISOString().split('T')[0]}.json`;
    exportToJSON(kpis, filters, filename);
    setIsOpen(false);
  };

  const handleExportTSV = () => {
    const filename = `kpis-${filters.startDate.toISOString().split('T')[0]}.tsv`;
    exportToTSV(kpis, filters, filename);
    setIsOpen(false);
  };

  const handleCopyToClipboard = async () => {
    const success = await copyToClipboard(kpis, filters);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* Export Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 bg-[#3b82f6] text-white text-sm font-medium rounded-lg hover:bg-[#1e40af] transition-all flex items-center gap-2"
        title="Export KPI data in multiple formats"
      >
        <span>📥 {title}</span>
        <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 bg-[#1a2332] border border-[#334155] rounded-lg shadow-lg z-50 min-w-[220px]">
          {/* Export Options */}
          <button
            onClick={handleExportCSV}
            className="w-full text-left px-4 py-2.5 text-[#cbd5e1] hover:bg-[#243549] hover:text-[#f1f5f9] border-b border-[#334155] flex items-center gap-2 transition-colors"
          >
            <span>📊</span> Export as CSV
          </button>

          <button
            onClick={handleExportJSON}
            className="w-full text-left px-4 py-2.5 text-[#cbd5e1] hover:bg-[#243549] hover:text-[#f1f5f9] border-b border-[#334155] flex items-center gap-2 transition-colors"
          >
            <span>{ }</span> Export as JSON
          </button>

          <button
            onClick={handleExportTSV}
            className="w-full text-left px-4 py-2.5 text-[#cbd5e1] hover:bg-[#243549] hover:text-[#f1f5f9] border-b border-[#334155] flex items-center gap-2 transition-colors"
          >
            <span>📋</span> Export as TSV
          </button>

          <button
            onClick={handleCopyToClipboard}
            className="w-full text-left px-4 py-2.5 text-[#cbd5e1] hover:bg-[#243549] hover:text-[#f1f5f9] flex items-center gap-2 transition-colors"
          >
            <span>{copied ? '✅' : '📋'}</span> {copied ? 'Copied!' : 'Copy Report'}
          </button>
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};

export default ExportMenu;
