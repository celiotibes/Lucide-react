/**
 * RAD (Relatório de Apuração de Débitos) como entidade versionada.
 *
 * Até aqui, `gerarRadPdf.ts` calculava o RAD "on the fly" a cada exportação em PDF, sem
 * persistir o resultado (ver comentário no topo de `contabilidade-reconstituicao/schema.sql`,
 * seção "RAD — Relatório de Apuração de Débitos, como entidade versionada"). Este módulo
 * formaliza o mesmo cálculo como registro em `rad_avaliacoes`/`rad_avaliacao_itens`: versão,
 * emissão, supersessão por nova vistoria/reavaliação, contestação e aplicação da dedução
 * apurada na caução — sem duplicar a regra de depreciação usada em outro lugar do sistema
 * (ver `calcularValorDepreciadoLinear` abaixo).
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { TAXA_DEPRECIACAO_ANUAL_PADRAO } from "../erp/integracao-patrimonio";

const MS_POR_ANO = 365.25 * 24 * 60 * 60 * 1000;

/** AUDITORIA DE CORREÇÃO (esta rodada): a versão anterior deste arquivo mantinha uma CÓPIA
 * LOCAL de `TAXA_DEPRECIACAO_ANUAL_PADRAO` (`const` próprio = 0.05), alegando evitar tocar um
 * arquivo compartilhado sob edição concorrente por outra tarefa. A concorrência acabou — a
 * cópia foi substituída por este import de `integracao-patrimonio.ts`, a fonte de verdade
 * real da taxa (usada por `contabilizarDepreciacaoImovel` para depreciar imóveis). Duas
 * constantes hardcoded para a mesma regra de negócio ("depreciação linear padrão do sistema")
 * divergem silenciosamente no dia em que só uma for atualizada — exatamente o tipo de
 * duplicação que uma perícia contábil não pode aceitar sem alarme.
 *
 * O que continua INTENCIONALMENTE diferente entre os dois módulos, e por quê (não é a mesma
 * classe de problema que a duplicação da taxa): a FORMA DE CALCULAR O TEMPO DECORRIDO.
 * `contabilizarDepreciacaoImovel` deprecia por PERÍODO CONTÁBIL FECHADO — cada chamada cobre
 * exatamente um mês calendário inteiro (`valor_aquisicao * taxa_anual / 12`), porque imóveis
 * têm `periodos_contabeis` fecháveis no razão. Um item de inventário do RAD não tem período
 * contábil — só duas datas conhecidas (vistoria de entrada, vistoria de saída ou hoje) — por
 * isso `calcularValorDepreciadoLinear` abaixo usa tempo CONTÍNUO em dias corridos (via
 * `MS_POR_ANO`, com o ajuste de ano bissexto 365.25) em vez de meses cheios. Para o mesmo
 * intervalo, os dois métodos podem produzir valores ligeiramente diferentes em meses não
 * completos (dias corridos vs. mês fechado) — divergência aceita e documentada, decorrente do
 * modelo de dados de cada domínio, não de uma taxa dessincronizada.
 */

/** Depreciação linear de um item de inventário, do valor de referência (reposição) até zero
 * em `1/taxa_anual` anos — mesma REGRA E MESMA TAXA já usadas para depreciar imóveis em
 * `integracao-patrimonio.ts::contabilizarDepreciacaoImovel` (`TAXA_DEPRECIACAO_ANUAL_PADRAO`,
 * 5% a.a.; ver comentário da constante acima sobre por que o valor é repetido em vez de
 * importado). A diferença é só a base de cálculo: lá é mensal contra o razão contábil
 * (`valor_aquisicao * taxa / 12` por período fechado); aqui é contínua, do dia da vistoria de
 * entrada (`data_vistoria` do item) até a data de referência (vistoria de saída, ou hoje),
 * porque um item de mobiliário não tem período contábil mensal fechável — só a fórmula
 * linear (percentual/ano) é reaproveitada.
 *
 * Sem `data_vistoria` conhecida (campo opcional no cadastro), não há base temporal para
 * depreciar — o item entra pelo valor de referência integral, mesma postura do resto do
 * sistema de não presumir o que não foi registrado (ver `gerarRadPdf.ts`).
 *
 * Nunca fica negativo: o `Math.max(0, ...)` cobre vistorias de entrada muito antigas (o item
 * já estaria contabilmente depreciado a zero há anos).
 */
export function calcularValorDepreciadoLinear(
  valorReferencia: number,
  dataVistoriaItem: string | null | undefined,
  dataReferencia: string,
  taxaAnual: number = TAXA_DEPRECIACAO_ANUAL_PADRAO,
): number {
  if (!dataVistoriaItem) return valorReferencia;

  const inicio = new Date(dataVistoriaItem + "T00:00:00").getTime();
  const fim = new Date(dataReferencia + "T00:00:00").getTime();
  const anosDecorridos = Math.max(0, (fim - inicio) / MS_POR_ANO);

  const valorDepreciado = valorReferencia * (1 - taxaAnual * anosDecorridos);
  return Math.max(0, valorDepreciado);
}

export interface RadAvaliacaoItem {
  id: number;
  rad_avaliacao_id: number;
  inventario_bem_id: number | null;
  descricao: string;
  valor_referencia: number;
  valor_depreciado: number;
  aceito: number;
  motivo: string | null;
}

export interface RadAvaliacao {
  id: number;
  contrato_id: number;
  vistoria_entrada_id: number | null;
  vistoria_saida_id: number | null;
  versao: number;
  status: "rascunho" | "emitido" | "superado" | "contestado";
  superado_por_id: number | null;
  valor_total_deducao: number | null;
  criado_em: string;
  emitido_em: string | null;
  motivo_contestacao: string | null;
}

export interface RadAvaliacaoComItens extends RadAvaliacao {
  itens: RadAvaliacaoItem[];
}

export interface ParametrosGerarRadAvaliacao {
  contratoId: number;
  vistoriaEntradaId?: number;
  vistoriaSaidaId?: number;
}

export interface ResultadoGerarRadAvaliacao {
  radAvaliacaoId: number;
  valorTotal: number;
}

function obterDataReferencia(db: Database, vistoriaSaidaId?: number): string {
  if (vistoriaSaidaId) {
    const [vistoria] = consultar<{ data_realizada: string | null; data_agendada: string | null }>(
      db,
      "SELECT data_realizada, data_agendada FROM vistorias WHERE id = ?",
      [vistoriaSaidaId],
    );
    const data = vistoria?.data_realizada ?? vistoria?.data_agendada;
    if (data) return data.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

/**
 * Gera uma nova avaliação de RAD (sempre uma versão nova, nunca sobrescreve uma existente —
 * ver `supersederRadAvaliacao` para substituir uma versão já emitida): busca o inventário
 * ATUAL do imóvel do contrato (mesma fonte e mesmo aviso de `gerarRadPdf.ts` — a lista não é
 * um snapshot fechado por contrato), deprecia cada item linearmente até a data da vistoria de
 * saída (ou hoje, se não houver) e grava a avaliação em rascunho com todos os itens aceitos
 * por padrão.
 */
export function gerarRadAvaliacao(
  db: Database,
  params: ParametrosGerarRadAvaliacao,
): ResultadoGerarRadAvaliacao {
  const { contratoId, vistoriaEntradaId, vistoriaSaidaId } = params;

  const [contrato] = consultar<{ imovel_id: number }>(
    db,
    "SELECT imovel_id FROM contratos_locacao WHERE id = ?",
    [contratoId],
  );
  if (!contrato) throw new Error(`Contrato ${contratoId} não encontrado.`);

  const itensInventario = consultar<{ id: number; descricao: string; valor_reposicao: number | null; data_vistoria: string | null }>(
    db,
    "SELECT id, descricao, valor_reposicao, data_vistoria FROM imovel_inventario_bens WHERE imovel_id = ?",
    [contrato.imovel_id],
  );

  const dataReferencia = obterDataReferencia(db, vistoriaSaidaId);

  const [ultimaVersao] = consultar<{ maior: number | null }>(
    db,
    "SELECT MAX(versao) as maior FROM rad_avaliacoes WHERE contrato_id = ?",
    [contratoId],
  );
  const versao = (ultimaVersao?.maior ?? 0) + 1;

  executar(
    db,
    `INSERT INTO rad_avaliacoes (contrato_id, vistoria_entrada_id, vistoria_saida_id, versao, status)
     VALUES (?, ?, ?, ?, 'rascunho')`,
    [contratoId, vistoriaEntradaId ?? null, vistoriaSaidaId ?? null, versao],
  );
  const [{ id: radAvaliacaoId }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id", []);

  let valorTotal = 0;
  for (const item of itensInventario) {
    const valorReferencia = item.valor_reposicao ?? 0;
    const valorDepreciado = calcularValorDepreciadoLinear(valorReferencia, item.data_vistoria, dataReferencia);
    valorTotal += valorDepreciado;

    executar(
      db,
      `INSERT INTO rad_avaliacao_itens
        (rad_avaliacao_id, inventario_bem_id, descricao, valor_referencia, valor_depreciado, aceito)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [radAvaliacaoId, item.id, item.descricao, valorReferencia, valorDepreciado],
    );
  }

  return { radAvaliacaoId, valorTotal };
}

/**
 * Rejeita um item do RAD (aceito = 0): o motivo é obrigatório porque, na prática, um item
 * rejeitado sem justificativa não pode ser cobrado do locatário (mesma exigência de
 * `vistoria_item`/provisionamento — nenhum lançamento adverso sem motivo registrado). Só é
 * permitido enquanto a avaliação ainda está em rascunho: depois de emitida, o valor total já
 * foi travado (`emitirRadAvaliacao`) e uma reavaliação deve passar por
 * `supersederRadAvaliacao`, não por edição silenciosa de um item já emitido.
 */
export function rejeitarItemRad(db: Database, itemId: number, motivo: string): void {
  if (!motivo || !motivo.trim()) {
    throw new Error("Item não pode ser rejeitado sem motivo — não pode ser cobrado sem motivo registrado.");
  }

  const [item] = consultar<{ rad_avaliacao_id: number }>(
    db,
    "SELECT rad_avaliacao_id FROM rad_avaliacao_itens WHERE id = ?",
    [itemId],
  );
  if (!item) throw new Error(`Item de RAD ${itemId} não encontrado.`);

  const [avaliacao] = consultar<{ status: string }>(
    db,
    "SELECT status FROM rad_avaliacoes WHERE id = ?",
    [item.rad_avaliacao_id],
  );
  if (avaliacao?.status !== "rascunho") {
    throw new Error("Só é possível rejeitar item de uma avaliação em rascunho — avaliações emitidas exigem supersederRadAvaliacao.");
  }

  executar(db, "UPDATE rad_avaliacao_itens SET aceito = 0, motivo = ? WHERE id = ?", [motivo, itemId]);
}

/**
 * Emite a avaliação: trava o valor total de dedução (soma dos itens ainda aceitos, já
 * refletindo qualquer rejeição feita antes da emissão) e muda o status para 'emitido'. Só
 * avaliações em rascunho podem ser emitidas — uma já emitida/superada/contestada não pode ser
 * emitida de novo (reemitir mudaria o valor já usado por `aplicarDeducaoNaCaucao`
 * silenciosamente; para corrigir depois de emitida, o caminho é `supersederRadAvaliacao`).
 */
export function emitirRadAvaliacao(db: Database, radAvaliacaoId: number): number {
  const [avaliacao] = consultar<{ status: string }>(
    db,
    "SELECT status FROM rad_avaliacoes WHERE id = ?",
    [radAvaliacaoId],
  );
  if (!avaliacao) throw new Error(`Avaliação de RAD ${radAvaliacaoId} não encontrada.`);
  if (avaliacao.status !== "rascunho") {
    throw new Error(`Avaliação ${radAvaliacaoId} já está '${avaliacao.status}' — só uma avaliação em rascunho pode ser emitida.`);
  }

  const [{ total }] = consultar<{ total: number | null }>(
    db,
    "SELECT SUM(valor_depreciado) as total FROM rad_avaliacao_itens WHERE rad_avaliacao_id = ? AND aceito = 1",
    [radAvaliacaoId],
  );
  const valorTotalDeducao = total ?? 0;

  executar(
    db,
    `UPDATE rad_avaliacoes
     SET status = 'emitido', emitido_em = datetime('now'), valor_total_deducao = ?
     WHERE id = ?`,
    [valorTotalDeducao, radAvaliacaoId],
  );

  return valorTotalDeducao;
}

/**
 * Supera uma avaliação já emitida com uma nova versão (ex: locatário contesta e uma nova
 * vistoria muda o resultado): gera a nova avaliação (mesma lógica de `gerarRadAvaliacao`,
 * já com a próxima versão do contrato) e marca a antiga como 'superado', apontando
 * `superado_por_id` para a nova. Só é permitido superar uma avaliação 'emitido' — um
 * rascunho não precisa de supersessão, basta editar/regerar diretamente (gerar outro
 * rascunho ou emitir o mesmo), e uma já 'superado'/'contestado' não pode ser superada de novo
 * por esta função (a cadeia de supersessão segue por `superado_por_id`, não por chamadas
 * repetidas aqui).
 */
export function supersederRadAvaliacao(
  db: Database,
  radAvaliacaoIdAntigo: number,
  contratoId: number,
  opcoes: { vistoriaEntradaId?: number; vistoriaSaidaId?: number } = {},
): ResultadoGerarRadAvaliacao {
  const [antiga] = consultar<{ status: string; contrato_id: number }>(
    db,
    "SELECT status, contrato_id FROM rad_avaliacoes WHERE id = ?",
    [radAvaliacaoIdAntigo],
  );
  if (!antiga) throw new Error(`Avaliação de RAD ${radAvaliacaoIdAntigo} não encontrada.`);
  if (antiga.status !== "emitido") {
    throw new Error(
      `Só é possível superar uma avaliação 'emitido' (esta está '${antiga.status}') — um rascunho é editado/regerado diretamente, sem supersessão.`,
    );
  }
  if (antiga.contrato_id !== contratoId) {
    throw new Error(`Avaliação ${radAvaliacaoIdAntigo} pertence ao contrato ${antiga.contrato_id}, não ao contrato ${contratoId} informado.`);
  }

  const nova = gerarRadAvaliacao(db, {
    contratoId,
    vistoriaEntradaId: opcoes.vistoriaEntradaId,
    vistoriaSaidaId: opcoes.vistoriaSaidaId,
  });

  executar(
    db,
    "UPDATE rad_avaliacoes SET status = 'superado', superado_por_id = ? WHERE id = ?",
    [nova.radAvaliacaoId, radAvaliacaoIdAntigo],
  );

  return nova;
}

/**
 * Contesta uma avaliação emitida (ex: locatário discorda do valor apurado). Só é permitido a
 * partir de 'emitido' — um rascunho ainda não foi comunicado a ninguém para ser contestado, e
 * uma já 'superado'/'contestado' não volta a este estado por aqui. O motivo é exigido (mesma
 * exigência de justificativa de `rejeitarItemRad`) e é gravado em `motivo_contestacao`
 * (`rad_avaliacoes`), para que o texto fique disponível junto do registro da avaliação, sem
 * depender de o chamador anotá-lo em observações de outra entidade.
 */
export function contestarRadAvaliacao(db: Database, radAvaliacaoId: number, motivo: string): void {
  if (!motivo || !motivo.trim()) {
    throw new Error("Contestação exige motivo.");
  }

  const [avaliacao] = consultar<{ status: string }>(
    db,
    "SELECT status FROM rad_avaliacoes WHERE id = ?",
    [radAvaliacaoId],
  );
  if (!avaliacao) throw new Error(`Avaliação de RAD ${radAvaliacaoId} não encontrada.`);
  if (avaliacao.status !== "emitido") {
    throw new Error(`Só é possível contestar uma avaliação 'emitido' (esta está '${avaliacao.status}').`);
  }

  executar(
    db,
    "UPDATE rad_avaliacoes SET status = 'contestado', motivo_contestacao = ? WHERE id = ?",
    [motivo, radAvaliacaoId],
  );
}

/** Retorna a avaliação vigente do contrato: a de maior versão que não esteja 'superado' —
 * ou seja, o rascunho/emitido/contestado mais recente. Uma avaliação 'superado' nunca é
 * "a atual" mesmo que numericamente seja a de maior versão entre as não descartadas (o que
 * não deveria acontecer se `supersederRadAvaliacao` for o único jeito de gerar versão nova a
 * partir de uma já emitida, mas o filtro por status cobre o caso mesmo assim). */
export function obterRadAvaliacaoAtual(db: Database, contratoId: number): RadAvaliacaoComItens | null {
  const [avaliacao] = consultar<RadAvaliacao>(
    db,
    `SELECT * FROM rad_avaliacoes
     WHERE contrato_id = ? AND status != 'superado'
     ORDER BY versao DESC LIMIT 1`,
    [contratoId],
  );
  if (!avaliacao) return null;

  const itens = consultar<RadAvaliacaoItem>(
    db,
    "SELECT * FROM rad_avaliacao_itens WHERE rad_avaliacao_id = ?",
    [avaliacao.id],
  );

  return { ...avaliacao, itens };
}

/**
 * Aplica a dedução apurada por uma avaliação emitida na caução do contrato: só permitido com
 * a avaliação 'emitido' (rascunho ainda pode mudar de valor; contestado está em disputa, não
 * deve virar dedução automática sem revisão). Nunca sobrescreve cegamente
 * `deducoes_valor`/`deducoes_descricao` já existentes — soma ao valor e concatena à descrição
 * já registrada, para não apagar uma dedução de um RAD anterior (ou de outra origem) que já
 * estivesse ali.
 */
export function aplicarDeducaoNaCaucao(db: Database, radAvaliacaoId: number, caucaoId: number): { deducoesValor: number; deducoesDescricao: string } {
  const [avaliacao] = consultar<{ status: string; versao: number; valor_total_deducao: number | null }>(
    db,
    "SELECT status, versao, valor_total_deducao FROM rad_avaliacoes WHERE id = ?",
    [radAvaliacaoId],
  );
  if (!avaliacao) throw new Error(`Avaliação de RAD ${radAvaliacaoId} não encontrada.`);
  if (avaliacao.status !== "emitido") {
    throw new Error(`Só é possível aplicar dedução de uma avaliação 'emitido' (esta está '${avaliacao.status}').`);
  }

  const [caucao] = consultar<{ deducoes_valor: number | null; deducoes_descricao: string | null }>(
    db,
    "SELECT deducoes_valor, deducoes_descricao FROM caucoes WHERE id = ?",
    [caucaoId],
  );
  if (!caucao) throw new Error(`Caução ${caucaoId} não encontrada.`);

  const [{ n }] = consultar<{ n: number }>(
    db,
    "SELECT COUNT(*) as n FROM rad_avaliacao_itens WHERE rad_avaliacao_id = ? AND aceito = 1",
    [radAvaliacaoId],
  );

  const valorDaAvaliacao = avaliacao.valor_total_deducao ?? 0;
  const referenciaRad = `RAD v${avaliacao.versao} — ${n} ${n === 1 ? "item aceito" : "itens aceitos"}`;

  const deducoesValor = (caucao.deducoes_valor ?? 0) + valorDaAvaliacao;
  const deducoesDescricao = caucao.deducoes_descricao && caucao.deducoes_descricao.trim()
    ? `${caucao.deducoes_descricao}; ${referenciaRad}`
    : referenciaRad;

  executar(
    db,
    "UPDATE caucoes SET deducoes_valor = ?, deducoes_descricao = ? WHERE id = ?",
    [deducoesValor, deducoesDescricao, caucaoId],
  );

  return { deducoesValor, deducoesDescricao };
}
