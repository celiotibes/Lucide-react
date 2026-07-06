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

import type { Pool } from 'pg';
import { calcularJurosMulta } from '../financeiro/jurosMulta';

export type EventoRegua = 'D5' | 'D15' | 'D30';

export interface ResultadoProcessamentoFatura {
  faturaId: string;
  diasAtraso: number;
  valorAtualizado: number;
  eventosRegistrados: EventoRegua[];
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
}

export async function processarReguaCobranca(
  pool: Pool,
  dataReferencia: Date = new Date(),
): Promise<ResultadoProcessamentoFatura[]> {
  const { rows: faturas } = await pool.query<LinhaFatura>(
    `select id, valor_bruto, vencimento, status, permite_acordo
     from faturas
     where status in ('aberta', 'atrasada')
       and vencimento < $1::date`,
    [formatarDataISO(dataReferencia)],
  );

  const resultados: ResultadoProcessamentoFatura[] = [];

  for (const fatura of faturas) {
    const calculo = calcularJurosMulta({
      valorOriginal: Number(fatura.valor_bruto),
      dataVencimento: new Date(fatura.vencimento),
      dataReferencia,
      permiteAcordo: fatura.permite_acordo,
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
    });
  }

  return resultados;
}

function formatarDataISO(data: Date): string {
  return data.toISOString().slice(0, 10);
}
