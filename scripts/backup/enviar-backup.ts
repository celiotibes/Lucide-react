#!/usr/bin/env node
/**
 * Envia um backup .sqlite JÁ VERIFICADO para um destino externo ao Supabase (Google Drive,
 * por ora — ver README), com retenção. Feito para rodar via cron.
 *
 *   npm run backup:enviar -- <arquivo-ou-pasta.sqlite> --remote <nome-do-remote> [opções]
 *
 * A VERIFICAÇÃO VEM ANTES DO ENVIO E É BLOQUEANTE — não é uma etapa opcional deste script,
 * é o motivo dele existir. Subir um backup imprestável é PIOR do que não subir: cria a
 * impressão de que existe cópia redundante quando não existe. Este script reusa
 * `verificarBackup()` de `src/domain/backup/verificarBackup.ts` — a mesma função que
 * `scripts/verificar-backup.ts` usa — em vez de reimplementar a checagem; um backup que não
 * restaura, ou cujo razão não fecha, nunca chega a tentar o envio.
 *
 * Códigos de saída (pensados para cron — silêncio não pode significar sucesso):
 *   0 = verificado e enviado (e retenção aplicada) com sucesso.
 *   1 = BACKUP REPROVADO na verificação — nada foi enviado. Não é falha deste script, é
 *       achado dele: o backup mais recente está ruim. Ver "o que fazer quando falha" no README.
 *   2 = falha operacional: uso incorreto, rclone ausente, remote inacessível, envio ou
 *       retenção falharam por erro de rede/permissão/cota. O backup em si pode estar bom —
 *       é a tentativa de enviá-lo que não completou.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { argv, exit } from "node:process";

import { verificarBackup } from "../../src/domain/backup/verificarBackup";
import { parseArgs, flagNumerica, validarNomeRemote } from "./lib/args";
import { imprimirRelatorio, backupPrestavel, CORES } from "./lib/relatorio";
import {
  verificarRcloneDisponivel,
  garantirPasta,
  listarArquivos,
  enviarArquivo,
  apagarArquivo,
  RcloneOperacaoFalhouError,
} from "./lib/rclone";
import { categoriasDoEnvio, arquivosParaApagar, reterDiasDaCategoria, POLITICA_PADRAO, CATEGORIAS, type Categoria, type PoliticaRetencao } from "./lib/retencao";

const { VERDE, AMARELO, VERMELHO, CINZA, NEGRITO, FIM } = CORES;

class ErroOperacional extends Error {}

function uso(): void {
  console.log(`
Uso:
  npm run backup:enviar -- <backup.sqlite | pasta-com-backups> --remote <nome> [opções]

Envia o backup mais recente (verificado antes) para o remote configurado via 'rclone config',
com retenção em três séries: diários, semanais, mensais.

Opções:
  --remote <nome>            Nome do remote do rclone (obrigatório).
  --pasta <caminho>           Pasta base no remote. Padrão: "backups-contabilidade".
  --forcar <a,b>              Força o envio também para estas séries além das do calendário
                               (valores: diarios, semanais, mensais). Uso: cobrir manualmente
                               um dia em que o cron não rodou.
  --reter-diarios-dias <n>    Padrão: 14.
  --reter-semanais-dias <n>   Padrão: 90.
  --reter-mensais-dias <n>    Padrão: 3650 (10 anos). 0 = nunca apagar.
  --dia-semanal <1-7>         1=segunda … 7=domingo. Padrão: 7 (domingo).
  --dia-mensal <1-31>         Padrão: 1.
  --help                      Mostra esta ajuda.

Códigos de saída: 0 sucesso · 1 backup reprovado (nada enviado) · 2 falha operacional.
`);
}

async function resolverArquivoBackup(caminho: string): Promise<string> {
  const info = await stat(caminho).catch(() => null);
  if (!info) throw new ErroOperacional(`Caminho não encontrado: ${caminho}`);
  if (info.isFile()) return caminho;
  if (!info.isDirectory()) throw new ErroOperacional(`Caminho não é arquivo nem pasta: ${caminho}`);

  const entradas = await readdir(caminho);
  const candidatos = entradas.filter((f) => f.toLowerCase().endsWith(".sqlite"));
  if (candidatos.length === 0) throw new ErroOperacional(`Nenhum arquivo .sqlite encontrado em ${caminho}`);

  const comData = await Promise.all(
    candidatos.map(async (f) => ({ f, mtime: (await stat(join(caminho, f))).mtimeMs })),
  );
  comData.sort((a, b) => b.mtime - a.mtime);
  return join(caminho, comData[0].f);
}

function nomeArquivoRemoto(agora: Date, hashSha256: string): string {
  const carimbo = agora.toISOString().replace(/:/g, "-").replace(/\.\d+Z$/, "Z");
  return `backup-${carimbo}_${hashSha256.slice(0, 10)}.sqlite`;
}

function parsePoliticaDosFlags(flags: Record<string, string>): PoliticaRetencao {
  const diaSemanal = flagNumerica(flags, "dia-semanal", POLITICA_PADRAO.semanais.diaISO);
  const diaMensal = flagNumerica(flags, "dia-mensal", POLITICA_PADRAO.mensais.diaDoMes);
  if (diaSemanal < 1 || diaSemanal > 7) throw new ErroOperacional("--dia-semanal precisa estar entre 1 e 7.");
  if (diaMensal < 1 || diaMensal > 31) throw new ErroOperacional("--dia-mensal precisa estar entre 1 e 31.");
  return {
    diarios: { reterDias: flagNumerica(flags, "reter-diarios-dias", POLITICA_PADRAO.diarios.reterDias) },
    semanais: { reterDias: flagNumerica(flags, "reter-semanais-dias", POLITICA_PADRAO.semanais.reterDias), diaISO: diaSemanal },
    mensais: { reterDias: flagNumerica(flags, "reter-mensais-dias", POLITICA_PADRAO.mensais.reterDias), diaDoMes: diaMensal },
  };
}

function parseForcar(bruto: string | undefined): Set<Categoria> {
  if (!bruto) return new Set();
  const validas = new Set<string>(CATEGORIAS);
  const partes = bruto.split(",").map((s) => s.trim()).filter(Boolean);
  for (const p of partes) {
    if (!validas.has(p)) throw new ErroOperacional(`--forcar recebeu categoria desconhecida: "${p}" (válidas: ${CATEGORIAS.join(", ")}).`);
  }
  return new Set(partes as Categoria[]);
}

const localizarWasm = (arquivo: string) => `node_modules/sql.js/dist/${arquivo}`;

async function principal(): Promise<number> {
  const { positional, flags, bandeiras } = parseArgs(argv.slice(2));

  if (bandeiras.has("help") || positional.length === 0) {
    uso();
    return positional.length === 0 && !bandeiras.has("help") ? 2 : 0;
  }

  const remoteBruto = flags["remote"];
  if (!remoteBruto) throw new ErroOperacional("--remote é obrigatório. Veja --help.");
  // Valida ANTES de qualquer contato com o rclone: `--remote nome:caminho` montava um
  // caminho com dois-pontos duplicado, gravava numa pasta de nome literal errado e ainda
  // reportava "Envio concluído". Ver validarNomeRemote().
  let remote: string;
  try {
    remote = validarNomeRemote(remoteBruto);
  } catch (erro) {
    throw new ErroOperacional(erro instanceof Error ? erro.message : String(erro));
  }
  const pastaBase = flags["pasta"] || "backups-contabilidade";
  const politica = parsePoliticaDosFlags(flags);
  const forcar = parseForcar(flags["forcar"]);

  // 1) Verificação — bloqueante, roda ANTES de qualquer contato com o rclone.
  const caminhoLocal = await resolverArquivoBackup(positional[0]);
  console.log(`${CINZA}Verificando ${caminhoLocal} antes de considerar o envio…${FIM}`);
  const bytes = new Uint8Array(await readFile(caminhoLocal));
  const relatorio = await verificarBackup(bytes, localizarWasm);
  imprimirRelatorio(`Verificação: ${caminhoLocal}`, relatorio);

  if (!backupPrestavel(relatorio)) {
    console.log(`\n${VERMELHO}${NEGRITO}BACKUP REPROVADO — nada foi enviado ao ${remote}.${FIM}`);
    console.log(
      `${VERMELHO}Subir este arquivo seria pior do que não ter cópia externa: criaria a impressão de que existe backup ` +
        `redundante quando o que existe é um arquivo que não presta. Corrija a origem do backup (banco local) antes de tentar de novo.${FIM}\n`,
    );
    return 1;
  }
  console.log(`${VERDE}Backup verificado — restaura e a contabilidade fecha. Prosseguindo com o envio.${FIM}`);

  // 2) rclone disponível?
  const status = verificarRcloneDisponivel();
  if (!status.disponivel) {
    console.error(`\n${VERMELHO}${status.mensagem}${FIM}\n`);
    return 2;
  }
  console.log(`${CINZA}rclone: ${status.versao}${FIM}`);

  // 3) Quais séries este envio atende, e envio de fato.
  const agora = new Date();
  const categorias = categoriasDoEnvio(agora, politica, forcar);
  const nomeArquivo = nomeArquivoRemoto(agora, relatorio.hashSha256);
  console.log(`\n${NEGRITO}Enviando para: ${categorias.join(", ")}${FIM}`);

  for (const categoria of categorias) {
    const pastaCategoria = `${pastaBase}/${categoria}`;
    const destino = `${pastaCategoria}/${nomeArquivo}`;
    garantirPasta(remote, pastaCategoria);
    enviarArquivo(remote, caminhoLocal, destino);
    console.log(`  ${VERDE}✓${FIM} ${remote}:${destino}`);
  }

  // 4) Retenção — uma passada por série, só nas séries deste envio (as outras não mudaram).
  console.log(`\n${NEGRITO}Retenção${FIM}`);
  for (const categoria of categorias) {
    const pastaCategoria = `${pastaBase}/${categoria}`;
    const reterDias = reterDiasDaCategoria(politica, categoria);
    const arquivos = listarArquivos(remote, pastaCategoria);
    const paraApagar = arquivosParaApagar(arquivos, agora, reterDias);
    if (reterDias <= 0) {
      console.log(`  ${CINZA}${categoria}: retenção desligada (reterDias=0) — ${arquivos.length} arquivo(s), nada apagado.${FIM}`);
      continue;
    }
    for (const a of paraApagar) {
      apagarArquivo(remote, a.caminho);
      console.log(`  ${AMARELO}−${FIM} ${remote}:${a.caminho} ${CINZA}(mais velho que ${reterDias} dias)${FIM}`);
    }
    console.log(
      `  ${categoria}: ${arquivos.length} arquivo(s) antes da poda, ${paraApagar.length} apagado(s), ` +
        `${arquivos.length - paraApagar.length} mantido(s).`,
    );
  }

  console.log(`\n${VERDE}${NEGRITO}Envio concluído: ${remote}:${pastaBase} (${categorias.join(", ")}).${FIM}\n`);
  return 0;
}

principal()
  .then((codigo) => exit(codigo))
  .catch((erro) => {
    if (erro instanceof ErroOperacional) {
      console.error(`${VERMELHO}${erro.message}${FIM}`);
    } else if (erro instanceof RcloneOperacaoFalhouError) {
      console.error(`${VERMELHO}${erro.message}${FIM}`);
    } else {
      console.error(`${VERMELHO}Erro inesperado: ${erro instanceof Error ? erro.stack || erro.message : String(erro)}${FIM}`);
    }
    exit(2);
  });
