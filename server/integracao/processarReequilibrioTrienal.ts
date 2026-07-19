// Elo entre o calendário puro (server/juridico/reequilibrioTrienal.ts) e o
// schema (reequilibrios_contratuais) + envio real de notificação. Mesmo
// padrão de reguaCobranca.ts: idempotente via upsert com unique
// (contrato_id, marco_data) — rodar o cron duas vezes no mesmo dia nunca
// duplica notificação.
//
// A notificação de 90 dias (planejamento) vai para o gestor, pedindo que
// defina os critérios de mercado a usar (Art. 19 não tem fórmula — ver
// comentário em reequilibrios_contratuais no schema). A notificação de 30
// dias (oficial) vai também para o inquilino, com um aviso genérico sobre
// o direito de revisão — sem inventar um valor de mercado; só menciona
// `valor_proposto` se o gestor já o tiver definido na tela de revisão.

import type { Pool } from 'pg';
import { calcularJanelasReequilibrio } from '../juridico/reequilibrioTrienal';
import { criarNotificador } from '../notificacao/Notificador';

const EMAIL_ADMIN_PADRAO = process.env.EMAIL_ADMIN_NOTIFICACOES || 'admin@crmt.dev';

export interface ResultadoProcessamentoReequilibrio {
  contratoId: string;
  marco: string;
  planejamentoEnviado: boolean;
  oficialEnviado: boolean;
}

interface LinhaContrato {
  id: string;
  data_inicio: string;
  imovel_identificacao: string;
  locatario_nome: string | null;
  locatario_email: string | null;
}

interface LinhaReequilibrio {
  id: string;
  status: string;
  valor_proposto: string | null;
  notificacao_planejamento_enviada_em: string | null;
  notificacao_oficial_enviada_em: string | null;
}

export async function processarReequilibrioTrienal(
  pool: Pool,
  dataReferencia: Date = new Date(),
): Promise<ResultadoProcessamentoReequilibrio[]> {
  const { rows: contratos } = await pool.query<LinhaContrato>(
    `select c.id, c.data_inicio, i.identificacao as imovel_identificacao,
            p.nome as locatario_nome, p.email as locatario_email
     from contratos c
     join imoveis i on i.id = c.imovel_id
     left join contrato_partes cp on cp.contrato_id = c.id and cp.papel = 'locatario_principal'
     left join pessoas p on p.id = cp.pessoa_id
     where c.status in ('ativo', 'aviso_previo')`,
  );

  const notificador = criarNotificador();
  const resultados: ResultadoProcessamentoReequilibrio[] = [];

  for (const contrato of contratos) {
    const janelas = calcularJanelasReequilibrio(new Date(contrato.data_inicio), dataReferencia);
    if (!janelas.devidoPlanejamento) continue;

    const marcoIso = formatarDataISO(janelas.marco);

    const { rows: upsert } = await pool.query<LinhaReequilibrio>(
      `insert into reequilibrios_contratuais (contrato_id, marco_data)
       values ($1, $2)
       on conflict (contrato_id, marco_data) do update set contrato_id = excluded.contrato_id
       returning id, status, valor_proposto, notificacao_planejamento_enviada_em, notificacao_oficial_enviada_em`,
      [contrato.id, marcoIso],
    );
    const reequilibrio = upsert[0];

    let planejamentoEnviado = false;
    let oficialEnviado = false;

    if (!reequilibrio.notificacao_planejamento_enviada_em) {
      await notificador.enviar({
        canais: ['email'],
        destinatario: { email: EMAIL_ADMIN_PADRAO, nome: 'Administrador' },
        template: {
          titulo: `Reequilíbrio contratual em 90 dias — ${contrato.imovel_identificacao}`,
          corpo:
            `O contrato de ${contrato.imovel_identificacao} completa 3 anos em ${marcoIso} (Art. 19, Lei 8.245/91). ` +
            'Defina os critérios de mercado a serem usados na eventual revisão antes do prazo da notificação oficial (30 dias).',
        },
      });
      await pool.query(
        `update reequilibrios_contratuais set notificacao_planejamento_enviada_em = now() where id = $1`,
        [reequilibrio.id],
      );
      planejamentoEnviado = true;
    }

    if (janelas.devidoOficial && !reequilibrio.notificacao_oficial_enviada_em) {
      const trechoValor = reequilibrio.valor_proposto
        ? ` O valor de referência proposto pela administração é R$ ${Number(reequilibrio.valor_proposto).toFixed(2)}.`
        : '';

      await notificador.enviar({
        canais: ['email'],
        destinatario: { email: EMAIL_ADMIN_PADRAO, nome: 'Administrador' },
        template: {
          titulo: `Notificação oficial de reequilíbrio pendente — ${contrato.imovel_identificacao}`,
          corpo:
            `Faltam 30 dias para o marco trienal (${marcoIso}) do contrato de ${contrato.imovel_identificacao}. ` +
            (reequilibrio.status === 'criterios_definidos'
              ? 'Critérios já definidos — envie a notificação formal ao inquilino.'
              : 'Critérios AINDA NÃO foram definidos — defina-os antes de notificar o inquilino.'),
        },
      });

      if (contrato.locatario_email) {
        await notificador.enviar({
          canais: ['email'],
          destinatario: { email: contrato.locatario_email, nome: contrato.locatario_nome ?? 'Locatário' },
          template: {
            titulo: 'Aviso sobre revisão do valor do aluguel',
            corpo:
              `Seu contrato de locação de ${contrato.imovel_identificacao} completa 3 anos em ${marcoIso}. ` +
              'Conforme o Art. 19 da Lei 8.245/91, a partir dessa data o valor do aluguel pode ser objeto de revisão ' +
              `para ajuste ao preço de mercado.${trechoValor} Entraremos em contato para tratar os detalhes.`,
          },
        });
      }

      await pool.query(`update reequilibrios_contratuais set notificacao_oficial_enviada_em = now() where id = $1`, [
        reequilibrio.id,
      ]);
      oficialEnviado = true;
    }

    resultados.push({ contratoId: contrato.id, marco: marcoIso, planejamentoEnviado, oficialEnviado });
  }

  return resultados;
}

function formatarDataISO(data: Date): string {
  return data.toISOString().slice(0, 10);
}
