#!/usr/bin/env node
/**
 * Baixa o backup MAIS RECENTE que está no destino externo e roda a mesma verificação de
 * restauração usada antes do envio — desta vez sobre o que efetivamente chegou lá, não sobre
 * o arquivo local que foi enviado.
 *
 * Esse é o passo que `enviar-backup.ts` sozinho NÃO prova: um envio que retornou sucesso
 * mostra que o rclone terminou sem erro, não que o fornecedor guardou os bytes certos. Um
 * upload truncado por queda de conexão, ou um arquivo corrompido silenciosamente pelo lado do
 * fornecedor, é indistinguível de um backup bom até a hora do aperto — e a hora do aperto é
 * exatamente quando não dá para descobrir isso. Rodar este script periodicamente (ver README,
 * recomendação: semanal) é o que efetivamente prova que a cópia serve.
 *
 *   npm run backup:verificar-remoto -- --remote <nome> [opções]
 *
 * Códigos de saída:
 *   0 = baixou e verificou: o arquivo no destino restaura e a contabilidade fecha.
 *   1 = baixou, mas o arquivo no destino está ruim — a cópia externa NÃO presta como estava.
 *       É o pior caso: parecia que existia backup redundante e não existe um bom.
 *   2 = falha operacional: rclone ausente, remote inacessível, série vazia, download falhou.
 */

import { readFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { argv, exit } from "node:process";

import { verificarBackup } from "../../src/domain/backup/verificarBackup";
import { parseArgs, validarNomeRemote } from "./lib/args";
import { imprimirRelatorio, backupPrestavel, CORES } from "./lib/relatorio";
import { verificarRcloneDisponivel, listarArquivos, baixarArquivo, RcloneOperacaoFalhouError } from "./lib/rclone";
import { CATEGORIAS, type Categoria } from "./lib/retencao";

const { VERDE, VERMELHO, CINZA, NEGRITO, FIM } = CORES;

class ErroOperacional extends Error {}

function uso(): void {
  console.log(`
Uso:
  npm run backup:verificar-remoto -- --remote <nome> [opções]

Baixa o backup mais recente do destino configurado e roda a verificação de restauração nele —
prova que a cópia externa serve, não só que o envio "deu certo".

Opções:
  --remote <nome>       Nome do remote do rclone (obrigatório).
  --pasta <caminho>      Pasta base no remote. Padrão: "backups-contabilidade".
  --categoria <nome>     Qual série checar: diarios, semanais ou mensais. Padrão: diarios.
  --help                 Mostra esta ajuda.

Códigos de saída: 0 presta · 1 arquivo no destino está ruim · 2 falha operacional.
`);
}

const localizarWasm = (arquivo: string) => `node_modules/sql.js/dist/${arquivo}`;

async function principal(): Promise<number> {
  const { flags, bandeiras } = parseArgs(argv.slice(2));

  if (bandeiras.has("help")) {
    uso();
    return 0;
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
  const categoria = (flags["categoria"] || "diarios") as Categoria;
  if (!CATEGORIAS.includes(categoria)) {
    throw new ErroOperacional(`--categoria inválida: "${categoria}" (válidas: ${CATEGORIAS.join(", ")}).`);
  }

  const status = verificarRcloneDisponivel();
  if (!status.disponivel) {
    console.error(`\n${VERMELHO}${status.mensagem}${FIM}\n`);
    return 2;
  }
  console.log(`${CINZA}rclone: ${status.versao}${FIM}`);

  const pastaCategoria = `${pastaBase}/${categoria}`;
  const arquivos = listarArquivos(remote, pastaCategoria);
  if (arquivos.length === 0) {
    console.error(`${VERMELHO}Nenhum arquivo encontrado em ${remote}:${pastaCategoria} — nada para verificar.${FIM}`);
    return 2;
  }
  const maisRecente = arquivos.reduce((a, b) => (a.modificadoEm > b.modificadoEm ? a : b));
  console.log(
    `${NEGRITO}Mais recente em ${remote}:${pastaCategoria}:${FIM} ${maisRecente.nome} ` +
      `${CINZA}(${maisRecente.modificadoEm.toISOString()}, ${(maisRecente.tamanhoBytes / 1024).toFixed(0)} KB)${FIM}`,
  );

  const pastaTemp = await mkdtemp(join(tmpdir(), "verificar-backup-remoto-"));
  const destinoLocal = join(pastaTemp, maisRecente.nome);
  try {
    console.log(`${CINZA}Baixando para verificar…${FIM}`);
    baixarArquivo(remote, maisRecente.caminho, destinoLocal);

    const bytes = new Uint8Array(await readFile(destinoLocal));
    const relatorio = await verificarBackup(bytes, localizarWasm);
    imprimirRelatorio(`Verificação do arquivo baixado: ${remote}:${maisRecente.caminho}`, relatorio);

    if (!backupPrestavel(relatorio)) {
      console.log(
        `\n${VERMELHO}${NEGRITO}A CÓPIA EXTERNA NÃO PRESTA — o arquivo mais recente em ${remote}:${pastaCategoria} ` +
          `não restaura corretamente ou a contabilidade não fecha.${FIM}`,
      );
      console.log(
        `${VERMELHO}Isto é justamente o que a verificação do lado do envio não detecta: o upload pode ter "dado certo" e ` +
          `o arquivo do outro lado, mesmo assim, não servir. Trate como se não houvesse backup externo até corrigir.${FIM}\n`,
      );
      return 1;
    }
    console.log(`\n${VERDE}${NEGRITO}Cópia externa verificada: restaura e a contabilidade fecha.${FIM}\n`);
    return 0;
  } finally {
    await unlink(destinoLocal).catch(() => {});
  }
}

principal()
  .then((codigo) => exit(codigo))
  .catch((erro) => {
    if (erro instanceof ErroOperacional || erro instanceof RcloneOperacaoFalhouError) {
      console.error(`${VERMELHO}${erro.message}${FIM}`);
    } else {
      console.error(`${VERMELHO}Erro inesperado: ${erro instanceof Error ? erro.stack || erro.message : String(erro)}${FIM}`);
    }
    exit(2);
  });
