// Elo entre o schema (database/schema.sql) e o cálculo puro
// (server/financeiro/jurosMulta.ts): lê faturas em aberto vencidas,
// recalcula o valor atualizado, grava de volta, e registra a passagem
// pelos marcos da régua de cobrança (D5/D15/D30 — docs/04-roadmap-fases.md).
//
// Este módulo NÃO envia WhatsApp/e-mail — isso é responsabilidade do n8n
// (docs/03-arquitetura-e-stack.md: n8n orquestra, não calcula). O que esta
// função faz é a parte que precisa ser correta e testável: decidir que
// marco foi cruzado e gravar isso de forma idempotente, para que rodar o
// job duas vezes no mesmo dia (reinício do cron, retry de falha) nunca
// duplique um evento nem dispare uma notificação duas vezes.
//
// Quando `permite_acordo = true` na fatura, os marcos da régua NÃO são
// registrados — não faz sentido notificar cobrança de atraso numa fatura
// que já está em acordo/renegociação (mesma suspensão de juros/multa já
// aplicada por calcularJurosMulta).
//
// Política de cobrança por contrato (docs/10-auditoria-contrato-real.md):
// juros/multa/honorários variam de contrato para contrato — um contrato
// real assinado (Kitnet 16, João Pottker) usa multa em degraus (2%/10%) e
// juros de 1% a.m., diferente do que este sistema assumia antes. Por isso
// a política é lida de `contrato_politica_cobranca`; contratos sem uma
// linha própria cadastrada caem no fallback `POLITICA_COBRANCA_GENERICA`
// (explicitamente marcado como não confirmado contra nenhum contrato real
// — ver server/financeiro/jurosMulta.ts).

import type { Pool } from 'pg';
import { calcularJurosMulta, POLITICA_COBRANCA_GENERICA, type PoliticaCobranca } from '../financeiro/jurosMulta';

export type EventoRegua = 'D5' | 'D15' | 'D30';

export interface ResultadoProcessamentoFatura {
  faturaId: string;
  diasAtraso: number;
  valorAtualizado: number;
  eventosRegistrados: EventoRegua[];
  politicaGenericaUsada: boolean;
}

const LIMIARES: Array<{ evento: EventoRegua; dias: number }> = [
  { evento: 'D5', dias: 5 },
  { evento: 'D15', dias: 15 },
  { evento: 'D30', dias: 30 },
];

interface LinhaFatura {
  id: string;
  valor_bruto: string;
  vencimento: string;
  status: string;
  permite_acordo: boolean;
  multa_ate_5_dias_pct: string | null;
  dias_limite_multa_reduzida: number | null;
  multa_apos_5_dias_pct: string | null;
  juros_pct_am: string | null;
  honorarios_pct: string | null;
  honorarios_somente_se_judicial: boolean | null;
  dias_gatilho_honorarios_automatico: number | null;
}

export async function processarReguaCobranca(
  pool: Pool,
  dataReferencia: Date = new Date(),
): Promise<ResultadoProcessamentoFatura[]> {
  const { rows: faturas } = await pool.query<LinhaFatura>(
    `select f.id, f.valor_bruto, f.vencimento, f.status, f.permite_acordo,
            pc.multa_ate_5_dias_pct, pc.dias_limite_multa_reduzida, pc.multa_apos_5_dias_pct,
            pc.juros_pct_am, pc.honorarios_pct, pc.honorarios_somente_se_judicial,
            pc.dias_gatilho_honorarios_automatico
     from faturas f
     left join contrato_politica_cobranca pc on pc.contrato_id = f.contrato_id
     where f.status in ('aberta', 'atrasada')
       and f.vencimento < $1::date`,
    [formatarDataISO(dataReferencia)],
  );

  const resultados: ResultadoProcessamentoFatura[] = [];

  for (const fatura of faturas) {
    const { politica, politicaGenericaUsada } = resolverPolitica(fatura);

    const calculo = calcularJurosMulta({
      valorOriginal: Number(fatura.valor_bruto),
      dataVencimento: new Date(fatura.vencimento),
      dataReferencia,
      permiteAcordo: fatura.permite_acordo,
      politica,
    });

    if (calculo.diasAtraso <= 0) {
      continue;
    }

    await pool.query(
      `update faturas set status = 'atrasada', valor_liquido = $1, atualizado_em = now() where id = $2`,
      [calculo.valorAtualizado, fatura.id],
    );

    const eventosRegistrados: EventoRegua[] = [];

    if (!fatura.permite_acordo) {
      for (const { evento, dias } of LIMIARES) {
        if (calculo.diasAtraso >= dias) {
          const { rowCount } = await pool.query(
            `insert into regua_cobranca_eventos (fatura_id, evento, canal)
             values ($1, $2, 'whatsapp')
             on conflict (fatura_id, evento) do nothing`,
            [fatura.id, evento],
          );
          if (rowCount && rowCount > 0) {
            eventosRegistrados.push(evento);
          }
        }
      }
    }

    resultados.push({
      faturaId: fatura.id,
      diasAtraso: calculo.diasAtraso,
      valorAtualizado: calculo.valorAtualizado,
      eventosRegistrados,
      politicaGenericaUsada,
    });
  }

  return resultados;
}

function resolverPolitica(fatura: LinhaFatura): { politica: PoliticaCobranca; politicaGenericaUsada: boolean } {
  if (fatura.multa_ate_5_dias_pct === null) {
    return { politica: POLITICA_COBRANCA_GENERICA, politicaGenericaUsada: true };
  }

  return {
    politicaGenericaUsada: false,
    politica: {
      multaInicialPct: Number(fatura.multa_ate_5_dias_pct),
      diasLimiteMultaInicial: fatura.dias_limite_multa_reduzida!,
      multaAposLimitePct: Number(fatura.multa_apos_5_dias_pct),
      jurosPctAoMes: Number(fatura.juros_pct_am),
      honorariosPct: Number(fatura.honorarios_pct),
      gatilhoHonorarios: fatura.honorarios_somente_se_judicial
        ? { tipo: 'somente_se_necessario_judicial' }
        : { tipo: 'automatico_apos_dias', dias: fatura.dias_gatilho_honorarios_automatico! },
    },
  };
}

function formatarDataISO(data: Date): string {
  return data.toISOString().slice(0, 10);
}
