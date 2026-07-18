import PDFDocument from 'pdfkit';
import { obterPool } from '@/server/integracao/db';
import { formatarMoeda, formatarData } from '@/lib/formatacao';

interface ItemFechamento {
  descricao: string;
  origem: string;
  valor: number;
  tipo: 'debito' | 'credito';
}

export async function gerarPdfFechamento(
  vistoriaSaidaId: string,
  dataEmissao: Date = new Date()
): Promise<Buffer> {
  const pool = obterPool();

  // Buscar dados da vistoria
  const vistoriaResult = await pool.query(
    `select v.id, v.data, i.identificacao as imovel, c.id as contrato_id
     from vistorias v
     join imoveis i on i.id = v.imovel_id
     join contratos c on c.id = v.contrato_id
     where v.id = $1`,
    [vistoriaSaidaId]
  );

  if (vistoriaResult.rows.length === 0) {
    throw new Error('Vistoria não encontrada');
  }

  const vistoria = vistoriaResult.rows[0];

  // Buscar dados do fechamento
  const fechamentoResult = await pool.query(
    `select fc.id, fc.total_debitos, fc.total_creditos, fc.saldo_final,
            fc.caucao_valor_atualizado, fc.caucao_fonte,
            array_agg(json_build_object(
              'descricao', if.descricao,
              'tipo', if.tipo,
              'origem', if.origem,
              'valor', if.valor
            )) as itens
     from fechamentos_contrato fc
     left join itens_fechamento if on if.fechamento_id = fc.id
     where fc.vistoria_saida_id = $1
     group by fc.id, fc.total_debitos, fc.total_creditos, fc.saldo_final, fc.caucao_valor_atualizado, fc.caucao_fonte`,
    [vistoriaSaidaId]
  );

  if (fechamentoResult.rows.length === 0) {
    throw new Error('Fechamento não encontrado');
  }

  const fechamento = fechamentoResult.rows[0];

  // Criar PDF
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
  });

  // Buffer para armazenar o PDF
  let buffers: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => buffers.push(chunk));

  // Cabeçalho
  doc.fontSize(18).font('Helvetica-Bold').text('RELATÓRIO DE FECHAMENTO', { align: 'center' });
  doc.fontSize(10).font('Helvetica').text('Contrato de Locação', { align: 'center' });
  doc.moveDown(0.5);

  // Informações gerais
  doc.fontSize(10).font('Helvetica-Bold').text('Informações Gerais');
  doc.fontSize(9).font('Helvetica');
  doc.text(`Imóvel: ${vistoria.imovel}`);
  doc.text(`Contrato ID: ${vistoria.contrato_id}`);
  doc.text(`Data da vistoria de saída: ${formatarData(vistoria.data)}`);
  doc.text(`Data de emissão: ${formatarData(dataEmissao)}`);
  doc.moveDown();

  // Seção de Débitos
  doc.fontSize(11).font('Helvetica-Bold').text('DÉBITOS DO INQUILINO');
  doc.fontSize(9).font('Helvetica');

  const debitos = fechamento.itens.filter((i: ItemFechamento) => i.tipo === 'debito');
  if (debitos.length > 0) {
    // Tabela de débitos
    const tableTop = doc.y;
    const columnPositions = { desc: 40, origem: 300, valor: 500 };

    doc.text('Descrição', columnPositions.desc, tableTop);
    doc.text('Origem', columnPositions.origem, tableTop);
    doc.text('Valor', columnPositions.valor, tableTop);

    doc.moveTo(40, tableTop + 15).lineTo(560, tableTop + 15).stroke();

    let y = tableTop + 20;
    let totalDebitos = 0;

    for (const item of debitos) {
      const valor = parseFloat(item.valor);
      totalDebitos += valor;

      doc.text(item.descricao, columnPositions.desc, y, { width: 250 });
      doc.text(item.origem, columnPositions.origem, y, { width: 150 });
      doc.text(formatarMoeda(item.valor), columnPositions.valor, y, { align: 'right' });

      y += 25;

      if (y > 700) {
        doc.addPage();
        y = 40;
      }
    }

    doc.moveTo(40, y).lineTo(560, y).stroke();
    y += 5;

    doc.font('Helvetica-Bold').text('TOTAL DE DÉBITOS:', columnPositions.desc, y);
    doc.text(formatarMoeda(totalDebitos), columnPositions.valor, y, { align: 'right' });
  }

  doc.moveDown();

  // Seção de Créditos
  doc.fontSize(11).font('Helvetica-Bold').text('CRÉDITOS DO INQUILINO');
  doc.fontSize(9).font('Helvetica');

  const creditos = fechamento.itens.filter((i: ItemFechamento) => i.tipo === 'credito');
  if (creditos.length > 0 || fechamento.caucao_valor_atualizado) {
    const tableTop = doc.y;
    const columnPositions = { desc: 40, origem: 300, valor: 500 };

    doc.text('Descrição', columnPositions.desc, tableTop);
    doc.text('Origem', columnPositions.origem, tableTop);
    doc.text('Valor', columnPositions.valor, tableTop);

    doc.moveTo(40, tableTop + 15).lineTo(560, tableTop + 15).stroke();

    let y = tableTop + 20;
    let totalCreditos = 0;

    for (const item of creditos) {
      const valor = parseFloat(item.valor);
      totalCreditos += valor;

      doc.text(item.descricao, columnPositions.desc, y, { width: 250 });
      doc.text(item.origem, columnPositions.origem, y, { width: 150 });
      doc.text(formatarMoeda(item.valor), columnPositions.valor, y, { align: 'right' });

      y += 25;
    }

    // Caução se houver
    if (fechamento.caucao_valor_atualizado) {
      doc.text('Caução atualizada', columnPositions.desc, y, { width: 250 });
      doc.text(fechamento.caucao_fonte === 'indice_bacen' ? 'Índice poupança' : 'Extrato bancário', columnPositions.origem, y, { width: 150 });
      doc.text(formatarMoeda(fechamento.caucao_valor_atualizado), columnPositions.valor, y, { align: 'right' });
      totalCreditos += parseFloat(fechamento.caucao_valor_atualizado);
      y += 25;
    }

    doc.moveTo(40, y).lineTo(560, y).stroke();
    y += 5;

    doc.font('Helvetica-Bold').text('TOTAL DE CRÉDITOS:', columnPositions.desc, y);
    doc.text(formatarMoeda(totalCreditos), columnPositions.valor, y, { align: 'right' });
  }

  doc.moveDown(2);

  // Saldo Final
  const saldoFinal = parseFloat(fechamento.saldo_final);
  const corSaldo = saldoFinal >= 0 ? 'green' : 'red';

  doc.fontSize(12).font('Helvetica-Bold');
  doc.fillColor(corSaldo).text('SALDO FINAL');
  doc.fontSize(11);

  if (saldoFinal >= 0) {
    doc.text(`A DEVOLVER AO INQUILINO: ${formatarMoeda(saldoFinal)}`);
  } else {
    doc.text(`A COBRAR DO INQUILINO: ${formatarMoeda(Math.abs(saldoFinal))}`);
  }

  doc.fillColor('black');
  doc.moveDown(2);

  // Rodapé
  doc.fontSize(8).font('Helvetica').text('Este documento foi gerado automaticamente pelo sistema CRMT de gestão imobiliária.', { align: 'center' });
  doc.text('Valor: ' + formatarMoeda(Math.abs(saldoFinal)), { align: 'center' });

  // Finalizar PDF
  doc.end();

  // Retornar buffer quando pronto
  return new Promise((resolve) => {
    doc.on('end', () => {
      resolve(Buffer.concat(buffers));
    });
  });
}
