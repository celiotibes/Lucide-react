/** Classificação de transação assistida por IA — a camada que faltava.
 *
 * O que já existia antes deste módulo: classificação 100% determinística por regra salva
 * (regrasAprendidas.ts — casamento de regex contra descricao_original/CNPJ) ou 100% manual
 * (TransacoesView.tsx, categorizar()). Para uma transação sem plano_conta_codigo que
 * nenhuma regra salva capturou, não havia nada além do combo vazio esperando um clique.
 *
 * Este módulo fecha essa lacuna como uma CAMADA A MAIS, nunca uma substituição: para cada
 * transação pendente sem sugestão viva, chama o roteador multi-provedor de IA (ver
 * src/domain/ia/roteador.ts, mesmo caminho de classificarComIA.ts) pedindo um código do
 * plano de contas REAL do app (`plano_de_contas` — não confundir com `contas_plano_contas`,
 * o plano do razão contábil; ver src/domain/erp/mapeamentoPlanoApp.ts), grava a sugestão
 * com proveniência (qual chamada de IA, ver ia_chamadas/proveniencia.ts) e para por aí.
 *
 * REGRA DE OURO, sem exceção aqui: IA nunca escreve direto no razão nem classifica uma
 * transação sozinha. `gerarSugestoesPendentes` só grava linhas em
 * `sugestoes_classificacao_ia` com status='pendente' — nunca toca `transacoes` nem
 * `ledger_entries`. Só `aceitarSugestao`, chamada por um humano explicitamente, aplica a
 * classificação de verdade, e faz isso passando por `reclassificarTransacao` (estorno +
 * relançamento no razão quando a transação já tinha sido migrada) — exatamente o mesmo
 * caminho que uma reclassificação manual usa, nunca um UPDATE direto.
 *
 * AMBIGUIDADE VIRA PERGUNTA, NÃO SUGESTÃO ESCONDIDA: o prompt pede à própria IA que
 * formule uma pergunta objetiva (`pergunta_para_decisao`) quando o caso é genuinamente
 * ambíguo — duas classificações plausíveis, contraparte desconhecida, valor atípico para o
 * padrão da conta — em vez de devolver só uma sugestão de confiança baixa que o humano
 * poderia aceitar sem perceber a incerteza real por trás dela.
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { chamarComRoteamento } from "../ia/roteador";
import { atualizarConfiancaChamada, vincularChamadaATransacao } from "../ia/proveniencia";
import { reclassificarTransacao, type ResultadoReclassificacao } from "../reclassificacao/reclassificarTransacao";
import type { ConfiancaClassificacao } from "../ia/tipos";

export interface SugestaoClassificacaoIA {
  id: number;
  transacao_id: number;
  plano_conta_codigo_sugerido: string | null;
  confianca: ConfiancaClassificacao;
  explicacao: string;
  pergunta_para_decisao: string | null;
  ia_chamada_id: number | null;
  status: "pendente" | "aceita" | "rejeitada";
  criado_em: string;
  decidido_em: string | null;
  decidido_por: number | null;
}

interface LinhaSugestao {
  id: number;
  transacao_id: number;
  plano_conta_codigo_sugerido: string | null;
  confianca: ConfiancaClassificacao;
  explicacao: string;
  pergunta_para_decisao: string | null;
  ia_chamada_id: number | null;
  status: "pendente" | "aceita" | "rejeitada";
  criado_em: string;
  decidido_em: string | null;
  decidido_por: number | null;
}

function linhaParaSugestao(l: LinhaSugestao): SugestaoClassificacaoIA {
  return { ...l };
}

interface TransacaoPendente {
  id: number;
  data: string;
  valor: number;
  descricao_original: string;
}

interface ContraparteDocumento {
  cnpj_cpf_contraparte: string | null;
  nome_contraparte: string | null;
}

/** CNPJ/nome da contraparte de uma transação, via o documento (recibo/fatura/boleto) já
 * casado com ela — prioriza um casamento confirmado manualmente; na ausência de um,
 * usa o de maior score entre os sugeridos. `null` quando nenhum documento foi casado
 * ainda (o mais comum para uma transação recém-importada) — a IA classifica com o que
 * tiver disponível, nunca fabrica um CNPJ que não existe no dado. */
function buscarContraparteDaTransacao(db: Database, transacao_id: number): ContraparteDocumento | null {
  const [linha] = consultar<ContraparteDocumento>(
    db,
    `SELECT d.cnpj_cpf_contraparte, d.nome_contraparte
     FROM documento_transacoes dt
     JOIN documentos d ON d.id = dt.documento_id
     WHERE dt.transacao_id = ?
     ORDER BY (dt.status = 'confirmado') DESC, dt.score DESC
     LIMIT 1`,
    [transacao_id],
  );
  return linha ?? null;
}

interface ItemPlanoContas {
  codigo: string;
  descricao: string;
  grupo: string;
}

function montarPrompt(
  transacao: TransacaoPendente,
  contraparte: ContraparteDocumento | null,
  planoContas: ItemPlanoContas[],
): string {
  const listaContas = planoContas.map((p) => `${p.codigo} (${p.grupo}) — ${p.descricao}`).join("\n");
  return `Você é um especialista em contabilidade de locação de imóveis no Brasil, ajudando a
classificar uma transação bancária num plano de contas.

Transação a classificar:
- Data: ${transacao.data}
- Valor: R$ ${Math.abs(transacao.valor).toFixed(2)} (${transacao.valor >= 0 ? "entrada" : "saída"})
- Descrição do extrato: ${transacao.descricao_original}
- CNPJ/CPF da contraparte (de um documento já casado com esta transação, quando houver): ${contraparte?.cnpj_cpf_contraparte ?? "não identificado"}
- Nome da contraparte: ${contraparte?.nome_contraparte ?? "não identificado"}

Plano de contas disponível (código (grupo) — descrição):
${listaContas}

Retorne APENAS um objeto JSON:
{
  "codigo": "<código EXATO de um dos itens acima, ou null se genuinamente incerto>",
  "confianca": "<alta|media|baixa>",
  "explicacao": "<justificativa curta, 1-2 frases>",
  "pergunta": "<pergunta objetiva para um humano decidir — preenchida SÓ quando o caso é genuinamente ambíguo (duas classificações plausíveis, contraparte desconhecida, valor atípico para o padrão da conta), null caso contrário>"
}

IMPORTANTE:
- Nunca invente um código fora da lista acima.
- Você está apenas SUGERINDO. Nunca classifica a transação sozinho — um humano sempre decide.
- Quando estiver em dúvida real entre duas contas plausíveis (ou a contraparte for
  desconhecida, ou o valor for atípico para o padrão da conta), não force uma sugestão de
  confiança baixa escondida: formule a pergunta em "pergunta" para o humano decidir.`;
}

interface RespostaBrutaSugestao {
  codigo?: string | null;
  confianca?: ConfiancaClassificacao;
  explicacao?: string;
  pergunta?: string | null;
}

const CONFIANCAS_VALIDAS: ConfiancaClassificacao[] = ["alta", "media", "baixa"];

export interface ResultadoGeracaoSugestoes {
  /** Quantas transações pendentes foram avaliadas nesta chamada (candidatas — sem
   * classificação e sem sugestão pendente já registrada). */
  candidatas: number;
  /** Sugestões gravadas com sucesso (novas ou substituindo uma sugestão anterior não
   * pendente da mesma transação). */
  geradas: number;
  /** Das geradas, quantas vieram com pergunta_para_decisao preenchida. */
  comPergunta: number;
  /** Candidatas em que a IA falhou (rede, nenhum provedor configurado, resposta não
   * interpretável) — sem sugestão para aquela transação, sem exceção não tratada. */
  ignoradasPorErro: number;
}

/** Gera sugestões de classificação por IA para transações pendentes (`plano_conta_codigo
 * IS NULL`) que ainda não têm uma sugestão viva (`status='pendente'`) — não reprocessa
 * (nem gasta uma nova chamada de IA n)uma transação que já tem sugestão esperando decisão.
 *
 * `entidade_id` é aceito na assinatura por paridade com o resto do domínio ERP
 * (migrarTransacoesParaLedger, periodos_contabeis etc.), mas `transacoes` não tem coluna
 * de entidade própria — é um conceito de banco inteiro aqui, não por linha — então o
 * parâmetro é reservado para quando/se isso mudar e não filtra nada hoje; passar `undefined`
 * é o uso normal enquanto essa coluna não existir.
 *
 * Nunca lança: falha de rede, nenhum provedor de IA configurado, ou resposta que não é um
 * JSON interpretável para uma transação específica só faz aquela transação ficar sem
 * sugestão desta vez — as demais candidatas continuam sendo processadas normalmente. */
export async function gerarSugestoesPendentes(
  db: Database,
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars -- reservado, ver comentário acima; `transacoes` ainda não tem coluna de entidade para filtrar por */
  entidade_id?: number,
  limite = 20,
): Promise<ResultadoGeracaoSugestoes> {
  const pendentes = consultar<TransacaoPendente>(
    db,
    `SELECT t.id, t.data, t.valor, t.descricao_original
     FROM transacoes t
     WHERE t.plano_conta_codigo IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM sugestoes_classificacao_ia s
         WHERE s.transacao_id = t.id AND s.status = 'pendente'
       )
     ORDER BY t.id
     LIMIT ?`,
    [limite],
  );

  const resultado: ResultadoGeracaoSugestoes = { candidatas: pendentes.length, geradas: 0, comPergunta: 0, ignoradasPorErro: 0 };
  if (pendentes.length === 0) return resultado;

  const planoContas = consultar<ItemPlanoContas>(db, "SELECT codigo, descricao, grupo FROM plano_de_contas ORDER BY codigo");
  const codigosValidos = new Set(planoContas.map((p) => p.codigo));

  // Sequencial, não Promise.all: o roteador mantém um índice de rodízio em memória entre
  // provedores pagos (ver roteador.ts) — chamadas concorrentes disputariam esse estado
  // compartilhado sem necessidade, e o volume aqui (transações pendentes de UMA revisão)
  // nunca justifica o paralelismo.
  for (const transacao of pendentes) {
    try {
      const contraparte = buscarContraparteDaTransacao(db, transacao.id);
      const prompt = montarPrompt(transacao, contraparte, planoContas);
      const chamada = await chamarComRoteamento(prompt, {}, { db });

      const match = chamada.texto.match(/\{[\s\S]*\}/);
      if (!match) {
        resultado.ignoradasPorErro++;
        continue;
      }
      const parseado = JSON.parse(match[0]) as RespostaBrutaSugestao;
      if (!parseado.confianca || !CONFIANCAS_VALIDAS.includes(parseado.confianca) || !parseado.explicacao) {
        // Resposta sem os dois campos que a tabela exige NOT NULL — não há sugestão
        // confiável para gravar; conta como falha desta transação, sem quebrar o lote.
        resultado.ignoradasPorErro++;
        continue;
      }

      atualizarConfiancaChamada(chamada.registro.id, parseado.confianca, db);

      const codigoSugerido = parseado.codigo && codigosValidos.has(parseado.codigo) ? parseado.codigo : null;
      const pergunta = parseado.pergunta?.trim() || null;
      const iaChamadaId = /^\d+$/.test(chamada.registro.id) ? Number(chamada.registro.id) : null;

      executar(
        db,
        `INSERT INTO sugestoes_classificacao_ia
           (transacao_id, plano_conta_codigo_sugerido, confianca, explicacao, pergunta_para_decisao, ia_chamada_id, status, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, 'pendente', ?)
         ON CONFLICT(transacao_id) DO UPDATE SET
           plano_conta_codigo_sugerido = excluded.plano_conta_codigo_sugerido,
           confianca = excluded.confianca,
           explicacao = excluded.explicacao,
           pergunta_para_decisao = excluded.pergunta_para_decisao,
           ia_chamada_id = excluded.ia_chamada_id,
           status = 'pendente',
           criado_em = excluded.criado_em,
           decidido_em = NULL,
           decidido_por = NULL`,
        [transacao.id, codigoSugerido, parseado.confianca, parseado.explicacao, pergunta, iaChamadaId, new Date().toISOString()],
      );

      if (iaChamadaId !== null) vincularChamadaATransacao(db, chamada.registro.id, transacao.id);

      resultado.geradas++;
      if (pergunta) resultado.comPergunta++;
    } catch (erro) {
      // Nunca deixa o lote travar por causa de uma transação: rede fora, nenhum provedor
      // ativo, JSON malformado — a transação simplesmente segue sem sugestão desta vez, a
      // classificação determinística/manual continua funcionando normalmente para ela.
      console.error(`gerarSugestoesPendentes: falha ao sugerir para transação ${transacao.id}:`, erro);
      resultado.ignoradasPorErro++;
    }
  }

  return resultado;
}

/** Todas as sugestões PENDENTES de um conjunto de transações, numa única consulta — mesmo
 * princípio de provasDasTransacoes() (importacao/cofre.ts): a tela de transações não deve
 * pagar uma consulta ao SQLite por linha renderizada. */
export function sugestoesPendentesPorTransacao(db: Database, transacaoIds: number[]): Map<number, SugestaoClassificacaoIA> {
  if (transacaoIds.length === 0) return new Map();
  const placeholders = transacaoIds.map(() => "?").join(",");
  const linhas = consultar<LinhaSugestao>(
    db,
    `SELECT * FROM sugestoes_classificacao_ia WHERE status = 'pendente' AND transacao_id IN (${placeholders})`,
    transacaoIds,
  );
  return new Map(linhas.map((l) => [l.transacao_id, linhaParaSugestao(l)]));
}

function buscarSugestao(db: Database, sugestao_id: number): SugestaoClassificacaoIA | null {
  const [linha] = consultar<LinhaSugestao>(db, "SELECT * FROM sugestoes_classificacao_ia WHERE id = ?", [sugestao_id]);
  return linha ? linhaParaSugestao(linha) : null;
}

/** Aceita uma sugestão pendente: aplica `plano_conta_codigo_sugerido` à transação através
 * de `reclassificarTransacao` — nunca um UPDATE direto — e marca a sugestão como decidida.
 * `categorizado_por` grava 'ia' (distinto de 'manual'/'regra'), preservando de onde veio a
 * classificação mesmo depois de aceita (ver ROTULO_CATEGORIZADO_POR em TransacoesView.tsx). */
export function aceitarSugestao(
  db: Database,
  sugestao_id: number,
  usuario_id?: number,
): ResultadoReclassificacao & { sugestao_id: number } {
  const sugestao = buscarSugestao(db, sugestao_id);
  if (!sugestao) {
    return {
      sucesso: false,
      mensagem: `Sugestão ${sugestao_id} não encontrada.`,
      transacao_id: -1,
      classificacao_anterior: null,
      classificacao_nova: null,
      razao_ajustado: false,
      sugestao_id,
    };
  }
  if (sugestao.status !== "pendente") {
    return {
      sucesso: false,
      mensagem: `Sugestão ${sugestao_id} já foi decidida (status='${sugestao.status}') — não pode ser aceita de novo.`,
      transacao_id: sugestao.transacao_id,
      classificacao_anterior: null,
      classificacao_nova: null,
      razao_ajustado: false,
      sugestao_id,
    };
  }

  const resultado = reclassificarTransacao(db, sugestao.transacao_id, sugestao.plano_conta_codigo_sugerido, {
    categorizado_por: "ia",
    reclassificado_por: usuario_id,
    motivo: `Sugestão de IA aceita (confiança ${sugestao.confianca}): ${sugestao.explicacao}`,
  });
  if (!resultado.sucesso) return { ...resultado, sugestao_id };

  executar(
    db,
    "UPDATE sugestoes_classificacao_ia SET status = 'aceita', decidido_em = ?, decidido_por = ? WHERE id = ?",
    [new Date().toISOString(), usuario_id ?? null, sugestao_id],
  );

  return { ...resultado, sugestao_id };
}

/** Rejeita uma sugestão pendente — nunca toca a transação (fica exatamente como estava,
 * disponível para classificação manual, uma regra, ou uma sugestão futura da IA). `motivo`
 * é aceito para o chamador poder registrar por que (ex: telemetria/log de UI), mas as
 * colunas mínimas desta tabela não incluem um campo próprio para ele — só a decisão em si
 * (status/decidido_em/decidido_por) é persistida. */
export function rejeitarSugestao(
  db: Database,
  sugestao_id: number,
  usuario_id?: number,
  motivo?: string,
): { sucesso: boolean; mensagem: string } {
  const sugestao = buscarSugestao(db, sugestao_id);
  if (!sugestao) return { sucesso: false, mensagem: `Sugestão ${sugestao_id} não encontrada.` };
  if (sugestao.status !== "pendente") {
    return { sucesso: false, mensagem: `Sugestão ${sugestao_id} já foi decidida (status='${sugestao.status}').` };
  }

  if (motivo) {
    console.info(`rejeitarSugestao ${sugestao_id}: ${motivo}`);
  }

  executar(
    db,
    "UPDATE sugestoes_classificacao_ia SET status = 'rejeitada', decidido_em = ?, decidido_por = ? WHERE id = ?",
    [new Date().toISOString(), usuario_id ?? null, sugestao_id],
  );

  return { sucesso: true, mensagem: "Sugestão rejeitada — a transação continua sem classificação." };
}
