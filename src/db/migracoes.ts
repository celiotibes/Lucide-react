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
