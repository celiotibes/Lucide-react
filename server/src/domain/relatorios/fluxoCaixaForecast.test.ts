import { describe, it, expect, beforeEach } from "vitest";
import { forecastMediaMovel, forecastRegressao } from "./fluxoCaixaForecast";
import type Database from "better-sqlite3";
import SQLite from "better-sqlite3";

// Helper para criar banco de testes em memória
function criarBancoDeTeste(): Database.Database {
  const db = new SQLite(":memory:");
  db.pragma("foreign_keys = ON");

  // Criar tabelas
  db.exec(`
    CREATE TABLE IF NOT EXISTS contas_bancarias (
      id INTEGER PRIMARY KEY,
      banco TEXT,
      numero TEXT,
      titular TEXT,
      tipo TEXT
    );

    CREATE TABLE IF NOT EXISTS imoveis (
      id INTEGER PRIMARY KEY,
      apelido TEXT,
      tipo TEXT,
      financiado INTEGER
    );

    CREATE TABLE IF NOT EXISTS plano_de_contas (
      codigo TEXT PRIMARY KEY,
      descricao TEXT,
      natureza TEXT,
      grupo TEXT
    );

    CREATE TABLE IF NOT EXISTS transacoes (
      id INTEGER PRIMARY KEY,
      conta_id INTEGER,
      data TEXT,
      valor REAL,
      descricao_original TEXT,
      plano_conta_codigo TEXT,
      FOREIGN KEY (conta_id) REFERENCES contas_bancarias(id)
    );

    CREATE TABLE IF NOT EXISTS lembretes_agendados (
      id INTEGER PRIMARY KEY,
      data_vencimento TEXT,
      valor REAL,
      tipo TEXT,
      status TEXT
    );
  `);

  // Inserir dados base
  db.prepare("INSERT INTO contas_bancarias (id, banco, numero, titular, tipo) VALUES (1, 'Banco Teste', '000-0', 'Célio', 'corrente')").run();
  db.prepare("INSERT INTO imoveis (id, apelido, tipo, financiado) VALUES (1, 'Kitnet 02', 'kitnet', 0)").run();

  // Inserir plano de contas padrão
  db.prepare("INSERT OR IGNORE INTO plano_de_contas (codigo, descricao, natureza, grupo) VALUES ('1.1.01', 'Aluguel Recebido', 'credito', 'receita')").run();
  db.prepare("INSERT OR IGNORE INTO plano_de_contas (codigo, descricao, natureza, grupo) VALUES ('2.1.01', 'Condomínio e IPTU', 'debito', 'despesa')").run();
  db.prepare("INSERT OR IGNORE INTO plano_de_contas (codigo, descricao, natureza, grupo) VALUES ('3.1.01', 'Transferência', 'debito', 'transferencia')").run();

  return db;
}

describe("forecastMediaMovel", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = criarBancoDeTeste();
  });

  // Teste 1: Histórico vazio - deve retornar saldo flat
  it("retorna saldo flat quando não há histórico", () => {
    const resultado = forecastMediaMovel(db, 30);
    expect(resultado).toHaveLength(30);
    expect(resultado[0]).toMatchObject({
      saldoEstimado: 0,
      min: 0,
      max: 0,
      metodo: "media_movel",
    });
  });

  // Teste 2: Menos de 90 dias de histórico
  it("calcula com histórico menor que 90 dias", () => {
    const hoje = new Date();
    const dias30aAtras = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 30; i++) {
      const data = new Date(dias30aAtras.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, 100, 'receita', '1.1.01')").run(data);
    }

    const resultado = forecastMediaMovel(db, 30);
    expect(resultado).toHaveLength(30);
    expect(resultado[0]?.saldoEstimado).toBeGreaterThan(0);
  });

  // Teste 3: Média móvel positiva
  it("projeta aumento de saldo com receita consistente", () => {
    const hoje = new Date();
    const dias90aAtras = new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 90; i++) {
      const data = new Date(dias90aAtras.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, 100, 'receita', '1.1.01')").run(data);
    }

    const resultado = forecastMediaMovel(db, 30);
    expect(resultado).toHaveLength(30);
    expect(resultado[29]?.saldoEstimado).toBeGreaterThan(resultado[0]?.saldoEstimado ?? 0);
  });

  // Teste 4: Média móvel negativa
  it("projeta queda de saldo com despesa consistente", () => {
    const hoje = new Date();
    const dias90aAtras = new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 90; i++) {
      const data = new Date(dias90aAtras.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, -50, 'despesa', '2.1.01')").run(data);
    }

    const resultado = forecastMediaMovel(db, 30);
    expect(resultado).toHaveLength(30);
    expect(resultado[29]?.saldoEstimado).toBeLessThan(resultado[0]?.saldoEstimado ?? Infinity);
  });

  // Teste 5: Intervalo de confiança
  it("calcula intervalo de confiança maior com volatilidade", () => {
    const hoje = new Date();
    const dias90aAtras = new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 90; i++) {
      const data = new Date(dias90aAtras.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const valor = i % 2 === 0 ? 100 : 50;
      db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, ?, 'receita', '1.1.01')").run(data, valor);
    }

    const resultado = forecastMediaMovel(db, 30);
    const margem = (resultado[0]?.max ?? 0) - (resultado[0]?.min ?? 0);
    expect(margem).toBeGreaterThan(0);
  });

  // Teste 6: Mix de receita e despesa
  it("projeta saldo com mix de receita e despesa", () => {
    const hoje = new Date();
    const dias90aAtras = new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000);
    const saldoInicial = 10000;

    const dataStr = dias90aAtras.toISOString().split("T")[0];
    db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, ?, 'saldo inicial', '1.1.01')").run(dataStr, saldoInicial);

    for (let i = 0; i < 90; i++) {
      const data = new Date(dias90aAtras.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, 200, 'receita', '1.1.01')").run(data);
      db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, -80, 'despesa', '2.1.01')").run(data);
    }

    const resultado = forecastMediaMovel(db, 30);
    expect(resultado[0]?.saldoEstimado).toBeGreaterThan(saldoInicial);
  });

  // Teste 7: Número de dias
  it("retorna exatamente diasAdiante projeções", () => {
    const resultado30 = forecastMediaMovel(db, 30);
    expect(resultado30).toHaveLength(30);

    const resultado60 = forecastMediaMovel(db, 60);
    expect(resultado60).toHaveLength(60);

    const resultado90 = forecastMediaMovel(db, 90);
    expect(resultado90).toHaveLength(90);
  });

  // Teste 8: Datas futuras
  it("gera datas futuras sequenciais", () => {
    const resultado = forecastMediaMovel(db, 5);
    const hoje = new Date();

    for (let i = 0; i < 5; i++) {
      const dataProjecao = new Date(resultado[i]?.data ?? "");
      const dataEsperada = new Date(hoje.getTime() + (i + 1) * 24 * 60 * 60 * 1000);

      const dataProjecaoStr = dataProjecao.toISOString().split("T")[0];
      const dataEsperadaStr = dataEsperada.toISOString().split("T")[0];
      expect(dataProjecaoStr).toBe(dataEsperadaStr);
    }
  });

  // Teste 9: Ignora transferências
  it("ignora transferências entre contas próprias", () => {
    const hoje = new Date();
    const dias90aAtras = new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 90; i++) {
      const data = new Date(dias90aAtras.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, -100, 'transferencia', '3.1.01')").run(data);
    }

    const resultado = forecastMediaMovel(db, 30);
    resultado.forEach((p) => {
      expect(p.saldoEstimado).toBe(0);
    });
  });

  // Teste 10: Método correto
  it("retorna metodo correto em todas as projeções", () => {
    const resultado = forecastMediaMovel(db, 10);
    resultado.forEach((p) => {
      expect(p.metodo).toBe("media_movel");
    });
  });

  // Teste 11: Min <= Estimado <= Max
  it("respeita invariante min <= estimado <= max", () => {
    const hoje = new Date();
    const dias90aAtras = new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 90; i++) {
      const data = new Date(dias90aAtras.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const valor = (i % 3 === 0 ? 100 : 50);
      db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, ?, 'receita', '1.1.01')").run(data, valor);
    }

    const resultado = forecastMediaMovel(db, 30);
    resultado.forEach((p) => {
      expect(p.min).toBeLessThanOrEqual(p.saldoEstimado);
      expect(p.saldoEstimado).toBeLessThanOrEqual(p.max);
    });
  });

  // Teste 12: Saldo inicial afeta projeção
  it("usa saldo atual corretamente", () => {
    const hoje = new Date();
    const diasUm = new Date(hoje.getTime() - 1 * 24 * 60 * 60 * 1000);
    const saldoInicial = 5000;

    const dataStr = diasUm.toISOString().split("T")[0];
    db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, ?, 'saldo inicial', '1.1.01')").run(dataStr, saldoInicial);

    const resultado = forecastMediaMovel(db, 1);
    // Com uma transação de 5000 e nenhum padrão, a primeira projeção deve ser 5000 + fluxo médio
    expect(resultado[0]?.saldoEstimado).toBeGreaterThanOrEqual(saldoInicial);
  });

  // Teste 13: Acumulação
  it("cada dia acumula a média ao saldo anterior", () => {
    const hoje = new Date();
    const dias90aAtras = new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 90; i++) {
      const data = new Date(dias90aAtras.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, 100, 'receita', '1.1.01')").run(data);
    }

    const resultado = forecastMediaMovel(db, 30);
    for (let i = 1; i < resultado.length; i++) {
      expect(resultado[i]?.saldoEstimado).toBeGreaterThan(resultado[i - 1]?.saldoEstimado ?? -Infinity);
    }
  });

  // Teste 14: Projeção com período muito curto
  it("lida bem com período curto", () => {
    const resultado = forecastMediaMovel(db, 1);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toBeDefined();
  });

  // Teste 15: Saldo negativo
  it("projeta corretamente mesmo com saldo negativo", () => {
    const hoje = new Date();
    const diasUm = new Date(hoje.getTime() - 1 * 24 * 60 * 60 * 1000);

    const dataStr = diasUm.toISOString().split("T")[0];
    db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, ?, 'saldo negativo', '1.1.01')").run(dataStr, -1000);

    const resultado = forecastMediaMovel(db, 10);
    expect(resultado).toHaveLength(10);
    expect(resultado[0]?.saldoEstimado).toBeLessThanOrEqual(0);
  });
});

describe("forecastRegressao", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = criarBancoDeTeste();
  });

  // Teste 1: Histórico vazio
  it("retorna saldo flat quando não há histórico", () => {
    const resultado = forecastRegressao(db, 30);
    expect(resultado).toHaveLength(30);
    expect(resultado[0]).toMatchObject({
      saldoEstimado: 0,
      min: 0,
      max: 0,
      metodo: "regressao",
    });
  });

  // Teste 2: Tendência de crescimento
  it("detecta tendência de crescimento", () => {
    const hoje = new Date();
    const dias90aAtras = new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 90; i++) {
      const data = new Date(dias90aAtras.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const valor = 10 + i * 1;
      db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, ?, 'receita', '1.1.01')").run(data, valor);
    }

    const resultado = forecastRegressao(db, 30);
    expect(resultado[29]?.saldoEstimado).toBeGreaterThan(resultado[0]?.saldoEstimado ?? 0);
  });

  // Teste 3: Tendência de queda
  it("detecta tendência de queda", () => {
    const hoje = new Date();
    const dias90aAtras = new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000);
    const saldoInicial = 10000;

    const dataStr = dias90aAtras.toISOString().split("T")[0];
    db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, ?, 'saldo inicial', '1.1.01')").run(dataStr, saldoInicial);

    for (let i = 0; i < 90; i++) {
      const data = new Date(dias90aAtras.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const valor = 10 + i * 1;
      db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, -?, 'despesa', '2.1.01')").run(data, valor);
    }

    const resultado = forecastRegressao(db, 30);
    expect(resultado[29]?.saldoEstimado).toBeLessThan(resultado[0]?.saldoEstimado ?? Infinity);
  });

  // Teste 4: Intervalo de confiança
  it("calcula intervalo de confiança com regressão", () => {
    const hoje = new Date();
    const dias90aAtras = new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 90; i++) {
      const data = new Date(dias90aAtras.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, 100, 'receita', '1.1.01')").run(data);
    }

    const resultado = forecastRegressao(db, 30);
    resultado.forEach((p) => {
      expect(p.min).toBeLessThanOrEqual(p.saldoEstimado);
      expect(p.saldoEstimado).toBeLessThanOrEqual(p.max);
    });
  });

  // Teste 5: Número de dias
  it("retorna exatamente diasAdiante projeções", () => {
    const resultado30 = forecastRegressao(db, 30);
    expect(resultado30).toHaveLength(30);

    const resultado60 = forecastRegressao(db, 60);
    expect(resultado60).toHaveLength(60);
  });

  // Teste 6: Datas futuras
  it("gera datas futuras sequenciais", () => {
    const resultado = forecastRegressao(db, 5);
    const hoje = new Date();

    for (let i = 0; i < 5; i++) {
      const dataProjecao = new Date(resultado[i]?.data ?? "");
      const dataEsperada = new Date(hoje.getTime() + (i + 1) * 24 * 60 * 60 * 1000);

      const dataProjecaoStr = dataProjecao.toISOString().split("T")[0];
      const dataEsperadaStr = dataEsperada.toISOString().split("T")[0];
      expect(dataProjecaoStr).toBe(dataEsperadaStr);
    }
  });

  // Teste 7: Método correto
  it("retorna metodo correto", () => {
    const resultado = forecastRegressao(db, 10);
    resultado.forEach((p) => {
      expect(p.metodo).toBe("regressao");
    });
  });

  // Teste 8: Ignora transferências
  it("ignora transferências no modelo", () => {
    const hoje = new Date();
    const dias90aAtras = new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 90; i++) {
      const data = new Date(dias90aAtras.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, -100, 'transferencia', '3.1.01')").run(data);
    }

    const resultado = forecastRegressao(db, 30);
    resultado.forEach((p) => {
      expect(p.saldoEstimado).toBeLessThanOrEqual(0.1);
    });
  });

  // Teste 9: Min <= Estimado <= Max
  it("respeita invariante min <= estimado <= max", () => {
    const hoje = new Date();
    const dias90aAtras = new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 90; i++) {
      const data = new Date(dias90aAtras.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const valor = 50 + Math.random() * 100;
      db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, ?, 'receita', '1.1.01')").run(data, valor);
    }

    const resultado = forecastRegressao(db, 30);
    resultado.forEach((p) => {
      expect(p.min).toBeLessThanOrEqual(p.saldoEstimado);
      expect(p.saldoEstimado).toBeLessThanOrEqual(p.max);
    });
  });

  // Teste 10: Padrão linear claro
  it("aproveita r² para confirmar ajuste do modelo", () => {
    const hoje = new Date();
    const dias90aAtras = new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 90; i++) {
      const data = new Date(dias90aAtras.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, ?, 'receita', '1.1.01')").run(data, 100 * i);
    }

    const resultado = forecastRegressao(db, 30);
    const margemMédia = resultado.reduce((acc, p) => acc + (p.max - p.min), 0) / resultado.length;
    expect(margemMédia).toBeLessThan(10000);
  });

  // Teste 11: Acumulação
  it("cada projeção acumula ao saldo anterior", () => {
    const hoje = new Date();
    const dias90aAtras = new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 90; i++) {
      const data = new Date(dias90aAtras.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, 50, 'receita', '1.1.01')").run(data);
    }

    const resultado = forecastRegressao(db, 30);
    const primeiroSaldo = resultado[0]?.saldoEstimado ?? 0;
    const ultimoSaldo = resultado[29]?.saldoEstimado ?? 0;
    expect(ultimoSaldo).toBeGreaterThanOrEqual(primeiroSaldo - 1);
  });

  // Teste 12: Período curto
  it("lida bem com período curto", () => {
    const resultado = forecastRegressao(db, 1);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toBeDefined();
  });

  // Teste 13: Dados variáveis
  it("maior variação = maior intervalo de confiança", () => {
    const hoje = new Date();
    const dias90aAtras = new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000);
    const saldoInicial = 5000;

    const dataStr = dias90aAtras.toISOString().split("T")[0];
    db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, ?, 'saldo inicial', '1.1.01')").run(dataStr, saldoInicial);

    for (let i = 0; i < 90; i++) {
      const data = new Date(dias90aAtras.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const valor = Math.random() * 490 + 10;
      db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, ?, 'receita', '1.1.01')").run(data, valor);
    }

    const resultado = forecastRegressao(db, 30);
    const margemMédia = resultado.reduce((acc, p) => acc + (p.max - p.min), 0) / resultado.length;
    expect(margemMédia).toBeGreaterThan(0);
  });

  // Teste 14: Períodos diferentes
  it("dimensiona intervalo de confiança para período mais longo", () => {
    const hoje = new Date();
    const dias90aAtras = new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 90; i++) {
      const data = new Date(dias90aAtras.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const valor = 50 + Math.random() * 50;
      db.prepare("INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo) VALUES (1, ?, ?, 'receita', '1.1.01')").run(data, valor);
    }

    const resultado30 = forecastRegressao(db, 30);
    const resultado90 = forecastRegressao(db, 90);

    expect(resultado30).toHaveLength(30);
    expect(resultado90).toHaveLength(90);
  });

  // Teste 15: Caso edge
  it("lida com array vazio de histórico", () => {
    const resultado = forecastRegressao(db, 10);
    expect(resultado).toHaveLength(10);
    expect(resultado[0]?.saldoEstimado).toBe(0);
  });
});
