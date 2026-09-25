/** Cofre de evidências: liga cada lançamento ao arquivo que o originou, por hash.
 *
 * `transacoes.documento_fonte` guarda só o NOME do arquivo. Nome não prova nada — dois
 * arquivos diferentes podem se chamar igual, e um arquivo pode ser editado sem mudar de
 * nome. Num laudo ou numa petição, "veio do extrato.ofx" não é afirmação verificável.
 *
 * O que é verificável: o SHA-256 do conteúdo. Guardado no lote, permite reapresentar o
 * arquivo anos depois e demonstrar que é byte a byte o mesmo que originou o lançamento.
 *
 * O hash usa a Web Crypto API (`crypto.subtle`), não o módulo `crypto` do Node — este app
 * roda inteiro no navegador, e o import do Node é externalizado pelo Vite e estoura em
 * tempo de execução no cliente. Ver src/domain/erp/crypto-navegador.test.ts.
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";

export interface LoteImportacao {
  id: number;
  arquivo_nome: string;
  arquivo_hash_sha256: string;
  arquivo_bytes: number;
  tipo_detectado: string;
  conta_id: number | null;
  status: "em_triagem" | "concluido" | "descartado";
  importado_em: string;
  concluido_em: string | null;
  total_linhas: number;
  observacoes: string | null;
}

/** SHA-256 do conteúdo, em hexadecimal. */
export async function hashDoArquivo(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer =
    bytes instanceof Uint8Array
      ? (bytes.slice().buffer as ArrayBuffer)
      : bytes;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashDoFile(arquivo: File): Promise<string> {
  return hashDoArquivo(await arquivo.arrayBuffer());
}

/** Lote já existente para este arquivo nesta conta, se houver.
 *
 * Reimportar o mesmo arquivo é engano comum e caro: sem esta checagem o extrato entrava
 * de novo e a dedup por `UNIQUE (conta_id, fitid)` só pegava OFX — CSV e PDF não têm
 * fitid, então dobravam receita e despesa em silêncio. */
export function loteExistente(
  db: Database,
  hash: string,
  conta_id: number | null,
): LoteImportacao | null {
  // conta_id NULL não casa com "=" em SQL; `IS` trata NULL como valor comparável.
  return (
    consultar<LoteImportacao>(
      db,
      "SELECT * FROM lotes_importacao WHERE arquivo_hash_sha256 = ? AND conta_id IS ?",
      [hash, conta_id],
    )[0] ?? null
  );
}

export interface LinhaBruta {
  data: string;
  valor: number;
  descricaoOriginal: string;
  fitid?: string | null;
}

export interface ResultadoLote {
  lote_id: number;
  ja_existia: boolean;
  linhas_registradas: number;
  linhas_malformadas: number;
  linhas_duplicata_provavel: number;
}

/** Cada campo é avaliado por si. Anular os dois quando só um está ilegível joga fora dado
 * que o parser conseguiu ler — e a triagem existe justamente para preservar o que deu
 * para extrair e deixar o resto corrigível. Uma linha com valor legível e data ilegível
 * precisa chegar à pessoa COM o valor preenchido. */
function camposLegiveis(l: LinhaBruta): { data: string | null; valor: number | null } {
  return {
    data: /^\d{4}-\d{2}-\d{2}$/.test(l.data) ? l.data : null,
    valor: Number.isFinite(l.valor) ? l.valor : null,
  };
}

/** Cria o lote e registra cada linha do arquivo em triagem — nenhuma vira transação aqui.
 *
 * Linha com data ou valor ilegível entra como 'malformada' em vez de ser descartada: o
 * fluxo antigo a jogava fora e só informava uma contagem, de modo que o dado perdido não
 * era recuperável nem localizável no arquivo. Agora ela fica listada, com o número da
 * linha, e pode ser corrigida à mão. */
export function registrarLote(
  db: Database,
  dados: {
    arquivo_nome: string;
    arquivo_hash_sha256: string;
    arquivo_bytes: number;
    tipo_detectado: string;
    conta_id: number | null;
  },
  linhas: LinhaBruta[],
): ResultadoLote {
  const existente = loteExistente(db, dados.arquivo_hash_sha256, dados.conta_id);
  if (existente) {
    return {
      lote_id: existente.id,
      ja_existia: true,
      linhas_registradas: 0,
      linhas_malformadas: 0,
      linhas_duplicata_provavel: 0,
    };
  }

  executar(
    db,
    `INSERT INTO lotes_importacao
       (arquivo_nome, arquivo_hash_sha256, arquivo_bytes, tipo_detectado, conta_id, total_linhas)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      dados.arquivo_nome,
      dados.arquivo_hash_sha256,
      dados.arquivo_bytes,
      dados.tipo_detectado,
      dados.conta_id,
      linhas.length,
    ],
  );
  const lote_id = consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id")[0].id;

  let malformadas = 0;
  linhas.forEach((linha, indice) => {
    const { data, valor } = camposLegiveis(linha);
    const faltando: string[] = [];
    if (data === null) faltando.push(`data ("${linha.data}")`);
    if (valor === null) faltando.push(`valor ("${linha.valor}")`);
    if (faltando.length > 0) malformadas++;

    executar(
      db,
      `INSERT INTO importacao_linhas
         (lote_id, linha_numero, data, valor, descricao_original, fitid, status, motivo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lote_id,
        indice + 1,
        data,
        valor,
        linha.descricaoOriginal,
        linha.fitid ?? null,
        faltando.length > 0 ? "malformada" : "pendente",
        faltando.length > 0
          ? `Ilegível no arquivo: ${faltando.join(" e ")}. O resto da linha foi preservado — corrija o campo para poder decidir.`
          : null,
      ],
    );
  });

  const duplicatas = marcarDuplicatasProvaveis(db, lote_id);

  return {
    lote_id,
    ja_existia: false,
    linhas_registradas: linhas.length,
    linhas_malformadas: malformadas,
    linhas_duplicata_provavel: duplicatas,
  };
}

/** Marca como 'duplicata_provavel' as linhas que casam com transação já existente.
 *
 * Dois critérios, do mais forte para o mais fraco:
 *   1. mesmo fitid na mesma conta — identidade declarada pelo próprio banco;
 *   2. mesma conta + mesma data + mesmo valor — o que um reimport de CSV/PDF produz.
 *
 * O critério 2 gera falso positivo legítimo (duas diárias iguais no mesmo dia, duas
 * parcelas idênticas). Por isso marca e NÃO descarta: a decisão é humana, e o motivo
 * registrado diz contra qual transação bateu. */
export function marcarDuplicatasProvaveis(db: Database, lote_id: number): number {
  const conta_id =
    consultar<{ conta_id: number | null }>(
      db,
      "SELECT conta_id FROM lotes_importacao WHERE id = ?",
      [lote_id],
    )[0]?.conta_id ?? null;
  if (conta_id === null) return 0;

  const pendentes = consultar<{
    id: number;
    data: string;
    valor: number;
    fitid: string | null;
  }>(
    db,
    "SELECT id, data, valor, fitid FROM importacao_linhas WHERE lote_id = ? AND status = 'pendente'",
    [lote_id],
  );

  let marcadas = 0;
  for (const linha of pendentes) {
    let alvo: { id: number; descricao_original: string } | undefined;
    let criterio = "";

    if (linha.fitid) {
      alvo = consultar<{ id: number; descricao_original: string }>(
        db,
        "SELECT id, descricao_original FROM transacoes WHERE conta_id = ? AND fitid = ? LIMIT 1",
        [conta_id, linha.fitid],
      )[0];
      if (alvo) criterio = `mesmo identificador do banco (FITID ${linha.fitid})`;
    }

    if (!alvo) {
      alvo = consultar<{ id: number; descricao_original: string }>(
        db,
        `SELECT id, descricao_original FROM transacoes
         WHERE conta_id = ? AND data = ? AND ABS(valor - ?) < 0.005
           AND id NOT IN (
             SELECT duplicata_de_id FROM importacao_linhas
             WHERE lote_id = ? AND duplicata_de_id IS NOT NULL
           )
         LIMIT 1`,
        [conta_id, linha.data, linha.valor, lote_id],
      )[0];
      if (alvo) criterio = "mesma conta, mesma data e mesmo valor";
    }

    if (!alvo) continue;

    executar(
      db,
      `UPDATE importacao_linhas
       SET status = 'duplicata_provavel', duplicata_de_id = ?, motivo = ?
       WHERE id = ?`,
      [
        alvo.id,
        `Possível duplicidade por ${criterio} — já existe a transação #${alvo.id} "${alvo.descricao_original}". Confira antes de aprovar.`,
        linha.id,
      ],
    );
    marcadas++;
  }
  return marcadas;
}

export interface ProvaDaTransacao {
  transacao_id: number;
  arquivo_nome: string;
  arquivo_hash_sha256: string;
  linha_numero: number;
  importado_em: string;
  decidido_em: string | null;
  decidido_por: string | null;
}

/** De onde veio este lançamento e o que prova isso.
 *
 * É a consulta que responde, para um valor qualquer na tela de transações: qual arquivo o
 * originou, em que linha dele, qual o hash desse arquivo, e quem aprovou a entrada. */
export function provaDaTransacao(db: Database, transacao_id: number): ProvaDaTransacao | null {
  return (
    consultar<ProvaDaTransacao>(
      db,
      `SELECT l.transacao_id, lo.arquivo_nome, lo.arquivo_hash_sha256,
              l.linha_numero, lo.importado_em, l.decidido_em, l.decidido_por
       FROM importacao_linhas l
       JOIN lotes_importacao lo ON lo.id = l.lote_id
       WHERE l.transacao_id = ?`,
      [transacao_id],
    )[0] ?? null
  );
}

/** Mesma prova de `provaDaTransacao`, para muitas transações de uma vez.
 *
 * A tela de transações lista até centenas de lançamentos por página. Chamar
 * `provaDaTransacao` uma vez por linha renderizada faria uma consulta SQL por linha — aqui
 * é uma única consulta com `IN (...)`, devolvida como Map para busca O(1) no render.
 *
 * Uma transação sem linha de importação ligada (dado de demonstração gerado por código,
 * lançamento manual, ou importada antes de o cofre existir) simplesmente não aparece no
 * Map — ausência de chave é a resposta "sem prova", não um erro a tratar. */
export function provasDasTransacoes(
  db: Database,
  transacao_ids: number[],
): Map<number, ProvaDaTransacao> {
  const mapa = new Map<number, ProvaDaTransacao>();
  if (transacao_ids.length === 0) return mapa;

  const placeholders = transacao_ids.map(() => "?").join(",");
  const linhas = consultar<ProvaDaTransacao>(
    db,
    `SELECT l.transacao_id, lo.arquivo_nome, lo.arquivo_hash_sha256,
            l.linha_numero, lo.importado_em, l.decidido_em, l.decidido_por
     FROM importacao_linhas l
     JOIN lotes_importacao lo ON lo.id = l.lote_id
     WHERE l.transacao_id IN (${placeholders})`,
    transacao_ids,
  );
  for (const linha of linhas) mapa.set(linha.transacao_id, linha);
  return mapa;
}
