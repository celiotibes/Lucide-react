#!/usr/bin/env node

/**
 * Reencripta colunas para a chave ativa (rotação de chaves da criptografia de campo).
 *
 * Uso:
 *   tsx server/src/scripts/rotacionar-chaves.ts --tabela=clientes --colunas=cpf,email [--lote=500] [--db=data/app.db] [--dry-run]
 *   Várias tabelas: repita --tabela=<t>:<c1,c2> (ex.: --tabela=clientes:cpf,email --tabela=contas:numero)
 *
 * Chaves vêm do ambiente: FIELD_ENCRYPTION_KEYS + FIELD_ENCRYPTION_ACTIVE_KID
 * (ou a variável legada FIELD_ENCRYPTION_KEY). Ver docs/ROTACAO-DE-CHAVES.md.
 * Saída: apenas contagens. Código de saída 1 se restarem pendências/falhas.
 */

import path from 'path';
import Database from 'better-sqlite3';
import { carregarChaveiro } from '../domain/encryption/chaveiro.js';
import { reencriptarCampos } from '../domain/encryption/reencriptar-campos.js';

export interface ArgsRotacao {
  alvos: Array<{ tabela: string; colunas: string[] }>;
  lote: number;
  dryRun: boolean;
  db: string;
}

export function lerArgs(argv: string[]): ArgsRotacao {
  const out: ArgsRotacao = { alvos: [], lote: 500, dryRun: false, db: path.join(process.cwd(), 'data', 'app.db') };
  let tabelaSolta: string | undefined;
  let colunasSoltas: string[] | undefined;
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--lote=')) out.lote = Number(a.slice(7));
    else if (a.startsWith('--db=')) out.db = a.slice(5);
    else if (a.startsWith('--colunas=')) colunasSoltas = a.slice(10).split(',').filter(Boolean);
    else if (a.startsWith('--tabela=')) {
      const v = a.slice(9);
      const i = v.indexOf(':');
      if (i > 0) out.alvos.push({ tabela: v.slice(0, i), colunas: v.slice(i + 1).split(',').filter(Boolean) });
      else tabelaSolta = v;
    } else throw new Error(`Argumento desconhecido: ${a}`);
  }
  if (tabelaSolta) {
    if (!colunasSoltas?.length) throw new Error('--tabela exige --colunas.');
    out.alvos.push({ tabela: tabelaSolta, colunas: colunasSoltas });
  }
  if (out.alvos.length === 0) throw new Error('Informe --tabela=<t> --colunas=<c1,c2>.');
  if (!Number.isInteger(out.lote) || out.lote < 1) throw new Error('--lote inválido.');
  return out;
}

function main(): number {
  const args = lerArgs(process.argv.slice(2));
  const chaveiro = carregarChaveiro();
  const db = new Database(args.db);
  let pendentes = 0;
  try {
    console.log(`[rotacionar-chaves] chave ativa: ${chaveiro.kidAtivo}; kids conhecidos: ${chaveiro.kids().join(', ')}${args.dryRun ? ' (DRY-RUN, nada será gravado)' : ''}`);
    for (const alvo of args.alvos) {
      const r = reencriptarCampos(db, { ...alvo, lote: args.lote, dryRun: args.dryRun, chaveiro });
      pendentes += r.pendentes;
      console.log(
        `[rotacionar-chaves] ${r.tabela}: examinadas=${r.linhasExaminadas} reescritos=${r.reescritos} ` +
          `jaAtuais=${r.jaAtuais} naoCifrados=${r.naoCifrados} conflitos=${r.conflitos} falhas=${r.falhas.length} pendentes=${r.pendentes}`
      );
      for (const f of r.falhas.slice(0, 20)) console.log(`  falha: coluna=${f.coluna} rowid=${f.rowid} ${f.motivo}`);
    }
  } finally {
    db.close();
  }
  return pendentes > 0 ? 1 : 0;
}

// Só executa quando chamado como script (não ao importar em testes).
if (process.argv[1] && /rotacionar-chaves\.[tj]s$/.test(process.argv[1])) {
  try {
    process.exit(main());
  } catch (e) {
    console.error('[rotacionar-chaves] erro:', e instanceof Error ? e.message : 'desconhecido');
    process.exit(2);
  }
}
