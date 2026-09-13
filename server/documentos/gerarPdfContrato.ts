import PDFDocument from 'pdfkit';
import { Readable } from 'stream';

interface ContratoParaExportar {
  id: string;
  imovel_identificacao: string;
  locatario_nome: string;
  locador_nome: string;
  data_inicio: string;
  data_fim: string;
  valor_aluguel: number;
  dia_vencimento: number;
  aviso_previo_dias: number;
  tipo: string;
  indice_reajuste: string | null;
  status: string;
  garantias: Array<{
    tipo: string;
    valor?: number;
    data_vencimento_apolice?: string;
  }>;
}

export async function gerarPdfContrato(contrato: ContratoParaExportar): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
    });

    const buffers: Buffer[] = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // Cores e fontes
    const corPrincipal = '#667eea';
    const corTexto = '#333333';
    const corDestaque = '#764ba2';

    // Cabeçalho
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .fillColor(corPrincipal)
      .text('CONTRATO DE LOCAÇÃO IMOBILIÁRIA', { align: 'center' })
      .moveDown(0.5);

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#999999')
      .text(`Documento ID: ${contrato.id}`, { align: 'center' })
      .text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, { align: 'center' })
      .moveDown(1.5);

    // Informações do imóvel
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(corDestaque)
      .text('1. DO IMÓVEL LOCADO');

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor(corTexto);

    const tabelaImovel = [
      ['Identificação:', contrato.imovel_identificacao],
      ['Tipo de Contrato:', contrato.tipo === 'locacao_padrao' ? 'Locação Padrão' : 'Temporada'],
      ['Status:', formatarStatus(contrato.status)],
    ];

    doc.moveDown(0.3);
    tabelaImovel.forEach(([label, valor]) => {
      doc
        .font('Helvetica-Bold')
        .fillColor('#555555')
        .text(label, { width: 150, continued: true });
      doc
        .font('Helvetica')
        .fillColor(corTexto)
        .text(valor);
    });

    doc.moveDown(1);

    // Partes do contrato
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(corDestaque)
      .text('2. PARTES CONTRATANTES');

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor(corTexto)
      .moveDown(0.3);

    doc
      .font('Helvetica-Bold')
      .fillColor('#555555')
      .text('Inquilino (Locatário):');
    doc
      .font('Helvetica')
      .fillColor(corTexto)
      .text(contrato.locatario_nome);

    doc.moveDown(0.5);

    doc
      .font('Helvetica-Bold')
      .fillColor('#555555')
      .text('Proprietário (Locador):');
    doc
      .font('Helvetica')
      .fillColor(corTexto)
      .text(contrato.locador_nome);

    doc.moveDown(1);

    // Condições financeiras
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(corDestaque)
      .text('3. CONDIÇÕES FINANCEIRAS');

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor(corTexto)
      .moveDown(0.3);

    const tabelaFinanceira = [
      ['Aluguel Mensal:', `R$ ${contrato.valor_aluguel.toFixed(2).replace('.', ',')}`],
      ['Dia de Vencimento:', `${contrato.dia_vencimento}º dia do mês`],
      [
        'Reajuste:',
        contrato.indice_reajuste
          ? `${contrato.indice_reajuste} (anual)`
          : 'Sem reajuste automático',
      ],
    ];

    tabelaFinanceira.forEach(([label, valor]) => {
      doc
        .font('Helvetica-Bold')
        .fillColor('#555555')
        .text(label, { width: 150, continued: true });
      doc
        .font('Helvetica')
        .fillColor(corTexto)
        .text(valor);
    });

    doc.moveDown(1);

    // Vigência
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(corDestaque)
      .text('4. VIGÊNCIA DO CONTRATO');

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor(corTexto)
      .moveDown(0.3);

    const dataInicio = new Date(contrato.data_inicio).toLocaleDateString('pt-BR');
    const dataFim = contrato.data_fim ? new Date(contrato.data_fim).toLocaleDateString('pt-BR') : 'Indeterminado';

    doc
      .font('Helvetica-Bold')
      .fillColor('#555555')
      .text('Início:', { width: 150, continued: true });
    doc
      .font('Helvetica')
      .fillColor(corTexto)
      .text(dataInicio);

    doc
      .font('Helvetica-Bold')
      .fillColor('#555555')
      .text('Término:', { width: 150, continued: true });
    doc
      .font('Helvetica')
      .fillColor(corTexto)
      .text(dataFim);

    doc
      .font('Helvetica-Bold')
      .fillColor('#555555')
      .text('Aviso Prévio:', { width: 150, continued: true });
    doc
      .font('Helvetica')
      .fillColor(corTexto)
      .text(`${contrato.aviso_previo_dias} dias`);

    doc.moveDown(1);

    // Garantias
    if (contrato.garantias && contrato.garantias.length > 0) {
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor(corDestaque)
        .text('5. GARANTIAS');

      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor(corTexto)
        .moveDown(0.3);

      contrato.garantias.forEach((garantia, index) => {
        doc
          .font('Helvetica-Bold')
          .fillColor('#555555')
          .text(`${index + 1}. ${formatarTipoGarantia(garantia.tipo)}`);

        if (garantia.valor) {
          doc
            .font('Helvetica')
            .fillColor(corTexto)
            .text(`   Valor: R$ ${garantia.valor.toFixed(2).replace('.', ',')}`);
        }

        if (garantia.data_vencimento_apolice) {
          const dataVencimento = new Date(garantia.data_vencimento_apolice).toLocaleDateString(
            'pt-BR',
          );
          doc
            .font('Helvetica')
            .fillColor(corTexto)
            .text(`   Vencimento: ${dataVencimento}`);
        }
      });

      doc.moveDown(1);
    }

    // Rodapé com informações legais
    const heightAtEnd = doc.y;
    const pageHeight = doc.page.height;
    const marginBottom = 60;

    if (heightAtEnd + marginBottom < pageHeight) {
      doc.moveDown(pageHeight - heightAtEnd - marginBottom - doc.currentLineHeight() * 3);
    }

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#999999')
      .text('Este documento foi gerado automaticamente pelo sistema CRMT Gestão Imobiliária.', {
        align: 'center',
      })
      .text('Para documentos oficiais, utilize cópias impressas e assinadas pelo responsável.', {
        align: 'center',
      })
      .moveDown(0.5)
      .fontSize(8)
      .text(`Página 1 de 1 | ${new Date().toLocaleString('pt-BR')}`, { align: 'center' });

    doc.end();
  });
}

function formatarStatus(status: string): string {
  const statusMap: Record<string, string> = {
    ativo: 'Ativo',
    aviso_previo: 'Aviso Prévio Dado',
    encerrado: 'Encerrado',
    extrajudicial: 'Em Processo Extrajudicial',
    em_despejo: 'Em Processo de Despejo',
  };
  return statusMap[status] || status;
}

function formatarTipoGarantia(tipo: string): string {
  const tipoMap: Record<string, string> = {
    caucao: 'Caução',
    fiador: 'Fiador',
    seguro_fianca: 'Seguro-Fiança',
    titulo_capitalizacao: 'Título de Capitalização',
    seguro_incendio: 'Seguro-Incêndio',
  };
  return tipoMap[tipo] || tipo;
}
