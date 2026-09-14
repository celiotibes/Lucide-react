import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar } from "../../db/connection";
import { compararDeclaradoXReconstituido } from "./comparativoFiscal";

async function bancoBase() {
  const db = await criarBancoDeTeste();
  executar(db, "INSERT INTO contas_bancarias (id, banco, numero, titular, tipo) VALUES (1, 'Banco Teste', '000-0', 'Célio', 'corrente')");
  executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet 1', 'kitnet')");
  return db;
}

describe("compararDeclaradoXReconstituido", () => {
  it("sem nenhuma declaração lançada: rendaDeclarada fica null, nunca 0 (ausência de dado não é resposta)", async () => {
    const db = await bancoBase();
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (1, 1, '2026-03-10', 1000, 'PIX AIRBNB', '1.2.01', 1)",
    );

    const [linha] = compararDeclaradoXReconstituido(db, "2026-01-01", "2026-12-31");

    expect(linha.anoCalendario).toBe(2026);
    expect(linha.rendaReconstituida).toBe(1000);
    expect(linha.rendaDeclarada).toBeNull();
    expect(linha.origemDeclarado).toBe("nenhum");
    expect(linha.diferenca).toBeNull();
    expect(linha.percentualNaoDeclarado).toBeNull();
  });

  it("DIRPF anual tem prioridade sobre Carnê-Leão mensal quando ambos existem para o mesmo ano", async () => {
    const db = await bancoBase();
    executar(
      db,
      "INSERT INTO declaracoes_fiscais (ano_calendario, tipo, rendimento_tributavel_declarado) VALUES (2026, 'dirpf_anual', 12000)",
    );
    executar(
      db,
      "INSERT INTO declaracoes_fiscais (ano_calendario, tipo, mes_referencia, rendimento_tributavel_declarado) VALUES (2026, 'carne_leao_mensal', '2026-01-01', 500)",
    );
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (1, 1, '2026-03-10', 15000, 'PIX AIRBNB', '1.2.01', 1)",
    );

    const [linha] = compararDeclaradoXReconstituido(db, "2026-01-01", "2026-12-31");

    expect(linha.rendaDeclarada).toBe(12000); // DIRPF, não os 500 do carnê-leão isolado
    expect(linha.origemDeclarado).toBe("dirpf_anual");
    expect(linha.diferenca).toBeCloseTo(3000, 6); // 15000 reconstituído - 12000 declarado
  });

  it("sem DIRPF: soma os DARFs de Carnê-Leão mensal lançados e sinaliza cobertura parcial", async () => {
    const db = await bancoBase();
    executar(
      db,
      "INSERT INTO declaracoes_fiscais (ano_calendario, tipo, mes_referencia, rendimento_tributavel_declarado) VALUES (2026, 'carne_leao_mensal', '2026-01-01', 500)",
    );
    executar(
      db,
      "INSERT INTO declaracoes_fiscais (ano_calendario, tipo, mes_referencia, rendimento_tributavel_declarado) VALUES (2026, 'carne_leao_mensal', '2026-02-01', 600)",
    );
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (1, 1, '2026-03-10', 5000, 'PIX AIRBNB', '1.2.01', 1)",
    );

    const [linha] = compararDeclaradoXReconstituido(db, "2026-01-01", "2026-12-31");

    expect(linha.rendaDeclarada).toBe(1100); // 500 + 600
    expect(linha.origemDeclarado).toBe("carne_leao_mensal");
    expect(linha.mesesComCarneLeaoLancado).toBe(2); // sinaliza que só 2 dos 12 meses foram lançados
  });

  it("percentualNaoDeclarado é null quando rendaReconstituida é zero, mesmo com declaração lançada (evita divisão por zero)", async () => {
    const db = await bancoBase();
    executar(
      db,
      "INSERT INTO declaracoes_fiscais (ano_calendario, tipo, rendimento_tributavel_declarado) VALUES (2026, 'dirpf_anual', 5000)",
    );
    // Nenhuma transação de receita lançada neste ano.

    const [linha] = compararDeclaradoXReconstituido(db, "2026-01-01", "2026-12-31");
    expect(linha.rendaReconstituida).toBe(0);
    expect(linha.percentualNaoDeclarado).toBeNull();
  });

  it("um ano aparece na lista mesmo só com declaração e nenhuma transação reconstituída (o inverso do caso comum)", async () => {
    const db = await bancoBase();
    executar(
      db,
      "INSERT INTO declaracoes_fiscais (ano_calendario, tipo, rendimento_tributavel_declarado) VALUES (2024, 'dirpf_anual', 8000)",
    );

    const linhas = compararDeclaradoXReconstituido(db, "2020-01-01", "2030-12-31");
    const linha2024 = linhas.find((l) => l.anoCalendario === 2024);
    expect(linha2024?.rendaReconstituida).toBe(0);
    expect(linha2024?.rendaDeclarada).toBe(8000);
    expect(linha2024?.diferenca).toBe(-8000); // reconstituído bem abaixo do declarado, sem problema nenhum
  });

  it("separa corretamente anos-calendário diferentes, cada um com sua própria comparação", async () => {
    const db = await bancoBase();
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (1, 1, '2025-06-10', 3000, 'PIX AIRBNB', '1.2.01', 1)",
    );
    executar(
      db,
      "INSERT INTO transacoes (id, conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id) VALUES (2, 1, '2026-06-10', 4000, 'PIX AIRBNB', '1.2.01', 1)",
    );

    const linhas = compararDeclaradoXReconstituido(db, "2025-01-01", "2026-12-31");

    expect(linhas.map((l) => l.anoCalendario)).toEqual([2025, 2026]);
    expect(linhas.find((l) => l.anoCalendario === 2025)?.rendaReconstituida).toBe(3000);
    expect(linhas.find((l) => l.anoCalendario === 2026)?.rendaReconstituida).toBe(4000);
  });
});
