import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { consultar, executar } from "../../../db/connection";
import {
  vincularContaPluggy,
  listarContasVinculadas,
  sincronizarTransacoes,
  type PluggyMeuApiClient,
  type TransacaoPluggyMeu,
} from "../pluggySync";

let db: Database;

beforeEach(async () => {
  db = await criarBancoDeTeste();
});

function ultimoId(tabela: string): number {
  return consultar<{ id: number }>(db, `SELECT id FROM ${tabela} ORDER BY id DESC LIMIT 1`)[0].id;
}

function criarContaBancaria(overrides: Partial<{ banco: string; numero: string }> = {}): number {
  const p = { banco: "Banco Teste", numero: "0001-2", ...overrides };
  executar(
    db,
    "INSERT INTO contas_bancarias (banco, numero, titular, tipo) VALUES (?, ?, 'Titular Teste', 'corrente')",
    [p.banco, p.numero],
  );
  return ultimoId("contas_bancarias");
}

function criarApiClientMock(transacoes: TransacaoPluggyMeu[]): PluggyMeuApiClient {
  return {
    listarContas: vi.fn(async () => []),
    buscarTransacoes: vi.fn(async () => transacoes),
  };
}

const TRANSACAO_1: TransacaoPluggyMeu = { data: "2026-02-10", valor: 1200, descricaoOriginal: "PIX recebido - Locatário", fitid: "pluggy-tx-1" };
const TRANSACAO_2: TransacaoPluggyMeu = { data: "2026-02-12", valor: -89.9, descricaoOriginal: "Conta de luz", fitid: "pluggy-tx-2" };

describe("pluggySync", () => {
  describe("vincularContaPluggy", () => {
    it("cria o vínculo entre uma conta bancária e uma conta do MeuPluggy", () => {
      const contaId = criarContaBancaria();
      const vinculo = vincularContaPluggy(db, contaId, { itemId: "item-1", accountId: "acc-1", nomeInstituicao: "Banco Um" });

      expect(vinculo.conta_bancaria_id).toBe(contaId);
      expect(vinculo.pluggy_item_id).toBe("item-1");
      expect(vinculo.pluggy_account_id).toBe("acc-1");
      expect(vinculo.nome_instituicao_pluggy).toBe("Banco Um");
      expect(vinculo.status_sincronizacao).toBe("ok");
    });

    it("rejeita vincular a uma conta bancária inexistente", () => {
      expect(() => vincularContaPluggy(db, 9999, { itemId: "item-1", accountId: "acc-1" })).toThrow(/não encontrada/);
    });

    it("vincular de novo a mesma conta Pluggy atualiza o vínculo em vez de duplicar (pluggy_account_id é único)", () => {
      const contaId1 = criarContaBancaria({ numero: "0001-2" });
      const contaId2 = criarContaBancaria({ numero: "0003-4" });

      vincularContaPluggy(db, contaId1, { itemId: "item-1", accountId: "acc-1", nomeInstituicao: "Banco Um" });
      const atualizado = vincularContaPluggy(db, contaId2, { itemId: "item-1", accountId: "acc-1", nomeInstituicao: "Banco Um" });

      expect(atualizado.conta_bancaria_id).toBe(contaId2);
      const todos = consultar(db, "SELECT * FROM pluggy_contas_vinculadas WHERE pluggy_account_id = 'acc-1'");
      expect(todos).toHaveLength(1);
    });

    it("listarContasVinculadas traz banco/número da conta local junto", () => {
      const contaId = criarContaBancaria({ banco: "Itaú", numero: "9999-0" });
      vincularContaPluggy(db, contaId, { itemId: "item-1", accountId: "acc-1" });

      const vinculos = listarContasVinculadas(db);
      expect(vinculos).toHaveLength(1);
      expect(vinculos[0].banco).toBe("Itaú");
      expect(vinculos[0].numero).toBe("9999-0");
    });
  });

  describe("sincronizarTransacoes", () => {
    it("rejeita sincronizar uma conta bancária sem vínculo", async () => {
      const contaId = criarContaBancaria();
      await expect(sincronizarTransacoes(db, criarApiClientMock([]), contaId)).rejects.toThrow(/não tem vínculo/);
    });

    it("busca as transações e as registra em triagem (lote + linhas pendentes), nunca direto em `transacoes`", async () => {
      const contaId = criarContaBancaria();
      vincularContaPluggy(db, contaId, { itemId: "item-1", accountId: "acc-1", nomeInstituicao: "Banco Um" });

      const resultado = await sincronizarTransacoes(db, criarApiClientMock([TRANSACAO_1, TRANSACAO_2]), contaId);

      expect(resultado.inseridas).toBe(2);
      expect(resultado.ja_sincronizado_antes).toBe(false);

      const transacoesNoRazao = consultar(db, "SELECT * FROM transacoes WHERE conta_id = ?", [contaId]);
      expect(transacoesNoRazao).toHaveLength(0);

      const linhasEmTriagem = consultar<{ status: string; descricao_original: string }>(
        db,
        "SELECT status, descricao_original FROM importacao_linhas WHERE lote_id = ? ORDER BY linha_numero",
        [resultado.lote_id],
      );
      expect(linhasEmTriagem).toHaveLength(2);
      expect(linhasEmTriagem.every((l) => l.status === "pendente")).toBe(true);
    });

    it("atualiza ultima_sincronizacao e status_sincronizacao='ok' após sucesso", async () => {
      const contaId = criarContaBancaria();
      vincularContaPluggy(db, contaId, { itemId: "item-1", accountId: "acc-1" });

      await sincronizarTransacoes(db, criarApiClientMock([TRANSACAO_1]), contaId);

      const vinculo = consultar<{ status_sincronizacao: string; ultima_sincronizacao: string | null }>(
        db,
        "SELECT status_sincronizacao, ultima_sincronizacao FROM pluggy_contas_vinculadas WHERE conta_bancaria_id = ?",
        [contaId],
      )[0];
      expect(vinculo.status_sincronizacao).toBe("ok");
      expect(vinculo.ultima_sincronizacao).not.toBeNull();
    });

    it("marca status_sincronizacao='erro' com o motivo em observacoes quando a busca falha, e relança o erro", async () => {
      const contaId = criarContaBancaria();
      vincularContaPluggy(db, contaId, { itemId: "item-1", accountId: "acc-1" });

      const apiClient: PluggyMeuApiClient = {
        listarContas: vi.fn(async () => []),
        buscarTransacoes: vi.fn(async () => {
          throw new Error("Item desconectado — reconecte em meu.pluggy.ai");
        }),
      };

      await expect(sincronizarTransacoes(db, apiClient, contaId)).rejects.toThrow(/Item desconectado/);

      const vinculo = consultar<{ status_sincronizacao: string; observacoes: string | null }>(
        db,
        "SELECT status_sincronizacao, observacoes FROM pluggy_contas_vinculadas WHERE conta_bancaria_id = ?",
        [contaId],
      )[0];
      expect(vinculo.status_sincronizacao).toBe("erro");
      expect(vinculo.observacoes).toMatch(/Item desconectado/);
    });

    it("sincronizar duas vezes a mesma janela de transações não duplica linhas (dedup por hash do conteúdo)", async () => {
      const contaId = criarContaBancaria();
      vincularContaPluggy(db, contaId, { itemId: "item-1", accountId: "acc-1" });

      const primeira = await sincronizarTransacoes(db, criarApiClientMock([TRANSACAO_1, TRANSACAO_2]), contaId);
      expect(primeira.inseridas).toBe(2);

      const segunda = await sincronizarTransacoes(db, criarApiClientMock([TRANSACAO_1, TRANSACAO_2]), contaId);
      expect(segunda.ja_sincronizado_antes).toBe(true);
      expect(segunda.inseridas).toBe(0);
      expect(segunda.lote_id).toBe(primeira.lote_id);

      const totalLinhas = consultar<{ total: number }>(
        db,
        "SELECT COUNT(*) as total FROM importacao_linhas WHERE lote_id = ?",
        [primeira.lote_id],
      )[0].total;
      expect(totalLinhas).toBe(2);
    });

    it("quando a nova sincronização traz uma transação a mais, a linha repetida é marcada como duplicata provável (não duplicada às cegas)", async () => {
      const contaId = criarContaBancaria();
      vincularContaPluggy(db, contaId, { itemId: "item-1", accountId: "acc-1" });

      await sincronizarTransacoes(db, criarApiClientMock([TRANSACAO_1]), contaId);
      // Aprova a primeira linha manualmente, simulando o que a triagem faria, para que ela
      // passe a existir em `transacoes` e a segunda sincronização tenha algo para comparar.
      executar(db, "INSERT INTO transacoes (conta_id, data, valor, descricao_original, fitid) VALUES (?, ?, ?, ?, ?)", [
        contaId,
        TRANSACAO_1.data,
        TRANSACAO_1.valor,
        TRANSACAO_1.descricaoOriginal,
        TRANSACAO_1.fitid,
      ]);

      const segunda = await sincronizarTransacoes(db, criarApiClientMock([TRANSACAO_1, TRANSACAO_2]), contaId);
      expect(segunda.ja_sincronizado_antes).toBe(false);
      // `duplicadas` é um SUBCONJUNTO de `inseridas` (mesma semântica de registrarLote/cofre.ts:
      // ambas as linhas entram em `importacao_linhas` — a flagada como possível duplicata entra
      // com status 'duplicata_provavel' em vez de 'pendente', mas entra do mesmo jeito, para
      // decisão humana na triagem).
      expect(segunda.inseridas).toBe(2);
      expect(segunda.duplicadas).toBe(1);
    });
  });
});
