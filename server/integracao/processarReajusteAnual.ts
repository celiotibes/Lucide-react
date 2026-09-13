// Elo entre o calendário puro (server/juridico/reajusteAnual.ts) e o schema
// (reajustes_anuais_notificacoes + reajustes_contrato). Mesmo padrão
// idempotente de processarRenovacaoContratual.ts — inclusive reaproveita o
// mesmo resolvedor de proposta (server/financeiro/resolverPropostaReajuste.ts),
// que sabe re-tentar quando uma proposta anterior foi rejeitada e já existe
// índice mais recente cadastrado.
//
// Só considera contratos SEM data_fim dentro de 60 dias — se a renovação já
// está para cobrir o reajuste (processarRenovacaoContratual.ts), evita gerar
// duas propostas conflitantes para o mesmo contrato ao mesmo tempo.

import type { Pool } from 'pg';
import { calcularJanelaReajusteAnual } from '../juridico/reajusteAnual';
import { resolverPropostaReajuste } from '../financeiro/resolverPropostaReajuste';
import type { IndiceReajuste } from '../financeiro/calcularReajuste';
import { criarNotificador } from '../notificacao/Notificador';
import { registrarFalhasEnvio } from '../notificacao/registrarFalhasEnvio';

const EMAIL_ADMIN_PADRAO = process.env.EMAIL_ADMIN_NOTIFICACOES || 'admin@crmt.dev';
const DIAS_FOLGA_RENOVACAO = 60;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

export interface ResultadoProcessamentoReajusteAnual {
  contratoId: string;
  marco: string;
  notificacaoEnviada: boolean;
  reajustePropostoId?: string;
}

interface LinhaContrato {
  id: string;
  data_inicio: string;
  data_ultimo_reajuste: string | null;
  data_fim: string | null;
  valor_aluguel: string;
  indice_reajuste: IndiceReajuste | null;
  imovel_identificacao: string;
}

interface LinhaNotificacao {
  id: string;
  reajuste_id: string | null;
  notificacao_enviada_em: string | null;
}

export async function processarReajusteAnual(
  pool: Pool,
  dataReferencia: Date = new Date(),
): Promise<ResultadoProcessamentoReajusteAnual[]> {
  const { rows: contratos } = await pool.query<LinhaContrato>(
    `select c.id, c.data_inicio, c.data_ultimo_reajuste, c.data_fim, c.valor_aluguel, c.indice_reajuste,
            i.identificacao as imovel_identificacao
     from contratos c
     join imoveis i on i.id = c.imovel_id
     where c.status in ('ativo', 'aviso_previo')`,
  );

  const { rows: configRows } = await pool.query<{ valor: string }>(
    `select valor from configuracoes_sistema where chave = 'indice_reajuste_padrao'`,
  );
  const indicePadraoSistema = (configRows[0]?.valor as IndiceReajuste) ?? 'IPCA';

  const notificador = criarNotificador();
  const resultados: ResultadoProcessamentoReajusteAnual[] = [];

  for (const contrato of contratos) {
    // A renovação já cobre o reajuste quando o fim do contrato está próximo
    // — evita duas propostas concorrentes para o mesmo contrato.
    if (contrato.data_fim) {
      const diasAteFim = Math.round(
        (new Date(contrato.data_fim).getTime() - dataReferencia.getTime()) / MS_POR_DIA,
      );
      if (diasAteFim <= DIAS_FOLGA_RENOVACAO) continue;
    }

    const janela = calcularJanelaReajusteAnual(
      new Date(contrato.data_inicio),
      contrato.data_ultimo_reajuste ? new Date(contrato.data_ultimo_reajuste) : null,
      dataReferencia,
    );
    if (!janela.devidoAgora) continue;

    const marcoIso = formatarDataISO(janela.proximoReajuste);

    const { rows: upsert } = await pool.query<LinhaNotificacao>(
      `insert into reajustes_anuais_notificacoes (contrato_id, marco_data)
       values ($1, $2)
       on conflict (contrato_id, marco_data) do update set contrato_id = excluded.contrato_id
       returning id, reajuste_id, notificacao_enviada_em`,
      [contrato.id, marcoIso],
    );
    const notificacao = upsert[0];

    const resolucao = await resolverPropostaReajuste(pool, {
      contratoId: contrato.id,
      valorAtual: Number(contrato.valor_aluguel),
      indiceContrato: contrato.indice_reajuste,
      indicePadraoSistema,
      reajusteVinculadoId: notificacao.reajuste_id,
    });

    if (resolucao.reajusteId !== notificacao.reajuste_id) {
      await pool.query(`update reajustes_anuais_notificacoes set reajuste_id = $1 where id = $2`, [
        resolucao.reajusteId,
        notificacao.id,
      ]);
    }

    let notificacaoEnviada = false;

    // Notifica só uma vez por ciclo (heads-up inicial) OU sempre que uma
    // proposta é de fato gerada (mesmo que seja um retry depois de rejeição
    // com índice novo) — para o admin saber que já pode revisar.
    if (!notificacao.notificacao_enviada_em || resolucao.criouNovaProposta) {
      const mensagem = resolucao.criouNovaProposta
        ? `Proposta de reajuste anual gerada: R$ ${contrato.valor_aluguel} → confira em Contratos > Reajustes.`
        : (resolucao.motivoIndisponivel ?? 'Sem índice cadastrado — confirme o novo valor manualmente.');

      registrarFalhasEnvio(
        await notificador.enviar({
          canais: ['email'],
          destinatario: { email: EMAIL_ADMIN_PADRAO, nome: 'Administrador' },
          template: {
            titulo: `Reajuste anual — ${contrato.imovel_identificacao}`,
            corpo: `O contrato de ${contrato.imovel_identificacao} completa 12 meses desde o último reajuste em ${marcoIso}. ${mensagem}`,
          },
        }),
        `reajuste anual contrato=${contrato.id}`,
      );

      if (!notificacao.notificacao_enviada_em) {
        await pool.query(`update reajustes_anuais_notificacoes set notificacao_enviada_em = now() where id = $1`, [
          notificacao.id,
        ]);
      }
      notificacaoEnviada = true;
    }

    resultados.push({
      contratoId: contrato.id,
      marco: marcoIso,
      notificacaoEnviada,
      reajustePropostoId: resolucao.criouNovaProposta ? (resolucao.reajusteId ?? undefined) : undefined,
    });
  }

  return resultados;
}

function formatarDataISO(data: Date): string {
  return data.toISOString().slice(0, 10);
}
