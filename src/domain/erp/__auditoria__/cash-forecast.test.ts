import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { executar, consultar } from "../../../db/connection";
import { criarEntidadeLegal } from "../entidadeLegal";
import { registrarLancamentoContabil } from "../ledger";
import { gerarProjecaoCaixa } from "../cash-forecast";

/**
 * ACHADO (gravidade GRAVE) em cash-forecast.ts::gerarProjecaoCaixa.
 *
 * O saldo projetado de cada mês é zerado com `Math.max(0, saldoFinal)` — e o valor JÁ
 * ZERADO (`saldoAtualizado = Math.max(0, saldoFinal)`) é o que alimenta o saldo inicial do
 * MÊS SEGUINTE, dentro do próprio laço de 12 meses. Um déficit estrutural (saídas maiores
 * que entradas todo mês) deveria se acumular mês a mês — é exatamente esse acúmulo que
 * revela ao perito quando o caixa se esgota de vez. Em vez disso, cada mês recomeça do
 * zero: o pior saldo relatado (`saldo_minimo_projetado`) reflete só o déficit de UM mês
 * isolado, nunca o déficit acumulado de vários meses seguidos.
 *
 * Efeito para um laudo pericial: uma trajetória de 12 meses que na realidade termina, por
 * exemplo, R$ 23.000 negativos, é relatada como se o pior momento fosse só a queda de um
 * único mês (uma fração pequena desse valor) — o sistema subestima drasticamente o tamanho
 * real de um problema de liquidez estrutural, o oposto do que uma ferramenta de alerta
 * deveria fazer.
 *
 * Como reproduzir: `npx vitest run src/domain/erp/__auditoria__/cash-forecast.test.ts`.
 *
 * Onde corrigir: src/domain/erp/cash-forecast.ts — usar o `saldoFinal` real (sem
 * Math.max(0, ...)) como saldo inicial do mês seguinte; se a exibição não deve mostrar
 * número negativo, isso é decisão de UI, não do cálculo interno que alimenta o próximo mês.
 */
describe("cash-forecast: déficit projetado não se acumula entre os meses", () => {
  it.fails("saldo_minimo_projetado deveria refletir o déficit acumulado de vários meses seguidos de saída maior que entrada", async () => {
    const db = await criarBancoDeTeste();
    const { entidade_id } = criarEntidadeLegal(db, { nome: "Titular", cpf_cnpj: "52998224725" });

    // Histórico: para cada mês do calendário (1..12) em 2024, um período com uma única
    // saída de caixa de R$ 2.000 e nenhuma entrada — o padrão histórico que
    // gerarProjecaoCaixa usa para projetar sazonalidade por mês.
    const idsHistoricos: number[] = [];
    for (let mes = 1; mes <= 12; mes++) {
      executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2024, ?, 'aberto')", [entidade_id!, mes]);
      const periodo_id = consultar<{ id: number }>(db, "SELECT id FROM periodos_contabeis WHERE ano=2024 AND mes=?", [mes])[0].id;
      idsHistoricos.push(periodo_id);
      registrarLancamentoContabil(db, {
        entidade_id: entidade_id!, periodo_id, conta_id: 1101,
        data_lancamento: `2024-${String(mes).padStart(2, "0")}-15`, valor_credito: 2000,
        descricao: "Saída histórica", origem_modulo: "manual", origem_id: mes,
        referencia_documento: `HIST-${mes}`,
      });
    }

    // Período de referência da projeção: janeiro de 2025, com saldo inicial de R$ 1.000.
    executar(db, "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 1, 'aberto')", [entidade_id!]);
    const periodoAtual = consultar<{ id: number }>(db, "SELECT id FROM periodos_contabeis WHERE ano=2025 AND mes=1")[0].id;
    registrarLancamentoContabil(db, {
      entidade_id: entidade_id!, periodo_id: periodoAtual, conta_id: 1101,
      data_lancamento: "2025-01-02", valor_debito: 1000, descricao: "Saldo inicial",
      origem_modulo: "manual", origem_id: 100, referencia_documento: "SALDO-INICIAL",
    });

    const projecao = gerarProjecaoCaixa(db, entidade_id!, periodoAtual);

    // Reconstituo, fora da função auditada, o déficit VERDADEIRO acumulado — a mesma
    // fórmula, mas sem zerar o saldo a cada mês — para comparar com o que o sistema relata.
    let saldoReal = 1000;
    let piorSaldoReal = saldoReal;
    for (const p of projecao.projecoes) {
      saldoReal += p.liquido_operacional; // liquido_operacional já reflete a sazonalidade aplicada
      if (saldoReal < piorSaldoReal) piorSaldoReal = saldoReal;
    }

    // O relatório deveria acusar um déficit mínimo pelo menos tão profundo quanto o
    // déficit acumulado real (ambos negativos; o real é bem mais negativo que o relatado).
    expect(projecao.saldo_minimo_projetado).toBeLessThanOrEqual(piorSaldoReal + 0.01);
  });
});
