import React, { useState, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { Download, Print, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
import './ReportViewer.css';

export interface ReportData {
  id: string;
  title: string;
  type: 'financial' | 'property' | 'audit' | 'custom';
  generatedAt: string;
  pages: number;
  fileUrl?: string;
  thumbnailUrl?: string;
}

interface ReportViewerProps {
  report: ReportData;
  isLoading?: boolean;
  onDownload?: (reportId: string) => Promise<void>;
  onPrint?: (reportId: string) => void;
}

export const ReportViewer: React.FC<ReportViewerProps> = ({
  report,
  isLoading = false,
  onDownload,
  onPrint
}) => {
  const { effectiveTheme } = useTheme();
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!onDownload) return;

    setIsDownloading(true);
    try {
      await onDownload(report.id);
    } catch (error) {
      console.error('Error downloading report:', error);
    } finally {
      setIsDownloading(false);
    }
  }, [report.id, onDownload]);

  const handlePrint = useCallback(() => {
    if (onPrint) {
      onPrint(report.id);
    }
    window.print();
  }, [report.id, onPrint]);

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 10, 200));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 10, 50));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, report.pages));
  };

  const handlePrevPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };

  const getReportTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      financial: 'Relatório Financeiro',
      property: 'Relatório de Propriedade',
      audit: 'Auditoria',
      custom: 'Personalizado'
    };
    return labels[type] || type;
  };

  return (
    <div className={`report-viewer report-viewer--${effectiveTheme}`}>
      <div className="report-viewer__header">
        <div className="report-viewer__title-section">
          <h2 className="report-viewer__title">{report.title}</h2>
          <span className="report-viewer__type">{getReportTypeLabel(report.type)}</span>
          <span className="report-viewer__date">
            {new Date(report.generatedAt).toLocaleDateString('pt-BR')}
          </span>
        </div>

        <div className="report-viewer__controls">
          {report.fileUrl && (
            <button
              className="report-viewer__button report-viewer__button--primary"
              onClick={handleDownload}
              disabled={isDownloading}
              title="Baixar relatório"
            >
              <Download size={18} />
              {isDownloading ? 'Baixando...' : 'Baixar'}
            </button>
          )}

          <button
            className="report-viewer__button"
            onClick={handlePrint}
            title="Imprimir"
          >
            <Print size={18} />
          </button>
        </div>
      </div>

      <div className="report-viewer__content">
        {isLoading ? (
          <div className="report-viewer__loading">
            <div className="report-viewer__spinner"></div>
            <p>Carregando relatório...</p>
          </div>
        ) : report.thumbnailUrl ? (
          <div className="report-viewer__preview">
            <img
              src={report.thumbnailUrl}
              alt={`${report.title} - Página ${currentPage}`}
              className="report-viewer__image"
              style={{
                transform: `scale(${zoom / 100})`
              }}
            />
          </div>
        ) : (
          <div className="report-viewer__placeholder">
            <div className="report-viewer__placeholder-icon">📄</div>
            <p>Clique em "Baixar" para visualizar o relatório completo</p>
          </div>
        )}
      </div>

      {report.pages > 1 && (
        <div className="report-viewer__pagination">
          <button
            className="report-viewer__button report-viewer__button--nav"
            onClick={handlePrevPage}
            disabled={currentPage === 1}
            title="Página anterior"
          >
            <ChevronLeft size={18} />
          </button>

          <span className="report-viewer__page-info">
            Página {currentPage} de {report.pages}
          </span>

          <button
            className="report-viewer__button report-viewer__button--nav"
            onClick={handleNextPage}
            disabled={currentPage === report.pages}
            title="Próxima página"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      <div className="report-viewer__zoom">
        <button
          className="report-viewer__button report-viewer__button--icon"
          onClick={handleZoomOut}
          disabled={zoom === 50}
          title="Reduzir zoom"
        >
          <ZoomOut size={18} />
        </button>

        <span className="report-viewer__zoom-level">{zoom}%</span>

        <button
          className="report-viewer__button report-viewer__button--icon"
          onClick={handleZoomIn}
          disabled={zoom === 200}
          title="Aumentar zoom"
        >
          <ZoomIn size={18} />
        </button>
      </div>

      <div className="report-viewer__footer">
        <p className="report-viewer__footer-text">
          ID: {report.id}
        </p>
        <p className="report-viewer__footer-text">
          Gerado em: {new Date(report.generatedAt).toLocaleString('pt-BR')}
        </p>
      </div>
    </div>
  );
};
