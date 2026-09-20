#!/usr/bin/env node
/**
 * Verifica um backup .sqlite exportado pelo app: restaura de verdade e confere se a
 * contabilidade dentro dele fecha.
 *
 *   node scripts/verificar-backup.mjs caminho/do/backup.sqlite
 *   node scripts/verificar-backup.mjs atual.sqlite --comparar-com anterior.sqlite
 *
 * Sai com código 0 se o backup presta, 1 se não. É isso que permite usá-lo num cron:
 * backup que falha na verificação PRECISA falhar ruidosamente, senão a rotina fica
 * "funcionando" por meses sobre arquivos imprestáveis — que é o modo mais comum de
 * perder dado com backup configurado.
 *
 * Por que existe, já que o app já calcula SHA-256 do backup: hash prova que o arquivo não
 * mudou depois de gerado. Não prova que o que foi gerado era bom. Backup de um banco já
 * corrompido tem hash perfeito.
 */

import { readFile } from "node:fs/promises";
import { argv, exit } from "node:process";



// O módulo de verificação é TypeScript. Em vez de duplicar a lógica aqui (que é o caminho
// certo para as duas cópias divergirem em silêncio), carregamos o mesmo arquivo que o app
// e os testes usam, via tsx.


const VERDE = "\x1b[32m";
const AMARELO = "\x1b[33m";
const VERMELHO = "\x1b[31m";
const CINZA = "\x1b[90m";
const FIM = "\x1b[0m";

const SIMBOLO = { ok: `${VERDE}✓${FIM}`, aviso: `${AMARELO}!${FIM}`, falha: `${VERMELHO}✗${FIM}` };

function uso() {
  console.log(`
Uso:
  node scripts/verificar-backup.mjs <backup.sqlite>
  node scripts/verificar-backup.mjs <atual.sqlite> --comparar-com <anterior.sqlite>

Sai com 0 se o backup presta, 1 se não presta.
`);
}

const args = argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  uso();
  exit(args.length === 0 ? 1 : 0);
}

const caminhoAtual = args[0];
const indiceComparar = args.indexOf("--comparar-com");
const caminhoAnterior = indiceComparar >= 0 ? args[indiceComparar + 1] : null;

if (indiceComparar >= 0 && !caminhoAnterior) {
  console.error(`${VERMELHO}--comparar-com exige o caminho do backup anterior.${FIM}`);
  exit(1);
}

const { verificarBackup, compararComAnterior } = await import(
  "../src/domain/backup/verificarBackup"
);

const localizarWasm = (arquivo) => `node_modules/sql.js/dist/${arquivo}`;

function imprimir(titulo, relatorio) {
  console.log(`\n${titulo}`);
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

let bytesAtual;
try {
  bytesAtual = new Uint8Array(await readFile(caminhoAtual));
} catch (erro) {
  console.error(`${VERMELHO}Não foi possível ler ${caminhoAtual}: ${erro.message}${FIM}`);
  exit(1);
}

const atual = await verificarBackup(bytesAtual, localizarWasm);
imprimir(`Backup: ${caminhoAtual}`, atual);

let comparacaoFalhou = false;
if (caminhoAnterior) {
  try {
    const bytesAnterior = new Uint8Array(await readFile(caminhoAnterior));
    const anterior = await verificarBackup(bytesAnterior, localizarWasm);
    const alertas = compararComAnterior(atual, anterior);
    console.log(`\nComparação com ${caminhoAnterior}`);
    for (const a of alertas) {
      console.log(`  ${SIMBOLO[a.gravidade]} ${a.nome}`);
      console.log(`${CINZA}      ${a.detalhe}${FIM}`);
    }
    comparacaoFalhou = alertas.some((a) => a.gravidade === "falha");
  } catch (erro) {
    console.error(`${AMARELO}Não foi possível comparar com o anterior: ${erro.message}${FIM}`);
  }
}

const prestavel = atual.restauravel && atual.contabilidadeIntegra && !comparacaoFalhou;
console.log(
  prestavel
    ? `\n${VERDE}Backup verificado: restaura e a contabilidade fecha.${FIM}\n`
    : `\n${VERMELHO}BACKUP IMPRESTÁVEL — não conte com este arquivo.${FIM}\n`,
);
exit(prestavel ? 0 : 1);
