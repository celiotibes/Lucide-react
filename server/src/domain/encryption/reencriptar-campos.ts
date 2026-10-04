/**
 * Reencriptação de colunas para a chave ativa (rotação de chaves).
 *
 * - Idempotente: só reescreve valores que não estão na chave ativa; rodar de novo é no-op.
 * - Retomável: processa em lotes, uma transação por lote, avançando por cursor (rowid).
 *   Interromper e reiniciar continua de onde parou (o que já foi migrado é pulado).
 * - Fail-closed: valor com kid desconhecido/adulterado NÃO é alterado e é contado em `falhas`.
 * - Não loga nem retorna valores, plaintext ou chaves; falhas trazem só coluna, rowid e motivo.
 */

import type Database from 'better-sqlite3';
import {
  carregarChaveiro,
  criptografarParaColuna,
  descriptografarVersionado,
  estaNaChaveAtiva,
  lerEnvelope,
  type Chaveiro,
} from './chaveiro';

export interface OpcoesReencriptacao {
  tabela: string;
  colunas: string[];
  /** Linhas por lote/transação (padrão 500). */
  lote?: number;
  /** Só conta o que seria reescrito, sem gravar. */
  dryRun?: boolean;
  /** Chaveiro; padrão: carregado do ambiente. */
  chaveiro?: Chaveiro;
  /** Retoma a partir deste rowid (exclusivo). */
  aPartirDe?: number;
}

export interface FalhaReencriptacao {
  coluna: string;
  rowid: number;
  motivo: string;
}

export interface RelatorioReencriptacao {
  tabela: string;
  dryRun: boolean;
  kidAtivo: string;
  linhasExaminadas: number;
  /** Valores já na chave ativa. */
  jaAtuais: number;
  /** Valores reescritos (em dry-run: que seriam reescritos). */
  reescritos: number;
  /** Valores nulos, vazios ou que não são envelopes (não tocados). */
  naoCifrados: number;
  /** Valores alterados por outro processo durante a rotação (serão pegos na próxima execução). */
  conflitos: number;
  falhas: FalhaReencriptacao[];
  lotes: number;
  /** Último rowid examinado; use em `aPartirDe` para retomar. */
  ultimoRowid: number;
  /** Valores que ainda não estão na chave ativa ao final (falhas + conflitos, ou a reescrever em dry-run). */
  pendentes: number;
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function ident(nome: string, tipo: string): string {
  if (!IDENT.test(nome)) throw new Error(`Identificador de ${tipo} inválido.`);
  return `"${nome}"`;
}

export function reencriptarCampos(db: Database.Database, opcoes: OpcoesReencriptacao): RelatorioReencriptacao {
  const lote = opcoes.lote ?? 500;
  if (!Number.isInteger(lote) || lote < 1) throw new Error('lote deve ser um inteiro >= 1.');
  if (!opcoes.colunas?.length) throw new Error('Informe ao menos uma coluna.');

  const chaveiro = opcoes.chaveiro ?? carregarChaveiro();
  const dryRun = opcoes.dryRun ?? false;
  const tabela = ident(opcoes.tabela, 'tabela');
  const colunas = opcoes.colunas.map((c) => ident(c, 'coluna'));

  const selecionar = db.prepare(
    `SELECT rowid AS _rid, ${colunas.join(', ')} FROM ${tabela} WHERE rowid > ? ORDER BY rowid LIMIT ?`
  );
  // Atualização otimista: só grava se o valor ainda é o que lemos.
  const atualizar = opcoes.colunas.map((_, i) =>
    db.prepare(`UPDATE ${tabela} SET ${colunas[i]} = ? WHERE rowid = ? AND ${colunas[i]} = ?`)
  );

  const rel: RelatorioReencriptacao = {
    tabela: opcoes.tabela,
    dryRun,
    kidAtivo: chaveiro.kidAtivo,
    linhasExaminadas: 0,
    jaAtuais: 0,
    reescritos: 0,
    naoCifrados: 0,
    conflitos: 0,
    falhas: [],
    lotes: 0,
    ultimoRowid: opcoes.aPartirDe ?? 0,
    pendentes: 0,
  };

  for (;;) {
    const linhas = selecionar.all(rel.ultimoRowid, lote) as Array<Record<string, unknown>>;
    if (linhas.length === 0) break;
    rel.lotes++;

    const processarLote = () => {
      for (const linha of linhas) {
        const rid = linha._rid as number;
        rel.linhasExaminadas++;
        opcoes.colunas.forEach((coluna, i) => {
          const valor = linha[coluna];
          if (typeof valor !== 'string' || valor === '') {
            rel.naoCifrados++;
            return;
          }
          const env = lerEnvelope(valor);
          if (!env) {
            rel.naoCifrados++;
            return;
          }
          if (estaNaChaveAtiva(env, chaveiro)) {
            rel.jaAtuais++;
            return;
          }
          let novo: string;
          try {
            novo = criptografarParaColuna(descriptografarVersionado(env, chaveiro), chaveiro);
          } catch (e) {
            rel.falhas.push({ coluna, rowid: rid, motivo: e instanceof Error ? e.name + ': ' + e.message : 'erro' });
            return;
          }
          if (dryRun) {
            rel.reescritos++;
            return;
          }
          const r = atualizar[i].run(novo, rid, valor);
          if (r.changes === 1) rel.reescritos++;
          else rel.conflitos++;
        });
        rel.ultimoRowid = rid;
      }
    };

    if (dryRun) processarLote();
    else db.transaction(processarLote)();

    if (linhas.length < lote) break;
  }

  rel.pendentes = dryRun ? rel.reescritos + rel.falhas.length : rel.falhas.length + rel.conflitos;
  return rel;
}
