/** Parser de argumentos de linha de comando, deliberadamente sem dependência (nem `commander`
 * nem `yargs`): os scripts de `scripts/backup/` têm meia dúzia de flags cada, não vale puxar
 * uma lib inteira para isso. Convenção: `--flag valor` vira `flags.flag = "valor"`; `--flag`
 * sem valor (ou seguido de outra flag) vira uma bandeira booleana; o resto é posicional. */

export interface ArgsParseadas {
  positional: string[];
  flags: Record<string, string>;
  bandeiras: Set<string>;
}

export function parseArgs(argv: string[]): ArgsParseadas {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  const bandeiras = new Set<string>();

  for (let i = 0; i < argv.length; i++) {
    const atual = argv[i];
    if (atual.startsWith("--")) {
      const nome = atual.slice(2);
      const proximo = argv[i + 1];
      if (proximo === undefined || proximo.startsWith("--")) {
        bandeiras.add(nome);
      } else {
        flags[nome] = proximo;
        i++;
      }
    } else if (atual === "-h") {
      bandeiras.add("help");
    } else {
      positional.push(atual);
    }
  }

  return { positional, flags, bandeiras };
}

/** Lê uma flag numérica com valor padrão — usado pelas opções de retenção
 * (`--reter-diarios-dias`, etc.), que aceitam qualquer inteiro >= 0. */
export function flagNumerica(flags: Record<string, string>, nome: string, padrao: number): number {
  const bruto = flags[nome];
  if (bruto === undefined) return padrao;
  const n = Number(bruto);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error(`--${nome} precisa ser um inteiro >= 0 (recebido: "${bruto}").`);
  }
  return n;
}

/** Valida o nome do remote do rclone.
 *
 * Existe porque a ausência dela produziu exatamente a falha que estes scripts foram feitos
 * para impedir. Passando `--remote local-teste:/tmp/destino` (nome MAIS caminho, um engano
 * natural para quem conhece a sintaxe do rclone), o script montava
 * `local-teste:/tmp/destino:backups-contabilidade` — com dois-pontos duplicado — o rclone
 * criava um diretório com esse nome literal, e o script anunciava "✓ Envio concluído".
 * Backup escrito no lugar errado com relatório de sucesso é pior que erro: a pessoa acredita
 * que tem cópia externa.
 *
 * A convenção é `--remote <nome>`: só o nome configurado em `rclone config`. O caminho
 * dentro do destino é do script (`backups-contabilidade/<série>/`), não do chamador. */
export function validarNomeRemote(remote: string): string {
  const limpo = remote.trim();
  if (limpo.length === 0) {
    throw new Error("--remote não pode ser vazio. Use o nome configurado em `rclone config`.");
  }
  if (limpo.includes(":")) {
    throw new Error(
      `--remote deve ser só o NOME do remote, sem dois-pontos nem caminho (recebido: "${remote}").\n` +
        `  Exemplo correto:  --remote gdrive\n` +
        `  O caminho dentro do destino é escolhido pelos scripts (backups-contabilidade/<série>/);\n` +
        `  passar "nome:caminho" gravaria numa pasta de nome literal errado e ainda reportaria sucesso.`,
    );
  }
  if (limpo.includes("/") || limpo.includes("\\")) {
    throw new Error(
      `--remote não aceita barra (recebido: "${remote}"). É o nome do remote, não um caminho de pasta.`,
    );
  }
  return limpo;
}
