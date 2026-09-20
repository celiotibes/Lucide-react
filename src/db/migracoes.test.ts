import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import schemaSql from "../../contabilidade-reconstituicao/schema.sql?raw";
import { parseTabelasDoSchema, garantirColunasAtualizadas, reconstruirLedgerEntries } from "./migracoes";

describe("parseTabelasDoSchema — contra o schema.sql real", () => {
  const tabelas = parseTabelasDoSchema(schemaSql);

  it("encontra todas as 51 tabelas do schema", () => {
    expect(tabelas.size).toBe(51);
    // As três últimas a entrar: conciliação bancária (saldo informado pelo extrato,
    // registro da conciliação e a decomposição da diferença).
    for (const nova of ["extrato_saldos_informados", "conciliacoes_bancarias", "conciliacoes_itens"]) {
      expect(tabelas.has(nova)).toBe(true);
    }
  });

  it("imoveis: extrai co_titular_nome corretamente apesar do comentário multilinha com parêntese desbalanceado numa única linha (achado de auditoria anterior)", () => {
    const colunas = tabelas.get("imoveis")!;
    const nomes = colunas.map((c) => c.nome);
    expect(nomes).toContain("co_titular_nome");
    expect(nomes).toContain("regime_patrimonial");
    expect(colunas.length).toBe(17);
  });

  it("contrato_custeio_rubricas (6 colunas) e contrato_franquia_hidrica (5 colunas)", () => {
    expect(tabelas.get("contrato_custeio_rubricas")!.map((c) => c.nome)).toEqual([
      "id", "contrato_id", "referencia", "descricao", "percentual", "valor_base",
    ]);
    expect(tabelas.get("contrato_franquia_hidrica")!.map((c) => c.nome)).toEqual([
      "id", "contrato_id", "ocupacao_pessoas", "franquia_total_m3", "custo_estimado_reais",
    ]);
  });

  it("documentos_gerados e log_alteracoes (tabelas novas desta sessão) são extraídas corretamente", () => {
    expect(tabelas.get("documentos_gerados")!.map((c) => c.nome)).toEqual([
      "id", "tipo", "nome_arquivo", "data_emissao", "gerado_em", "hash_sha256", "tamanho_bytes", "contrato_id", "imovel_id",
    ]);
    expect(tabelas.get("log_alteracoes")!.map((c) => c.nome)).toEqual([
      "id", "tabela", "registro_id", "operacao", "quando", "resumo", "dados_anteriores", "dados_novos",
    ]);
  });

  it("nunca inclui constraints de tabela (PRIMARY KEY composta, UNIQUE, CHECK, FOREIGN KEY) como se fossem coluna", () => {
    for (const [, colunas] of tabelas) {
      for (const nome of colunas.map((c) => c.nome.toUpperCase())) {
        expect(["PRIMARY", "FOREIGN", "UNIQUE", "CHECK", "CONSTRAINT"]).not.toContain(nome);
      }
    }
  });

  it("indices_economicos: PRIMARY KEY composta (indice, mes_referencia) não vira coluna fantasma", () => {
    expect(tabelas.get("indices_economicos")!.map((c) => c.nome)).toEqual(["indice", "mes_referencia", "taxa_mensal"]);
  });

  it("transacoes: UNIQUE (conta_id, fitid) no fim do corpo não é tratado como coluna", () => {
    const nomes = tabelas.get("transacoes")!.map((c) => c.nome);
    expect(nomes).not.toContain("UNIQUE");
    expect(nomes).toContain("fitid");
  });
});

describe("garantirColunasAtualizadas — migração aditiva num banco 'antigo' de verdade", () => {
  it("adiciona uma coluna que faltava (simulando um banco salvo antes dela existir) sem apagar dado já presente", async () => {
    const SQL = await initSqlJs({ locateFile: (arquivo) => `node_modules/sql.js/dist/${arquivo}` });
    const db = new SQL.Database();
    // Versão "antiga" da tabela imoveis — sem co_titular_nome, como um usuário que salvou o
    // banco antes dessa coluna ser adicionada ao schema.sql.
    db.run(`
      CREATE TABLE imoveis (
        id INTEGER PRIMARY KEY,
        apelido TEXT NOT NULL,
        tipo TEXT NOT NULL,
        uso_pessoal INTEGER NOT NULL DEFAULT 0,
        financiado INTEGER NOT NULL DEFAULT 0,
        regime_patrimonial TEXT NOT NULL DEFAULT 'proprio'
      )
    `);
    db.run("INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet 1', 'kitnet')");

    garantirColunasAtualizadas(db, schemaSql);

    const colunas = db.exec("PRAGMA table_info(imoveis)")[0].values.map((v) => String(v[1]));
    expect(colunas).toContain("co_titular_nome");
    expect(colunas).toContain("matricula_mae");
    expect(colunas).toContain("valor_venal_atual");

    // O dado que já existia antes da migração continua intacto.
    const [linha] = db.exec("SELECT apelido, co_titular_nome FROM imoveis WHERE id = 1")[0].values;
    expect(linha[0]).toBe("Kitnet 1");
    expect(linha[1]).toBeNull();
  });

  it("não falha (só ignora) uma tabela do schema que ainda não existe no banco", async () => {
    const SQL = await initSqlJs({ locateFile: (arquivo) => `node_modules/sql.js/dist/${arquivo}` });
    const db = new SQL.Database(); // banco totalmente vazio, nenhuma tabela
    expect(() => garantirColunasAtualizadas(db, schemaSql)).not.toThrow();
  });

  it("coluna nova com CHECK inline (rateios.base_incompleta) migra sem erro e assume o DEFAULT em linha já existente", async () => {
    const SQL = await initSqlJs({ locateFile: (arquivo) => `node_modules/sql.js/dist/${arquivo}` });
    const db = new SQL.Database();
    // Versão "antiga" de rateios — sem base_incompleta (achado desta sessão ao aplicar a
    // metodologia de rateio do SkillOS accounting-reconstruction: fallback silencioso de
    // divisão igual precisa ficar marcado, nunca indistinguível de um rateio completo).
    db.run(`
      CREATE TABLE rateios (
        id INTEGER PRIMARY KEY,
        transacao_id INTEGER NOT NULL,
        imovel_id INTEGER NOT NULL,
        criterio TEXT NOT NULL,
        percentual REAL NOT NULL,
        valor_rateado REAL NOT NULL
      )
    `);
    db.run("INSERT INTO rateios (id, transacao_id, imovel_id, criterio, percentual, valor_rateado) VALUES (1, 1, 1, 'fracao_ideal', 0.5, -50)");

    garantirColunasAtualizadas(db, schemaSql);

    const colunas = db.exec("PRAGMA table_info(rateios)")[0].values.map((v) => String(v[1]));
    expect(colunas).toContain("base_incompleta");
    const [linha] = db.exec("SELECT base_incompleta FROM rateios WHERE id = 1")[0].values;
    expect(linha[0]).toBe(0);
  });
});

describe("reconstruirLedgerEntries — banco criado antes da correção de constraint", () => {
  // Definição de ledger_entries como estava antes: uma linha por documento de origem
  // (impossibilitando a contrapartida) e um CHECK de origem_modulo com 8 valores.
  const LEDGER_ANTIGO = `
    CREATE TABLE ledger_entries (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER NOT NULL,
      periodo_id INTEGER NOT NULL,
      centro_custo_id INTEGER,
      conta_id INTEGER NOT NULL,
      data_lancamento DATE NOT NULL,
      valor_debito REAL,
      valor_credito REAL,
      descricao TEXT NOT NULL,
      origem_modulo TEXT NOT NULL CHECK (origem_modulo IN (
        'transacoes','contratos','patrimonio','caucao','financiamento','rateio','vistorias','manual'
      )),
      origem_id INTEGER NOT NULL,
      referencia_documento TEXT NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      criado_por INTEGER,
      auditada INTEGER NOT NULL DEFAULT 0,
      auditado_em DATETIME,
      auditado_por INTEGER,
      estornado_por_id INTEGER,
      motivo_estorno TEXT,
      UNIQUE (origem_modulo, origem_id)
    );`;

  async function bancoLegado() {
    const SQL = await initSqlJs({ locateFile: (a) => `node_modules/sql.js/dist/${a}` });
    const db = new SQL.Database();
    db.run(schemaSql);
    db.run("DROP TABLE ledger_entries");
    db.run(LEDGER_ANTIGO);
    // A tabela antiga não tinha FK; a nova tem. Sem as linhas-pai o INSERT passa antes da
    // migração e falha depois — por FK, não pela constraint sob teste.
    db.run(`INSERT INTO entidades_legais (id, tipo, cpf_cnpj, nome) VALUES (1, 'pessoa_fisica', '52998224725', 'Titular')`);
    db.run(`INSERT INTO periodos_contabeis (id, entidade_id, ano, mes) VALUES (1, 1, 2024, 3)`);
    for (const [id, codigo, grupo, natureza] of [
      [1101, '1.1.01', 'ativo', 'debito'],
      [4101, '4.1.01', 'receita', 'credito'],
      [6301, '6.3.01', 'despesa', 'debito'],
    ] as const) {
      db.run(
        `INSERT INTO contas_plano_contas (id, entidade_id, codigo, descricao, grupo, natureza)
         VALUES (?, 1, ?, 'Conta', ?, ?)`,
        [id, codigo, grupo, natureza],
      );
    }
    db.run(
      `INSERT INTO ledger_entries (id, entidade_id, periodo_id, conta_id, data_lancamento,
        valor_debito, descricao, origem_modulo, origem_id, referencia_documento)
       VALUES (7, 1, 1, 1101, '2024-03-10', 2500, 'Lançamento histórico', 'transacoes', 42, 'TXN-42')`,
    );
    return db;
  }

  it("preserva os lançamentos já existentes", async () => {
    const db = await bancoLegado();
    reconstruirLedgerEntries(db, schemaSql);

    const [linha] = db.exec("SELECT id, descricao, valor_debito FROM ledger_entries")[0].values;
    expect(linha).toEqual([7, "Lançamento histórico", 2500]);
  });

  it("passa a aceitar a contrapartida, que a constraint antiga barrava", async () => {
    const db = await bancoLegado();
    const inserirContrapartida = () =>
      db.run(
        `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, data_lancamento,
          valor_credito, descricao, origem_modulo, origem_id, referencia_documento)
         VALUES (1, 1, 4101, '2024-03-10', 2500, 'Contrapartida', 'transacoes', 42, 'TXN-42')`,
      );

    expect(inserirContrapartida).toThrow(/UNIQUE/i); // antes da migração
    reconstruirLedgerEntries(db, schemaSql);
    expect(inserirContrapartida).not.toThrow(); // depois
  });

  it("passa a aceitar os origem_modulo que o CHECK antigo rejeitava", async () => {
    const db = await bancoLegado();
    const inserirAdvocacia = () =>
      db.run(
        `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, data_lancamento,
          valor_debito, descricao, origem_modulo, origem_id, referencia_documento)
         VALUES (1, 1, 6301, '2024-03-10', 900, 'Honorários', 'advocacia', 1, 'ADV-1')`,
      );

    expect(inserirAdvocacia).toThrow(/CHECK/i);
    reconstruirLedgerEntries(db, schemaSql);
    expect(inserirAdvocacia).not.toThrow();
  });

  it("é idempotente — rodar de novo num banco já migrado não faz nada", async () => {
    const db = await bancoLegado();
    reconstruirLedgerEntries(db, schemaSql);
    reconstruirLedgerEntries(db, schemaSql);

    expect(db.exec("SELECT COUNT(*) FROM ledger_entries")[0].values[0][0]).toBe(1);
    expect(db.exec("SELECT name FROM sqlite_master WHERE name = 'ledger_entries_migracao'")).toEqual([]);
  });
});
