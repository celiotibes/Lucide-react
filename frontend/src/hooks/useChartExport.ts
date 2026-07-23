import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface ChartExportOptions {
  filename?: string;
  title?: string;
  backgroundColor?: string;
  scale?: number;
}

interface PDFReportOptions extends ChartExportOptions {
  includeMetadata?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
  categories?: string[];
}

export const useChartExport = () => {
  const downloadFile = (content: string | Blob, filename: string, mimeType: string) => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportChartAsPNG = async (
    chartRef: HTMLElement | null,
    options: ChartExportOptions = {}
  ) => {
    if (!chartRef) {
      console.error('Chart reference not found');
      return;
    }

    try {
      const filename = options.filename || `chart-${new Date().toISOString().split('T')[0]}.png`;
      const backgroundColor = options.backgroundColor || '#ffffff';
      const scale = options.scale || 2;

      const canvas = await html2canvas(chartRef, {
        backgroundColor,
        scale,
        logging: false,
        useCORS: true,
      });

      canvas.toBlob((blob) => {
        if (blob) {
          downloadFile(blob, filename, 'image/png');
        }
      }, 'image/png', 0.95);
    } catch (error) {
      console.error('Error exporting chart as PNG:', error);
    }
  };

  const exportChartAsSVG = async (
    chartRef: HTMLElement | null,
    options: ChartExportOptions = {}
  ) => {
    if (!chartRef) {
      console.error('Chart reference not found');
      return;
    }

    try {
      const filename = options.filename || `chart-${new Date().toISOString().split('T')[0]}.svg`;
      const svgContent = chartRef.innerHTML;

      // Wrap in SVG if not already
      const wrappedSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400">
        ${svgContent}
      </svg>`;

      downloadFile(wrappedSVG, filename, 'image/svg+xml');
    } catch (error) {
      console.error('Error exporting chart as SVG:', error);
    }
  };

  const exportChartAsJPG = async (
    chartRef: HTMLElement | null,
    options: ChartExportOptions = {}
  ) => {
    if (!chartRef) {
      console.error('Chart reference not found');
      return;
    }

    try {
      const filename = options.filename || `chart-${new Date().toISOString().split('T')[0]}.jpg`;
      const backgroundColor = options.backgroundColor || '#ffffff';
      const scale = options.scale || 2;

      const canvas = await html2canvas(chartRef, {
        backgroundColor,
        scale,
        logging: false,
        useCORS: true,
      });

      canvas.toBlob((blob) => {
        if (blob) {
          downloadFile(blob, filename, 'image/jpeg');
        }
      }, 'image/jpeg', 0.85);
    } catch (error) {
      console.error('Error exporting chart as JPG:', error);
    }
  };

  const generatePDFReport = async (
    chartRefs: HTMLElement[],
    options: PDFReportOptions = {}
  ) => {
    if (chartRefs.length === 0) {
      console.error('No chart references provided');
      return;
    }

    try {
      const filename = options.filename || `relatorio-${new Date().toISOString().split('T')[0]}.pdf`;
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let currentY = margin;

      // Add title
      if (options.title) {
        pdf.setFontSize(20);
        pdf.text(options.title, margin, currentY);
        currentY += 15;
      }

      // Add metadata
      if (options.includeMetadata) {
        pdf.setFontSize(10);
        pdf.setTextColor(100, 100, 100);

        const generatedAt = new Date().toLocaleString('pt-BR');
        pdf.text(`Gerado em: ${generatedAt}`, margin, currentY);
        currentY += 7;

        if (options.dateRange) {
          const startDate = options.dateRange.start.toLocaleDateString('pt-BR');
          const endDate = options.dateRange.end.toLocaleDateString('pt-BR');
          pdf.text(`Período: ${startDate} a ${endDate}`, margin, currentY);
          currentY += 7;
        }

        if (options.categories && options.categories.length > 0) {
          const categoryText = `Categorias: ${options.categories.join(', ')}`;
          pdf.text(categoryText, margin, currentY);
          currentY += 7;
        }

        pdf.setTextColor(0, 0, 0);
        currentY += 5;
      }

      // Add charts
      for (const chartRef of chartRefs) {
        if (currentY > pageHeight - margin - 60) {
          pdf.addPage();
          currentY = margin;
        }

        try {
          const canvas = await html2canvas(chartRef, {
            backgroundColor: '#ffffff',
            scale: 2,
            logging: false,
            useCORS: true,
          });

          const imgData = canvas.toDataURL('image/png');
          const imgWidth = pageWidth - 2 * margin;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;

          if (currentY + imgHeight > pageHeight - margin) {
            pdf.addPage();
            currentY = margin;
          }

          pdf.addImage(imgData, 'PNG', margin, currentY, imgWidth, imgHeight);
          currentY += imgHeight + 10;
        } catch (error) {
          console.error('Error adding chart to PDF:', error);
        }
      }

      // Save PDF
      pdf.save(filename);
    } catch (error) {
      console.error('Error generating PDF report:', error);
    }
  };

  return {
    exportChartAsPNG,
    exportChartAsSVG,
    exportChartAsJPG,
    generatePDFReport,
  };
};
