// Elo entre `planos_manutencao_preventiva` (cronograma recorrente — docs/14)
// e `ordens_servico`: para cada plano ativo vencido, cria a OS da ocorrência
// e avança a próxima data prevista. Mesmo princípio de idempotência de
// `gerarFaturaMensal.ts` (docs/12) — mas aqui a chave de idempotência é
// (plano_manutencao_id, data_agendada) em vez de (contrato, competência).
//
// Decisão deliberada sobre atraso acumulado: se o job não rodar por um
// tempo e um plano ficar várias ocorrências atrasado, cada execução deste
// job gera UMA OS (a ocorrência mais atrasada) e avança a data uma
// periodicidade — não um "flood" de OS retroativas de uma vez. Rodar o job
// diariamente (ou semanalmente) recupera o atraso de forma gradual, uma
// ocorrência por vez, em vez de inundar o zelador/prestador com um backlog
// inteiro no mesmo dia.

import type { Pool } from 'pg';

export interface OrdemServicoPreventivaGerada {
  planoId: string;
  ordemServicoId: string;
  dataAgendada: string;
}

export interface ResultadoGeracaoPreventivas {
  geradas: OrdemServicoPreventivaGerada[];
}

interface LinhaPlano {
  id: string;
  imovel_id: string | null;
  residencial_id: string | null;
  categoria: string;
  descricao: string | null;
  periodicidade_dias: number;
  proxima_execucao: Date; // node-postgres devolve colunas `date` como Date, não string
  prestador_padrao_id: string | null;
}

export async function gerarOrdensServicoPreventivas(
  pool: Pool,
  dataReferencia: Date = new Date(),
): Promise<ResultadoGeracaoPreventivas> {
  const referenciaISO = formatarDataISO(dataReferencia);

  const { rows: planos } = await pool.query<LinhaPlano>(
    `select id, imovel_id, residencial_id, categoria, descricao, periodicidade_dias, proxima_execucao, prestador_padrao_id
     from planos_manutencao_preventiva
     where ativo = true and proxima_execucao <= $1::date
     order by proxima_execucao`,
    [referenciaISO],
  );

  const geradas: OrdemServicoPreventivaGerada[] = [];

  for (const plano of planos) {
    const { rows: existente } = await pool.query<{ id: string }>(
      `select id from ordens_servico where plano_manutencao_id = $1 and data_agendada::date = $2::date`,
      [plano.id, plano.proxima_execucao],
    );

    if (existente.length === 0) {
      const { rows: novaOs } = await pool.query<{ id: string }>(
        `insert into ordens_servico (imovel_id, residencial_id, categoria, descricao, prestador_id, data_agendada, plano_manutencao_id)
         values ($1, $2, $3, $4, $5, $6::date, $7)
         returning id`,
        [
          plano.imovel_id,
          plano.residencial_id,
          plano.categoria,
          plano.descricao,
          plano.prestador_padrao_id,
          plano.proxima_execucao,
          plano.id,
        ],
      );

      geradas.push({
        planoId: plano.id,
        ordemServicoId: novaOs[0].id,
        dataAgendada: formatarDataISO(plano.proxima_execucao),
      });

      const proximaData = somarDias(plano.proxima_execucao, plano.periodicidade_dias);
      await pool.query(`update planos_manutencao_preventiva set proxima_execucao = $1::date where id = $2`, [
        proximaData,
        plano.id,
      ]);
    }
  }

  return { geradas };
}

function formatarDataISO(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function somarDias(data: Date, dias: number): string {
  const resultado = new Date(data);
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return formatarDataISO(resultado);
}
