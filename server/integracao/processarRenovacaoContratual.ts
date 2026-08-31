// Elo entre o calendário puro (server/juridico/renovacaoContratual.ts), o
// resolvedor de proposta (server/financeiro/resolverPropostaReajuste.ts) e
// o schema (renovacoes_contratuais_notificacoes + reajustes_contrato).
// Mesmo padrão idempotente de processarReequilibrioTrienal.ts.
//
// Aos 60 dias: aviso de planejamento (interno). Aos 30 dias: aviso de
// ajuste + proposta de novo valor gravada em reajustes_contrato como
// 'proposto' — SEMPRE aguardando confirmação humana (nunca 'aplicado'
// automaticamente). Se o contrato não define índice, usa o padrão de
// configuracoes_sistema (IPCA/IGPM, editável pelo admin). Se não houver
// percentual cadastrado, ou se a proposta anterior foi rejeitada sem um
// índice mais recente disponível, o resolvedor devolve o motivo — e o cron
// TENTA DE NOVO no próximo run em vez de desistir para sempre (diferente da
// versão anterior desta função, que marcava "já notificado" e nunca mais
// olhava o contrato).

import type { Pool } from 'pg';
import { calcularJanelasRenovacao } from '../juridico/renovacaoContratual';
import { resolverPropostaReajuste } from '../financeiro/resolverPropostaReajuste';
import type { IndiceReajuste } from '../financeiro/calcularReajuste';
import { criarNotificador } from '../notificacao/Notificador';
import { registrarFalhasEnvio } from '../notificacao/registrarFalhasEnvio';

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
      registrarFalhasEnvio(
        await notificador.enviar({
          canais: ['email'],
          destinatario: { email: EMAIL_ADMIN_PADRAO, nome: 'Administrador' },
          template: {
            titulo: `Renovação em 60 dias — ${contrato.imovel_identificacao}`,
            corpo: `O contrato de ${contrato.imovel_identificacao} vence em ${dataFimIso}. Planeje a renovação/renegociação.`,
          },
        }),
        `renovacao planejamento contrato=${contrato.id}`,
      );
      await pool.query(
        `update renovacoes_contratuais_notificacoes set notificacao_planejamento_enviada_em = now() where id = $1`,
        [renovacao.id],
      );
      planejamentoEnviado = true;
    }

    if (janelas.devidoAjuste) {
      const resolucao = await resolverPropostaReajuste(pool, {
        contratoId: contrato.id,
        valorAtual: Number(contrato.valor_aluguel),
        indiceContrato: contrato.indice_reajuste,
        indicePadraoSistema,
        reajusteVinculadoId: renovacao.reajuste_id,
      });

      if (resolucao.reajusteId !== renovacao.reajuste_id) {
        await pool.query(`update renovacoes_contratuais_notificacoes set reajuste_id = $1 where id = $2`, [
          resolucao.reajusteId,
          renovacao.id,
        ]);
        reajustePropostoId = resolucao.criouNovaProposta ? (resolucao.reajusteId ?? undefined) : undefined;
      }

      // Notifica no primeiro contato do ciclo, e de novo sempre que uma
      // proposta nova é de fato gerada (inclusive um retry pós-rejeição).
      if (!renovacao.notificacao_ajuste_enviada_em || resolucao.criouNovaProposta) {
        const mensagemValor = resolucao.criouNovaProposta
          ? `Proposta de reajuste gerada: R$ ${contrato.valor_aluguel} → confira em Contratos > Reajustes.`
          : (resolucao.motivoIndisponivel ?? 'Sem índice cadastrado — confirme o novo valor manualmente.');

        registrarFalhasEnvio(
          await notificador.enviar({
            canais: ['email'],
            destinatario: { email: EMAIL_ADMIN_PADRAO, nome: 'Administrador' },
            template: {
              titulo: `Ajuste de renovação em 30 dias — ${contrato.imovel_identificacao}`,
              corpo: `O contrato de ${contrato.imovel_identificacao} vence em ${dataFimIso}. ${mensagemValor}`,
            },
          }),
          `renovacao ajuste contrato=${contrato.id}`,
        );

        if (!renovacao.notificacao_ajuste_enviada_em) {
          await pool.query(
            `update renovacoes_contratuais_notificacoes set notificacao_ajuste_enviada_em = now() where id = $1`,
            [renovacao.id],
          );
        }
        ajusteEnviado = true;
      }
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
