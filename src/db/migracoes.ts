import type { Database } from "sql.js";

export interface ColunaSchema {
  nome: string;
  definicao: string; // ex: "matricula TEXT" ou "regime_patrimonial TEXT NOT NULL DEFAULT 'proprio' CHECK (...)"
}

const PALAVRAS_RESERVADAS_TABELA = new Set(["PRIMARY", "FOREIGN", "UNIQUE", "CHECK", "CONSTRAINT"]);

/** Divide o corpo de um CREATE TABLE em fragmentos por vírgula, respeitando parênteses
 * aninhados (ex: CHECK (tipo IN ('a', 'b', 'c')) não pode ser cortado nas vírgulas
 * internas). */
function dividirPorVirgulaRespeitandoParenteses(texto: string): string[] {
  const partes: string[] = [];
  let profundidade = 0;
  let atual = "";
  for (const char of texto) {
    if (char === "(") profundidade++;
    if (char === ")") profundidade--;
    if (char === "," && profundidade === 0) {
      partes.push(atual);
      atual = "";
    } else {
      atual += char;
    }
  }
  if (atual.trim()) partes.push(atual);
  return partes;
}

/** Remove comentários de linha (`-- ...` até o fim da linha) antes de qualquer split —
 * sem isso, uma vírgula dentro de um comentário (comum neste schema.sql, cheio de
 * comentários explicativos) é tratada como separador de coluna, fragmentando uma única
 * definição em pedaços e transformando palavras do comentário em "colunas" fantasma. */
function removerComentariosSql(texto: string): string {
  return texto.replace(/--[^\n]*/g, "");
}

function extrairColunasDoCorpo(corpoComComentarios: string): ColunaSchema[] {
  const corpo = removerComentariosSql(corpoComComentarios);
  const colunas: ColunaSchema[] = [];
  for (const fragmentoBruto of dividirPorVirgulaRespeitandoParenteses(corpo)) {
    const fragmento = fragmentoBruto.trim().replace(/\s+/g, " ");
    if (!fragmento) continue;
    const primeiraPalavra = fragmento.split(/\s+/)[0]?.toUpperCase() ?? "";
    if (PALAVRAS_RESERVADAS_TABELA.has(primeiraPalavra)) continue; // constraint de tabela, não coluna
    const match = fragmento.match(/^(\w+)\s+([\s\S]+)$/);
    if (!match) continue;
    colunas.push({ nome: match[1], definicao: fragmento });
  }
  return colunas;
}

/** Extrai, de cada bloco `CREATE TABLE [IF NOT EXISTS] nome (...)` do schema.sql, o nome
 * de cada coluna declarada e sua definição completa (tipo + constraints inline) — usado
 * para descobrir, num banco já persistido no IndexedDB, quais colunas do schema atual
 * ainda faltam (ver garantirColunasAtualizadas). */
export function parseTabelasDoSchema(schemaSql: string): Map<string, ColunaSchema[]> {
  const tabelas = new Map<string, ColunaSchema[]>();
  const regexInicio = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(\w+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = regexInicio.exec(schemaSql)) !== null) {
    const nomeTabela = m[1];
    const inicioCorpo = m.index + m[0].length;
    let profundidade = 1;
    let i = inicioCorpo;
    for (; i < schemaSql.length && profundidade > 0; i++) {
      if (schemaSql[i] === "(") profundidade++;
      else if (schemaSql[i] === ")") profundidade--;
    }
    const corpo = schemaSql.slice(inicioCorpo, i - 1);
    tabelas.set(nomeTabela, extrairColunasDoCorpo(corpo));
  }
  return tabelas;
}

/** Extrai do schema.sql o bloco `CREATE TABLE [IF NOT EXISTS] <tabela> (...)` inteiro,
 * cru, com constraints de tabela e tudo — o que `parseTabelasDoSchema` não dá, porque ela
 * descarta justamente as constraints. Usado para reconstruir uma tabela cuja definição
 * mudou em algo que ALTER TABLE ADD COLUMN não alcança. */
export function extrairCreateTable(schemaSql: string, tabela: string): string | null {
  const regex = new RegExp(`CREATE TABLE(?:\\s+IF NOT EXISTS)?\\s+${tabela}\\s*\\(`, "i");
  const m = regex.exec(schemaSql);
  if (!m) return null;
  const inicioCorpo = m.index + m[0].length;
  let profundidade = 1;
  let i = inicioCorpo;
  for (; i < schemaSql.length && profundidade > 0; i++) {
    if (schemaSql[i] === "(") profundidade++;
    else if (schemaSql[i] === ")") profundidade--;
  }
  return schemaSql.slice(m.index, i);
}

/** Reconstrói `ledger_entries` em bancos criados por versões anteriores do schema.
 *
 * Duas constraints da versão antiga inviabilizavam o razão e nenhuma delas é alcançável
 * por ALTER TABLE ADD COLUMN, a única migração que garantirColunasAtualizadas() sabe
 * fazer — em SQLite, mudar constraint exige reconstruir a tabela:
 *
 *   1. `UNIQUE (origem_modulo, origem_id)` permitia UMA linha por documento de origem.
 *      Partida dobrada precisa de duas (débito numa conta, crédito na contrapartida), e
 *      a segunda batia na constraint. O ledger só podia nascer desbalanceado.
 *   2. O CHECK de `origem_modulo` listava 8 valores, enquanto o tipo LancamentoContabil
 *      usa 15. Sete módulos do ERP gravavam um valor que o banco real rejeitava.
 *
 * É idempotente por detecção: se a definição salva já contém a chave nova, não faz nada.
 * Os índices caem junto com a tabela antiga; quem os recria é o db.run(schemaSql) que
 * migrarBancoExistente() roda logo depois (todo CREATE INDEX usa IF NOT EXISTS). */
export function reconstruirLedgerEntries(db: Database, schemaSql: string): void {
  let definicaoAtual: string;
  try {
    const resultado = db.exec(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ledger_entries'",
    );
    const linha = resultado[0]?.values?.[0]?.[0];
    if (!linha) return; // tabela ainda não existe — schema.sql atual a criará já correta
    definicaoAtual = String(linha);
  } catch {
    return;
  }

  // Assinatura da versão nova: a chave única passou a incluir conta_id.
  const jaMigrado = /UNIQUE\s*\(\s*origem_modulo\s*,\s*origem_id\s*,\s*conta_id\s*\)/i.test(
    definicaoAtual,
  );
  if (jaMigrado) return;

  const createNovo = extrairCreateTable(schemaSql, "ledger_entries");
  if (!createNovo) {
    // eslint-disable-next-line no-console
    console.error("Migração de ledger_entries abortada: CREATE TABLE não encontrado no schema.sql");
    return;
  }

  // Copia só as colunas presentes nos DOIS lados. A tabela antiga pode não ter colunas
  // que o schema atual tem (e vice-versa, se alguma foi removida); listar explicitamente
  // evita depender da ordem posicional, que um INSERT SELECT * assumiria.
  const colunasAntigas = new Set(
    (db.exec("PRAGMA table_info(ledger_entries)")[0]?.values ?? []).map((l) => String(l[1])),
  );
  const colunasNovas = parseTabelasDoSchema(schemaSql).get("ledger_entries") ?? [];
  const comuns = colunasNovas.map((c) => c.nome).filter((nome) => colunasAntigas.has(nome));
  if (comuns.length === 0) return;
  const lista = comuns.join(", ");

  // Guarda o estado atual de foreign_keys para restaurar depois: desligar é necessário
  // durante o DROP+RENAME, mas deixar desligado mudaria o comportamento do resto do app.
  const fkAntes = Number(db.exec("PRAGMA foreign_keys")[0]?.values?.[0]?.[0] ?? 0);

  try {
    db.run("PRAGMA foreign_keys = OFF");
    db.run("BEGIN");
    // Restos de uma tentativa anterior interrompida: o IF NOT EXISTS do schema reusaria
    // a tabela meio preenchida em silêncio.
    db.run("DROP TABLE IF EXISTS ledger_entries_migracao");
    db.run(createNovo.replace(/ledger_entries/i, "ledger_entries_migracao"));
    db.run(
      `INSERT INTO ledger_entries_migracao (${lista}) SELECT ${lista} FROM ledger_entries`,
    );
    db.run("DROP TABLE ledger_entries");
    db.run("ALTER TABLE ledger_entries_migracao RENAME TO ledger_entries");
    db.run("COMMIT");
  } catch (erro) {
    try {
      db.run("ROLLBACK");
    } catch {
      /* já fora de transação */
    }
    // eslint-disable-next-line no-console
    console.error("Falha ao reconstruir ledger_entries:", erro);
  } finally {
    db.run(`PRAGMA foreign_keys = ${fkAntes ? "ON" : "OFF"}`);
  }
}

/** Migração aditiva para bancos já persistidos no IndexedDB: abrirBanco() só roda o
 * schema.sql inteiro na criação de um banco novo — um usuário que já usava o app antes
 * de uma coluna/tabela ser adicionada nunca teria essa coluna/tabela na cópia salva no
 * seu navegador, e qualquer INSERT/SELECT contra ela quebraria. Esta função compara,
 * tabela por tabela, o schema.sql atual (fonte da verdade) contra PRAGMA table_info do
 * banco carregado, e roda ALTER TABLE ADD COLUMN para cada coluna que falta. Tabelas
 * inteiramente novas (ex: dividas_consumo) são cobertas por CREATE TABLE IF NOT EXISTS
 * no próprio schema.sql, rodado antes desta função — ver abrirBanco() em connection.ts. */
export function garantirColunasAtualizadas(db: Database, schemaSql: string): void {
  const tabelasEsperadas = parseTabelasDoSchema(schemaSql);
  for (const [tabela, colunasEsperadas] of tabelasEsperadas) {
    let colunasExistentes: Set<string>;
    try {
      const resultado = db.exec(`PRAGMA table_info(${tabela})`);
      colunasExistentes = new Set((resultado[0]?.values ?? []).map((linha) => String(linha[1])));
    } catch {
      continue; // tabela deveria existir (schema.sql já rodou antes) — se não existe, não há como migrar colunas
    }
    for (const coluna of colunasEsperadas) {
      if (!colunasExistentes.has(coluna.nome)) {
        try {
          db.run(`ALTER TABLE ${tabela} ADD COLUMN ${coluna.definicao}`);
        } catch (erro) {
          // eslint-disable-next-line no-console
          console.error(`Falha ao migrar coluna ${tabela}.${coluna.nome}:`, erro);
        }
      }
    }
  }
}
