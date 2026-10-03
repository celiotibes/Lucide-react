/**
 * MÓDULO: extração (assistida por IA) do histórico de pagamentos de uma dívida sem
 * cronograma exato — dívida de consumo (`dividas_consumo`) ou financiamento com
 * `sistema='OUTRO'` (`financiamentos`). Decisão do usuário (2026-09-29): para essas dívidas,
 * SAC/PRICE não se aplica (ver `financiamento/amortizacao.ts`) e não há como calcular
 * juros/amortização por parcela a partir de uma fórmula — o jeito de ter um número real é
 * ler o contrato/extrato de pagamentos que o credor forneceu. Este módulo deixa a IA TENTAR
 * ler esse documento e sugerir os pagamentos que encontrar, mas nunca lança nada sozinha:
 * toda sugestão nasce com `confirmado_por_usuario = 0` e só vira fato depois que uma pessoa
 * confirma (ou corrige e confirma) — mesma regra de ouro já aplicada em
 * `documentos/matching.ts` (sugestão de vínculo documento↔transação) e
 * `categorize/regrasDocumentos.ts` (regra aprendida só é sugestão, nunca aplicação automática).
 *
 * REAPROVEITAMENTO DELIBERADO (não duplicar):
 *   - `ia/roteador.ts` (`chamarComRoteamento`) — o mesmo roteador multi-provedor com
 *     escalonamento por qualidade e fallback por falha usado em `classificarComIA.ts`. Este
 *     módulo não sabe nada sobre HTTP/provedor, só monta um prompt e interpreta a resposta.
 *   - `ia/qualidadeOcr.ts` (`avaliarQualidadeTexto`) — mesmo critério de "esse texto está bom
 *     o bastante para não precisar escalar para um provedor pago" usado em `extrairCampos.ts`.
 *   - `ia/proveniencia.ts` (`vincularChamadaADocumento`) — depois de a chamada responder,
 *     liga o registro de proveniência ao documento que a originou, para "qual regra extraiu
 *     este pagamento" apontar a uma linha auditável (provedor, modelo, quando, prompt
 *     truncado) em vez de só "a IA achou". `registrarChamada` (chamado dentro do roteador,
 *     não aqui) já persiste a chamada em `ia_chamadas` quando `db` é passado — este módulo
 *     sempre passa `db`.
 *   - `documento_dividas`/`divida_pagamentos_historico` (schema.sql) — tabelas já existentes,
 *     não alteradas aqui.
 *
 * TEXTO DO DOCUMENTO — de onde vem: `documentos.texto_extraido` é preenchido no momento do
 * upload por `extrairTextoDocumento()` (`documentos/extrairCampos.ts`), que já escolhe o
 * parser certo por tipo de arquivo (pdfDocumento.ts para PDF, ocrImagem.ts para imagem). Este
 * módulo só LÊ essa coluna — não chama os parsers de novo — porque um `documentoId` sozinho
 * não dá acesso aos bytes originais do arquivo (o `File` do navegador não é persistido; só o
 * texto que ele produziu). Se `texto_extraido` estiver vazio (documento inserido por um
 * caminho que pulou a extração), lança erro claro em vez de seguir com um prompt vazio —
 * a única forma de corrigir isso é reenviar o arquivo, não algo que este módulo possa fazer
 * sozinho a partir do id.
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { chamarComRoteamento, avaliarQualidadeTexto, type OpcoesRoteador } from "../ia/roteador";
import { vincularChamadaADocumento } from "../ia/proveniencia";
import type { DividaTipo } from "./rateioDividas";

export type { DividaTipo };

// Limite bem maior que o de classificarComIA.ts (1000 caracteres): lá basta um indício no
// topo do documento para decidir tipo/fornecedor; aqui o que importa é justamente a TABELA
// de parcelas/pagamentos, que pode estar no meio ou no fim de um contrato longo e se estende
// por muitas linhas. Truncar cedo demais jogaria fora exatamente o dado que se está pedindo.
const LIMITE_CARACTERES_PROMPT = 6000;

export interface PagamentoDividaHistorico {
  id: number;
  divida_tipo: DividaTipo;
  divida_id: number;
  data_pagamento: string;
  valor_pago: number;
  valor_juros: number | null;
  valor_amortizacao: number | null;
  origem: "extraido_ia" | "manual";
  confirmado_por_usuario: 0 | 1;
  documento_id: number | null;
  observacoes: string | null;
  criado_em: string;
}

function validarDividaTipo(dividaTipo: DividaTipo): void {
  if (dividaTipo !== "divida_consumo" && dividaTipo !== "financiamento") {
    throw new Error(`Tipo de dívida inválido: "${dividaTipo}" — esperado "divida_consumo" ou "financiamento".`);
  }
}

/**
 * Liga um documento (contrato/extrato) a uma dívida — insere em `documento_dividas`. É o que
 * permite `extrairPagamentosDeDocumento` descobrir a que `divida_tipo`+`divida_id` os
 * pagamentos que a IA encontrar devem ser gravados.
 */
export function vincularDocumentoADivida(db: Database, documentoId: number, dividaTipo: DividaTipo, dividaId: number): void {
  validarDividaTipo(dividaTipo);
  const [doc] = consultar<{ id: number }>(db, "SELECT id FROM documentos WHERE id = ?", [documentoId]);
  if (!doc) throw new Error(`Documento ${documentoId} não encontrado — não é possível vinculá-lo a uma dívida.`);
  executar(
    db,
    "INSERT INTO documento_dividas (documento_id, divida_tipo, divida_id) VALUES (?, ?, ?)",
    [documentoId, dividaTipo, dividaId],
  );
}

/** A que dívida um documento está ligado — o vínculo mais recente, se houver mais de um
 * (não deveria acontecer no fluxo normal de upload, mas não é impedido pelo schema). Lança
 * erro claro quando não há vínculo: `extrairPagamentosDeDocumento` não tem como adivinhar em
 * qual dívida gravar sem que `vincularDocumentoADivida` tenha sido chamada antes. */
function vinculoDaDivida(db: Database, documentoId: number): { dividaTipo: DividaTipo; dividaId: number } {
  const [linha] = consultar<{ divida_tipo: DividaTipo; divida_id: number }>(
    db,
    "SELECT divida_tipo, divida_id FROM documento_dividas WHERE documento_id = ? ORDER BY criado_em DESC, id DESC LIMIT 1",
    [documentoId],
  );
  if (!linha) {
    throw new Error(
      `Documento ${documentoId} não está vinculado a nenhuma dívida — chame vincularDocumentoADivida() antes de extrairPagamentosDeDocumento().`,
    );
  }
  return { dividaTipo: linha.divida_tipo, dividaId: linha.divida_id };
}

function montarPrompt(textoLimitado: string): string {
  return `Você é um especialista em análise de contratos e extratos de pagamento de dívidas e financiamentos brasileiros (consignado, empréstimo pessoal, cartão parcelado, financiamento sem tabela SAC/Price conhecida).

Analise o texto a seguir (contrato ou extrato de pagamentos) e extraia TODOS os pagamentos/parcelas que conseguir identificar com data e valor pago.

Para cada pagamento, extraia também o valor de juros e o valor de amortização SOMENTE SE estiverem claramente decompostos no próprio texto (ex: uma tabela com colunas "Juros"/"Encargos" e "Amortização"/"Principal"). NUNCA estime, calcule ou deduza esses dois valores a partir do valor pago — se não estiverem explícitos como números separados no texto, retorne null para eles.

Retorne APENAS um objeto JSON, sem nenhum texto antes ou depois, no formato:
{
  "pagamentos": [
    { "data": "AAAA-MM-DD", "valorPago": 000.00, "valorJuros": 000.00 ou null, "valorAmortizacao": 000.00 ou null }
  ]
}

IMPORTANTE:
- Nunca invente um pagamento que não está no texto.
- Data sempre no formato AAAA-MM-DD (converta de DD/MM/AAAA se necessário).
- valorPago é obrigatório para cada item — se não houver um valor pago claro para uma linha, não inclua esse item na lista.
- Se não encontrar nenhum pagamento no texto, retorne {"pagamentos": []}.

Texto do documento:
${textoLimitado}`;
}

interface PagamentoValidado {
  data: string;
  valorPago: number;
  valorJuros: number | null;
  valorAmortizacao: number | null;
}

const REGEX_DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const REGEX_DATA_BR = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** Aceita "AAAA-MM-DD" (formato pedido no prompt) e, defensivamente, "DD/MM/AAAA" (formato
 * mais comum nos documentos de origem — cobre o caso do modelo não converter como pedido).
 * Qualquer outro formato é tratado como inválido (retorna null; o chamador decide lançar). */
function normalizarData(bruta: unknown): string | null {
  if (typeof bruta !== "string") return null;
  const valor = bruta.trim();
  if (REGEX_DATA_ISO.test(valor)) return valor;
  const casadoBr = valor.match(REGEX_DATA_BR);
  if (casadoBr) return `${casadoBr[3]}-${casadoBr[2]}-${casadoBr[1]}`;
  return null;
}

/** `valorJuros`/`valorAmortizacao` são opcionais (podem vir ausentes ou `null` quando o
 * documento não decompõe o pagamento) — mas se vierem presentes, precisam ser um número
 * válido, nunca um valor que a inserção no banco silenciosamente transformaria em outra
 * coisa. */
function normalizarValorOpcional(bruto: unknown, indice: number, campo: string): number | null {
  if (bruto === undefined || bruto === null) return null;
  const numero = typeof bruto === "number" ? bruto : Number(bruto);
  if (!Number.isFinite(numero)) {
    throw new Error(`Pagamento #${indice + 1} da resposta da IA: "${campo}" tem valor não numérico ("${String(bruto)}").`);
  }
  return numero;
}

function validarItem(item: unknown, indice: number): PagamentoValidado {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    throw new Error(`Pagamento #${indice + 1} da resposta da IA não é um objeto válido.`);
  }
  const bruto = item as Record<string, unknown>;

  const data = normalizarData(bruto.data);
  if (!data) {
    throw new Error(
      `Pagamento #${indice + 1} da resposta da IA: data ausente ou em formato não reconhecido ("${String(bruto.data)}") — esperado AAAA-MM-DD.`,
    );
  }

  const valorPago = typeof bruto.valorPago === "number" ? bruto.valorPago : Number(bruto.valorPago);
  if (!Number.isFinite(valorPago) || valorPago <= 0) {
    throw new Error(`Pagamento #${indice + 1} (${data}) da resposta da IA: valor pago ausente ou inválido ("${String(bruto.valorPago)}").`);
  }

  const valorJuros = normalizarValorOpcional(bruto.valorJuros, indice, "valorJuros");
  const valorAmortizacao = normalizarValorOpcional(bruto.valorAmortizacao, indice, "valorAmortizacao");

  return { data, valorPago, valorJuros, valorAmortizacao };
}

/** Parsing defensivo da resposta da IA: qualquer desvio do formato esperado (sem JSON
 * reconhecível, JSON inválido, "pagamentos" ausente/não-array, item sem data/valor válidos)
 * lança um erro claro em vez de inserir dado inventado ou incompleto no histórico da dívida.
 * Tudo-ou-nada: se QUALQUER item for inválido, nada é inserido (ver `extrairPagamentosDeDocumento`,
 * que só grava depois de validar a lista inteira) — evita um histórico parcialmente coerente
 * que pareceria completo sem ser. */
function extrairPagamentosValidados(textoResposta: string): PagamentoValidado[] {
  const match = textoResposta.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`Resposta da IA não contém um objeto JSON reconhecível: "${textoResposta.slice(0, 200)}"`);
  }

  let parsed: { pagamentos?: unknown };
  try {
    parsed = JSON.parse(match[0]) as { pagamentos?: unknown };
  } catch (erro) {
    throw new Error(`Resposta da IA não é um JSON válido: ${erro instanceof Error ? erro.message : String(erro)}`);
  }

  if (!Array.isArray(parsed.pagamentos)) {
    throw new Error('Resposta da IA não contém um array "pagamentos" — formato inesperado, nenhum pagamento foi inserido.');
  }

  return parsed.pagamentos.map((item, indice) => validarItem(item, indice));
}

export interface OpcoesExtracaoPagamentos {
  /** Repassado a `chamarComRoteamento` — permite injetar `config`/`provedores` em teste
   * (mesmo mecanismo documentado em ia/roteador.ts) sem tocar `fetch` global. `db` é sempre
   * forçado para o `db` recebido por esta função, mesmo se informado aqui. */
  roteador?: Omit<OpcoesRoteador, "db">;
}

/**
 * Extrai, via IA, a lista de pagamentos (data, valor pago e — quando decompostos no próprio
 * documento — juros/amortização) de um documento já vinculado a uma dívida, e insere cada um
 * em `divida_pagamentos_historico` com `origem='extraido_ia'` e `confirmado_por_usuario=0`:
 * são SEMPRE sugestões, nunca fatos, até confirmação humana explícita (ver
 * `confirmarPagamentoExtraido`). Retorna os ids inseridos, todos pendentes de confirmação.
 *
 * Antes de chamar a IA, avalia a qualidade do texto extraído (mesmo critério de
 * `ia/qualidadeOcr.ts` usado em `extrairCampos.ts`) para decidir se o roteador escalona
 * direto para um provedor pago (texto ruim) ou tenta primeiro o caminho barato local
 * (Ollama) — ver `ia/roteador.ts`.
 */
export async function extrairPagamentosDeDocumento(
  db: Database,
  documentoId: number,
  opcoes: OpcoesExtracaoPagamentos = {},
): Promise<number[]> {
  const [doc] = consultar<{ id: number; arquivo_nome: string; texto_extraido: string | null }>(
    db,
    "SELECT id, arquivo_nome, texto_extraido FROM documentos WHERE id = ?",
    [documentoId],
  );
  if (!doc) throw new Error(`Documento ${documentoId} não encontrado.`);

  const { dividaTipo, dividaId } = vinculoDaDivida(db, documentoId);

  const texto = (doc.texto_extraido ?? "").trim();
  if (texto === "") {
    throw new Error(
      `Documento "${doc.arquivo_nome}" (#${documentoId}) não tem texto extraído registrado — não há como reprocessar o arquivo original a partir só do id do documento. Reenvie o arquivo (o upload extrai o texto automaticamente) antes de tentar a extração de pagamentos por IA.`,
    );
  }

  const textoLimitado = texto.slice(0, LIMITE_CARACTERES_PROMPT);
  const avaliacaoQualidade = avaliarQualidadeTexto(textoLimitado);
  const prompt = montarPrompt(textoLimitado);

  const resultado = await chamarComRoteamento(prompt, { avaliacaoQualidade }, { ...opcoes.roteador, db });

  // Valida a resposta INTEIRA antes de inserir qualquer linha — ver o comentário de
  // extrairPagamentosValidados sobre por que é tudo-ou-nada.
  const pagamentosValidados = extrairPagamentosValidados(resultado.texto);

  // Liga esta chamada ao documento que ela processou — permite chegar de "quais pagamentos
  // este documento sugeriu" até "qual chamada de IA exata os produziu" (provedor, modelo,
  // quando, prompt truncado), mesmo padrão de classificarComIA.ts/extrairCampos.ts.
  vincularChamadaADocumento(db, resultado.registro.id, documentoId);

  const idsInseridos: number[] = [];
  for (const p of pagamentosValidados) {
    executar(
      db,
      `INSERT INTO divida_pagamentos_historico
         (divida_tipo, divida_id, data_pagamento, valor_pago, valor_juros, valor_amortizacao, origem, confirmado_por_usuario, documento_id)
       VALUES (?, ?, ?, ?, ?, ?, 'extraido_ia', 0, ?)`,
      [dividaTipo, dividaId, p.data, p.valorPago, p.valorJuros, p.valorAmortizacao, documentoId],
    );
    const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id");
    idsInseridos.push(id);
  }

  return idsInseridos;
}

export interface AjustesConfirmacaoPagamento {
  dataPagamento?: string;
  valorPago?: number;
  valorJuros?: number | null;
  valorAmortizacao?: number | null;
}

/**
 * Confirma um pagamento sugerido por IA (ou corrige e confirma): aplica os ajustes
 * informados (se houver — o usuário pode ter corrigido um valor que a IA leu errado) e seta
 * `confirmado_por_usuario = 1`. Só a partir daqui o pagamento entra nos relatórios que
 * dependem de `divida_pagamentos_historico` (ver o comentário da tabela em schema.sql).
 */
export function confirmarPagamentoExtraido(db: Database, pagamentoId: number, ajustes?: AjustesConfirmacaoPagamento): void {
  const [existente] = consultar<{ id: number }>(db, "SELECT id FROM divida_pagamentos_historico WHERE id = ?", [pagamentoId]);
  if (!existente) throw new Error(`Pagamento ${pagamentoId} não encontrado.`);

  if (ajustes?.dataPagamento !== undefined && !REGEX_DATA_ISO.test(ajustes.dataPagamento)) {
    throw new Error(`Data inválida ("${ajustes.dataPagamento}") — esperado AAAA-MM-DD.`);
  }
  if (ajustes?.valorPago !== undefined && !(ajustes.valorPago > 0)) {
    throw new Error(`Valor pago inválido (${ajustes.valorPago}) — deve ser maior que 0.`);
  }

  const campos: string[] = ["confirmado_por_usuario = 1"];
  const params: (string | number | null)[] = [];
  if (ajustes?.dataPagamento !== undefined) {
    campos.push("data_pagamento = ?");
    params.push(ajustes.dataPagamento);
  }
  if (ajustes?.valorPago !== undefined) {
    campos.push("valor_pago = ?");
    params.push(ajustes.valorPago);
  }
  if (ajustes?.valorJuros !== undefined) {
    campos.push("valor_juros = ?");
    params.push(ajustes.valorJuros);
  }
  if (ajustes?.valorAmortizacao !== undefined) {
    campos.push("valor_amortizacao = ?");
    params.push(ajustes.valorAmortizacao);
  }
  params.push(pagamentoId);

  executar(db, `UPDATE divida_pagamentos_historico SET ${campos.join(", ")} WHERE id = ?`, params);
}

/**
 * Rejeita (descarta) um pagamento sugerido por IA — remove a linha. É seguro remover porque
 * uma linha `confirmado_por_usuario = 0` nunca foi tratada como fato em nenhum relatório
 * (não é um estorno contábil, é o descarte de uma sugestão que a pessoa olhou e recusou).
 * Lança erro se o pagamento já estiver confirmado: neste ponto ele já pode ter sido usado em
 * algum relatório, e remover silenciosamente removeria um fato, não uma sugestão — quem quer
 * desfazer um pagamento confirmado usa outra via (edição/exclusão explícita), não esta.
 */
export function rejeitarPagamentoExtraido(db: Database, pagamentoId: number, motivo: string): void {
  const [existente] = consultar<{ id: number; confirmado_por_usuario: number }>(
    db,
    "SELECT id, confirmado_por_usuario FROM divida_pagamentos_historico WHERE id = ?",
    [pagamentoId],
  );
  if (!existente) throw new Error(`Pagamento ${pagamentoId} não encontrado.`);
  if (motivo.trim() === "") throw new Error("Informe o motivo da rejeição.");
  if (existente.confirmado_por_usuario === 1) {
    throw new Error(`Pagamento ${pagamentoId} já está confirmado — não pode ser rejeitado como sugestão pendente.`);
  }
  executar(db, "DELETE FROM divida_pagamentos_historico WHERE id = ?", [pagamentoId]);
}

export interface NovoPagamentoManual {
  dividaTipo: DividaTipo;
  dividaId: number;
  dataPagamento: string;
  valorPago: number;
  valorJuros?: number | null;
  valorAmortizacao?: number | null;
  observacoes?: string;
}

/**
 * Registra um pagamento digitado diretamente pelo usuário (sem upload/IA) — nasce com
 * `origem='manual'` e `confirmado_por_usuario=1`: o próprio usuário digitou o valor, não há
 * "confirmação" adicional a pedir (diferente de um valor sugerido por IA, que precisa de
 * revisão antes de virar fato). Retorna o id inserido.
 */
export function registrarPagamentoManual(db: Database, dados: NovoPagamentoManual): number {
  validarDividaTipo(dados.dividaTipo);
  if (!REGEX_DATA_ISO.test(dados.dataPagamento)) {
    throw new Error(`Data de pagamento inválida ("${dados.dataPagamento}") — esperado AAAA-MM-DD.`);
  }
  if (!(dados.valorPago > 0)) {
    throw new Error(`Valor pago inválido (${dados.valorPago}) — deve ser maior que 0.`);
  }

  executar(
    db,
    `INSERT INTO divida_pagamentos_historico
       (divida_tipo, divida_id, data_pagamento, valor_pago, valor_juros, valor_amortizacao, origem, confirmado_por_usuario, observacoes)
     VALUES (?, ?, ?, ?, ?, ?, 'manual', 1, ?)`,
    [
      dados.dividaTipo,
      dados.dividaId,
      dados.dataPagamento,
      dados.valorPago,
      dados.valorJuros ?? null,
      dados.valorAmortizacao ?? null,
      dados.observacoes?.trim() || null,
    ],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id");
  return id;
}

/** Todos os pagamentos ainda pendentes de confirmação (`confirmado_por_usuario = 0`) —
 * opcionalmente filtrados por dívida. Sem filtro, lista pendências do sistema inteiro (útil
 * para um painel de pendências); com `dividaTipo`+`dividaId`, lista só as de uma dívida
 * (o uso esperado dentro de DividasConsumoForm.tsx/FinanciamentosForm.tsx). */
export function listarPagamentosPendentesConfirmacao(
  db: Database,
  dividaTipo?: DividaTipo,
  dividaId?: number,
): PagamentoDividaHistorico[] {
  const condicoes = ["confirmado_por_usuario = 0"];
  const params: (string | number | null)[] = [];
  if (dividaTipo !== undefined) {
    condicoes.push("divida_tipo = ?");
    params.push(dividaTipo);
  }
  if (dividaId !== undefined) {
    condicoes.push("divida_id = ?");
    params.push(dividaId);
  }
  return consultar<PagamentoDividaHistorico>(
    db,
    `SELECT * FROM divida_pagamentos_historico WHERE ${condicoes.join(" AND ")} ORDER BY data_pagamento DESC, id DESC`,
    params,
  );
}

/** Histórico já confirmado (`confirmado_por_usuario = 1`) de uma dívida — extraído-e-confirmado
 * ou manual, ambos aqui; a UI distingue os dois pela coluna `origem`. Usado pela seção
 * "Histórico de pagamentos" dos formulários de dívida/financiamento (não fazia parte da lista
 * de funções pedida na Tarefa 1, mas é necessária para o requisito 3 da Tarefa 2 — "lista de
 * pagamentos já confirmados" — e seguiu o mesmo padrão de `listarPagamentosPendentesConfirmacao`
 * em vez de a tela fazer SQL solta). */
export function listarPagamentosConfirmados(db: Database, dividaTipo: DividaTipo, dividaId: number): PagamentoDividaHistorico[] {
  return consultar<PagamentoDividaHistorico>(
    db,
    "SELECT * FROM divida_pagamentos_historico WHERE confirmado_por_usuario = 1 AND divida_tipo = ? AND divida_id = ? ORDER BY data_pagamento DESC, id DESC",
    [dividaTipo, dividaId],
  );
}
