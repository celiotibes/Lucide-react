import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { executar } from "../../../db/connection";
import { registrarLote, marcarDuplicatasProvaveis, type LinhaBruta } from "../../importacao/cofre";
import { listarLinhas } from "../../importacao/triagem";

/**
 * ACHADO (gravidade MODERADA — qualidade de evidência, não valor numérico) em
 * importacao/cofre.ts::marcarDuplicatasProvaveis.
 *
 * O critério fraco de duplicidade (mesma conta + mesma data + mesmo valor) usa
 * `... LIMIT 1` sem excluir uma transação já referenciada por OUTRA linha do mesmo lote.
 * Cenário real e legítimo: duas diárias de estacionamento idênticas (mesma conta, mesma
 * data, mesmo valor) já lançadas corretamente como duas transações distintas. Um extrato
 * reimportado por engano traz as duas de volta. `marcarDuplicatasProvaveis` deveria, para
 * ser uma prova útil, apontar a primeira linha nova como duplicata da primeira transação
 * existente E a segunda linha nova como duplicata da SEGUNDA — mas a consulta busca `LIMIT
 * 1` sem excluir quem já foi referenciado, então as DUAS linhas novas são marcadas como
 * duplicata da MESMA (primeira) transação existente. A segunda transação existente nunca é
 * mencionada em nenhum motivo.
 *
 * Efeito para um laudo pericial: o perito lê o motivo registrado ("já existe a transação
 * #X") como a PROVA de qual documento se repete — mas aqui os dois motivos "provam" a
 * mesma coisa, quando na verdade correspondem a dois pares diferentes. Não é erro de valor
 * (a decisão de aprovar/rejeitar continua sendo humana), mas é evidência de proveniência
 * enganosa, exatamente o tipo de detalhe que compromete uma prova pericial num confronto.
 *
 * Como reproduzir: `npx vitest run src/domain/erp/__auditoria__/triagem-duplicatas.test.ts`.
 *
 * Onde corrigir: src/domain/importacao/cofre.ts::marcarDuplicatasProvaveis — excluir da
 * busca por data+valor os `transacoes.id` já usados como `duplicata_de_id` por outra linha
 * do MESMO lote (ex.: `AND id NOT IN (SELECT duplicata_de_id FROM importacao_linhas WHERE
 * lote_id = ? AND duplicata_de_id IS NOT NULL)`), casando duplicatas 1-para-1.
 */
describe("cofre: marcarDuplicatasProvaveis não distingue duas duplicatas legítimas do mesmo dia", () => {
  let db: Database;

  beforeEach(async () => {
    db = await criarBancoDeTeste();
    executar(
      db,
      "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo) VALUES (1, 'Teste', '0001', '12345', 'Titular', 'corrente')",
    );
    // Duas transações JÁ EXISTENTES, legitimamente idênticas (duas diárias de
    // estacionamento no mesmo dia) — casos reais, não erro de digitação.
    executar(
      db,
      `INSERT INTO transacoes (conta_id, data, valor, descricao_original)
       VALUES (1, '2024-03-10', -15, 'DIARIA ESTACIONAMENTO')`,
    );
    executar(
      db,
      `INSERT INTO transacoes (conta_id, data, valor, descricao_original)
       VALUES (1, '2024-03-10', -15, 'DIARIA ESTACIONAMENTO')`,
    );
  });

  it.fails("as duas linhas reimportadas deveriam apontar cada uma para uma transação existente diferente", () => {
    const linhas: LinhaBruta[] = [
      { data: "2024-03-10", valor: -15, descricaoOriginal: "DIARIA ESTACIONAMENTO" },
      { data: "2024-03-10", valor: -15, descricaoOriginal: "DIARIA ESTACIONAMENTO" },
    ];
    const { lote_id } = registrarLote(
      db,
      { arquivo_nome: "reimport.csv", arquivo_hash_sha256: "hash-reimport", arquivo_bytes: 100, tipo_detectado: "csv", conta_id: 1 },
      linhas,
    );
    marcarDuplicatasProvaveis(db, lote_id);

    const triadas = listarLinhas(db, lote_id, "duplicata_provavel");
    expect(triadas).toHaveLength(2);

    const alvos = triadas.map((l) => l.duplicata_de_id);
    // Cada linha nova deveria casar com uma transação existente DIFERENTE (1-para-1) —
    // hoje as duas apontam para a mesma (o primeiro resultado do LIMIT 1).
    expect(new Set(alvos).size).toBe(2);
  });
});
