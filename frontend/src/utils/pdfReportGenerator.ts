import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface PDFReportData {
  title: string;
  subtitle?: string;
  generatedAt: Date;
  dateRange?: {
    start: Date;
    end: Date;
  };
  categories?: string[];
  charts?: Array<{
    ref: HTMLElement;
    title: string;
    description?: string;
  }>;
  kpis?: Array<{
    name: string;
    value: string | number;
    unit?: string;
    trend?: string;
    status?: string;
  }>;
  summary?: string;
}

export const generateDashboardPDF = async (data: PDFReportData): Promise<void> => {
  try {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - 2 * margin;
    let currentY = margin;

    // Helper function to add page break if needed
    const checkPageBreak = (requiredHeight: number): number => {
      if (currentY + requiredHeight > pageHeight - margin) {
        pdf.addPage();
        return margin;
      }
      return currentY;
    };

    // ===== TITLE PAGE =====
    pdf.setFontSize(28);
    pdf.setTextColor(59, 130, 246); // Blue color
    pdf.text(data.title, margin, currentY);
    currentY += 12;

    if (data.subtitle) {
      pdf.setFontSize(14);
      pdf.setTextColor(100, 100, 100);
      pdf.text(data.subtitle, margin, currentY);
      currentY += 10;
    }

    // Metadata section
    pdf.setFontSize(10);
    pdf.setTextColor(100, 100, 100);
    currentY += 5;

    const generatedAt = data.generatedAt.toLocaleString('pt-BR');
    pdf.text(`Gerado em: ${generatedAt}`, margin, currentY);
    currentY += 7;

    if (data.dateRange) {
      const startDate = data.dateRange.start.toLocaleDateString('pt-BR');
      const endDate = data.dateRange.end.toLocaleDateString('pt-BR');
      pdf.text(`Período: ${startDate} a ${endDate}`, margin, currentY);
      currentY += 7;
    }

    if (data.categories && data.categories.length > 0) {
      const categoryText = `Categorias: ${data.categories.join(', ')}`;
      const categoryLines = pdf.splitTextToSize(categoryText, contentWidth);
      pdf.text(categoryLines, margin, currentY);
      currentY += categoryLines.length * 5 + 5;
    }

    // ===== KPI SUMMARY =====
    if (data.kpis && data.kpis.length > 0) {
      currentY = checkPageBreak(40);

      pdf.setFontSize(14);
      pdf.setTextColor(0, 0, 0);
      pdf.text('Indicadores-Chave (KPIs)', margin, currentY);
      currentY += 10;

      pdf.setFontSize(9);
      const kpiData = data.kpis.map((kpi) => [
        kpi.name,
        String(kpi.value),
        kpi.unit || '',
        kpi.trend || '',
        kpi.status || '',
      ]);

      pdf.autoTable({
        head: [['KPI', 'Valor', 'Unidade', 'Tendência', 'Status']],
        body: kpiData,
        startY: currentY,
        margin: margin,
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: 30, halign: 'right' },
          2: { cellWidth: 25 },
          3: { cellWidth: 30 },
          4: { cellWidth: 35 },
        },
        headStyles: {
          fillColor: [59, 130, 246],
          textColor: 255,
          fontStyle: 'bold',
        },
        bodyStyles: {
          textColor: 50,
        },
        alternateRowStyles: {
          fillColor: [240, 244, 248],
        },
      });

      currentY = (pdf as any).lastAutoTable.finalY + 10;
    }

    // ===== CHARTS =====
    if (data.charts && data.charts.length > 0) {
      for (let i = 0; i < data.charts.length; i++) {
        const chartItem = data.charts[i];

        currentY = checkPageBreak(80);

        // Chart title
        pdf.setFontSize(12);
        pdf.setTextColor(0, 0, 0);
        pdf.text(chartItem.title, margin, currentY);
        currentY += 8;

        if (chartItem.description) {
          pdf.setFontSize(9);
          pdf.setTextColor(100, 100, 100);
          const descLines = pdf.splitTextToSize(chartItem.description, contentWidth);
          pdf.text(descLines, margin, currentY);
          currentY += descLines.length * 4 + 4;
        }

        // Render chart
        try {
          const canvas = await html2canvas(chartItem.ref, {
            backgroundColor: '#ffffff',
            scale: 2,
            logging: false,
            useCORS: true,
          });

          const imgData = canvas.toDataURL('image/png');
          const imgWidth = contentWidth;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;

          // Ensure image fits on page
          if (currentY + imgHeight > pageHeight - margin * 2) {
            pdf.addPage();
            currentY = margin;
          }

          pdf.addImage(imgData, 'PNG', margin, currentY, imgWidth, imgHeight);
          currentY += imgHeight + 15;
        } catch (error) {
          console.error(`Error adding chart "${chartItem.title}" to PDF:`, error);
          pdf.setTextColor(200, 0, 0);
          pdf.setFontSize(9);
          pdf.text('Erro ao renderizar gráfico', margin, currentY);
          currentY += 10;
        }
      }
    }

    // ===== SUMMARY =====
    if (data.summary) {
      currentY = checkPageBreak(30);

      pdf.setFontSize(12);
      pdf.setTextColor(0, 0, 0);
      pdf.text('Resumo Executivo', margin, currentY);
      currentY += 8;

      pdf.setFontSize(10);
      pdf.setTextColor(50, 50, 50);
      const summaryLines = pdf.splitTextToSize(data.summary, contentWidth);
      pdf.text(summaryLines, margin, currentY);
    }

    // ===== FOOTER =====
    const pageCount = (pdf as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      const pageText = `Página ${i} de ${pageCount}`;
      pdf.text(pageText, pageWidth - margin - 20, pageHeight - 10);
    }

    // Save PDF
    const filename = `relatorio-dashboard-${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(filename);
  } catch (error) {
    console.error('Error generating PDF report:', error);
    throw error;
  }
};

export const generateChartsPDF = async (
  charts: Array<{ ref: HTMLElement; title: string }>,
  options: {
    title?: string;
    dateRange?: { start: Date; end: Date };
    categories?: string[];
  } = {}
): Promise<void> => {
  const reportData: PDFReportData = {
    title: options.title || 'Relatório de Gráficos',
    generatedAt: new Date(),
    dateRange: options.dateRange,
    categories: options.categories,
    charts: charts.map((chart) => ({
      ref: chart.ref,
      title: chart.title,
    })),
  };

  await generateDashboardPDF(reportData);
};
