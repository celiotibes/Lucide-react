// Elo entre leituras de energia confirmadas e o cálculo puro
// (server/energia/calcularFaturaEnergia.ts): para cada leitura confirmada
// de um mês de competência ainda não faturado, busca a leitura anterior,
// resolve a tarifa vigente (por distribuidora — derivada da cidade do
// imóvel, docs/11-energia-individual-e-bandeiras.md) e grava uma fatura
// tipo 'energia' com os itens discriminados (consumo + taxa administrativa
// de 25%, sempre descritos separadamente — auditoria item 1).
//
// Confirmado pelo cliente: energia é cobrada por medidor individual em
// cada imóvel (não é uma franquia compartilhada como água), com tarifa
// dependente da bandeira vigente (verde/amarela/vermelha_1/vermelha_2) —
// exatamente o que `tarifas_energia.bandeira` já modelava desde o início.
//
// Leituras sem leitura anterior confirmada, ou sem tarifa cadastrada para
// a distribuidora/competência, são deliberadamente PULADAS (não geram
// fatura, não lançam erro) — ficam para revisão manual, porque faturar
// sem dado suficiente seria pior que não faturar (auditoria item 7: OCR/
// leitura nunca é fonte de verdade sozinha).

import type { Pool } from 'pg';
import { calcularFaturaEnergia } from '../energia/calcularFaturaEnergia';

export interface ResultadoFaturamentoEnergia {
  leituraId: string;
  imovelId: string;
  faturaId: string;
  valorTotal: number;
}

export interface ItemPulado {
  leituraId: string;
  motivo: 'sem_leitura_anterior' | 'sem_tarifa_vigente' | 'sem_contrato_vinculado';
}

export interface ResultadoFaturamentoLote {
  faturadas: ResultadoFaturamentoEnergia[];
  puladas: ItemPulado[];
}

interface LinhaLeituraPendente {
  id: string;
  imovel_id: string;
  contrato_id: string | null;
  leitura_kwh: string;
  data_leitura: string;
  franquia_energia_kwh: string;
  taxa_administracao_energia_pct: string;
  distribuidora_energia: string | null;
}

export async function faturarEnergiaConfirmada(pool: Pool, competencia: Date): Promise<ResultadoFaturamentoLote> {
  const competenciaISO = formatarPrimeiroDiaDoMes(competencia);

  const { rows: leituras } = await pool.query<LinhaLeituraPendente>(
    `select le.id, le.imovel_id, le.contrato_id, le.leitura_kwh, le.data_leitura,
            i.franquia_energia_kwh, i.taxa_administracao_energia_pct, c.distribuidora_energia
     from leituras_energia le
     join imoveis i on i.id = le.imovel_id
     join cidades c on c.id = i.cidade_id
     where le.status = 'confirmada'
       and date_trunc('month', le.data_leitura) = $1::date
       and not exists (
         select 1 from faturas f
         where f.imovel_id = le.imovel_id and f.tipo = 'energia' and f.competencia = $1::date
       )
     order by le.data_leitura`,
    [competenciaISO],
  );

  const faturadas: ResultadoFaturamentoEnergia[] = [];
  const puladas: ItemPulado[] = [];

  for (const leitura of leituras) {
    if (!leitura.contrato_id) {
      puladas.push({ leituraId: leitura.id, motivo: 'sem_contrato_vinculado' });
      continue;
    }

    const { rows: anteriorRows } = await pool.query<{ leitura_kwh: string }>(
      `select leitura_kwh from leituras_energia
       where imovel_id = $1 and status = 'confirmada' and data_leitura < $2
       order by data_leitura desc limit 1`,
      [leitura.imovel_id, leitura.data_leitura],
    );
    if (anteriorRows.length === 0) {
      puladas.push({ leituraId: leitura.id, motivo: 'sem_leitura_anterior' });
      continue;
    }

    const { rows: tarifaRows } = await pool.query<{ te_valor: string; tusd_valor: string }>(
      `select te_valor, tusd_valor from tarifas_energia
       where distribuidora = $1 and vigencia_inicio <= $2
       order by vigencia_inicio desc limit 1`,
      [leitura.distribuidora_energia, leitura.data_leitura],
    );
    if (tarifaRows.length === 0) {
      puladas.push({ leituraId: leitura.id, motivo: 'sem_tarifa_vigente' });
      continue;
    }

    const { rows: contratoRows } = await pool.query<{ dia_vencimento: number }>(
      `select dia_vencimento from contratos where id = $1`,
      [leitura.contrato_id],
    );

    const calculo = calcularFaturaEnergia({
      leituraAnteriorKwh: Number(anteriorRows[0].leitura_kwh),
      leituraAtualKwh: Number(leitura.leitura_kwh),
      franquiaKwh: Number(leitura.franquia_energia_kwh),
      tarifaTePorKwh: Number(tarifaRows[0].te_valor),
      tarifaTusdPorKwh: Number(tarifaRows[0].tusd_valor),
      taxaAdministrativaPct: Number(leitura.taxa_administracao_energia_pct),
    });

    const vencimento = calcularVencimento(competenciaISO, contratoRows[0]?.dia_vencimento ?? 10);

    const { rows: faturaRows } = await pool.query<{ id: string }>(
      `insert into faturas (contrato_id, imovel_id, competencia, tipo, valor_bruto, valor_liquido, vencimento)
       values ($1, $2, $3, 'energia', $4, $4, $5)
       returning id`,
      [leitura.contrato_id, leitura.imovel_id, competenciaISO, calculo.valorTotal, vencimento],
    );
    const faturaId = faturaRows[0].id;

    for (const item of calculo.itens) {
      await pool.query(`insert into fatura_itens (fatura_id, descricao, valor) values ($1, $2, $3)`, [
        faturaId,
        item.descricao,
        item.valor,
      ]);
    }

    faturadas.push({ leituraId: leitura.id, imovelId: leitura.imovel_id, faturaId, valorTotal: calculo.valorTotal });
  }

  return { faturadas, puladas };
}

function formatarPrimeiroDiaDoMes(data: Date): string {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function calcularVencimento(competenciaISO: string, diaVencimento: number): string {
  const [ano, mes] = competenciaISO.split('-').map(Number);
  const proximoMes = new Date(Date.UTC(ano, mes, diaVencimento)); // mes já é 1-indexado aqui -> mês seguinte em UTC 0-indexado
  return proximoMes.toISOString().slice(0, 10);
}
