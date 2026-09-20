import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Guarda contra uma classe inteira de defeito invisível nos testes.
 *
 * Este app roda 100% no navegador (sql.js em WASM, IndexedDB, sem backend contábil).
 * `import crypto from "crypto"` é o módulo NATIVO DO NODE: o Vite o externaliza, e a
 * primeira chamada a `crypto.createHash(...)` estoura em tempo de execução no cliente.
 *
 * Nenhum teste pega isso sozinho, porque o Vitest roda em Node, onde o módulo existe de
 * verdade. O defeito só aparece para o usuário. A alternativa correta é a Web Crypto API
 * (`crypto.subtle.digest`), global no navegador e no Node 19+, já usada em
 * src/domain/backupIntegridade.ts — ela é assíncrona, e é por isso que quem a adota
 * precisa propagar `await`.
 *
 * A lista abaixo é DÍVIDA CONHECIDA, não permissão: são módulos que hoje nenhuma tela
 * alcança (verificado: zero imports a partir de .tsx), então o defeito está latente. Ao
 * ligar qualquer um deles a uma tela, troque o crypto ANTES e tire o arquivo daqui — foi
 * o que se fez com ledger.ts ao ligar o razão, e com audit-logging-imutavel.ts e
 * strategy-backup.ts ao ligar o Painel de Auditoria. Acrescentar um arquivo novo a esta
 * lista quase sempre é a decisão errada. */
const DIVIDA_CONHECIDA = new Set([
  "src/domain/erp/advocacia-ledger-integration.ts",
  "src/domain/erp/api-gateway.ts",
  "src/domain/erp/contas-pessoais-ledger-integration.ts",
  "src/domain/erp/encriptacao.ts",
  "src/domain/erp/imovel-gestao-ledger-integration.ts",
  "src/domain/erp/integracao-skillos-ledger.ts",
  "src/domain/erp/pagamentos-ledger-integration.ts",
]);

const IMPORTA_CRYPTO_DO_NODE = /^\s*import\s[^\n;]*\sfrom\s+["'](node:)?crypto["']/m;

function arquivosDeProducao(dir: string, encontrados: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) {
      if (entrada === "__tests__" || entrada === "test" || entrada === "node_modules") continue;
      arquivosDeProducao(caminho, encontrados);
    } else if (/\.tsx?$/.test(entrada) && !/\.test\.tsx?$/.test(entrada)) {
      encontrados.push(caminho);
    }
  }
  return encontrados;
}

describe("nenhum módulo de produção novo pode importar o crypto do Node", () => {
  const infratores = arquivosDeProducao("src")
    .filter((caminho) => IMPORTA_CRYPTO_DO_NODE.test(readFileSync(caminho, "utf8")))
    .sort();

  it("não surgiu infrator fora da dívida já conhecida", () => {
    const novos = infratores.filter((c) => !DIVIDA_CONHECIDA.has(c));
    expect(novos).toEqual([]);
  });

  it("a lista de dívida não guarda arquivo já corrigido", () => {
    // Sem isto, a lista viraria um cemitério: um arquivo consertado continuaria listado e
    // o próximo leitor não saberia o que ainda falta de verdade.
    const obsoletos = [...DIVIDA_CONHECIDA].filter((c) => !infratores.includes(c)).sort();
    expect(obsoletos).toEqual([]);
  });

  it("os módulos já ligados a alguma tela estão limpos", () => {
    for (const modulo of [
      "src/domain/erp/ledger.ts",
      "src/domain/erp/audit-logging-imutavel.ts",
      "src/domain/erp/strategy-backup.ts",
      "src/domain/erp/compliance-audit-log.ts",
      "src/domain/backupIntegridade.ts",
    ]) {
      expect(`${modulo}: ${IMPORTA_CRYPTO_DO_NODE.test(readFileSync(modulo, "utf8"))}`).toBe(
        `${modulo}: false`,
      );
    }
  });
});
