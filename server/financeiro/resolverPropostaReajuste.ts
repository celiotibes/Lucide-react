// Decide se deve gerar uma NOVA proposta de reajuste em reajustes_contrato,
// dado o vínculo atual (se houver) de um ciclo de reajuste — seja o de
// renovação (renovacoes_contratuais_notificacoes) ou o anual
// (reajustes_anuais_notificacoes). Compartilhado pelos dois porque a regra
// é a mesma:
//   - Já existe proposta viva (proposto/aprovado/aplicado)? Não faz nada.
//   - Proposta anterior foi rejeitada? Só gera outra se houver um percentual
//     de índice MAIS RECENTE que a proposta rejeitada — sem isso ficaria
//     regenerando a mesma proposta rejeitada em loop.
//   - Nunca houve proposta? Tenta gerar; se não houver índice cadastrado,
//     devolve o motivo para a notificação explicar (sem inventar valor).

import type { Pool } from 'pg';
import { calcularReajuste, resolverIndiceContrato, type IndiceReajuste } from './calcularReajuste';

export interface ParametrosResolverProposta {
  contratoId: string;
  valorAtual: number;
  indiceContrato: IndiceReajuste | null;
  indicePadraoSistema: IndiceReajuste;
  /** id de reajustes_contrato atualmente vinculado a este ciclo (null se nenhum ainda). */
  reajusteVinculadoId: string | null;
}

export interface ResultadoResolverProposta {
  /** id a manter vinculado a este ciclo (o mesmo de antes, um novo, ou o mesmo antigo sem sucesso). */
  reajusteId: string | null;
  criouNovaProposta: boolean;
  motivoIndisponivel?: string;
}

interface LinhaReajusteExistente {
  status: string;
  indice: string;
  data_proposta: string;
}

export async function resolverPropostaReajuste(
  pool: Pool,
  params: ParametrosResolverProposta,
): Promise<ResultadoResolverProposta> {
  if (params.reajusteVinculadoId) {
    const { rows } = await pool.query<LinhaReajusteExistente>(
      `select status, indice, data_proposta from reajustes_contrato where id = $1`,
      [params.reajusteVinculadoId],
    );
    const atual = rows[0];

    if (atual && atual.status !== 'rejeitado') {
      // proposto, aprovado ou aplicado: já há uma proposta viva, nada a fazer.
      return { reajusteId: params.reajusteVinculadoId, criouNovaProposta: false };
    }

    if (atual && atual.status === 'rejeitado') {
      const indiceResolvido = resolverIndiceContrato(params.indiceContrato, params.indicePadraoSistema);
      const { rows: indiceRows } = await pool.query<{ percentual_acumulado_12m: string }>(
        `select percentual_acumulado_12m from indices_economicos
         where indice = $1 and competencia > $2
         order by competencia desc limit 1`,
        [indiceResolvido, atual.data_proposta],
      );
      if (!indiceRows[0]) {
        return {
          reajusteId: params.reajusteVinculadoId,
          criouNovaProposta: false,
          motivoIndisponivel:
            'Proposta anterior foi rejeitada e ainda não há um índice mais recente cadastrado para gerar uma nova.',
        };
      }
      // Há índice mais novo que o da proposta rejeitada — segue para gerar uma nova abaixo.
    }
  }

  const indiceResolvido = resolverIndiceContrato(params.indiceContrato, params.indicePadraoSistema);
  const { rows: indiceRows } = await pool.query<{ percentual_acumulado_12m: string }>(
    `select percentual_acumulado_12m from indices_economicos
     where indice = $1
     order by competencia desc limit 1`,
    [indiceResolvido],
  );
  const percentual = indiceRows[0] ? Number(indiceRows[0].percentual_acumulado_12m) : null;

  const calculo = calcularReajuste({
    valorAtual: params.valorAtual,
    indice: indiceResolvido,
    percentualAcumulado12m: percentual,
  });

  if (!calculo.disponivel) {
    return { reajusteId: params.reajusteVinculadoId, criouNovaProposta: false, motivoIndisponivel: calculo.motivoIndisponivel };
  }

  const { rows: novoRows } = await pool.query<{ id: string }>(
    `insert into reajustes_contrato (contrato_id, indice, percentual, valor_anterior, valor_novo, status)
     values ($1, $2, $3, $4, $5, 'proposto')
     returning id`,
    [params.contratoId, calculo.indice, calculo.percentual, params.valorAtual, calculo.valorNovo],
  );

  return { reajusteId: novoRows[0].id, criouNovaProposta: true };
}
