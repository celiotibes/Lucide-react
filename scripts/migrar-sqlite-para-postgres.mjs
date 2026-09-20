#!/usr/bin/env node
// ============================================================================
// Lê um .sqlite exportado pelo app (botão "Exportar arquivo" /
// exportarArquivo() em src/db/connection.ts) e gera um .sql de carga para o
// schema Postgres (contabilidade-reconstituicao/schema.postgres.sql).
//
// NÃO conecta em banco nenhum — só lê o .sqlite (via sql.js, a mesma lib que
// o app já usa no navegador) e escreve um arquivo .sql de INSERTs. Rode com:
//
//   node scripts/migrar-sqlite-para-postgres.mjs <entrada.sqlite> <saida.sql>
//
// O .sql gerado é uma transação única (BEGIN ... COMMIT): ou entra tudo, ou
// nada — nunca deixa o banco pela metade se uma linha no meio falhar. Depois
// de gerado, revise os avisos impressos no console (datas fora de formato,
// linhas puladas) ANTES de aplicar; aplicar é responsabilidade de quem opera
// o projeto Supabase (`psql "$DATABASE_URL" -f saida.sql` ou o SQL Editor do
// Supabase), fora do escopo deste script.
//
// ----------------------------------------------------------------------------
// ORDEM DE CARGA (por que esta ordem, e não a ordem alfabética/do schema.sql)
// ----------------------------------------------------------------------------
// Toda tabela filha (com FOREIGN KEY) precisa ser carregada DEPOIS da tabela
// pai — senão o INSERT da filha falha com "violates foreign key constraint"
// porque o id que ela referencia ainda não existe do lado Postgres. A ordem
// abaixo é uma ordenação topológica do grafo de FKs de schema.sql (calculada
// programaticamente a partir do próprio arquivo — não digitada de memória;
// ver o comentário ao lado de cada tabela para a dependência que a justifica).
// Uma única exceção precisa de tratamento especial, não de reordenação:
// `ledger_entries.estornado_por_id` referencia a PRÓPRIA `ledger_entries`
// (um lançamento de estorno aponta para o lançamento estornado). Isso não dá
// pra resolver com ordem — não existe ordem que carregue uma tabela antes
// dela mesma. A solução, já embutida em schema.postgres.sql, é declarar essa
// FK específica `DEFERRABLE INITIALLY DEFERRED`: dentro de uma única
// transação (que é o que este script gera), o Postgres só confere essa FK no
// COMMIT, quando todas as linhas (inclusive a referenciada, não importa a
// ordem relativa das duas) já estão presentes.
// ----------------------------------------------------------------------------

import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ordem topológica de carga — pai antes de filho. Calculada a partir das
// REFERENCES de contabilidade-reconstituicao/schema.sql (51 tabelas).
const ORDEM_CARGA = [
  "contas_bancarias",
  "imoveis",
  "imovel_inventario_bens", // FK: imoveis
  "financiamentos", // FK: imoveis
  "dividas_consumo",
  "obras", // FK: imoveis
  "prestadores",
  "contratos_locacao", // FK: imoveis
  "contrato_reajustes", // FK: contratos_locacao
  "contrato_locatarios", // FK: contratos_locacao
  "caucoes", // FK: contratos_locacao
  "contrato_custeio_rubricas", // FK: contratos_locacao
  "contrato_franquia_hidrica", // FK: contratos_locacao
  "indices_economicos",
  "declaracoes_fiscais",
  "plano_de_contas",
  "transacoes", // FK: contas_bancarias, contratos_locacao, imoveis, plano_de_contas, prestadores
  "rateios", // FK: imoveis, transacoes
  "regras_categorizacao", // FK: imoveis, plano_de_contas
  "documentos", // FK: plano_de_contas
  "documento_imoveis", // FK: documentos, imoveis
  "documento_transacoes", // FK: documentos, transacoes
  "regras_categorizacao_documentos", // FK: imoveis, plano_de_contas
  "documentos_gerados", // FK: contratos_locacao, imoveis
  "log_alteracoes",
  "vistorias", // FK: contratos_locacao, imoveis
  "vistoria_item", // FK: vistorias
  "vistoria_anexo", // FK: vistorias
  "vistoria_log", // FK: vistorias
  "entidades_legais",
  "periodos_contabeis", // FK: entidades_legais
  "centros_custo", // FK: entidades_legais
  "contas_plano_contas", // FK: entidades_legais
  "ledger_entries", // FK: centros_custo, contas_plano_contas, entidades_legais, periodos_contabeis (+ auto-FK deferida, ver acima)
  "ledger_saldos_periodo", // FK: contas_plano_contas, periodos_contabeis
  "ledger_encerramentos", // FK: periodos_contabeis
  "regras_contabilizacao", // FK: contas_plano_contas, entidades_legais
  "apontamentos_diarios", // FK: prestadores
  "historico_horarios", // FK: apontamentos_diarios
  "itens_remuneraveis", // FK: apontamentos_diarios
  "movimentacoes_financeiras", // FK: apontamentos_diarios
  "fechamentos_semanais", // FK: prestadores
  "emprestimos", // FK: prestadores
  "retificacoes", // FK: apontamentos_diarios
  "parametros_operacionais",
  "lotes_importacao", // FK: contas_bancarias
  "importacao_linhas", // FK: lotes_importacao, plano_de_contas, transacoes
  "auditoria_log",
  "extrato_saldos_informados", // FK: contas_bancarias
  "conciliacoes_bancarias", // FK: contas_bancarias
  "conciliacoes_itens", // FK: conciliacoes_bancarias
];

// As 11 colunas que eram INTEGER 0/1 no SQLite e viraram `boolean` em
// schema.postgres.sql (ver regra 6 no cabeçalho desse arquivo). 0 -> false,
// 1 -> true, NULL -> NULL.
const COLUNAS_BOOLEAN = {
  imoveis: ["financiado", "uso_pessoal"],
  contrato_reajustes: ["eh_reajuste_anual"],
  transacoes: ["revisado"],
  rateios: ["base_incompleta"],
  centros_custo: ["ativo"],
  contas_plano_contas: ["analisavel", "ativo"],
  ledger_entries: ["auditada"],
  ledger_encerramentos: ["balancete_OK"], // renomeada no destino, ver RENOMEIA_COLUNA
  conciliacoes_bancarias: ["fechada_sem_diferenca"],
  conciliacoes_itens: ["afeta_diferenca"],
  auditoria_log: ["assinado"],
};

// Coluna cujo NOME muda entre origem (SQLite) e destino (Postgres) — hoje só
// o caso de `balancete_OK` (letra maiúscula seria "engolida" pelo Postgres
// silenciosamente; ver "achados adicionais" em schema.postgres.sql).
const RENOMEIA_COLUNA = {
  ledger_encerramentos: { balancete_OK: "balancete_ok" },
};

// Colunas DATE (não DATETIME/TEXT) de cada tabela — usadas para validar
// formato ISO (YYYY-MM-DD) antes de gerar o INSERT. Uma data fora do formato
// não impede a carga da LINHA inteira: a coluna problemática vira NULL no
// Postgres e um aviso é impresso + registrado como comentário `-- REVISAR`
// acima do INSERT afetado, para revisão humana pontual em vez de rejeitar
// silenciosamente ou travar a carga inteira por causa de uma linha.
const COLUNAS_DATE = {
  contas_bancarias: ["ativa_desde"],
  imoveis: ["data_avaliacao_venal"],
  imovel_inventario_bens: ["data_vistoria"],
  financiamentos: ["data_contrato", "data_referencia_saldo_manual"],
  dividas_consumo: ["data_referencia_saldo"],
  obras: ["data_inicio", "data_fim"],
  contratos_locacao: ["data_inicio", "data_fim"],
  contrato_reajustes: ["data_vigencia"],
  caucoes: ["data_deposito", "data_devolucao"],
  indices_economicos: ["mes_referencia"],
  declaracoes_fiscais: ["mes_referencia"],
  transacoes: ["data"],
  regras_categorizacao: ["criado_em"],
  documentos: ["data_documento", "criado_em"],
  regras_categorizacao_documentos: ["criado_em", "atualizado_em"],
  documentos_gerados: ["data_emissao"],
  apontamentos_diarios: ["data"],
  movimentacoes_financeiras: ["data_solicitacao", "data_aprovacao", "data_desconto"],
  fechamentos_semanais: ["data_inicio", "data_fim"],
  emprestimos: ["data_contratacao", "data_vencimento"],
  retificacoes: ["data_retificacao"],
  parametros_operacionais: ["vigencia_inicio", "vigencia_fim"],
  importacao_linhas: ["data"],
  extrato_saldos_informados: ["data"],
  conciliacoes_bancarias: ["data_corte"],
  ledger_entries: ["data_lancamento"],
};

const REGEX_DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

// jsonb de destino (só uma coluna no schema todo — ver schema.postgres.sql).
const COLUNAS_JSONB = {
  conciliacoes_itens: ["referencias_json"],
};

/** Tenta normalizar uma data fora do formato ISO — mesma lógica de
 * normalizarData() em src/domain/parsers/csv.ts (DD/MM/YYYY -> YYYY-MM-DD),
 * reimplementada aqui (não importada de src/, que é código de produção fora
 * do escopo deste pacote) só para recuperar o caso mais comum sem descartar
 * a linha. Qualquer coisa que não seja ISO nem DD/MM/YYYY vira aviso + NULL. */
function tentarNormalizarData(bruta) {
  if (bruta == null) return { valor: null, avisar: false };
  const s = String(bruta).trim();
  if (s === "") return { valor: null, avisar: true, motivo: "string vazia" };
  if (REGEX_DATA_ISO.test(s)) return { valor: s, avisar: false };
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const [, dia, mes, ano] = m;
    return { valor: `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`, avisar: false };
  }
  return { valor: null, avisar: true, motivo: `formato não reconhecido: "${s}"` };
}

function escaparTexto(valor) {
  return `'${String(valor).replace(/'/g, "''")}'`;
}

function formatarNumero(valor) {
  // sql.js devolve REAL como Number JS; toString() evita notação científica
  // para a faixa de valores deste domínio (dinheiro, percentuais, ids).
  if (Number.isInteger(valor)) return String(valor);
  return valor.toFixed(10).replace(/0+$/, "").replace(/\.$/, ".0");
}

async function main() {
  const [entradaArg, saidaArg] = process.argv.slice(2);
  if (!entradaArg || !saidaArg) {
    console.error("Uso: node scripts/migrar-sqlite-para-postgres.mjs <entrada.sqlite> <saida.sql>");
    process.exit(1);
  }

  const initSqlJs = require("sql.js");
  const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
  const SQL = await initSqlJs({ locateFile: () => wasmPath });

  const bytes = await readFile(entradaArg);
  const db = new SQL.Database(bytes);

  const avisos = [];
  const linhas = [];
  linhas.push("-- Gerado por scripts/migrar-sqlite-para-postgres.mjs em " + new Date().toISOString());
  linhas.push("-- Origem: " + path.basename(entradaArg));
  linhas.push("-- Aplique DEPOIS de schema.postgres.sql e rls.postgres.sql.");
  linhas.push("BEGIN;");
  linhas.push("");

  const tabelasNoArquivo = new Set(
    db.exec("SELECT name FROM sqlite_master WHERE type = 'table'")[0]?.values.map((v) => String(v[0])) ?? [],
  );

  const tabelasComIdentity = [];

  for (const tabela of ORDEM_CARGA) {
    if (!tabelasNoArquivo.has(tabela)) {
      avisos.push(`Tabela "${tabela}" não existe no .sqlite de origem — pulada (banco de uma versão anterior do schema?).`);
      continue;
    }

    const infoColunas = db.exec(`PRAGMA table_info(${tabela})`)[0];
    const colunas = infoColunas ? infoColunas.values.map((v) => String(v[1])) : [];
    if (colunas.length === 0) continue;
    // notnull vem de PRAGMA table_info (coluna índice 3: 1 = NOT NULL) — lido
    // do próprio .sqlite, não hardcoded, para não divergir se schema.sql
    // ganhar/perder NOT NULL numa coluna sem este script ser atualizado.
    const notNullPorColuna = new Map(infoColunas.values.map((v) => [String(v[1]), Number(v[3]) === 1]));

    const resultado = db.exec(`SELECT * FROM ${tabela}`);
    const linhasOrigem = resultado[0]?.values ?? [];

    if (linhasOrigem.length === 0) {
      linhas.push(`-- ${tabela}: 0 linhas na origem, nada a inserir.`);
      linhas.push("");
      continue;
    }

    // Detecta se a tabela tem PK única chamada "id" (identity no destino) —
    // é o padrão de 49 das 51 tabelas; plano_de_contas (PK "codigo") e
    // indices_economicos (PK composta) não entram no ajuste de sequence.
    if (colunas.includes("id")) tabelasComIdentity.push(tabela);

    const colunasBoolean = new Set(COLUNAS_BOOLEAN[tabela] ?? []);
    const colunasDate = new Set(COLUNAS_DATE[tabela] ?? []);
    const colunasJsonb = new Set(COLUNAS_JSONB[tabela] ?? []);
    const renomeios = RENOMEIA_COLUNA[tabela] ?? {};

    const colunasDestino = colunas.map((c) => renomeios[c] ?? c);
    const listaColunas = colunasDestino.map((c) => `"${c}"`).join(", ");

    linhas.push(`-- ${tabela}: ${linhasOrigem.length} linha(s)`);

    const idxId = colunas.indexOf("id");
    const VALORES_POR_LOTE = 500;
    const linhasPuladas = [];
    for (let inicio = 0; inicio < linhasOrigem.length; inicio += VALORES_POR_LOTE) {
      const lote = linhasOrigem.slice(inicio, inicio + VALORES_POR_LOTE);
      const tuplas = [];
      for (const linhaValores of lote) {
        let linhaInvalida = null; // motivo pelo qual a linha inteira será pulada, se houver

        const partes = colunas.map((coluna, idx) => {
          const bruto = linhaValores[idx];
          const ehNotNull = notNullPorColuna.get(coluna) === true;
          const idLinha = idxId >= 0 ? linhaValores[idxId] : "?";

          const marcarNulaEmColunaObrigatoria = (motivo) => {
            if (ehNotNull) {
              linhaInvalida = `${tabela}.${coluna} (id=${idLinha}): ${motivo} — coluna é NOT NULL, LINHA INTEIRA NÃO CARREGADA (revisar e inserir manualmente depois de corrigir).`;
            } else {
              avisos.push(`${tabela}.${coluna} (id=${idLinha}): ${motivo} — gravado como NULL (coluna aceita NULL).`);
            }
            return "NULL";
          };

          if (bruto === null || bruto === undefined) return "NULL";

          if (colunasBoolean.has(coluna)) {
            if (bruto === 0 || bruto === "0") return "false";
            if (bruto === 1 || bruto === "1") return "true";
            return marcarNulaEmColunaObrigatoria(`valor booleano inesperado "${bruto}"`);
          }

          if (colunasDate.has(coluna)) {
            const { valor, avisar, motivo } = tentarNormalizarData(bruto);
            if (avisar) return marcarNulaEmColunaObrigatoria(motivo);
            return valor === null ? "NULL" : escaparTexto(valor);
          }

          if (colunasJsonb.has(coluna)) {
            return `${escaparTexto(bruto)}::jsonb`;
          }

          if (typeof bruto === "number") return formatarNumero(bruto);
          if (typeof bruto === "string") return escaparTexto(bruto);
          // Uint8Array (coluna BLOB, nenhuma neste schema hoje) — não tratado.
          return marcarNulaEmColunaObrigatoria(`tipo de valor não tratado (${typeof bruto})`);
        });

        if (linhaInvalida) {
          avisos.push(linhaInvalida);
          linhasPuladas.push(`-- LINHA NÃO CARREGADA — ${linhaInvalida}\n-- valores originais: ${JSON.stringify(linhaValores)}`);
          continue;
        }
        tuplas.push(`  (${partes.join(", ")})`);
      }

      if (tuplas.length > 0) {
        linhas.push(`INSERT INTO ${tabela} (${listaColunas}) VALUES`);
        linhas.push(tuplas.join(",\n") + ";");
      }
    }
    if (linhasPuladas.length > 0) {
      linhas.push(`-- ${linhasPuladas.length} linha(s) de ${tabela} NÃO carregada(s) — ver avisos no console:`);
      linhas.push(...linhasPuladas);
    }
    linhas.push("");
  }

  linhas.push("-- Reajusta as sequences de identity para o próximo INSERT sem id explícito");
  linhas.push("-- não colidir com um id importado. Necessário porque toda tabela acima usa");
  linhas.push("-- GENERATED BY DEFAULT AS IDENTITY (não ALWAYS) e este script sempre informa");
  linhas.push("-- o id original — ver regra 1 no cabeçalho de schema.postgres.sql.");
  for (const tabela of tabelasComIdentity) {
    linhas.push(
      `SELECT setval(pg_get_serial_sequence('${tabela}', 'id'), COALESCE((SELECT MAX(id) FROM ${tabela}), 1), true);`,
    );
  }
  linhas.push("");
  linhas.push("COMMIT;");

  await writeFile(saidaArg, linhas.join("\n") + "\n", "utf8");

  console.log(`Gerado: ${saidaArg}`);
  console.log(`Tabelas carregadas: ${tabelasComIdentity.length + (ORDEM_CARGA.length - tabelasComIdentity.length)}`);
  if (avisos.length > 0) {
    console.log(`\n${avisos.length} aviso(s) — revise antes de aplicar:`);
    for (const aviso of avisos) console.log("  - " + aviso);
  } else {
    console.log("Nenhum aviso.");
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
