import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { aplicarRateioPersonalizado, removerRateio } from "../rateio/motorRateio";
import { listarImoveisDoDocumento, obterDocumento, listarTransacoesVinculadas } from "./documentos";
import type { Documento } from "../types";

export interface SugestaoTransacao {
  transacaoId: number;
  data: string;
  valor: number;
  descricaoOriginal: string;
  score: number;
  motivos: string[];
}

const JANELA_DIAS_PADRAO = 15;
const TOLERANCIA_VALOR_PADRAO = 0.03; // 3%

function diferencaDias(a: string, b: string): number {
  const msPorDia = 86400000;
  return Math.abs((new Date(a + "T00:00:00").getTime() - new Date(b + "T00:00:00").getTime()) / msPorDia);
}

function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .trim();
}

// Sufixos societários/preposições genéricas demais para contar como sinal de correspondência
// por si só (ex: "DE", "LTDA" aparecendo na descrição não indica nada sobre QUAL fornecedor).
const PALAVRAS_IGNORADAS = new Set([
  "LTDA", "ME", "EIRELI", "SA", "S A", "LIMITADA", "MEI", "EPP",
  "DE", "DA", "DO", "DOS", "DAS", "E",
]);

function palavrasSignificativas(nome: string): string[] {
  return normalizarTexto(nome)
    .split(/\s+/)
    .filter((p) => p.length >= 3 && !PALAVRAS_IGNORADAS.has(p));
}

/** Extratos bancários reais quase nunca trazem a razão social completa — é comum vir
 * abreviada, truncada ou sem acento (ex.: "MELLO CONSULT LTDA" no lugar de "Mello
 * Consultoria Limitada"). Uma comparação por substring literal (como havia antes) perdia
 * esses casos por inteiro. Em vez disso, compara por PALAVRA significativa do nome
 * cadastrado, aceitando um prefixo de pelo menos 70% da palavra (ou 4 caracteres, o que for
 * maior) já como acerto daquela palavra — cobre truncamento sem se tornar fuzzy demais a
 * ponto de casar nomes só parecidos por acaso. Retorna a fração de palavras do nome que
 * encontraram correspondência na descrição (0 a 1), nunca uma pontuação binária. */
export function pontuarSemelhancaNome(nomeContraparte: string, descricaoTransacao: string): number {
  const palavras = palavrasSignificativas(nomeContraparte);
  if (palavras.length === 0) return 0;

  const descricaoNormalizada = normalizarTexto(descricaoTransacao);
  const encontradas = palavras.filter((p) => {
    const prefixo = p.slice(0, Math.max(4, Math.ceil(p.length * 0.7)));
    return descricaoNormalizada.includes(prefixo);
  });
  return encontradas.length / palavras.length;
}

/** Sugere transações candidatas a corresponder a um documento, por proximidade de valor,
 * data e (quando disponível) CNPJ/CPF ou nome do fornecedor aparecendo na descrição crua da
 * transação bancária — heurística determinística, sem IA, sem sair do navegador. Já exclui
 * transações rejeitadas manualmente para o mesmo documento. */
export function sugerirTransacoesParaDocumento(
  db: Database,
  documento: Documento,
  janelaDias = JANELA_DIAS_PADRAO,
  toleranciaValor = TOLERANCIA_VALOR_PADRAO,
): SugestaoTransacao[] {
  if (documento.valor === undefined || documento.valor === null || !documento.data_documento) return [];

  const valorMin = documento.valor * (1 - toleranciaValor);
  const valorMax = documento.valor * (1 + toleranciaValor);
  const jaTratadas = new Set(listarTransacoesVinculadas(db, documento.id).filter((v) => v.status === "rejeitado").map((v) => v.transacaoId));

  const candidatas = consultar<{ id: number; data: string; valor: number; descricao_original: string }>(
    db,
    "SELECT id, data, valor, descricao_original FROM transacoes WHERE ABS(valor) BETWEEN ? AND ?",
    [valorMin, valorMax],
  );

  const resultado: SugestaoTransacao[] = [];
  for (const t of candidatas) {
    if (jaTratadas.has(t.id)) continue;
    const dias = diferencaDias(t.data, documento.data_documento);
    if (dias > janelaDias) continue;

    let score = 0;
    const motivos: string[] = [];

    const diffValorRelativo = Math.abs(Math.abs(t.valor) - documento.valor) / documento.valor;
    if (diffValorRelativo < 0.001) {
      score += 0.5;
      motivos.push("valor exato");
    } else {
      score += 0.5 * Math.max(0, 1 - diffValorRelativo / toleranciaValor);
      motivos.push(`valor próximo (±${(diffValorRelativo * 100).toFixed(1)}%)`);
    }

    score += 0.3 * Math.max(0, 1 - dias / janelaDias);
    motivos.push(dias === 0 ? "mesma data" : `${Math.round(dias)} dia(s) de diferença`);

    if (documento.cnpj_cpf_contraparte) {
      const semFormatacao = documento.cnpj_cpf_contraparte.replace(/\D/g, "");
      if (semFormatacao.length > 0 && t.descricao_original.replace(/\D/g, "").includes(semFormatacao)) {
        score += 0.2;
        motivos.push("CNPJ/CPF encontrado na descrição");
      }
    }
    if (documento.nome_contraparte && documento.nome_contraparte.trim().length >= 3) {
      const semelhanca = pontuarSemelhancaNome(documento.nome_contraparte, t.descricao_original);
      if (semelhanca > 0) {
        score += 0.2 * semelhanca;
        motivos.push(
          semelhanca >= 0.999
            ? "nome do fornecedor encontrado na descrição"
            : `nome do fornecedor parcialmente reconhecido na descrição (${Math.round(semelhanca * 100)}% das palavras)`,
        );
      }
    }

    resultado.push({
      transacaoId: t.id,
      data: t.data,
      valor: t.valor,
      descricaoOriginal: t.descricao_original,
      score: Math.min(1, score),
      motivos,
    });
  }

  return resultado.sort((a, b) => b.score - a.score).slice(0, 10);
}

/** Vincula um documento a uma transação e propaga a classificação — categoria do plano de
 * contas e imóvel (único ou rateio proporcional entre vários, se o documento cobrir mais de
 * um) — para a transação. Só roda quando o usuário confirma explicitamente uma sugestão ou
 * vínculo manual; nunca classifica sozinho. */
export function vincularDocumento(db: Database, documentoId: number, transacaoId: number, score: number): void {
  executar(
    db,
    "INSERT OR REPLACE INTO documento_transacoes (documento_id, transacao_id, score, status) VALUES (?, ?, ?, 'confirmado')",
    [documentoId, transacaoId, score],
  );

  const documento = obterDocumento(db, documentoId);
  if (!documento) return;

  executar(
    db,
    "UPDATE transacoes SET documento_fonte = ?, plano_conta_codigo = COALESCE(?, plano_conta_codigo), categorizado_por = 'manual' WHERE id = ?",
    [documento.arquivo_nome, documento.plano_conta_codigo ?? null, transacaoId],
  );

  const imoveisDoDocumento = listarImoveisDoDocumento(db, documentoId);
  if (imoveisDoDocumento.length === 1) {
    removerRateio(db, transacaoId);
    executar(db, "UPDATE transacoes SET imovel_id = ? WHERE id = ?", [imoveisDoDocumento[0].imovel_id, transacaoId]);
  } else if (imoveisDoDocumento.length > 1) {
    aplicarRateioPersonalizado(
      db,
      transacaoId,
      imoveisDoDocumento.map((di) => ({ imovelId: di.imovel_id, percentual: di.percentual / 100 })),
    );
  }
}

export function rejeitarSugestao(db: Database, documentoId: number, transacaoId: number): void {
  executar(
    db,
    "INSERT OR REPLACE INTO documento_transacoes (documento_id, transacao_id, score, status) VALUES (?, ?, 0, 'rejeitado')",
    [documentoId, transacaoId],
  );
}
