// Elo entre o banco e os serializadores puros de server/relatorios/
// (docs/15-relatorios-exportaveis.md): lê os dados de um período e devolve
// tanto as linhas estruturadas quanto o texto já pronto para exportar.
//
// Três relatórios, dois regimes contábeis distintos (mesma distinção já
// documentada no comentário da tabela `faturas`):
//   - Faturas (CSV): regime de COMPETÊNCIA — o que foi faturado no
//     período, independente de ter sido pago.
//   - Despesas de prestadores (CSV): idem, regime de competência — custos
//     incorridos (folha de prestadores fixos + custos avulsos de ordem de
//     serviço), sem inventar uma fórmula de total que combine
//     `valor_base`/`adicional_pct`/km sem confirmação contratual — os
//     campos crus são exportados separados, quem importa decide a soma.
//   - Extrato de cobranças pagas (OFX): regime de CAIXA — dinheiro que
//     efetivamente entrou via Asaas, formato padrão de conciliação
//     bancária que sistemas contábeis importam.

import type { Pool } from 'pg';
import { adicionarBOM, gerarCSV, type ColunaCSV } from '../relatorios/csv';
import { gerarOFX, type TransacaoOFX } from '../relatorios/ofx';

export interface PeriodoRelatorio {
  inicio: Date;
  fim: Date;
}

// ---------------------------------------------------------------------------
// Faturas (contas a receber, regime de competência)
// ---------------------------------------------------------------------------

export interface LinhaRelatorioFatura {
  faturaId: string;
  competencia: string;
  vencimento: string;
  tipo: string;
  status: string;
  imovel: string;
  contraparte: string | null;
  valorBruto: number;
  valorLiquido: number;
}

interface LinhaFaturaBanco {
  id: string;
  competencia: Date;
  vencimento: Date;
  tipo: string;
  status: string;
  imovel: string;
  contraparte: string | null;
  valor_bruto: string;
  valor_liquido: string;
}

export async function buscarFaturasParaRelatorio(pool: Pool, periodo: PeriodoRelatorio): Promise<LinhaRelatorioFatura[]> {
  const { rows } = await pool.query<LinhaFaturaBanco>(
    `select f.id, f.competencia, f.vencimento, f.tipo, f.status,
            i.identificacao as imovel,
            p.nome as contraparte,
            f.valor_bruto, f.valor_liquido
     from faturas f
     join imoveis i on i.id = f.imovel_id
     left join contrato_partes cp on cp.contrato_id = f.contrato_id and cp.papel = 'locatario_principal'
     left join pessoas p on p.id = cp.pessoa_id
     where f.competencia >= $1::date and f.competencia <= $2::date
     order by f.competencia, i.identificacao`,
    [formatarDataISO(periodo.inicio), formatarDataISO(periodo.fim)],
  );

  return rows.map((r) => ({
    faturaId: r.id,
    competencia: formatarDataISO(r.competencia),
    vencimento: formatarDataISO(r.vencimento),
    tipo: r.tipo,
    status: r.status,
    imovel: r.imovel,
    contraparte: r.contraparte,
    valorBruto: Number(r.valor_bruto),
    valorLiquido: Number(r.valor_liquido),
  }));
}

const COLUNAS_RELATORIO_FATURAS: ColunaCSV<LinhaRelatorioFatura>[] = [
  { cabecalho: 'Competência', valor: (l) => l.competencia },
  { cabecalho: 'Vencimento', valor: (l) => l.vencimento },
  { cabecalho: 'Tipo', valor: (l) => l.tipo },
  { cabecalho: 'Imóvel', valor: (l) => l.imovel },
  { cabecalho: 'Locatário', valor: (l) => l.contraparte ?? '' },
  { cabecalho: 'Valor bruto', valor: (l) => l.valorBruto },
  { cabecalho: 'Valor líquido', valor: (l) => l.valorLiquido },
  { cabecalho: 'Status', valor: (l) => l.status },
];

export async function exportarRelatorioFaturasCSV(pool: Pool, periodo: PeriodoRelatorio): Promise<string> {
  const linhas = await buscarFaturasParaRelatorio(pool, periodo);
  return adicionarBOM(gerarCSV(linhas, COLUNAS_RELATORIO_FATURAS));
}

// ---------------------------------------------------------------------------
// Despesas de prestadores (contas a pagar, regime de competência)
// ---------------------------------------------------------------------------

export interface LinhaRelatorioDespesa {
  origem: 'folha_prestador' | 'custo_os';
  data: string;
  prestador: string | null;
  categoria: string;
  descricao: string;
  valorBase: number;
  adicionalPct: number | null;
  imovel: string | null;
}

interface LinhaFolhaBanco {
  data: Date;
  prestador: string;
  tipo: string;
  motivo_adicional: string | null;
  valor_base: string;
  adicional_pct: string;
  imovel: string | null;
}

interface LinhaCustoOsBanco {
  criado_em: Date;
  categoria: string;
  descricao: string;
  valor: string;
  imovel: string | null;
  residencial: string | null;
}

export async function buscarDespesasParaRelatorio(pool: Pool, periodo: PeriodoRelatorio): Promise<LinhaRelatorioDespesa[]> {
  const { rows: folha } = await pool.query<LinhaFolhaBanco>(
    `select lp.data, p.nome as prestador, lp.tipo, lp.motivo_adicional, lp.valor_base, lp.adicional_pct,
            i.identificacao as imovel
     from lancamentos_prestador lp
     join pessoas p on p.id = lp.prestador_id
     left join imoveis i on i.id = lp.imovel_id
     where lp.data >= $1::date and lp.data <= $2::date
     order by lp.data`,
    [formatarDataISO(periodo.inicio), formatarDataISO(periodo.fim)],
  );

  const { rows: custosOs } = await pool.query<LinhaCustoOsBanco>(
    `select osc.criado_em, os.categoria, osc.descricao, osc.valor,
            i.identificacao as imovel, r.nome as residencial
     from ordem_servico_custos osc
     join ordens_servico os on os.id = osc.ordem_servico_id
     left join imoveis i on i.id = os.imovel_id
     left join residenciais r on r.id = os.residencial_id
     where osc.criado_em >= $1::date and osc.criado_em < ($2::date + interval '1 day')
     order by osc.criado_em`,
    [formatarDataISO(periodo.inicio), formatarDataISO(periodo.fim)],
  );

  const linhasFolha: LinhaRelatorioDespesa[] = folha.map((f) => ({
    origem: 'folha_prestador',
    data: formatarDataISO(f.data),
    prestador: f.prestador,
    categoria: f.tipo,
    descricao: f.motivo_adicional ?? f.tipo,
    valorBase: Number(f.valor_base),
    adicionalPct: Number(f.adicional_pct),
    imovel: f.imovel,
  }));

  const linhasCustoOs: LinhaRelatorioDespesa[] = custosOs.map((c) => ({
    origem: 'custo_os',
    data: formatarDataISO(c.criado_em),
    prestador: null,
    categoria: c.categoria,
    descricao: c.descricao,
    valorBase: Number(c.valor),
    adicionalPct: null,
    imovel: c.imovel ?? c.residencial,
  }));

  return [...linhasFolha, ...linhasCustoOs].sort((a, b) => a.data.localeCompare(b.data));
}

const COLUNAS_RELATORIO_DESPESAS: ColunaCSV<LinhaRelatorioDespesa>[] = [
  { cabecalho: 'Data', valor: (l) => l.data },
  { cabecalho: 'Origem', valor: (l) => (l.origem === 'folha_prestador' ? 'Folha de prestador' : 'Custo de OS') },
  { cabecalho: 'Prestador', valor: (l) => l.prestador ?? '' },
  { cabecalho: 'Categoria', valor: (l) => l.categoria },
  { cabecalho: 'Descrição', valor: (l) => l.descricao },
  { cabecalho: 'Valor base', valor: (l) => l.valorBase },
  { cabecalho: 'Adicional %', valor: (l) => (l.adicionalPct === null ? '' : l.adicionalPct * 100) },
  { cabecalho: 'Centro de custo', valor: (l) => l.imovel ?? '' },
];

export async function exportarRelatorioDespesasCSV(pool: Pool, periodo: PeriodoRelatorio): Promise<string> {
  const linhas = await buscarDespesasParaRelatorio(pool, periodo);
  return adicionarBOM(gerarCSV(linhas, COLUNAS_RELATORIO_DESPESAS));
}

// ---------------------------------------------------------------------------
// Extrato de cobranças pagas (regime de caixa, OFX)
// ---------------------------------------------------------------------------

interface LinhaCobrancaBanco {
  id: string;
  data_pagamento: Date;
  valor_cobrado: string;
  tipo: string;
  imovel: string;
}

export async function exportarExtratoCobrancasOFX(pool: Pool, periodo: PeriodoRelatorio): Promise<string> {
  const { rows } = await pool.query<LinhaCobrancaBanco>(
    `select ca.id, ca.data_pagamento, ca.valor_cobrado, ca.tipo, i.identificacao as imovel
     from cobrancas_asaas ca
     join faturas f on f.id = ca.fatura_id
     join imoveis i on i.id = f.imovel_id
     where ca.status = 'pago' and ca.data_pagamento is not null
       and ca.data_pagamento >= $1::date and ca.data_pagamento < ($2::date + interval '1 day')
     order by ca.data_pagamento`,
    [formatarDataISO(periodo.inicio), formatarDataISO(periodo.fim)],
  );

  const transacoes: TransacaoOFX[] = rows.map((r) => ({
    id: r.id,
    data: r.data_pagamento,
    valor: Number(r.valor_cobrado),
    descricao: `${r.tipo === 'pix' ? 'PIX' : 'Boleto'} - ${r.imovel}`,
  }));

  return gerarOFX(transacoes, { contaId: 'ASAAS', dataInicio: periodo.inicio, dataFim: periodo.fim });
}

function formatarDataISO(data: Date): string {
  return data.toISOString().slice(0, 10);
}
