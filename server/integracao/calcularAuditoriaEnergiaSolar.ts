// Liga a geração solar confirmada (`geracao_solar`) e a fatura Celesc GD
// confirmada (`faturas_celesc_gd`) ao que já foi cobrado dos inquilinos
// (mesma leitura pareada atual/anterior que `faturarEnergia.ts` já usa,
// somada por residencial) e roda `calcularAuditoriaEnergiaSolar` (função
// pura, `server/energia/auditoriaGeracaoSolar.ts`). Só processa
// competências com os dois dados de origem já confirmados por um humano
// — nunca estima geração ou fatura Celesc a partir de dado pendente
// (mesmo princípio de `faturarEnergia.ts`: dado insuficiente é pulado,
// não vira número inventado).

import type { Pool } from 'pg';
import { calcularAuditoriaEnergiaSolar } from '../energia/auditoriaGeracaoSolar';

export type MotivoNaoCalculado = 'sem_geracao_confirmada' | 'sem_fatura_celesc_confirmada' | 'sem_leitura_de_inquilino_no_periodo';

export interface ResultadoCalculoAuditoria {
  calculada: true;
  auditoriaId: string;
  areaComumKwh: number;
  areaComumValor: number;
  resultadoFinanceiroValor: number;
  inconsistente: boolean;
}

export interface ResultadoNaoCalculado {
  calculada: false;
  motivo: MotivoNaoCalculado;
}

export async function calcularAuditoriaEnergiaSolarDoResidencial(
  pool: Pool,
  residencialId: string,
  competencia: Date,
): Promise<ResultadoCalculoAuditoria | ResultadoNaoCalculado> {
  const competenciaISO = formatarPrimeiroDiaDoMes(competencia);

  const { rows: geracaoRows } = await pool.query<{ energia_gerada_kwh: string }>(
    `select energia_gerada_kwh from geracao_solar
     where residencial_id = $1 and competencia = $2 and status = 'confirmada'`,
    [residencialId, competenciaISO],
  );
  if (geracaoRows.length === 0) {
    return { calculada: false, motivo: 'sem_geracao_confirmada' };
  }

  const { rows: celescRows } = await pool.query<{
    valor_total: string;
    energia_injetada_kwh: string;
    energia_consumida_rede_kwh: string;
  }>(
    `select valor_total, energia_injetada_kwh, energia_consumida_rede_kwh from faturas_celesc_gd
     where residencial_id = $1 and competencia = $2 and status = 'confirmada'`,
    [residencialId, competenciaISO],
  );
  if (celescRows.length === 0) {
    return { calculada: false, motivo: 'sem_fatura_celesc_confirmada' };
  }

  // Mesmo pareamento leitura atual/anterior de faturarEnergia.ts, somado
  // por todos os imóveis do residencial nesta competência.
  const { rows: consumoRows } = await pool.query<{ total_kwh: string | null; total_valor: string | null }>(
    `select
       sum(le.leitura_kwh - anterior.leitura_kwh) as total_kwh,
       sum(f.valor_liquido) as total_valor
     from leituras_energia le
     join imoveis i on i.id = le.imovel_id
     join lateral (
       select leitura_kwh from leituras_energia
       where imovel_id = le.imovel_id and status = 'confirmada' and data_leitura < le.data_leitura
       order by data_leitura desc limit 1
     ) anterior on true
     left join faturas f on f.imovel_id = le.imovel_id and f.tipo = 'energia' and f.competencia = $2
     where i.residencial_id = $1
       and le.status = 'confirmada'
       and date_trunc('month', le.data_leitura) = $2::date`,
    [residencialId, competenciaISO],
  );
  const totalCobradoInquilinosKwh = Number(consumoRows[0]?.total_kwh ?? 0);
  const totalCobradoInquilinosValor = Number(consumoRows[0]?.total_valor ?? 0);
  if (totalCobradoInquilinosKwh === 0) {
    return { calculada: false, motivo: 'sem_leitura_de_inquilino_no_periodo' };
  }

  const tarifaCelescVigente = Number(celescRows[0].valor_total) / Number(celescRows[0].energia_consumida_rede_kwh || 1);

  const resultado = calcularAuditoriaEnergiaSolar({
    energiaGeradaTotalKwh: Number(geracaoRows[0].energia_gerada_kwh),
    energiaInjetadaKwh: Number(celescRows[0].energia_injetada_kwh),
    energiaConsumidaRedeKwh: Number(celescRows[0].energia_consumida_rede_kwh),
    totalCobradoInquilinosKwh,
    totalCobradoInquilinosValor,
    tarifaCelescVigente,
  });

  const { rows: inseridas } = await pool.query<{ id: string }>(
    `insert into auditorias_energia_solar
       (residencial_id, competencia, energia_gerada_total_kwh, energia_injetada_kwh,
        consumo_proprio_instantaneo_kwh, energia_consumida_rede_kwh, total_consumido_kwh,
        total_cobrado_inquilinos_kwh, total_cobrado_inquilinos_valor, area_comum_kwh, area_comum_valor,
        resultado_financeiro_valor)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (residencial_id, competencia) do update set
       energia_gerada_total_kwh = excluded.energia_gerada_total_kwh,
       energia_injetada_kwh = excluded.energia_injetada_kwh,
       consumo_proprio_instantaneo_kwh = excluded.consumo_proprio_instantaneo_kwh,
       energia_consumida_rede_kwh = excluded.energia_consumida_rede_kwh,
       total_consumido_kwh = excluded.total_consumido_kwh,
       total_cobrado_inquilinos_kwh = excluded.total_cobrado_inquilinos_kwh,
       total_cobrado_inquilinos_valor = excluded.total_cobrado_inquilinos_valor,
       area_comum_kwh = excluded.area_comum_kwh,
       area_comum_valor = excluded.area_comum_valor,
       resultado_financeiro_valor = excluded.resultado_financeiro_valor,
       calculado_em = now()
     returning id`,
    [
      residencialId,
      competenciaISO,
      Number(geracaoRows[0].energia_gerada_kwh),
      Number(celescRows[0].energia_injetada_kwh),
      resultado.consumoProprioInstantaneoKwh,
      Number(celescRows[0].energia_consumida_rede_kwh),
      resultado.totalConsumidoKwh,
      totalCobradoInquilinosKwh,
      totalCobradoInquilinosValor,
      resultado.areaComumKwh,
      resultado.areaComumValor,
      resultado.resultadoFinanceiroValor,
    ],
  );

  return {
    calculada: true,
    auditoriaId: inseridas[0].id,
    areaComumKwh: resultado.areaComumKwh,
    areaComumValor: resultado.areaComumValor,
    resultadoFinanceiroValor: resultado.resultadoFinanceiroValor,
    inconsistente: resultado.inconsistente,
  };
}

function formatarPrimeiroDiaDoMes(data: Date): string {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
