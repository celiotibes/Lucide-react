export interface ContaPessoal {
  id: number;
  entidade_id: number;
  tipo_conta: 'conta_corrente_pessoal' | 'poupanca_pessoal' | 'investimentos_pessoais' | 'outro';
  descricao: string;
  saldo_inicial: number;
  data_abertura: string;
  status: 'ativa' | 'inativa' | 'encerrada';
}

export interface MovimentoPessoal {
  id: number;
  conta_pessoal_id: number;
  entidade_id: number;
  periodo_id: number;
  data_movimento: string;
  descricao: string;
  tipo_movimento: 'entrada' | 'saida';
  valor: number;
  categoria: string;
  observacoes?: string;
}

export interface RelatorioPessoalFinanceiro {
  periodo: string;
  contas: ContaPessoal[];
  saldo_total: number;
  entradas_total: number;
  saidas_total: number;
  movimentos_por_categoria: Record<string, { entrada: number; saida: number }>;
  saldo_por_conta: Record<string, number>;
}

export interface SeparacaoPessoalXNegocio {
  saldo_pessoal_liquido: number;
  saldo_negocios: number;
  percentual_pessoal: number;
  pendencias_classificacao: number;
  movimentos_nao_classificados: number;
}

export function registrarMovimentoPessoal(
  db: any,
  movimento: Omit<MovimentoPessoal, 'id'>
): number {
  db.run(
    `INSERT INTO movimentos_pessoais (conta_pessoal_id, entidade_id, periodo_id, data_movimento, descricao, tipo_movimento, valor, categoria, observacoes, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      movimento.conta_pessoal_id,
      movimento.entidade_id,
      movimento.periodo_id,
      movimento.data_movimento,
      movimento.descricao,
      movimento.tipo_movimento,
      movimento.valor,
      movimento.categoria,
      movimento.observacoes || null,
      new Date().toISOString(),
    ]
  );
  return 1;
}

export function obterSaldoContaPessoal(db: any, conta_id: number): number {
  const conta = db.exec(
    `SELECT saldo_inicial FROM contas_pessoais WHERE id = ${conta_id}`
  );
  const saldoInicial = (conta[0]?.values[0]?.[0] || 0) as number;

  const result = db.exec(
    `SELECT SUM(CASE WHEN tipo_movimento = 'entrada' THEN valor ELSE -valor END) as saldo
     FROM movimentos_pessoais
     WHERE conta_pessoal_id = ${conta_id}`
  );
  const movimentos = (result[0]?.values[0]?.[0] || 0) as number;

  return saldoInicial + movimentos;
}

export function obterRelatorioFinanceiroPessoal(
  db: any,
  periodo_id: number,
  entidade_id: number
): RelatorioPessoalFinanceiro {
  const contas = db.exec(
    `SELECT id, tipo_conta, descricao, saldo_inicial FROM contas_pessoais WHERE entidade_id = ?`,
    [entidade_id]
  );

  const contasParsed: ContaPessoal[] = [];
  if (contas[0]?.values) {
    for (const [id, tipo, desc, saldo_init] of contas[0].values) {
      contasParsed.push({
        id,
        entidade_id,
        tipo_conta: tipo,
        descricao: desc,
        saldo_inicial: saldo_init,
        data_abertura: '',
        status: 'ativa',
      });
    }
  }

  const entradas = db.exec(
    `SELECT SUM(valor) as total FROM movimentos_pessoais
     WHERE entidade_id = ? AND periodo_id = ? AND tipo_movimento = 'entrada'`,
    [entidade_id, periodo_id]
  );
  const entradasTotal = (entradas[0]?.values[0]?.[0] || 0) as number;

  const saidas = db.exec(
    `SELECT SUM(valor) as total FROM movimentos_pessoais
     WHERE entidade_id = ? AND periodo_id = ? AND tipo_movimento = 'saida'`,
    [entidade_id, periodo_id]
  );
  const saidasTotal = (saidas[0]?.values[0]?.[0] || 0) as number;

  const porCategoria = db.exec(
    `SELECT categoria, tipo_movimento, SUM(valor) as total
     FROM movimentos_pessoais
     WHERE entidade_id = ? AND periodo_id = ?
     GROUP BY categoria, tipo_movimento`,
    [entidade_id, periodo_id]
  );

  const categoriaMap: Record<string, { entrada: number; saida: number }> = {};
  if (porCategoria[0]?.values) {
    for (const [cat, tipo, total] of porCategoria[0].values) {
      if (!categoriaMap[cat]) {
        categoriaMap[cat] = { entrada: 0, saida: 0 };
      }
      if (tipo === 'entrada') {
        categoriaMap[cat].entrada = total;
      } else {
        categoriaMap[cat].saida = total;
      }
    }
  }

  const saldoPorConta: Record<string, number> = {};
  for (const conta of contasParsed) {
    saldoPorConta[conta.descricao] = obterSaldoContaPessoal(db, conta.id);
  }

  const saldoTotal = Object.values(saldoPorConta).reduce((a, b) => a + b, 0);

  return {
    periodo: `${new Date().getFullYear()}/01`,
    contas: contasParsed,
    saldo_total: saldoTotal,
    entradas_total: entradasTotal,
    saidas_total: saidasTotal,
    movimentos_por_categoria: categoriaMap,
    saldo_por_conta: saldoPorConta,
  };
}

export function avaliarSeparacaoPessoalXNegocio(
  db: any,
  entidade_id: number,
  periodo_id: number
): SeparacaoPessoalXNegocio {
  const ledgerTotal = db.exec(
    `SELECT SUM(CASE WHEN valor_debito > 0 THEN valor_debito ELSE -valor_credito END) as total
     FROM ledger_entries
     WHERE entidade_id = ? AND periodo_id = ?`,
    [entidade_id, periodo_id]
  );
  const saldoNegocios = (ledgerTotal[0]?.values[0]?.[0] || 0) as number;

  const pessoalTotal = db.exec(
    `SELECT SUM(CASE WHEN tipo_movimento = 'entrada' THEN valor ELSE -valor END) as total
     FROM movimentos_pessoais
     WHERE entidade_id = ? AND periodo_id = ?`,
    [entidade_id, periodo_id]
  );
  const saldoPessoal = (pessoalTotal[0]?.values[0]?.[0] || 0) as number;

  const totalGeral = Math.abs(saldoNegocios) + Math.abs(saldoPessoal);
  const percentualPessoal = totalGeral > 0 ? (Math.abs(saldoPessoal) / totalGeral) * 100 : 0;

  const naoClassificados = db.exec(
    `SELECT COUNT(*) as count FROM movimentos_pessoais
     WHERE entidade_id = ? AND categoria IS NULL`,
    [entidade_id]
  );
  const pendentes = (naoClassificados[0]?.values[0]?.[0] || 0) as number;

  return {
    saldo_pessoal_liquido: saldoPessoal,
    saldo_negocios: saldoNegocios,
    percentual_pessoal: Math.round(percentualPessoal * 100) / 100,
    pendencias_classificacao: 0,
    movimentos_nao_classificados: pendentes,
  };
}

export function validarSeparacaoContabil(
  db: any,
  entidade_id: number
): { separacao_adequada: boolean; avisos: string[] } {
  const avisos: string[] = [];
  const separacao = avaliarSeparacaoPessoalXNegocio(db, entidade_id, 1);

  if (separacao.movimentos_nao_classificados > 0) {
    avisos.push(
      `${separacao.movimentos_nao_classificados} movimentos pessoais sem classificação`
    );
  }

  if (separacao.percentual_pessoal > 20) {
    avisos.push(
      `Movimentos pessoais representam ${separacao.percentual_pessoal}% do total (acima de 20%)`
    );
  }

  return {
    separacao_adequada: avisos.length === 0,
    avisos,
  };
}
