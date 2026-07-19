// Elo entre o calendário puro (server/juridico/renovacaoContratual.ts), o
// cálculo puro de reajuste (server/financeiro/calcularReajuste.ts) e o
// schema (renovacoes_contratuais_notificacoes + reajustes_contrato). Mesmo
// padrão idempotente de processarReequilibrioTrienal.ts.
//
// Aos 60 dias: aviso de planejamento (interno). Aos 30 dias: aviso de
// ajuste + proposta de novo valor gravada em reajustes_contrato como
// 'proposto' — SEMPRE aguardando confirmação humana (nunca 'aplicado'
// automaticamente). Se o contrato não define índice, usa o padrão de
// configuracoes_sistema (IPCA/IGPM, editável pelo admin). Se não houver
// percentual cadastrado para o índice resolvido, a notificação avisa que a
// confirmação de valores precisa ser manual (sem inventar número).

import type { Pool } from 'pg';
import { calcularJanelasRenovacao } from '../juridico/renovacaoContratual';
import { calcularReajuste, resolverIndiceContrato, type IndiceReajuste } from '../financeiro/calcularReajuste';
import { criarNotificador } from '../notificacao/Notificador';

const EMAIL_ADMIN_PADRAO = process.env.EMAIL_ADMIN_NOTIFICACOES || 'admin@crmt.dev';

export interface ResultadoProcessamentoRenovacao {
  contratoId: string;
  dataFim: string;
  planejamentoEnviado: boolean;
  ajusteEnviado: boolean;
  reajustePropostoId?: string;
}

interface LinhaContrato {
  id: string;
  data_fim: string;
  valor_aluguel: string;
  indice_reajuste: IndiceReajuste | null;
  imovel_identificacao: string;
}

interface LinhaRenovacao {
  id: string;
  reajuste_id: string | null;
  notificacao_planejamento_enviada_em: string | null;
  notificacao_ajuste_enviada_em: string | null;
}

export async function processarRenovacaoContratual(
  pool: Pool,
  dataReferencia: Date = new Date(),
): Promise<ResultadoProcessamentoRenovacao[]> {
  const { rows: contratos } = await pool.query<LinhaContrato>(
    `select c.id, c.data_fim, c.valor_aluguel, c.indice_reajuste, i.identificacao as imovel_identificacao
     from contratos c
     join imoveis i on i.id = c.imovel_id
     where c.status in ('ativo', 'aviso_previo') and c.data_fim is not null`,
  );

  const { rows: configRows } = await pool.query<{ valor: string }>(
    `select valor from configuracoes_sistema where chave = 'indice_reajuste_padrao'`,
  );
  const indicePadraoSistema = (configRows[0]?.valor as IndiceReajuste) ?? 'IPCA';

  const notificador = criarNotificador();
  const resultados: ResultadoProcessamentoRenovacao[] = [];

  for (const contrato of contratos) {
    const dataFim = new Date(contrato.data_fim);
    const janelas = calcularJanelasRenovacao(dataFim, dataReferencia);
    if (!janelas.devidoPlanejamento) continue;

    const dataFimIso = formatarDataISO(dataFim);

    const { rows: upsert } = await pool.query<LinhaRenovacao>(
      `insert into renovacoes_contratuais_notificacoes (contrato_id, data_fim_referencia)
       values ($1, $2)
       on conflict (contrato_id, data_fim_referencia) do update set contrato_id = excluded.contrato_id
       returning id, reajuste_id, notificacao_planejamento_enviada_em, notificacao_ajuste_enviada_em`,
      [contrato.id, dataFimIso],
    );
    const renovacao = upsert[0];

    let planejamentoEnviado = false;
    let ajusteEnviado = false;
    let reajustePropostoId: string | undefined;

    if (!renovacao.notificacao_planejamento_enviada_em) {
      await notificador.enviar({
        canais: ['email'],
        destinatario: { email: EMAIL_ADMIN_PADRAO, nome: 'Administrador' },
        template: {
          titulo: `Renovação em 60 dias — ${contrato.imovel_identificacao}`,
          corpo: `O contrato de ${contrato.imovel_identificacao} vence em ${dataFimIso}. Planeje a renovação/renegociação.`,
        },
      });
      await pool.query(
        `update renovacoes_contratuais_notificacoes set notificacao_planejamento_enviada_em = now() where id = $1`,
        [renovacao.id],
      );
      planejamentoEnviado = true;
    }

    if (janelas.devidoAjuste && !renovacao.notificacao_ajuste_enviada_em) {
      const indiceResolvido = resolverIndiceContrato(contrato.indice_reajuste, indicePadraoSistema);

      const { rows: indiceRows } = await pool.query<{ percentual_acumulado_12m: string }>(
        `select percentual_acumulado_12m from indices_economicos
         where indice = $1
         order by competencia desc
         limit 1`,
        [indiceResolvido],
      );
      const percentual = indiceRows[0] ? Number(indiceRows[0].percentual_acumulado_12m) : null;

      const calculo = calcularReajuste({
        valorAtual: Number(contrato.valor_aluguel),
        indice: indiceResolvido,
        percentualAcumulado12m: percentual,
      });

      let mensagemValor: string;
      if (calculo.disponivel) {
        const { rows: reajusteRows } = await pool.query<{ id: string }>(
          `insert into reajustes_contrato (contrato_id, indice, percentual, valor_anterior, valor_novo, status)
           values ($1, $2, $3, $4, $5, 'proposto')
           returning id`,
          [contrato.id, calculo.indice, calculo.percentual, contrato.valor_aluguel, calculo.valorNovo],
        );
        reajustePropostoId = reajusteRows[0].id;
        await pool.query(`update renovacoes_contratuais_notificacoes set reajuste_id = $1 where id = $2`, [
          reajustePropostoId,
          renovacao.id,
        ]);
        mensagemValor = `Proposta gerada: R$ ${contrato.valor_aluguel} → R$ ${calculo.valorNovo?.toFixed(2)} (${indiceResolvido} ${(calculo.percentual! * 100).toFixed(2)}%). Confirme em Contratos > Reajustes.`;
      } else {
        mensagemValor = calculo.motivoIndisponivel ?? 'Sem índice cadastrado — confirme o novo valor manualmente.';
      }

      await notificador.enviar({
        canais: ['email'],
        destinatario: { email: EMAIL_ADMIN_PADRAO, nome: 'Administrador' },
        template: {
          titulo: `Ajuste de renovação em 30 dias — ${contrato.imovel_identificacao}`,
          corpo: `O contrato de ${contrato.imovel_identificacao} vence em ${dataFimIso}. ${mensagemValor}`,
        },
      });
      await pool.query(
        `update renovacoes_contratuais_notificacoes set notificacao_ajuste_enviada_em = now() where id = $1`,
        [renovacao.id],
      );
      ajusteEnviado = true;
    }

    resultados.push({
      contratoId: contrato.id,
      dataFim: dataFimIso,
      planejamentoEnviado,
      ajusteEnviado,
      reajustePropostoId,
    });
  }

  return resultados;
}

function formatarDataISO(data: Date): string {
  return data.toISOString().slice(0, 10);
}
