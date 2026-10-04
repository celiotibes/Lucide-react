/**
 * Testes de integração: reembolso com estorno de baixa contábil (PARTE A)
 *
 * Roda contra o schema completo (criarBancoDeTeste) para testar:
 * - Estorno de ledger_entry_id_baixa quando aluguel foi baixado
 * - Volta a "pendente" após estorno
 * - Idempotência: segundo reembolso não duplica estorno
 */

import { describe, it, expect, beforeEach } from "vitest";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import type { Database } from "sql.js";
import { consultar, executar } from "../../../db/connection";
import { processarReembolsoAsaas } from "../asaasReembolsos";
import { baixarCompetencia } from "../../erp/aluguel-competencias";
import { criarEntidadeLegal } from "../../erp/entidadeLegal";
import { emitirCobrancaAluguel } from "../asaasCobranca";

const mockApiClient = {
  criarCliente: async () => ({ asaasCustomerId: `cust_${Date.now()}` }),
  criarCobranca: async () => ({
    asaasChargeId: `charge_${Date.now()}`,
    status: "PENDING",
    boletoUrl: "https://example.com/boleto",
    linhaDigitavel: "12345.67890",
    pixQrCode: "qrcode",
  }),
  consultarCobranca: async (chargeId: string) => ({
    asaasChargeId: chargeId,
    status: "RECEIVED",
    boletoUrl: "https://example.com/boleto",
    linhaDigitavel: "12345.67890",
    pixQrCode: "qrcode",
  }),
};

describe("PARTE A: Estorno de Reembolso com Ledger (schema real)", () => {
  let db: Database;
  let entidade_id: number;
  let conta_bancaria_id: number;

  beforeEach(async () => {
    db = await criarBancoDeTeste();
    const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: "52998224725" });
    if (!r.entidade_id) throw new Error(`Fixture não criou a entidade: ${r.mensagem}`);
    entidade_id = r.entidade_id;

    executar(db, "INSERT INTO imoveis (apelido, tipo) VALUES ('Kitnet Teste', 'kitnet')");
    const imovel_id = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;

    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, dia_vencimento, data_inicio)
       VALUES (1, ?, 'João Silva', 'residencial_fixo', 1500, 15, '2025-01-01')`,
      [imovel_id],
    );
    executar(
      db,
      `INSERT INTO aluguel_competencias (id, contrato_id, imovel_id, ano, mes, data_vencimento, valor_devido, status, criado_em)
       VALUES (1, 1, ?, 2025, 1, '2025-01-15', 1500, 'pendente', '2025-01-01T00:00:00Z')`,
      [imovel_id],
    );
    executar(
      db,
      "INSERT INTO contas_bancarias (banco, agencia, numero, titular, tipo) VALUES ('Banco Teste', '0001', '123456', 'Titular', 'corrente')",
    );
    conta_bancaria_id = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
  });

  it("deve estornar baixa contábil quando reembolso de aluguel baixado", async () => {
    // 1. Emitir cobrança
    const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
      tipoCobranca: "boleto", cpfCnpj: "52998224725",
    });

    // 2. Marcar cobrança como paga
    executar(db, "UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [
      cobranca.id,
    ]);

    // 3. BAIXAR competência (gera lançamento no razão)
    const resultadoBaixa = baixarCompetencia(db, 1, conta_bancaria_id, "2025-01-20", entidade_id);

    expect(resultadoBaixa.sucesso).toBe(true);
    expect(resultadoBaixa.ledger_entry_id_baixa).toBeGreaterThan(0);

    // 4. Verificar que competência tem ledger_entry_id_baixa
    const [competencaBaixada] = consultar<{
      ledger_entry_id_baixa: number | null;
      status: string;
    }>(db, "SELECT ledger_entry_id_baixa, status FROM aluguel_competencias WHERE id = 1");

    expect(competencaBaixada.ledger_entry_id_baixa).not.toBeNull();
    expect(competencaBaixada.status).toBe("recebido");

    // 5. Processar reembolso
    const reembolso = await processarReembolsoAsaas(db, {
      chargeId: cobranca.asaasChargeId!,
      motivo: "Cliente desistiu",
    });

    expect(reembolso.status).toBe("sucesso");

    // 6. Verificar que competência voltou a "pendente" e ledger_entry_id_baixa foi zerado
    const [competencaPos] = consultar<{
      ledger_entry_id_baixa: number | null;
      status: string;
    }>(db, "SELECT ledger_entry_id_baixa, status FROM aluguel_competencias WHERE id = 1");

    expect(competencaPos.status).toBe("pendente");
    expect(competencaPos.ledger_entry_id_baixa).toBeNull();

    // 7. Verificar que o lançamento original foi estornado
    const [lancamentoOriginal] = consultar<{
      id: number;
      estornado_por_id: number | null;
      motivo_estorno: string | null;
    }>(
      db,
      "SELECT id, estornado_por_id, motivo_estorno FROM ledger_entries WHERE id = ?",
      [resultadoBaixa.ledger_entry_id_baixa!],
    );

    expect(lancamentoOriginal.estornado_por_id).not.toBeNull();
    expect(lancamentoOriginal.motivo_estorno).toContain("reembolso");
  });

  it("estorna as DUAS pernas: razão balanceado e saldo do Caixa volta a zero", async () => {
    const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, { tipoCobranca: "boleto", cpfCnpj: "52998224725" });
    executar(db, "UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [cobranca.id]);
    const baixa = baixarCompetencia(db, 1, conta_bancaria_id, "2025-01-20", entidade_id);
    expect(baixa.sucesso).toBe(true);

    await processarReembolsoAsaas(db, { chargeId: cobranca.asaasChargeId!, motivo: "Cliente desistiu" });

    const [tot] = consultar<{ deb: number; cred: number }>(
      db,
      "SELECT COALESCE(SUM(valor_debito),0) AS deb, COALESCE(SUM(valor_credito),0) AS cred FROM ledger_entries",
    );
    expect(tot.deb).toBe(tot.cred);

    const porConta = consultar<{ conta_id: number; saldo: number }>(
      db,
      "SELECT conta_id, COALESCE(SUM(valor_debito),0) - COALESCE(SUM(valor_credito),0) AS saldo FROM ledger_entries GROUP BY conta_id",
    );
    for (const c of porConta) expect(c.saldo).toBe(0);

    const [abertas] = consultar<{ n: number }>(
      db,
      "SELECT COUNT(*) AS n FROM ledger_entries WHERE estorno_de_id IS NULL AND estornado_por_id IS NULL",
    );
    expect(abertas.n).toBe(0);
  });

  it("falha de estorno NÃO é silenciosa: lança erro, marca o reembolso como erro e não dá a cobrança por reembolsada", async () => {
    const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, { tipoCobranca: "boleto", cpfCnpj: "52998224725" });
    executar(db, "UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [cobranca.id]);
    expect(baixarCompetencia(db, 1, conta_bancaria_id, "2025-01-20", entidade_id).sucesso).toBe(true);
    // Fecha o período da baixa E o do mês de hoje: sem período aberto, o estorno é impossível.
    executar(db, "UPDATE periodos_contabeis SET status = 'fechado'");
    const hoje = new Date();
    executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, ?, ?, 'fechado')", [
      entidade_id, hoje.getFullYear(), hoje.getMonth() + 1,
    ]);

    await expect(
      processarReembolsoAsaas(db, { chargeId: cobranca.asaasChargeId!, motivo: "x" }),
    ).rejects.toThrow(/Estorno contábil não realizado/);

    const [r] = consultar<{ status: string; mensagem_erro: string | null }>(
      db,
      "SELECT status, mensagem_erro FROM reembolsos_asaas ORDER BY id DESC LIMIT 1",
    );
    expect(r.status).toBe("erro");
    expect(r.mensagem_erro).toContain("Estorno contábil");
    const [c] = consultar<{ status: string }>(db, "SELECT status FROM cobrancas_asaas WHERE id = ?", [cobranca.id]);
    expect(c.status).toBe("pago");
  });

  it("não deve estornar quando reembolso de aluguel ainda não baixado", async () => {
    const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
      tipoCobranca: "boleto", cpfCnpj: "52998224725",
    });
    executar(db, "UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [
      cobranca.id,
    ]);

    // NÃO baixa a competência, só registra o reembolso
    const reembolso = await processarReembolsoAsaas(db, {
      chargeId: cobranca.asaasChargeId!,
      motivo: "Sem baixa prévia",
    });

    expect(reembolso.status).toBe("sucesso");

    // Competência deve continuar pendente
    const [competencia] = consultar<{
      ledger_entry_id_baixa: number | null;
      status: string;
    }>(db, "SELECT ledger_entry_id_baixa, status FROM aluguel_competencias WHERE id = 1");

    expect(competencia.status).toBe("pendente");
    expect(competencia.ledger_entry_id_baixa).toBeNull();

    // Não deve haver estorno no razão
    const [estornos] = consultar<{ count: number }>(
      db,
      "SELECT COUNT(*) as count FROM ledger_entries WHERE estorno_de_id IS NOT NULL",
    );
    expect(estornos.count).toBe(0);
  });

  it("deve ser idempotente: segundo reembolso não duplica estorno", async () => {
    // 1. Setup: baixar competência
    const cobranca = await emitirCobrancaAluguel(db, mockApiClient, 1, {
      tipoCobranca: "boleto", cpfCnpj: "52998224725",
    });
    executar(db, "UPDATE cobrancas_asaas SET status = 'pago' WHERE id = ?", [
      cobranca.id,
    ]);

    const resultadoBaixa = baixarCompetencia(db, 1, conta_bancaria_id, "2025-01-20", entidade_id);
    const ledgerEntryBaixa = resultadoBaixa.ledger_entry_id_baixa!;

    // 2. Primeiro reembolso
    const reembolso1 = await processarReembolsoAsaas(db, {
      chargeId: cobranca.asaasChargeId!,
      motivo: "Motivo 1",
    });

    const [apos1] = consultar<{ estornado_por_id: number | null }>(
      db,
      "SELECT estornado_por_id FROM ledger_entries WHERE id = ?",
      [ledgerEntryBaixa],
    );
    const estornoId1 = apos1.estornado_por_id;

    // 3. Segundo reembolso (webhook retrypado, por exemplo)
    const reembolso2 = await processarReembolsoAsaas(db, {
      chargeId: cobranca.asaasChargeId!,
      motivo: "Motivo diferente",
    });

    // Deve ser o mesmo reembolso por idempotência
    expect(reembolso1.id).toBe(reembolso2.id);

    // Lançamento original ainda deve apontar APENAS para o estorno criado na 1ª vez
    const [apos2] = consultar<{ estornado_por_id: number | null }>(
      db,
      "SELECT estornado_por_id FROM ledger_entries WHERE id = ?",
      [ledgerEntryBaixa],
    );

    expect(apos2.estornado_por_id).toBe(estornoId1);

    // Não deve haver dois estornos
    const [estornos] = consultar<{ count: number }>(
      db,
      "SELECT COUNT(*) as count FROM ledger_entries WHERE estorno_de_id = ?",
      [ledgerEntryBaixa],
    );
    expect(estornos.count).toBe(1);
  });
});
