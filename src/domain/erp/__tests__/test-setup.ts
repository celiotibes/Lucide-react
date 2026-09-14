import initSqlJs from "sql.js";

export async function prepararBancoTeste() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  // Criar esquema básico
  db.run(`
    CREATE TABLE IF NOT EXISTS entidades (
      id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      tipo TEXT,
      cnpj TEXT
    );

    CREATE TABLE IF NOT EXISTS periodos_contabeis (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER NOT NULL,
      ano INTEGER NOT NULL,
      mes INTEGER NOT NULL,
      status TEXT DEFAULT 'aberto',
      FOREIGN KEY (entidade_id) REFERENCES entidades(id)
    );

    CREATE TABLE IF NOT EXISTS contas_plano_contas (
      id INTEGER PRIMARY KEY,
      codigo TEXT NOT NULL,
      descricao TEXT NOT NULL,
      grupo TEXT NOT NULL,
      natureza TEXT NOT NULL,
      UNIQUE(codigo)
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER NOT NULL,
      periodo_id INTEGER NOT NULL,
      conta_id INTEGER NOT NULL,
      descricao TEXT,
      valor_debito REAL DEFAULT 0,
      valor_credito REAL DEFAULT 0,
      data_lancamento TEXT,
      FOREIGN KEY (entidade_id) REFERENCES entidades(id),
      FOREIGN KEY (periodo_id) REFERENCES periodos_contabeis(id),
      FOREIGN KEY (conta_id) REFERENCES contas_plano_contas(id)
    );

    CREATE TABLE IF NOT EXISTS imoveis (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER NOT NULL,
      endereco TEXT NOT NULL,
      tipo_imovel TEXT,
      uso_pessoal INTEGER DEFAULT 0,
      financiado INTEGER DEFAULT 0,
      valor_aquisicao REAL DEFAULT 0,
      FOREIGN KEY (entidade_id) REFERENCES entidades(id)
    );

    CREATE TABLE IF NOT EXISTS contratos_locacao (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER NOT NULL,
      imovel_id INTEGER NOT NULL,
      valor_aluguel REAL,
      valor_referencia REAL,
      data_inicio TEXT,
      data_fim TEXT,
      status TEXT DEFAULT 'ativo',
      FOREIGN KEY (entidade_id) REFERENCES entidades(id),
      FOREIGN KEY (imovel_id) REFERENCES imoveis(id)
    );

    CREATE TABLE IF NOT EXISTS transacoes_auditoria (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER NOT NULL,
      periodo_id INTEGER NOT NULL,
      tipo TEXT,
      descricao TEXT,
      status TEXT DEFAULT 'pendente',
      FOREIGN KEY (entidade_id) REFERENCES entidades(id),
      FOREIGN KEY (periodo_id) REFERENCES periodos_contabeis(id)
    );
  `);

  // Inserir dados de teste
  const entidade_id = 1;
  const periodo_id = 1;

  db.run(
    `INSERT INTO entidades (id, nome, tipo) VALUES (?, ?, ?)`,
    [entidade_id, "Teste Entity", "PJ"]
  );

  db.run(
    `INSERT INTO periodos_contabeis (id, entidade_id, ano, mes, status) VALUES (?, ?, ?, ?, ?)`,
    [periodo_id, entidade_id, 2026, 1, "aberto"]
  );

  // Criar plano de contas básico
  const contasPadrao = [
    // Ativo
    ["1.1.01", "Caixa", "ativo", "debito"],
    ["1.1.02", "Conta Bancária", "ativo", "debito"],
    ["1.1.03", "Aplicações Financeiras", "ativo", "debito"],
    ["2.1.01", "Imóvel", "ativo", "debito"],
    ["2.1.02", "Equipamentos", "ativo", "debito"],

    // Passivo
    ["3.1.01", "Fornecedores", "passivo", "credito"],
    ["3.1.02", "Salários a Pagar", "passivo", "credito"],
    ["3.2.01", "Empréstimos de Longo Prazo", "passivo", "credito"],

    // Patrimônio Líquido
    ["4.1.01", "Capital Social", "patrimonio_liquido", "credito"],
    ["4.1.02", "Lucros Acumulados", "patrimonio_liquido", "credito"],

    // Receitas
    ["5.1.01", "Aluguel", "receita", "credito"],
    ["5.1.02", "Reajustes", "receita", "credito"],
    ["5.1.03", "Rateios", "receita", "credito"],
    ["5.2.01", "Juros Recebidos", "receita", "credito"],
    ["5.3.01", "Outras Receitas", "receita", "credito"],

    // Despesas
    ["6.1.01", "Condomínio", "despesa", "debito"],
    ["6.1.02", "Água e Esgoto", "despesa", "debito"],
    ["6.1.03", "Eletricidade", "despesa", "debito"],
    ["6.1.04", "Internet", "despesa", "debito"],
    ["6.1.05", "Manutenção", "despesa", "debito"],
    ["6.1.06", "Limpeza", "despesa", "debito"],
    ["6.1.07", "Seguros", "despesa", "debito"],
    ["6.2.01", "Depreciação", "despesa", "debito"],
    ["6.3.01", "Juros Financiamento", "despesa", "debito"],
    ["6.3.02", "Juros Mora", "despesa", "debito"],
    ["6.4.01", "Provisão Devedora", "despesa", "debito"],
  ];

  for (const [codigo, desc, grupo, natureza] of contasPadrao) {
    db.run(
      `INSERT INTO contas_plano_contas (codigo, descricao, grupo, natureza) VALUES (?, ?, ?, ?)`,
      [codigo, desc, grupo, natureza]
    );
  }

  // Inserir dados de teste (ledger_entries)
  // Receita de aluguel
  db.run(
    `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, descricao, valor_credito, data_lancamento)
     SELECT ?, ?, id, 'Aluguel - janeiro', 15000, '2026-01-01'
     FROM contas_plano_contas WHERE codigo = '5.1.01'`,
    [entidade_id, periodo_id]
  );

  // Receita de rateios
  db.run(
    `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, descricao, valor_credito, data_lancamento)
     SELECT ?, ?, id, 'Rateios - janeiro', 3000, '2026-01-05'
     FROM contas_plano_contas WHERE codigo = '5.1.03'`,
    [entidade_id, periodo_id]
  );

  // Despesa de condomínio
  db.run(
    `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, descricao, valor_debito, data_lancamento)
     SELECT ?, ?, id, 'Condomínio - janeiro', 2000, '2026-01-10'
     FROM contas_plano_contas WHERE codigo = '6.1.01'`,
    [entidade_id, periodo_id]
  );

  // Despesa de manutenção
  db.run(
    `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, descricao, valor_debito, data_lancamento)
     SELECT ?, ?, id, 'Manutenção - janeiro', 800, '2026-01-15'
     FROM contas_plano_contas WHERE codigo = '6.1.05'`,
    [entidade_id, periodo_id]
  );

  // Caixa inicial
  db.run(
    `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, descricao, valor_debito, data_lancamento)
     SELECT ?, ?, id, 'Saldo inicial - caixa', 10000, '2026-01-01'
     FROM contas_plano_contas WHERE codigo = '1.1.01'`,
    [entidade_id, periodo_id]
  );

  // Ativo imóvel
  db.run(
    `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, descricao, valor_debito, data_lancamento)
     SELECT ?, ?, id, 'Aquisição imóvel', 500000, '2025-12-15'
     FROM contas_plano_contas WHERE codigo = '2.1.01'`,
    [entidade_id, periodo_id]
  );

  // Capital social
  db.run(
    `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, descricao, valor_credito, data_lancamento)
     SELECT ?, ?, id, 'Capital - integralização', 500000, '2025-12-01'
     FROM contas_plano_contas WHERE codigo = '4.1.01'`,
    [entidade_id, periodo_id]
  );

  // Inserir dados de imoveis
  db.run(
    `INSERT INTO imoveis (id, entidade_id, endereco, tipo_imovel, uso_pessoal, financiado, valor_aquisicao) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [1, entidade_id, "Rua Principal 123, Apto 101", "apartamento", 0, 0, 300000]
  );

  db.run(
    `INSERT INTO imoveis (id, entidade_id, endereco, tipo_imovel, uso_pessoal, financiado, valor_aquisicao) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [2, entidade_id, "Rua Principal 123, Apto 102", "apartamento", 0, 0, 350000]
  );

  // Inserir dados de contratos_locacao
  db.run(
    `INSERT INTO contratos_locacao (id, entidade_id, imovel_id, valor_aluguel, valor_referencia, data_inicio, data_fim, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [1, entidade_id, 1, 2000, 2000, "2025-01-01", "2026-12-31", "ativo"]
  );

  db.run(
    `INSERT INTO contratos_locacao (id, entidade_id, imovel_id, valor_aluguel, valor_referencia, data_inicio, data_fim, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [2, entidade_id, 2, 2500, 2500, "2025-06-01", "2026-12-31", "ativo"]
  );

  // Inserir dados de transacoes_auditoria
  db.run(
    `INSERT INTO transacoes_auditoria (id, entidade_id, periodo_id, tipo, descricao, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [1, entidade_id, periodo_id, "lancamento", "Auditoria de lançamentos", "pendente"]
  );

  return { db, entidade_id, periodo_id };
}
