// Agrega `investidor_ledger` (docs/17) no "Extrato do Proprietário"
// (`extratos_mensais_proprietario` + `extrato_mensal_itens`) — referência
// de mercado citada no próprio comentário do schema (Imobzi): a prestação
// de contas precisa ser um documento pronto, não algo que o sócio monte
// sozinho lendo o ledger cru.
//
// Dois níveis, gerados na mesma passada: um extrato por (proprietário,
// imóvel, mês) com o detalhamento bruto/dedução/líquido, e um extrato
// consolidado por proprietário (imóvel_id null — "carteira inteira"), cujos
// itens são o repasse líquido de cada imóvel dele naquele mês.
//
// `documento_id`/`enviado_em`/`canal_envio` ficam em branco — não geramos
// PDF nem disparamos envio real por WhatsApp/e-mail (mesma honestidade já
// aplicada a `notificacoes_log.status = 'pendente_envio'`, docs/16): o
// extrato fica pronto no banco, pronto para ser mostrado num portal ou
// anexado a um envio manual, mas nada aqui finge um envio que não aconteceu.

import type { Pool } from 'pg';

export interface ExtratoGerado {
  pessoaId: string;
  /** null = extrato consolidado da carteira inteira do proprietário. */
  imovelId: string | null;
  extratoId: string;
  receitaBruta: number;
  totalDeducoes: number;
  valorRepassado: number;
}

export interface ResultadoGeracaoExtratos {
  gerados: ExtratoGerado[];
}

interface LinhaAgregadaPorImovel {
  pessoa_id: string;
  imovel_id: string;
  receita_bruta: string;
  valor_repassado: string;
}

interface LinhaAgregadaPorPessoa {
  pessoa_id: string;
  receita_bruta: string;
  valor_repassado: string;
}

export async function gerarExtratosMensaisProprietario(pool: Pool, competencia: Date): Promise<ResultadoGeracaoExtratos> {
  const competenciaISO = formatarPrimeiroDiaDoMes(competencia);
  const gerados: ExtratoGerado[] = [];

  const { rows: porImovel } = await pool.query<LinhaAgregadaPorImovel>(
    `select pessoa_id, imovel_id,
            sum(coalesce(valor_bruto, valor)) as receita_bruta,
            sum(valor) as valor_repassado
     from investidor_ledger
     where tipo = 'credito_repasse' and date_trunc('month', data) = $1::date
     group by pessoa_id, imovel_id`,
    [competenciaISO],
  );

  for (const linha of porImovel) {
    const { rows: existente } = await pool.query<{ id: string }>(
      `select id from extratos_mensais_proprietario where pessoa_id = $1 and imovel_id = $2 and competencia = $3::date`,
      [linha.pessoa_id, linha.imovel_id, competenciaISO],
    );
    if (existente.length > 0) continue;

    const receitaBruta = Number(linha.receita_bruta);
    const valorRepassado = Number(linha.valor_repassado);
    const totalDeducoes = arredondar(receitaBruta - valorRepassado);

    const { rows: extratoRows } = await pool.query<{ id: string }>(
      `insert into extratos_mensais_proprietario (pessoa_id, imovel_id, competencia, receita_bruta, total_deducoes, valor_repassado)
       values ($1, $2, $3::date, $4, $5, $6)
       returning id`,
      [linha.pessoa_id, linha.imovel_id, competenciaISO, receitaBruta, totalDeducoes, valorRepassado],
    );
    const extratoId = extratoRows[0].id;

    await pool.query(
      `insert into extrato_mensal_itens (extrato_id, descricao, tipo, valor) values ($1, 'Receita de aluguel', 'receita', $2)`,
      [extratoId, receitaBruta],
    );
    if (totalDeducoes > 0) {
      await pool.query(
        `insert into extrato_mensal_itens (extrato_id, descricao, tipo, valor) values ($1, 'Taxa de administração', 'despesa', $2)`,
        [extratoId, totalDeducoes],
      );
    }

    gerados.push({ pessoaId: linha.pessoa_id, imovelId: linha.imovel_id, extratoId, receitaBruta, totalDeducoes, valorRepassado });
  }

  // Consolidado por pessoa — `imovel_id is null` não é coberto pela unique
  // constraint da tabela (NULL nunca conflita consigo mesmo em SQL padrão),
  // então a idempotência aqui é sempre por `not exists`, não `on conflict`.
  const { rows: porPessoa } = await pool.query<LinhaAgregadaPorPessoa>(
    `select pessoa_id, sum(coalesce(valor_bruto, valor)) as receita_bruta, sum(valor) as valor_repassado
     from investidor_ledger
     where tipo = 'credito_repasse' and date_trunc('month', data) = $1::date
     group by pessoa_id`,
    [competenciaISO],
  );

  for (const linha of porPessoa) {
    const { rows: existente } = await pool.query<{ id: string }>(
      `select id from extratos_mensais_proprietario where pessoa_id = $1 and imovel_id is null and competencia = $2::date`,
      [linha.pessoa_id, competenciaISO],
    );
    if (existente.length > 0) continue;

    const receitaBruta = Number(linha.receita_bruta);
    const valorRepassado = Number(linha.valor_repassado);
    const totalDeducoes = arredondar(receitaBruta - valorRepassado);

    const { rows: extratoRows } = await pool.query<{ id: string }>(
      `insert into extratos_mensais_proprietario (pessoa_id, imovel_id, competencia, receita_bruta, total_deducoes, valor_repassado)
       values ($1, null, $2::date, $3, $4, $5)
       returning id`,
      [linha.pessoa_id, competenciaISO, receitaBruta, totalDeducoes, valorRepassado],
    );
    const extratoId = extratoRows[0].id;

    const { rows: porImovelDaPessoa } = await pool.query<{ identificacao: string; valor: string }>(
      `select i.identificacao, sum(il.valor) as valor
       from investidor_ledger il
       join imoveis i on i.id = il.imovel_id
       where il.tipo = 'credito_repasse' and il.pessoa_id = $1 and date_trunc('month', il.data) = $2::date
       group by i.identificacao
       order by i.identificacao`,
      [linha.pessoa_id, competenciaISO],
    );
    for (const item of porImovelDaPessoa) {
      await pool.query(`insert into extrato_mensal_itens (extrato_id, descricao, tipo, valor) values ($1, $2, 'receita', $3)`, [
        extratoId,
        item.identificacao,
        Number(item.valor),
      ]);
    }

    gerados.push({ pessoaId: linha.pessoa_id, imovelId: null, extratoId, receitaBruta, totalDeducoes, valorRepassado });
  }

  return { gerados };
}

function formatarPrimeiroDiaDoMes(data: Date): string {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}
