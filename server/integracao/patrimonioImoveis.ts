// Liga o cadastro de financiamento/hipoteca por imóvel ao cálculo puro
// de patrimônio líquido (server/financeiro/patrimonioLiquido.ts,
// docs/33). `registrarFinanciamentoImovel` só valida e grava — a decisão
// de quitar um financiamento (`status = 'quitado'`) é humana, não
// automática por data.

import type { Pool } from 'pg';
import {
  calcularPatrimonioLiquidoConsolidado,
  calcularPatrimonioLiquidoImovel,
  type ResultadoPatrimonioConsolidado,
  type ResultadoPatrimonioImovel,
} from '../financeiro/patrimonioLiquido';

export interface DadosFinanciamentoImovel {
  imovelId: string;
  tipo: 'financiamento_bancario' | 'consorcio_hipoteca';
  instituicao?: string | null;
  valorFinanciado?: number | null;
  valorParcela: number;
  saldoDevedor?: number | null;
  dataInicio?: string | null;
  numeroParcelas?: number | null;
  observacao?: string | null;
}

export type ResultadoRegistrarFinanciamento = { sucesso: true; id: string } | { sucesso: false; erro: string };

export async function registrarFinanciamentoImovel(
  pool: Pool,
  dados: DadosFinanciamentoImovel,
): Promise<ResultadoRegistrarFinanciamento> {
  if (!dados.imovelId) {
    return { sucesso: false, erro: 'Selecione o imóvel.' };
  }
  if (!['financiamento_bancario', 'consorcio_hipoteca'].includes(dados.tipo)) {
    return { sucesso: false, erro: 'Tipo de financiamento inválido.' };
  }
  if (!(dados.valorParcela >= 0)) {
    return { sucesso: false, erro: 'Valor da parcela deve ser zero ou positivo.' };
  }

  try {
    const { rows } = await pool.query<{ id: string }>(
      `insert into financiamentos_imoveis
         (imovel_id, tipo, instituicao, valor_financiado, valor_parcela, saldo_devedor, data_inicio, numero_parcelas, observacao)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id`,
      [
        dados.imovelId,
        dados.tipo,
        dados.instituicao ?? null,
        dados.valorFinanciado ?? null,
        dados.valorParcela,
        dados.saldoDevedor ?? null,
        dados.dataInicio ?? null,
        dados.numeroParcelas ?? null,
        dados.observacao ?? null,
      ],
    );
    return { sucesso: true, id: rows[0].id };
  } catch (e) {
    return { sucesso: false, erro: `Não foi possível salvar: ${e instanceof Error ? e.message : 'erro desconhecido'}` };
  }
}

export async function marcarFinanciamentoQuitado(pool: Pool, id: string): Promise<void> {
  await pool.query(`update financiamentos_imoveis set status = 'quitado', atualizado_em = now() where id = $1`, [id]);
}

export async function calcularPatrimonioLiquidoDoImovel(pool: Pool, imovelId: string): Promise<ResultadoPatrimonioImovel> {
  const { rows: imovelRows } = await pool.query<{ valor_avaliacao: string | null }>(
    `select valor_avaliacao from imoveis where id = $1`,
    [imovelId],
  );
  const { rows: financiamentos } = await pool.query<{ valor_parcela: string; saldo_devedor: string | null }>(
    `select valor_parcela, saldo_devedor from financiamentos_imoveis where imovel_id = $1 and status = 'ativo'`,
    [imovelId],
  );

  return calcularPatrimonioLiquidoImovel({
    imovelId,
    valorAvaliacao: imovelRows[0]?.valor_avaliacao ? Number(imovelRows[0].valor_avaliacao) : null,
    financiamentosAtivos: financiamentos.map((f) => ({
      valorParcela: Number(f.valor_parcela),
      saldoDevedor: f.saldo_devedor === null ? null : Number(f.saldo_devedor),
    })),
  });
}

export async function calcularPatrimonioLiquidoDoPortfolio(pool: Pool): Promise<ResultadoPatrimonioConsolidado> {
  const { rows: imoveis } = await pool.query<{ id: string; valor_avaliacao: string | null }>(
    `select id, valor_avaliacao from imoveis order by identificacao`,
  );
  const { rows: financiamentos } = await pool.query<{ imovel_id: string; valor_parcela: string; saldo_devedor: string | null }>(
    `select imovel_id, valor_parcela, saldo_devedor from financiamentos_imoveis where status = 'ativo'`,
  );

  const entradas = imoveis.map((imovel) => ({
    imovelId: imovel.id,
    valorAvaliacao: imovel.valor_avaliacao ? Number(imovel.valor_avaliacao) : null,
    financiamentosAtivos: financiamentos
      .filter((f) => f.imovel_id === imovel.id)
      .map((f) => ({
        valorParcela: Number(f.valor_parcela),
        saldoDevedor: f.saldo_devedor === null ? null : Number(f.saldo_devedor),
      })),
  }));

  return calcularPatrimonioLiquidoConsolidado(entradas);
}
