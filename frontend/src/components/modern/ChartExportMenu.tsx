import React, { useState, useRef, useEffect } from 'react';
import { useChartExport } from '../../hooks/useChartExport';
import { Download, Image, FileText, Loader } from 'lucide-react';

interface ChartExportMenuProps {
  chartRef: HTMLElement | null;
  title?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  categories?: string[];
}

export const ChartExportMenu: React.FC<ChartExportMenuProps> = ({
  chartRef,
  title = 'Chart Export',
  dateRange,
  categories,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { exportChartAsPNG, exportChartAsJPG, exportChartAsSVG, generatePDFReport } =
    useChartExport();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExportPNG = async () => {
    setIsExporting(true);
    await exportChartAsPNG(chartRef, { title });
    setIsExporting(false);
    setIsOpen(false);
  };

  const handleExportJPG = async () => {
    setIsExporting(true);
    await exportChartAsJPG(chartRef, { title });
    setIsExporting(false);
    setIsOpen(false);
  };

  const handleExportSVG = async () => {
    setIsExporting(true);
    await exportChartAsSVG(chartRef, { title });
    setIsExporting(false);
    setIsOpen(false);
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    if (chartRef) {
      await generatePDFReport([chartRef], {
        title,
        includeMetadata: true,
        dateRange,
        categories,
      });
    }
    setIsExporting(false);
    setIsOpen(false);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isExporting ? (
          <Loader className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        Exportar Gráfico
        <span className="text-xs">▼</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50">
          <div className="py-2">
            <button
              onClick={handleExportPNG}
              disabled={isExporting}
              className="w-full px-4 py-3 text-left hover:bg-slate-700 transition-colors text-slate-200 hover:text-white disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <Image className="w-4 h-4" />
                <div>
                  <div className="font-medium text-sm">Exportar como PNG</div>
                  <div className="text-xs text-slate-400">Alta resolução (2x)</div>
                </div>
              </div>
            </button>

            <button
              onClick={handleExportJPG}
              disabled={isExporting}
              className="w-full px-4 py-3 text-left hover:bg-slate-700 transition-colors text-slate-200 hover:text-white disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <Image className="w-4 h-4" />
                <div>
                  <div className="font-medium text-sm">Exportar como JPG</div>
                  <div className="text-xs text-slate-400">Arquivo compactado</div>
                </div>
              </div>
            </button>

            <button
              onClick={handleExportSVG}
              disabled={isExporting}
              className="w-full px-4 py-3 text-left hover:bg-slate-700 transition-colors text-slate-200 hover:text-white disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4" />
                <div>
                  <div className="font-medium text-sm">Exportar como SVG</div>
                  <div className="text-xs text-slate-400">Vetor escalável</div>
                </div>
              </div>
            </button>

            <div className="border-t border-slate-700 my-2" />

            <button
              onClick={handleExportPDF}
              disabled={isExporting}
              className="w-full px-4 py-3 text-left hover:bg-slate-700 transition-colors text-slate-200 hover:text-white disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4" />
                <div>
                  <div className="font-medium text-sm">Gerar Relatório PDF</div>
                  <div className="text-xs text-slate-400">Com metadados</div>
                </div>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
