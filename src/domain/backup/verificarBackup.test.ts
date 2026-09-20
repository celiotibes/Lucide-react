import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import { criarEntidadeLegal, sincronizarRazao } from "../erp/entidadeLegal";
import { compararComAnterior, verificarBackup, type RelatorioVerificacao } from "./verificarBackup";

/** O WASM do sql.js vem de node_modules no Node e de `/sql-wasm.wasm` no navegador —
 * mesmo motivo pelo qual fixtureDb.ts precisa do próprio resolvedor. */
const WASM_NODE = (arquivo: string) => `node_modules/sql.js/dist/${arquivo}`;

let db: Database;
let entidade_id: number;

const CPF_TESTE = "52998224725";

beforeEach(async () => {
  db = await criarBancoDeTeste();
  executar(
    db,
    "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo) VALUES (1, 'Teste', '0001', '12345', 'Titular', 'corrente')",
  );
  executar(
    db,
    "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet 101', 'kitnet')",
  );
  const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: CPF_TESTE });
  entidade_id = r.entidade_id!;

  for (const [id, data, valor, codigo] of [
    [1, "2024-03-10", 2500, "1.1.01"],
    [2, "2024-03-15", -430.5, "2.1.01"],
  ] as const) {
    executar(
      db,
      `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo)
       VALUES (?, 1, ?, ?, ?, ?)`,
      [id, data, valor, `Lançamento ${id}`, codigo],
    );
  }
  sincronizarRazao(db, entidade_id);
});

describe("verificação de backup — um backup bom", () => {
  it("restaura e aprova a contabilidade", async () => {
    const r = await verificarBackup(db.export(), WASM_NODE);

    expect(r.restauravel).toBe(true);
    expect(r.contabilidadeIntegra).toBe(true);
    expect(r.checagens.filter((c) => c.gravidade === "falha")).toEqual([]);
  });

  it("devolve o hash e as contagens que permitem comparar backups", async () => {
    const r = await verificarBackup(db.export(), WASM_NODE);

    expect(r.hashSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.tamanhoBytes).toBeGreaterThan(0);
    expect(r.contagens.transacoes).toBe(2);
    expect(r.contagens.ledger_entries).toBe(4); // duas pernas por transação
  });
});

describe("verificação de backup — o que ela precisa pegar", () => {
  it("arquivo que não é banco nenhum", async () => {
    const lixo = new TextEncoder().encode("isto não é um sqlite, é texto");
    const r = await verificarBackup(lixo, WASM_NODE);

    expect(r.restauravel).toBe(false);
    expect(r.checagens[0].gravidade).toBe("falha");
    expect(r.checagens[0].detalhe).toMatch(/não abre/);
  });

  it("banco de OUTRO programa, que abre mas não é deste sistema", async () => {
    const SQL = await (await import("sql.js")).default({ locateFile: WASM_NODE });
    const alheio = new SQL.Database();
    alheio.run("CREATE TABLE coisas (id INTEGER PRIMARY KEY, nome TEXT); INSERT INTO coisas (nome) VALUES ('x')");

    const r = await verificarBackup(alheio.export(), WASM_NODE);

    expect(r.restauravel).toBe(false);
    const assinatura = r.checagens.find((c) => c.nome === "Assinatura do sistema")!;
    expect(assinatura.gravidade).toBe("falha");
    expect(assinatura.detalhe).toMatch(/imoveis|transacoes|contratos_locacao/);
  });

  it("banco VAZIO — o pior caso, porque parece íntegro", async () => {
    const vazio = await criarBancoDeTeste();
    const r = await verificarBackup(vazio.export(), WASM_NODE);

    // Abre, tem as tabelas todas, hash perfeito — e não tem nada dentro.
    expect(r.restauravel).toBe(true);
    expect(r.contabilidadeIntegra).toBe(false);
    const conteudo = r.checagens.find((c) => c.nome === "Conteúdo")!;
    expect(conteudo.gravidade).toBe("falha");
    expect(conteudo.detalhe).toMatch(/parece íntegro e não é/);
  });

  it("razão desbalanceado — perna órfã de gravação interrompida", async () => {
    // Apaga UMA perna: é o que um backup tirado no meio de uma escrita produziria.
    executar(db, "DELETE FROM ledger_entries WHERE id = (SELECT MIN(id) FROM ledger_entries)");

    const r = await verificarBackup(db.export(), WASM_NODE);

    expect(r.contabilidadeIntegra).toBe(false);
    const balanco = r.checagens.find((c) => c.nome === "Balanceamento do razão")!;
    expect(balanco.gravidade).toBe("falha");
    expect(balanco.detalhe).toMatch(/não fecham/);
  });

  it("lançamento apontando para conta que não existe no plano", async () => {
    // Sem esta checagem, obterSaldoConta assume natureza "debito" e devolve o saldo com o
    // sinal trocado, sem acusar nada.
    //
    // A chave estrangeira impede que isso aconteça no banco VIVO — e é por isso que o dano
    // precisa ser simulado com `foreign_keys = OFF`. A verificação existe para o arquivo
    // que chega já danificado: truncado no meio da cópia, escrito por versão antiga do
    // schema, ou editado fora do app. Backup não vem com garantia de proveniência.
    db.run("PRAGMA foreign_keys = OFF");
    executar(db, "UPDATE ledger_entries SET conta_id = 999999 WHERE id = (SELECT MIN(id) FROM ledger_entries)");

    const r = await verificarBackup(db.export(), WASM_NODE);

    const contas = r.checagens.find((c) => c.nome === "Contas do razão")!;
    expect(contas.gravidade).toBe("falha");
    expect(contas.detalhe).toMatch(/conta inexistente/);
  });

  it("linha de triagem aprovada cuja transação sumiu — prova documental rompida", async () => {
    executar(
      db,
      `INSERT INTO lotes_importacao (id, arquivo_nome, arquivo_hash_sha256, arquivo_bytes, tipo_detectado, conta_id)
       VALUES (1, 'e.ofx', 'abc', 10, 'ofx', 1)`,
    );
    // Idem: o FK barra isto no banco vivo. O dano só existe em arquivo já corrompido.
    db.run("PRAGMA foreign_keys = OFF");
    executar(
      db,
      `INSERT INTO importacao_linhas (lote_id, linha_numero, data, valor, descricao_original, status, transacao_id)
       VALUES (1, 1, '2024-03-10', 100, 'X', 'aprovada', 99999)`,
    );

    const r = await verificarBackup(db.export(), WASM_NODE);

    const cofre = r.checagens.find((c) => c.nome === "Cofre de evidências")!;
    expect(cofre.gravidade).toBe("falha");
    expect(cofre.detalhe).toMatch(/prova documental está rompida/);
  });
});

describe("comparação com o backup anterior", () => {
  async function relatorio(): Promise<RelatorioVerificacao> {
    return verificarBackup(db.export(), WASM_NODE);
  }

  it("acusa tabela que encolheu — backup de banco já danificado", async () => {
    const anterior = await relatorio();
    executar(db, "DELETE FROM transacoes WHERE id = 2");
    const atual = await relatorio();

    const alertas = compararComAnterior(atual, anterior);
    const transacoes = alertas.find((a) => a.nome === "Tabela transacoes")!;
    expect(transacoes.gravidade).toBe("falha");
    expect(transacoes.detalhe).toMatch(/Encolheu de 2 para 1/);
  });

  it("crescer é normal e não alerta", async () => {
    const anterior = await relatorio();
    executar(
      db,
      `INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo)
       VALUES (3, 1, '2024-03-20', 900, 'Nova', '1.1.01')`,
    );
    const atual = await relatorio();

    expect(compararComAnterior(atual, anterior).every((a) => a.gravidade === "ok")).toBe(true);
  });
});
