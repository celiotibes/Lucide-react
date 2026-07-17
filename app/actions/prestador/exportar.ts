'use server';

import { createClient } from '@/lib/supabase/server';
import { Readable } from 'stream';

export type ExportFormat = 'csv' | 'excel' | 'pdf';
export type ExportType = 'fechamentos' | 'apontamentos' | 'resumo_financeiro' | 'adiantamentos';

interface ExportOptions {
  type: ExportType;
  format: ExportFormat;
  dataInicio?: string; // YYYY-MM-DD
  dataFim?: string; // YYYY-MM-DD
  prestadorId?: string;
  incluirPrestador?: boolean;
}

/**
 * Exporta dados de prestador em múltiplos formatos
 */
export async function exportarDados(options: ExportOptions): Promise<{
  sucesso: boolean;
  url?: string;
  nomearquivo?: string;
  erro?: string;
}> {
  try {
    const supabase = createClient();

    // Validar permissão
    const { data: user, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { sucesso: false, erro: 'Não autenticado' };
    }

    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return { sucesso: false, erro: 'Sem permissão para exportar' };
    }

    let dados: any[] = [];
    let nomeArquivo = '';

    // Buscar dados conforme tipo
    switch (options.type) {
      case 'fechamentos':
        dados = await buscarFechamentos(supabase, options);
        nomeArquivo = gerarNomeArquivo('fechamentos', options.format);
        break;

      case 'apontamentos':
        dados = await buscarApontamentos(supabase, options);
        nomeArquivo = gerarNomeArquivo('apontamentos', options.format);
        break;

      case 'resumo_financeiro':
        dados = await buscarResumoFinanceiro(supabase, options);
        nomeArquivo = gerarNomeArquivo('resumo_financeiro', options.format);
        break;

      case 'adiantamentos':
        dados = await buscarAdiantamentos(supabase, options);
        nomeArquivo = gerarNomeArquivo('adiantamentos', options.format);
        break;

      default:
        return { sucesso: false, erro: 'Tipo de exportação inválido' };
    }

    if (dados.length === 0) {
      return { sucesso: false, erro: 'Nenhum dado encontrado para exportar' };
    }

    // Gerar arquivo conforme formato
    let buffer: Buffer;
    let mimeType: string;

    switch (options.format) {
      case 'csv':
        buffer = gerarCSV(dados);
        mimeType = 'text/csv';
        break;

      case 'excel':
        buffer = await gerarExcel(dados, options.type);
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;

      case 'pdf':
        buffer = await gerarPDF(dados, options.type);
        mimeType = 'application/pdf';
        break;

      default:
        return { sucesso: false, erro: 'Formato inválido' };
    }

    // Salvar em storage temporal e gerar URL
    const supabaseStorage = supabase.storage.from('exports');
    const caminhoArquivo = `prestador/${new Date().getTime()}-${nomeArquivo}`;

    const { error: uploadError } = await supabaseStorage.upload(
      caminhoArquivo,
      buffer,
      {
        contentType: mimeType,
        cacheControl: '3600',
      }
    );

    if (uploadError) {
      return { sucesso: false, erro: `Erro ao salvar arquivo: ${uploadError.message}` };
    }

    // Gerar URL pública (válida por 1 hora)
    const { data: signedData } = await supabaseStorage.createSignedUrl(
      caminhoArquivo,
      3600
    );

    return {
      sucesso: true,
      url: signedData?.signedUrl,
      nomearquivo: nomeArquivo,
    };
  } catch (erro) {
    console.error('Erro ao exportar dados:', erro);
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
    };
  }
}

// ============================================================================
// Funções auxiliares de busca
// ============================================================================

async function buscarFechamentos(
  supabase: ReturnType<typeof createClient>,
  options: ExportOptions
) {
  let query = supabase
    .from('fechamentos_prestador')
    .select(
      `
      id, data_inicio, data_fim, frequencia, status,
      total_proventos, total_deducoes, valor_liquido,
      pix_status, pix_confirmado_em,
      nfse_status, nfse_protocolo,
      contratos_prestador (
        prestador_id,
        prestadores_servico (id, nome_completo, categoria)
      )
    `
    );

  if (options.dataInicio) {
    query = query.gte('data_fim', options.dataInicio);
  }

  if (options.dataFim) {
    query = query.lte('data_fim', options.dataFim);
  }

  if (options.prestadorId) {
    query = query.eq('contratos_prestador.prestador_id', options.prestadorId);
  }

  const { data, error } = await query.order('data_fim', { ascending: false });

  if (error) throw error;

  return (data || []).map((item: any) => ({
    'ID': item.id,
    'Prestador': item.contratos_prestador?.prestadores_servico?.nome_completo || '-',
    'Categoria': item.contratos_prestador?.prestadores_servico?.categoria || '-',
    'Período Início': item.data_inicio,
    'Período Fim': item.data_fim,
    'Frequência': item.frequencia,
    'Status': item.status,
    'Total Proventos': item.total_proventos?.toFixed(2),
    'Total Deduções': item.total_deducoes?.toFixed(2),
    'Valor Líquido': item.valor_liquido?.toFixed(2),
    'Status PIX': item.pix_status || '-',
    'PIX Confirmado Em': item.pix_confirmado_em || '-',
    'Status NFS-e': item.nfse_status || '-',
    'Protocolo NFS-e': item.nfse_protocolo || '-',
  }));
}

async function buscarApontamentos(
  supabase: ReturnType<typeof createClient>,
  options: ExportOptions
) {
  let query = supabase
    .from('apontamentos_prestador')
    .select(
      `
      id, data, hora_inicio, hora_saida, horas_trabalhadas,
      descricao_atividades, categoria_atividade,
      quilometragem_extra, valor_deslocamento,
      quantidade_kits_pos_hospedagem, quantidade_kits_dentro_horario,
      eh_emergencia, observacoes,
      contratos_prestador (
        prestadores_servico (id, nome_completo, categoria)
      )
    `
    );

  if (options.dataInicio) {
    query = query.gte('data', options.dataInicio);
  }

  if (options.dataFim) {
    query = query.lte('data', options.dataFim);
  }

  if (options.prestadorId) {
    query = query.eq('contratos_prestador.prestador_id', options.prestadorId);
  }

  const { data, error } = await query.order('data', { ascending: false });

  if (error) throw error;

  return (data || []).map((item: any) => ({
    'Data': item.data,
    'Prestador': item.contratos_prestador?.prestadores_servico?.nome_completo || '-',
    'Hora Início': item.hora_inicio || '-',
    'Hora Saída': item.hora_saida || '-',
    'Horas Trabalhadas': item.horas_trabalhadas?.toFixed(2) || '-',
    'Categoria': item.categoria_atividade || '-',
    'Descrição': item.descricao_atividades || '-',
    'Quilometragem': item.quilometragem_extra?.toFixed(2) || '-',
    'Valor Deslocamento': item.valor_deslocamento?.toFixed(2) || '-',
    'Kits Pós Hospedagem': item.quantidade_kits_pos_hospedagem || 0,
    'Kits Dentro do Horário': item.quantidade_kits_dentro_horario || 0,
    'Emergência': item.eh_emergencia ? 'Sim' : 'Não',
    'Observações': item.observacoes || '-',
  }));
}

async function buscarResumoFinanceiro(
  supabase: ReturnType<typeof createClient>,
  options: ExportOptions
) {
  const { data, error } = await supabase.rpc('fn_resumo_financeiro_periodo', {
    p_data_inicio: options.dataInicio || '2024-01-01',
    p_data_fim: options.dataFim || new Date().toISOString().split('T')[0],
    p_prestador_id: options.prestadorId || null,
  });

  if (error) throw error;

  return (data || []).map((item: any) => ({
    'Prestador': item.nome_completo,
    'Categoria': item.categoria,
    'Mês': item.mes,
    'Total Proventos': item.total_proventos?.toFixed(2),
    'Diárias': item.valor_diarias?.toFixed(2),
    'Horas Adicionais': item.valor_horas_adicionais?.toFixed(2),
    'Deslocamentos': item.valor_deslocamentos?.toFixed(2),
    'Kits': item.valor_kits?.toFixed(2),
    'Combustível': item.valor_combustivel?.toFixed(2),
    'Total Deduções': item.total_deducoes?.toFixed(2),
    'Adiantamentos Descontados': item.adiantamentos_descontados?.toFixed(2),
    'Parcelas Descontadas': item.parcelas_descontadas?.toFixed(2),
    'Valor Líquido': item.valor_liquido?.toFixed(2),
    'Fechamentos Pagos': item.fechamentos_pagos,
    'Fechamentos Aprovados': item.fechamentos_aprovados,
    'Fechamentos Devolvidos': item.fechamentos_devolvidos,
  }));
}

async function buscarAdiantamentos(
  supabase: ReturnType<typeof createClient>,
  options: ExportOptions
) {
  let query = supabase
    .from('adiantamentos_prestador')
    .select(
      `
      id, data_lancamento, tipo, descricao, valor_total,
      numero_parcelas, valor_parcela, parcelas_restantes,
      status, data_quitacao,
      contratos_prestador (
        prestadores_servico (id, nome_completo)
      )
    `
    );

  if (options.dataInicio) {
    query = query.gte('data_lancamento', options.dataInicio);
  }

  if (options.dataFim) {
    query = query.lte('data_lancamento', options.dataFim);
  }

  if (options.prestadorId) {
    query = query.eq('contratos_prestador.prestador_id', options.prestadorId);
  }

  const { data, error } = await query.order('data_lancamento', { ascending: false });

  if (error) throw error;

  return (data || []).map((item: any) => ({
    'ID': item.id,
    'Prestador': item.contratos_prestador?.prestadores_servico?.nome_completo || '-',
    'Data': item.data_lancamento,
    'Tipo': item.tipo,
    'Descrição': item.descricao,
    'Valor Total': item.valor_total?.toFixed(2),
    'Número de Parcelas': item.numero_parcelas || '-',
    'Valor Parcela': item.valor_parcela?.toFixed(2) || '-',
    'Parcelas Restantes': item.parcelas_restantes || '-',
    'Status': item.status,
    'Data Quitação': item.data_quitacao || '-',
  }));
}

// ============================================================================
// Geradores de arquivo
// ============================================================================

function gerarCSV(dados: any[]): Buffer {
  if (dados.length === 0) return Buffer.from('');

  const headers = Object.keys(dados[0]);
  const csvHeaders = headers.map(h => `"${h}"`).join(',');

  const csvRows = dados.map(row =>
    headers
      .map(header => {
        const value = row[header] || '';
        const stringValue = String(value).replace(/"/g, '""');
        return `"${stringValue}"`;
      })
      .join(',')
  );

  const csv = [csvHeaders, ...csvRows].join('\n');
  return Buffer.from(csv, 'utf-8');
}

async function gerarExcel(dados: any[], tipo: ExportType): Promise<Buffer> {
  // Dynamic import para evitar problemas com servidor
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Dados', {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
  });

  if (dados.length === 0) {
    worksheet.addRow(['Nenhum dado encontrado']);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  const headers = Object.keys(dados[0]);

  // Adicionar cabeçalho
  const headerRow = worksheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF366092' },
  };

  // Adicionar dados
  dados.forEach(row => {
    worksheet.addRow(headers.map(h => row[h] || ''));
  });

  // Auto-fit columns
  headers.forEach((header, idx) => {
    const col = worksheet.getColumn(idx + 1);
    col.width = Math.min(25, Math.max(15, header.length + 2));
  });

  // Freezing header row
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

async function gerarPDF(dados: any[], tipo: ExportType): Promise<Buffer> {
  // Usando library de geração de PDF server-side
  const PDFDocument = (await import('pdfkit')).default;
  const doc = new PDFDocument({ margin: 50, size: 'A4', landscape: true });

  // Buffer para acumular
  const chunks: Buffer[] = [];
  doc.on('data', chunk => chunks.push(chunk));

  // Título
  doc.fontSize(16).font('Helvetica-Bold').text(`Exportação: ${tipo.replace(/_/g, ' ')}`, {
    align: 'center',
  });

  doc.fontSize(10).font('Helvetica').text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, {
    align: 'center',
  });

  doc.moveDown();

  // Tabela de dados (simplificada)
  if (dados.length > 0) {
    const headers = Object.keys(dados[0]);
    const colWidth = (doc.page.width - 100) / headers.length;

    // Cabeçalho
    let x = 50;
    doc.fontSize(9).font('Helvetica-Bold');
    headers.forEach(header => {
      doc.text(header, x, doc.y, { width: colWidth - 5, ellipsis: true });
      x += colWidth;
    });

    doc.moveDown(0.5);
    doc.lineTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
    doc.moveDown(0.3);

    // Linhas de dados
    doc.fontSize(8).font('Helvetica');
    dados.slice(0, 100).forEach(row => {
      // Paging
      if (doc.y > doc.page.height - 50) {
        doc.addPage({ landscape: true });
      }

      x = 50;
      headers.forEach(header => {
        doc.text(String(row[header] || ''), x, doc.y, {
          width: colWidth - 5,
          ellipsis: true,
        });
        x += colWidth;
      });

      doc.moveDown(0.4);
    });

    if (dados.length > 100) {
      doc.moveDown();
      doc.fontSize(9).text(`... e mais ${dados.length - 100} registros`);
    }
  }

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);
  });
}

function gerarNomeArquivo(tipo: string, formato: ExportFormat): string {
  const timestamp = new Date().toISOString().split('T')[0];
  const extensoes: Record<ExportFormat, string> = {
    csv: 'csv',
    excel: 'xlsx',
    pdf: 'pdf',
  };
  return `${tipo}_${timestamp}.${extensoes[formato]}`;
}
