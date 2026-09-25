import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { criarEntidadeLegal } from "../entidadeLegal";
import { verificarIntegridade } from "../sincronizacao-integridade";

/**
 * ACHADO (gravidade CRÍTICA): `verificarIntegridade()` lança exceção e nunca termina.
 *
 * A checagem #3 ("Validar receitas de aluguel vs contratos ativos") filtra
 * `contratos_locacao WHERE status IN ('ativo', 'pendente')`. A tabela real
 * (contabilidade-reconstituicao/schema.sql) não tem coluna `status` em
 * `contratos_locacao` — a vigência é `data_fim IS NULL`. analytics-integradas.ts já
 * documenta esse mesmo defeito, corrigido lá (calcularOcupacao usa `data_fim`), mas
 * sincronizacao-integridade.ts ficou com a query antiga.
 *
 * Efeito para um laudo pericial: a tela "Sincronização e Integridade" — o módulo cuja
 * função é justamente apontar o que está errado no núcleo contábil — quebra assim que é
 * chamada. Nenhuma das checagens que vêm depois no código (períodos abertos demais,
 * lançamentos não auditados, DÉBITO = CRÉDITO do razão inteiro) chega a rodar, porque a
 * exceção interrompe a função antes de alcançá-las. Não é um número errado: é a ferramenta
 * de verificação do sistema, inoperante.
 *
 * Como reproduzir a falha: `npx vitest run src/domain/erp/__auditoria__/sincronizacao-integridade.test.ts`
 * (o teste está marcado com it.fails porque comprova um defeito, não porque está quebrado).
 *
 * Onde corrigir: src/domain/erp/sincronizacao-integridade.ts, checagem #3 — trocar
 * `WHERE status IN ('ativo', 'pendente')` por `WHERE data_fim IS NULL OR data_fim >= DATE('now')`,
 * como analytics-integradas.ts::calcularOcupacao já faz.
 */
describe("sincronizacao-integridade: verificarIntegridade quebra em produção", () => {
  it.fails("não deveria lançar 'no such column: status' — mas lança, contra o schema real", async () => {
    const db = await criarBancoDeTeste();
    const { entidade_id } = criarEntidadeLegal(db, { nome: "Titular", cpf_cnpj: "52998224725" });
    expect(entidade_id).toBeDefined();

    // Nem precisa haver dados: a query #3 referencia uma coluna inexistente e quebra
    // incondicionalmente, mesmo com o banco vazio.
    const relatorio = verificarIntegridade(db);
    expect(relatorio.status).toBeDefined();
  });
});
