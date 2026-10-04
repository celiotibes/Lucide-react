import { describe, it, expect } from "vitest";
import initSqlJs from "sql.js";
import schemaSql from "../../contabilidade-reconstituicao/schema.sql?raw";
import { migrarBancoExistente } from "./connection";

const VIEWS_BI = [
  "v_bi_lancamento_efetivo",
  "v_bi_resultado_mensal",
  "v_bi_saldo_contas",
  "v_bi_resultado_por_centro_custo",
];

// ledger_entries como antes do estorno_de_id e do CHECK ampliado (mesma definição de migracoes.test.ts).
const LEDGER_ANTIGO = `
  CREATE TABLE ledger_entries (
    id INTEGER PRIMARY KEY, entidade_id INTEGER NOT NULL, periodo_id INTEGER NOT NULL,
    centro_custo_id INTEGER, conta_id INTEGER NOT NULL, data_lancamento DATE NOT NULL,
    valor_debito REAL, valor_credito REAL, descricao TEXT NOT NULL,
    origem_modulo TEXT NOT NULL CHECK (origem_modulo IN ('transacoes','contratos','patrimonio','caucao','financiamento','rateio','vistorias','manual')),
    origem_id INTEGER NOT NULL, referencia_documento TEXT NOT NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, criado_por INTEGER,
    auditada INTEGER NOT NULL DEFAULT 0, auditado_em DATETIME, auditado_por INTEGER,
    estornado_por_id INTEGER, motivo_estorno TEXT, UNIQUE (origem_modulo, origem_id)
  );`;

async function bancoAntigo(comViews: boolean) {
  const SQL = await initSqlJs({ locateFile: (a) => `node_modules/sql.js/dist/${a}` });
  const db = new SQL.Database();
  db.run(schemaSql);
  for (const v of [...VIEWS_BI].reverse()) db.run(`DROP VIEW IF EXISTS ${v}`);
  db.run("DROP VIEW IF EXISTS v_ledger_titular_atual");
  db.run("DROP TABLE ledger_entries");
  db.run(LEDGER_ANTIGO);
  db.run(`INSERT INTO entidades_legais (id, tipo, cpf_cnpj, nome) VALUES (1, 'pessoa_fisica', '52998224725', 'Titular')`);
  db.run(`INSERT INTO periodos_contabeis (id, entidade_id, ano, mes) VALUES (1, 1, 2024, 3)`);
  db.run(`INSERT INTO contas_plano_contas (id, entidade_id, codigo, descricao, grupo, natureza) VALUES (4101, 1, '4.1.01', 'Receita', 'receita', 'credito')`);
  db.run(
    `INSERT INTO ledger_entries (id, entidade_id, periodo_id, conta_id, data_lancamento, valor_credito,
       descricao, origem_modulo, origem_id, referencia_documento)
     VALUES (1, 1, 1, 4101, '2024-03-10', 1234.56, 'Aluguel antigo', 'transacoes', 42, 'TXN-42')`,
  );
  if (comViews) {
    // Banco salvo por uma versão que já tinha as views: elas dependem da tabela que será reconstruída.
    db.run("CREATE VIEW v_ledger_titular_atual AS SELECT le.*, le.entidade_id AS titular_economico_id FROM ledger_entries le");
    db.run(schemaSql.slice(schemaSql.indexOf("-- BEGIN READ MODELS BI")).replace(/DROP VIEW IF EXISTS v_bi_[a-z_]+;/g, ""));
  }
  return db;
}

describe("read-models BI em banco antigo", () => {
  for (const comViews of [false, true]) {
    it(`abre sem erro e as views leem o razão migrado (views pré-existentes: ${comViews})`, async () => {
      const db = await bancoAntigo(comViews);
      expect(() => migrarBancoExistente(db)).not.toThrow();

      const nomes = db.exec("SELECT name FROM sqlite_master WHERE type = 'view'")[0].values.map((l) => String(l[0]));
      expect(nomes).toEqual(expect.arrayContaining(VIEWS_BI));

      const [linha] = db.exec("SELECT competencia, credito_centavos, resultado_centavos FROM v_bi_resultado_mensal")[0].values;
      expect(linha).toEqual(["2024-03", 123456, 123456]);
      // Reabrir (idempotência do DROP+CREATE).
      expect(() => migrarBancoExistente(db)).not.toThrow();
    });
  }
});
