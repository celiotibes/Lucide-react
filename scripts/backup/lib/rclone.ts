/** Wrapper fino sobre o binário `rclone` — não sobre uma API de nuvem específica.
 *
 * A decisão de ficar agnóstico de fornecedor (o dono ainda não escolheu entre Backblaze B2,
 * Google Drive, S3 e afins — ver `scripts/backup/README.md`) só funciona se este módulo não
 * souber nada sobre o destino além do nome do "remote" já configurado via `rclone config`.
 * Tudo aqui fala com o rclone via linha de comando (`spawnSync`) e trata a resposta como
 * texto/JSON genérico — nenhuma chamada de API de nuvem, nenhum SDK, nenhuma dependência nova
 * no `package.json`. Trocar de fornecedor um dia é trocar o `remote` no `rclone config`; este
 * arquivo não muda uma linha.
 */

import { spawnSync } from "node:child_process";

const RCLONE_BIN = process.env.RCLONE_BIN?.trim() || "rclone";

export class RcloneAusenteError extends Error {
  constructor() {
    super("rclone não encontrado no PATH.");
    this.name = "RcloneAusenteError";
  }
}

/** Erro de operação do rclone (comando rodou, mas falhou) — distinto de "rclone não existe".
 * Carrega o `stderr` bruto porque é ali que o rclone explica o motivo real (remote não
 * configurado, token expirado, cota excedida, rede fora do ar). */
export class RcloneOperacaoFalhouError extends Error {
  constructor(
    public readonly comando: string[],
    public readonly codigoSaida: number | null,
    public readonly stderrBruto: string,
  ) {
    super(`rclone ${comando.join(" ")} falhou (código ${codigoSaida}): ${stderrBruto || "(sem stderr)"}`);
    this.name = "RcloneOperacaoFalhouError";
  }
}

interface ResultadoComando {
  ok: boolean;
  codigo: number | null;
  stdout: string;
  stderr: string;
}

function rodar(args: string[], timeoutMs: number): ResultadoComando {
  const r = spawnSync(RCLONE_BIN, args, {
    encoding: "utf-8",
    timeout: timeoutMs,
    maxBuffer: 128 * 1024 * 1024,
  });
  if (r.error) {
    const comErro = r.error as NodeJS.ErrnoException;
    if (comErro.code === "ENOENT") throw new RcloneAusenteError();
    throw comErro;
  }
  return { ok: r.status === 0, codigo: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function rodarOuFalhar(args: string[], timeoutMs: number): string {
  const r = rodar(args, timeoutMs);
  if (!r.ok) throw new RcloneOperacaoFalhouError(args, r.codigo, r.stderr.trim());
  return r.stdout;
}

export const MENSAGEM_INSTALACAO = `
rclone não foi encontrado no PATH deste sistema.

O rclone é a ferramenta que este script usa para enviar o backup a um destino externo
(Google Drive, Backblaze B2, S3 e mais de 70 outros) sem que o script precise saber qual —
só o nome do "remote" já configurado. Ver scripts/backup/README.md para o porquê dessa escolha
e o passo a passo específico do Google Drive.

Instale com uma das opções abaixo e rode de novo:

  # Ubuntu/Debian, se o pacote do repositório estiver disponível
  sudo apt-get update && sudo apt-get install -y rclone

  # Script oficial de instalação (Linux/macOS), sempre a versão mais recente
  sudo -v && curl https://rclone.org/install.sh | sudo bash

  # macOS via Homebrew
  brew install rclone

  # Download direto, todas as plataformas
  https://rclone.org/downloads/

Depois de instalar, configure o destino com:

  rclone config

Veja scripts/backup/README.md para o passo a passo específico do Google Drive (destino
escolhido pelo dono por enquanto) — inclusive o aviso sobre criar client_id próprio, que
passou a ser OBRIGATÓRIO (o client_id compartilhado do rclone para o Google Drive está sendo
descontinuado ao longo de 2026).
`.trim();

export interface StatusRclone {
  disponivel: boolean;
  versao?: string;
  mensagem: string;
}

/** Primeira checagem de todo script: existe um `rclone` chamável neste PATH?
 *
 * Existe de propósito separado de "o remote está configurado" (isso só se descobre tentando
 * usar o remote) — a exigência do item 6 da tarefa é que a AUSÊNCIA do rclone seja anunciada
 * com clareza e instrução, não que todo erro de rclone vire a mesma mensagem genérica. */
export function verificarRcloneDisponivel(): StatusRclone {
  try {
    const r = rodar(["version"], 15_000);
    if (!r.ok) {
      return {
        disponivel: false,
        mensagem: `rclone foi encontrado, mas 'rclone version' falhou (código ${r.codigo}):\n${(r.stderr || r.stdout).trim()}`,
      };
    }
    const primeiraLinha = r.stdout.split("\n")[0]?.trim() || "rclone (versão não identificada)";
    return { disponivel: true, versao: primeiraLinha, mensagem: primeiraLinha };
  } catch (erro) {
    if (erro instanceof RcloneAusenteError) {
      return { disponivel: false, mensagem: MENSAGEM_INSTALACAO };
    }
    return {
      disponivel: false,
      mensagem: `Erro inesperado ao checar o rclone: ${erro instanceof Error ? erro.message : String(erro)}`,
    };
  }
}

/** Cria a pasta no remote se não existir — no-op se já existir (contrato do próprio rclone:
 * `Mkdir` é idempotente em todos os backends, inclusive Drive, que mantém cache de diretório
 * e não duplica uma pasta já existente com o mesmo caminho). Chamado antes de listar ou
 * enviar, porque na primeira execução a pasta ainda não existe. */
export function garantirPasta(remote: string, caminho: string): void {
  rodarOuFalhar(["mkdir", `${remote}:${caminho}`], 60_000);
}

export interface ArquivoRemoto {
  nome: string;
  /** Caminho completo, relativo à raiz do remote (inclui a pasta). */
  caminho: string;
  tamanhoBytes: number;
  modificadoEm: Date;
}

/** Lista os arquivos (não subpastas) dentro de `caminho` no remote. Pasta vazia ou recém-criada
 * pelo `garantirPasta` volta como lista vazia, não como erro. */
export function listarArquivos(remote: string, caminho: string): ArquivoRemoto[] {
  const saida = rodarOuFalhar(["lsjson", `${remote}:${caminho}`, "--files-only"], 120_000);
  let bruto: unknown;
  try {
    bruto = JSON.parse(saida || "[]");
  } catch {
    throw new Error(`Resposta inesperada do rclone ao listar ${remote}:${caminho}: ${saida.slice(0, 500)}`);
  }
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item): ArquivoRemoto | null => {
      const nome = typeof item.Name === "string" ? item.Name : typeof item.Path === "string" ? item.Path : "";
      const modificadoEm = new Date(String(item.ModTime ?? ""));
      if (nome === "" || Number.isNaN(modificadoEm.getTime())) return null;
      return {
        nome,
        caminho: `${caminho}/${nome}`,
        tamanhoBytes: Number(item.Size ?? 0),
        modificadoEm,
      };
    })
    .filter((a): a is ArquivoRemoto => a !== null);
}

/** Envia um arquivo local para um caminho exato no remote (`copyto`, não `copy`): o destino é
 * o caminho final do arquivo, não uma pasta onde ele seria colocado com o nome original — é
 * assim que garantimos o nome com timestamp que a retenção depois usa para calcular idade. */
export function enviarArquivo(remote: string, origemLocal: string, destinoRelativo: string): void {
  rodarOuFalhar(["copyto", origemLocal, `${remote}:${destinoRelativo}`], 30 * 60_000);
}

export function baixarArquivo(remote: string, origemRelativo: string, destinoLocal: string): void {
  rodarOuFalhar(["copyto", `${remote}:${origemRelativo}`, destinoLocal], 30 * 60_000);
}

export function apagarArquivo(remote: string, caminhoRelativo: string): void {
  rodarOuFalhar(["deletefile", `${remote}:${caminhoRelativo}`], 60_000);
}
