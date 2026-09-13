// Lançamento da fatura de Geração Distribuída (GD) da Celesc — recebe os
// valores já extraídos (seja de formulário manual, seja do parser
// `../relatorios/celescGD.ts#parsearFaturaCelescGD`, validado contra uma
// fatura real em docs/30). Esta função não decide a origem dos dados, só
// valida e persiste.
//
// Sempre nasce `pendente_confirmacao` — mesmo padrão de `leituras_energia`
// e `geracao_solar`: dado de origem externa nunca vira número oficial sem
// confirmação humana.

import type { Pool } from 'pg';

export interface DadosFaturaCelescGD {
  residencialId: string;
  competencia: string; // 'YYYY-MM-DD', sempre dia 1
  valorTotal: number;
  energiaInjetadaKwh: number;
  energiaConsumidaRedeKwh: number;
  arquivoUrl?: string | null;
}

export type ResultadoRegistrarFaturaCelescGD = { sucesso: true; id: string } | { sucesso: false; erro: string };

export async function registrarFaturaCelescGD(
  pool: Pool,
  dados: DadosFaturaCelescGD,
): Promise<ResultadoRegistrarFaturaCelescGD> {
  if (!dados.residencialId) {
    return { sucesso: false, erro: 'Selecione o residencial.' };
  }
  if (!(dados.valorTotal >= 0)) {
    return { sucesso: false, erro: 'Valor total deve ser zero ou positivo.' };
  }
  if (!(dados.energiaInjetadaKwh >= 0) || !(dados.energiaConsumidaRedeKwh >= 0)) {
    return { sucesso: false, erro: 'Energia injetada e consumida da rede devem ser zero ou positivas.' };
  }

  try {
    const { rows } = await pool.query<{ id: string }>(
      `insert into faturas_celesc_gd (residencial_id, competencia, valor_total, energia_injetada_kwh, energia_consumida_rede_kwh, arquivo_url)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [dados.residencialId, dados.competencia, dados.valorTotal, dados.energiaInjetadaKwh, dados.energiaConsumidaRedeKwh, dados.arquivoUrl ?? null],
    );
    return { sucesso: true, id: rows[0].id };
  } catch (e) {
    return { sucesso: false, erro: `Não foi possível salvar: ${e instanceof Error ? e.message : 'erro desconhecido'}` };
  }
}

// `confirmadoPorPessoaId` aceita null porque nenhuma tela do sistema tem
// sessão de usuário autenticado ainda (docs/09) — mesma situação de
// `app/quebras-contrato/actions.ts` (`analisado_por` fica null pelo mesmo
// motivo). A coluna já era nullable no schema; o parâmetro só passou a
// refletir isso.
export async function confirmarFaturaCelescGD(pool: Pool, id: string, confirmadoPorPessoaId: string | null): Promise<void> {
  await pool.query(
    `update faturas_celesc_gd set status = 'confirmada', confirmado_por = $2, confirmado_em = now() where id = $1`,
    [id, confirmadoPorPessoaId],
  );
}
