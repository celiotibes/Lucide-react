/** Impressão colorida de um `RelatorioVerificacao` no terminal — mesma formatação que
 * `scripts/verificar-backup.ts` já usa. Duplicada aqui de propósito (são ~15 linhas) em vez
 * de importada de lá: mantém `scripts/backup/` fechado sobre si mesmo, sem depender de um
 * script vizinho de outra pasta que pode mudar por outro motivo. É a mesma opção que
 * `verificarBackup.ts` já documenta para a função `consultar()` — duplicar um pedaço pequeno e
 * estável custa menos do que acoplar dois scripts que não precisam saber um do outro. */

import type { RelatorioVerificacao, ResultadoChecagem } from "../../../src/domain/backup/verificarBackup";

const VERDE = "\x1b[32m";
const AMARELO = "\x1b[33m";
const VERMELHO = "\x1b[31m";
const CINZA = "\x1b[90m";
const NEGRITO = "\x1b[1m";
const FIM = "\x1b[0m";

const SIMBOLO: Record<ResultadoChecagem["gravidade"], string> = {
  ok: `${VERDE}✓${FIM}`,
  aviso: `${AMARELO}!${FIM}`,
  falha: `${VERMELHO}✗${FIM}`,
};

export const CORES = { VERDE, AMARELO, VERMELHO, CINZA, NEGRITO, FIM };

export function imprimirRelatorio(titulo: string, relatorio: RelatorioVerificacao): void {
  console.log(`\n${NEGRITO}${titulo}${FIM}`);
  console.log(`${CINZA}  ${(relatorio.tamanhoBytes / 1024).toFixed(0)} KB · SHA-256 ${relatorio.hashSha256}${FIM}`);
  for (const c of relatorio.checagens) {
    console.log(`  ${SIMBOLO[c.gravidade]} ${c.nome}`);
    console.log(`${CINZA}      ${c.detalhe}${FIM}`);
  }
  const linhas = Object.entries(relatorio.contagens);
  if (linhas.length > 0) {
    console.log(`${CINZA}  conteúdo: ${linhas.map(([t, n]) => `${t}=${n}`).join(" · ")}${FIM}`);
  }
}

export function backupPrestavel(relatorio: RelatorioVerificacao): boolean {
  return relatorio.restauravel && relatorio.contabilidadeIntegra;
}
