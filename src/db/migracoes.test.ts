import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import schemaSql from "../../contabilidade-reconstituicao/schema.sql?raw";
import { parseTabelasDoSchema, garantirColunasAtualizadas } from "./migracoes";

describe("parseTabelasDoSchema — contra o schema.sql real", () => {
  const tabelas = parseTabelasDoSchema(schemaSql);

  it("encontra todas as 24 tabelas do schema", () => {
    expect(tabelas.size).toBe(24);
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
});
