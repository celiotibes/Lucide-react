/**
 * Gerador de relatórios em PDF/Excel/CSV
 * Fase 1: Exportação de dados
 */

import { createClient } from '@/lib/supabase/server';

export interface ConfiguracaoRelatorio {
  tipo: 'pdf' | 'excel' | 'csv';
  formato: 'dashboard' | 'dre' | 'apontamentos' | 'despesas' | 'residenciais' | 'prestadores';
  dataInicio: string;
  dataFim: string;
  residencialId?: string;
  prestadorId?: string;
  incluirGraficos?: boolean;
}

export interface DadosRelatorio {
  titulo: string;
  periodo: string;
  geradoEm: string;
  dados: any[];
  totalizadores?: Record<string, number>;
  metadados: {
    totalRegistros: number;
    filtros: string[];
  };
}

/**
 * Preparar dados para relatório
 */
export async function prepararDadosRelatorio(
  config: ConfiguracaoRelatorio
): Promise<DadosRelatorio> {
  const supabase = await createClient();

  const periodo = `${config.dataInicio} a ${config.dataFim}`;
  const metadados = {
    totalRegistros: 0,
    filtros: [] as string[],
  };

  if (config.residencialId) metadados.filtros.push(`Residencial: ${config.residencialId}`);
  if (config.prestadorId) metadados.filtros.push(`Prestador: ${config.prestadorId}`);

  let dados: any[] = [];
  let titulo = '';
  let totalizadores: Record<string, number> = {};

  try {
    switch (config.formato) {
      case 'dashboard': {
        titulo = 'Dashboard Executivo';
        const { data: kpis } = await supabase.from('vw_kpi_financeiro').select('*');
        dados = kpis?.filter((k) => {
          const dataKpi = new Date(k.ano, k.mes - 1, 1);
          const dataInicio = new Date(config.dataInicio);
          const dataFim = new Date(config.dataFim);
          return dataKpi >= dataInicio && dataKpi <= dataFim;
        }) || [];

        if (dados.length > 0) {
          totalizadores = {
            faturamentoTotal: dados.reduce((sum, d) => sum + (d.faturamento_total || 0), 0),
            receitaLiquida: dados.reduce((sum, d) => sum + (d.receita_liquida || 0), 0),
            custoTotal:
              dados.reduce((sum, d) => sum + (d.custo_operacional || 0), 0) +
              dados.reduce((sum, d) => sum + (d.custo_despesas || 0), 0),
          };
        }
        break;
      }

      case 'dre': {
        titulo = 'Demonstração de Resultado do Exercício';
        const { data: kpis } = await supabase.from('vw_kpi_financeiro').select('*');
        dados = kpis?.filter((k) => {
          const dataKpi = new Date(k.ano, k.mes - 1, 1);
          const dataInicio = new Date(config.dataInicio);
          const dataFim = new Date(config.dataFim);
          return dataKpi >= dataInicio && dataKpi <= dataFim;
        }) || [];
        break;
      }

      case 'apontamentos': {
        titulo = 'Relatório de Apontamentos';
        let query = supabase
          .from('apontamentos_prestador')
          .select('*, contratos_prestador(prestadores_servico(nome_completo))')
          .gte('data', config.dataInicio)
          .lte('data', config.dataFim);

        if (config.prestadorId) {
          query = query.eq('prestador_id', config.prestadorId);
        }

        const { data } = await query;
        dados = data || [];

        totalizadores = {
          totalHoras: dados.reduce((sum, d) => sum + (d.horas_trabalhadas || 0), 0),
          totalRegistros: dados.length,
          totalValor: dados.reduce((sum, d) => sum + (d.valor_total || 0), 0),
        };
        break;
      }

      case 'despesas': {
        titulo = 'Relatório de Despesas';
        let query = supabase
          .from('fact_despesa')
          .select('*')
          .gte('data_sk', config.dataInicio)
          .lte('data_sk', config.dataFim);

        const { data } = await query;
        dados = data || [];

        totalizadores = {
          totalDespesas: dados.reduce((sum, d) => sum + (d.valor_total || 0), 0),
          registros: dados.length,
          confiancaMediaOCR:
            dados.filter((d) => d.confianca_ocr).reduce((sum, d) => sum + (d.confianca_ocr || 0), 0) /
            Math.max(1, dados.filter((d) => d.confianca_ocr).length),
        };
        break;
      }

      case 'residenciais': {
        titulo = 'Relatório de Performance por Residencial';
        const { data } = await supabase.from('vw_resumo_mensal_residencial').select('*');
        dados =
          data?.filter((r) => {
            const dataRes = new Date(r.ano, r.mes - 1, 1);
            const dataInicio = new Date(config.dataInicio);
            const dataFim = new Date(config.dataFim);
            return dataRes >= dataInicio && dataRes <= dataFim;
          }) || [];
        break;
      }

      case 'prestadores': {
        titulo = 'Relatório de Performance por Prestador';
        const { data } = await supabase.from('vw_performance_prestador').select('*');
        dados =
          data?.filter((p) => {
            const dataPrest = new Date(p.ano, p.mes - 1, 1);
            const dataInicio = new Date(config.dataInicio);
            const dataFim = new Date(config.dataFim);
            return dataPrest >= dataInicio && dataPrest <= dataFim;
          }) || [];
        break;
      }
    }

    metadados.totalRegistros = dados.length;
  } catch (erro) {
    console.error('Erro ao preparar dados:', erro);
    throw erro;
  }

  return {
    titulo,
    periodo,
    geradoEm: new Date().toISOString(),
    dados,
    totalizadores,
    metadados,
  };
}

/**
 * Gerar CSV
 */
export function gerarCSV(relatorio: DadosRelatorio): string {
  const linhas: string[] = [];

  // Cabeçalho
  linhas.push(`${relatorio.titulo}`);
  linhas.push(`Período: ${relatorio.periodo}`);
  linhas.push(`Gerado em: ${new Date(relatorio.geradoEm).toLocaleString('pt-BR')}`);
  linhas.push('');

  // Totalizadores
  if (relatorio.totalizadores && Object.keys(relatorio.totalizadores).length > 0) {
    linhas.push('RESUMO');
    for (const [chave, valor] of Object.entries(relatorio.totalizadores)) {
      linhas.push(`${chave}: ${typeof valor === 'number' ? valor.toFixed(2) : valor}`);
    }
    linhas.push('');
  }

  // Cabeçalho da tabela
  if (relatorio.dados.length > 0) {
    const colunas = Object.keys(relatorio.dados[0]);
    linhas.push(colunas.map((c) => `"${c}"`).join(','));

    // Dados
    for (const linha of relatorio.dados) {
      const valores = colunas.map((col) => {
        const valor = linha[col];
        if (typeof valor === 'string' && valor.includes(',')) {
          return `"${valor}"`;
        }
        return typeof valor === 'number' ? valor.toFixed(2) : valor || '';
      });
      linhas.push(valores.join(','));
    }
  }

  return linhas.join('\n');
}

/**
 * Gerar HTML para PDF
 */
export function gerarHTML(relatorio: DadosRelatorio): string {
  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${relatorio.titulo}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 20px;
      color: #333;
    }
    .header {
      border-bottom: 3px solid #3B82F6;
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    h1 {
      margin: 0 0 5px 0;
      color: #1F2937;
    }
    .meta {
      font-size: 12px;
      color: #6B7280;
    }
    .resumo {
      background-color: #F3F4F6;
      border-left: 4px solid #3B82F6;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .resumo-item {
      display: inline-block;
      margin-right: 30px;
    }
    .resumo-label {
      font-size: 12px;
      color: #6B7280;
      text-transform: uppercase;
    }
    .resumo-valor {
      font-size: 24px;
      font-weight: bold;
      color: #1F2937;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th {
      background-color: #F3F4F6;
      border: 1px solid #D1D5DB;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      color: #1F2937;
    }
    td {
      border: 1px solid #D1D5DB;
      padding: 10px;
      text-align: left;
    }
    tr:nth-child(even) {
      background-color: #FAFAFA;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #D1D5DB;
      font-size: 12px;
      color: #6B7280;
      text-align: center;
    }
    @media print {
      body { margin: 0; padding: 10mm; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${relatorio.titulo}</h1>
    <div class="meta">
      <p>Período: <strong>${relatorio.periodo}</strong></p>
      <p>Gerado em: <strong>${new Date(relatorio.geradoEm).toLocaleString('pt-BR')}</strong></p>
    </div>
  </div>

  ${
    relatorio.totalizadores && Object.keys(relatorio.totalizadores).length > 0
      ? `
  <div class="resumo">
    ${Object.entries(relatorio.totalizadores)
      .map(([chave, valor]) => {
        const labelFormatado = chave
          .split('_')
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(' ');
        const valorFormatado =
          typeof valor === 'number'
            ? valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
            : valor;
        return `
      <div class="resumo-item">
        <div class="resumo-label">${labelFormatado}</div>
        <div class="resumo-valor">${valorFormatado}</div>
      </div>
    `;
      })
      .join('')}
  </div>
  `
      : ''
  }

  ${
    relatorio.dados.length > 0
      ? `
  <table>
    <thead>
      <tr>
        ${Object.keys(relatorio.dados[0])
          .map((col) => `<th>${col}</th>`)
          .join('')}
      </tr>
    </thead>
    <tbody>
      ${relatorio.dados
        .map(
          (linha) =>
            `<tr>${Object.values(linha)
              .map((valor) => {
                const valorFormatado =
                  typeof valor === 'number'
                    ? valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                    : valor || '';
                return `<td>${valorFormatado}</td>`;
              })
              .join('')}</tr>`
        )
        .join('')}
    </tbody>
  </table>
  `
      : '<p>Sem dados para o período selecionado.</p>'
  }

  <div class="footer">
    <p>Este relatório foi gerado automaticamente pelo sistema CRMT Lucide.</p>
  </div>
</body>
</html>
  `;

  return html;
}

/**
 * Exportar para arquivo
 */
export async function exportarRelatorio(
  config: ConfiguracaoRelatorio
): Promise<{
  sucesso: boolean;
  conteudo?: string;
  nomeArquivo?: string;
  tipo?: string;
  erro?: string;
}> {
  try {
    const relatorio = await prepararDadosRelatorio(config);

    let conteudo: string;
    let nomeArquivo: string;
    let tipo: string;

    const timestamp = new Date().toISOString().split('T')[0];

    switch (config.tipo) {
      case 'csv': {
        conteudo = gerarCSV(relatorio);
        nomeArquivo = `relatorio_${config.formato}_${timestamp}.csv`;
        tipo = 'text/csv';
        break;
      }

      case 'pdf': {
        conteudo = gerarHTML(relatorio);
        nomeArquivo = `relatorio_${config.formato}_${timestamp}.html`;
        tipo = 'text/html';
        // TODO: Converter para PDF com puppeteer ou similar
        break;
      }

      case 'excel': {
        conteudo = gerarCSV(relatorio); // Simplificado - usar xlsx para real
        nomeArquivo = `relatorio_${config.formato}_${timestamp}.csv`;
        tipo = 'text/csv';
        // TODO: Usar xlsx library para formatar como Excel
        break;
      }

      default:
        return { sucesso: false, erro: 'Tipo de arquivo não suportado' };
    }

    return {
      sucesso: true,
      conteudo,
      nomeArquivo,
      tipo,
    };
  } catch (erro) {
    console.error('Erro ao exportar relatório:', erro);
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
    };
  }
}
