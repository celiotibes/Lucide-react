/**
 * MÓDULO 4h: Migration & Data Import
 * Importação de dados de sistemas legados: SAP, Tally, QuickBooks
 * Validação, deduplicação, reconciliação de plano de contas
 */

export interface DadosLegacy {
  tipo_sistema: 'SAP' | 'Tally' | 'QuickBooks' | 'outro';
  contas?: ContaLegacy[];
  lancamentos?: LancamentoLegacy[];
  saldos?: SaldoLegacy[];
  periodo_inicio: string;
  periodo_fim: string;
}

export interface ContaLegacy {
  codigo_original: string;
  descricao: string;
  tipo_conta: string;
  natureza: string;
  saldo_inicial: number;
  data_criacao?: string;
}

export interface LancamentoLegacy {
  data: string;
  conta_codigo: string;
  descricao: string;
  valor_debito?: number;
  valor_credito?: number;
  referencia_documento: string;
  observacoes?: string;
}

export interface SaldoLegacy {
  conta_codigo: string;
  saldo: number;
  data_saldo: string;
}

export interface ResultadoMigracao {
  id?: number;
  data_migracao: string;
  sistema_origem: string;
  periodo_inicio: string;
  periodo_fim: string;
  total_contas_importadas: number;
  total_lancamentos_importados: number;
  contas_duplicadas: number;
  lancamentos_duplicados: number;
  contas_erro: number;
  lancamentos_erro: number;
  status: 'em_progresso' | 'concluido' | 'erro' | 'parcial';
  mensagem_status: string;
  mapeamento_contas: Record<string, string>; // codigo_legacy => codigo_novo
  reconciliacao_ok: boolean;
  hash_importacao?: string;
}

export interface ValidacaoDados {
  valido: boolean;
  erros: string[];
  avisos: string[];
  registros_processados: number;
  registros_invalidos: number;
}

/**
 * Importa dados de sistema legado
 */
export function importarDadosLegacy(
  db: any,
  entidade_id: number,
  periodo_id: number,
  dados_legacy: DadosLegacy
): ResultadoMigracao {
  const resultado: ResultadoMigracao = {
    data_migracao: new Date().toISOString(),
    sistema_origem: dados_legacy.tipo_sistema,
    periodo_inicio: dados_legacy.periodo_inicio,
    periodo_fim: dados_legacy.periodo_fim,
    total_contas_importadas: 0,
    total_lancamentos_importados: 0,
    contas_duplicadas: 0,
    lancamentos_duplicados: 0,
    contas_erro: 0,
    lancamentos_erro: 0,
    status: 'em_progresso',
    mensagem_status: 'Iniciando importação...',
    mapeamento_contas: {},
    reconciliacao_ok: false,
  };

  try {
    // 1. Validar dados
    const validacao = validarIntegridade(dados_legacy);
    if (!validacao.valido) {
      resultado.status = 'erro';
      resultado.mensagem_status = validacao.erros.join('; ');
      return resultado;
    }

    // 2. Mapear contas
    if (dados_legacy.contas) {
      for (const conta of dados_legacy.contas) {
        try {
          const codigoNovo = mapearConta(db, conta);
          resultado.mapeamento_contas[conta.codigo_original] = codigoNovo;
          resultado.total_contas_importadas++;
        } catch (erro) {
          console.error(`Erro ao mapear conta ${conta.codigo_original}:`, erro);
          resultado.contas_erro++;
        }
      }
    }

    // 3. Importar lançamentos
    if (dados_legacy.lancamentos) {
      for (const lancamento of dados_legacy.lancamentos) {
        try {
          const codigoNovo = resultado.mapeamento_contas[lancamento.conta_codigo];

          if (!codigoNovo) {
            console.warn(`Conta ${lancamento.conta_codigo} não mapeada`);
            resultado.lancamentos_erro++;
            continue;
          }

          // Verificar duplicação
          if (existeLancamentoDuplicado(db, lancamento)) {
            resultado.lancamentos_duplicados++;
            continue;
          }

          // Inserir lançamento
          db.run(
            `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito, descricao, origem_modulo, referencia_documento, criado_em)
             SELECT ?, ?, id, ?, ?, ?, ?, 'migracao-legacy', ?, ?
             FROM contas_plano_contas WHERE codigo = ?`,
            [
              entidade_id,
              periodo_id,
              lancamento.data,
              lancamento.valor_debito || 0,
              lancamento.valor_credito || 0,
              lancamento.descricao,
              lancamento.referencia_documento,
              new Date().toISOString(),
              codigoNovo,
            ]
          );

          resultado.total_lancamentos_importados++;
        } catch (erro) {
          console.error(`Erro ao importar lançamento:`, erro);
          resultado.lancamentos_erro++;
        }
      }
    }

    // 4. Reconciliar saldos
    if (dados_legacy.saldos) {
      resultado.reconciliacao_ok = reconciliarSaldos(db, periodo_id, dados_legacy.saldos, resultado.mapeamento_contas);
    }

    resultado.status =
      resultado.contas_erro + resultado.lancamentos_erro === 0 ? 'concluido' : 'parcial';
    resultado.mensagem_status =
      resultado.status === 'concluido'
        ? 'Importação concluída com sucesso'
        : `Importação concluída com ${resultado.contas_erro + resultado.lancamentos_erro} erros`;

    // 5. Registrar resultado
    db.run(
      `INSERT INTO migracao_dados (sistema_origem, periodo_inicio, periodo_fim, total_contas, total_lancamentos, duplicadas, status, mapeamento, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        resultado.sistema_origem,
        resultado.periodo_inicio,
        resultado.periodo_fim,
        resultado.total_contas_importadas,
        resultado.total_lancamentos_importados,
        resultado.lancamentos_duplicados,
        resultado.status,
        JSON.stringify(resultado.mapeamento_contas),
        resultado.data_migracao,
      ]
    );

    return resultado;
  } catch (erro) {
    resultado.status = 'erro';
    resultado.mensagem_status = `Erro geral: ${String(erro)}`;
    return resultado;
  }
}

/**
 * Valida integridade dos dados de importação
 */
export function validarIntegridade(dados: DadosLegacy): ValidacaoDados {
  const erros: string[] = [];
  const avisos: string[] = [];
  let registros_processados = 0;
  let registros_invalidos = 0;

  // Validar período
  if (!dados.periodo_inicio || !dados.periodo_fim) {
    erros.push('Período de importação é obrigatório');
  }

  // Validar contas
  if (dados.contas && dados.contas.length > 0) {
    for (const conta of dados.contas) {
      registros_processados++;

      if (!conta.codigo_original || !conta.descricao) {
        erros.push(`Conta inválida: código ou descrição faltando`);
        registros_invalidos++;
        continue;
      }

      if (conta.saldo_inicial < 0 && conta.natureza === 'debito') {
        avisos.push(`Conta ${conta.codigo_original}: saldo inicial negativo em conta devedora`);
      }
    }
  }

  // Validar lançamentos
  if (dados.lancamentos && dados.lancamentos.length > 0) {
    for (const lanc of dados.lancamentos) {
      registros_processados++;

      if (!lanc.data || !lanc.conta_codigo) {
        erros.push(`Lançamento inválido: data ou conta faltando`);
        registros_invalidos++;
        continue;
      }

      if (!lanc.valor_debito && !lanc.valor_credito) {
        erros.push(`Lançamento inválido: sem débito ou crédito`);
        registros_invalidos++;
        continue;
      }

      if (lanc.valor_debito && lanc.valor_credito) {
        erros.push(`Lançamento inválido: não pode ter débito e crédito simultâneos`);
        registros_invalidos++;
        continue;
      }

      // Data futura
      const dataLanc = new Date(lanc.data);
      if (dataLanc > new Date()) {
        avisos.push(`Lançamento com data futura: ${lanc.data}`);
      }
    }
  }

  return {
    valido: erros.length === 0,
    erros,
    avisos,
    registros_processados,
    registros_invalidos,
  };
}

/**
 * Mapeia conta do sistema legado para o plano de contas local
 */
function mapearConta(db: any, contaLegacy: ContaLegacy): string {
  // Verificar se já existe mapeamento
  const resultMapeado = db.exec(
    `SELECT codigo_local FROM conta_mapeamento WHERE codigo_nuvem = ?`,
    [contaLegacy.codigo_original]
  );

  if (resultMapeado[0]?.values[0]) {
    return resultMapeado[0].values[0][0];
  }

  // Procurar conta local compatível por tipo
  const resultCompativel = db.exec(
    `SELECT codigo FROM contas_plano_contas WHERE tipo LIKE ? AND natureza = ? LIMIT 1`,
    [`%${contaLegacy.tipo_conta}%`, contaLegacy.natureza]
  );

  if (resultCompativel[0]?.values[0]) {
    const codigoLocal = resultCompativel[0].values[0][0];

    // Registrar mapeamento
    db.run(
      `INSERT INTO conta_mapeamento (codigo_local, codigo_nuvem, descricao_local, descricao_nuvem, tipo_conta, natureza, status)
       VALUES (?, ?, ?, ?, ?, ?, 'ativo')`,
      [
        codigoLocal,
        contaLegacy.codigo_original,
        '',
        contaLegacy.descricao,
        contaLegacy.tipo_conta,
        contaLegacy.natureza,
      ]
    );

    return codigoLocal;
  }

  // Se não encontrar compatível, criar nova conta
  const novoCodigoBase = contaLegacy.codigo_original.split('.')[0];
  const proximoCodigo = `${novoCodigoBase}.${Math.floor(Math.random() * 1000)}`;

  db.run(
    `INSERT INTO contas_plano_contas (codigo, descricao, grupo, natureza)
     VALUES (?, ?, ?, ?)`,
    [
      proximoCodigo,
      `[LEGACY-${contaLegacy.codigo_original}] ${contaLegacy.descricao}`,
      contaLegacy.tipo_conta,
      contaLegacy.natureza,
    ]
  );

  return proximoCodigo;
}

/**
 * Verifica se lançamento é duplicado
 */
function existeLancamentoDuplicado(db: any, lancamento: LancamentoLegacy): boolean {
  const result = db.exec(
    `SELECT id FROM ledger_entries WHERE data_lancamento = ? AND referencia_documento = ? LIMIT 1`,
    [lancamento.data, lancamento.referencia_documento]
  );

  return result[0]?.values.length > 0;
}

/**
 * Reconcilia saldos importados com ledger
 */
function reconciliarSaldos(
  db: any,
  periodo_id: number,
  saldos_legacy: SaldoLegacy[],
  mapeamento: Record<string, string>
): boolean {
  let saldos_corretos = 0;
  let saldos_divergentes = 0;

  for (const saldoLegacy of saldos_legacy) {
    const codigoNovo = mapeamento[saldoLegacy.conta_codigo];

    if (!codigoNovo) continue;

    // Calcular saldo do ledger para a conta
    const result = db.exec(
      `SELECT COALESCE(SUM(valor_credito - valor_debito), 0) as saldo
       FROM ledger_entries
       WHERE periodo_id = ? AND conta_id = (SELECT id FROM contas_plano_contas WHERE codigo = ?)`,
      [periodo_id, codigoNovo]
    );

    const saldoLedger = result[0]?.values[0]?.[0] || 0;
    const diferenca = Math.abs(saldoLedger - saldoLegacy.saldo);

    if (diferenca < 0.01) {
      saldos_corretos++;
    } else {
      saldos_divergentes++;

      // Registrar divergência
      db.run(
        `INSERT INTO divergencias_migracao (conta_codigo, saldo_legacy, saldo_ledger, diferenca, criado_em)
         VALUES (?, ?, ?, ?, ?)`,
        [
          saldoLegacy.conta_codigo,
          saldoLegacy.saldo,
          saldoLedger,
          diferenca,
          new Date().toISOString(),
        ]
      );
    }
  }

  return saldos_divergentes === 0;
}

/**
 * Limpa dados inválidos após importação
 */
export function limparDadosInvalidos(
  db: any,
  periodo_id: number
): { registros_removidos: number; erros: string[] } {
  const erros: string[] = [];
  let removidos = 0;

  try {
    // Remover lançamentos sem valor
    const resultVazios = db.exec(
      `DELETE FROM ledger_entries WHERE periodo_id = ? AND valor_debito IS NULL AND valor_credito IS NULL`,
      [periodo_id]
    );

    // Remover lançamentos com ambos débito e crédito
    const resultDuploSinal = db.exec(
      `DELETE FROM ledger_entries WHERE periodo_id = ? AND valor_debito IS NOT NULL AND valor_credito IS NOT NULL`,
      [periodo_id]
    );

    // Remover lançamentos órfãos (conta não existe)
    const resultOrfaos = db.exec(
      `DELETE FROM ledger_entries WHERE periodo_id = ? AND conta_id NOT IN (SELECT id FROM contas_plano_contas)`,
      [periodo_id]
    );

    removidos = (resultVazios as any)?.changes || 0;
    removidos += (resultDuploSinal as any)?.changes || 0;
    removidos += (resultOrfaos as any)?.changes || 0;
  } catch (erro) {
    erros.push(String(erro));
  }

  return { registros_removidos: removidos, erros };
}

/**
 * Gera relatório de diferenças após importação
 */
export function gerarRelatorioDiferencas(
  db: any,
  periodo_id: number
): {
  divergencias: Array<{
    conta: string;
    saldo_esperado: number;
    saldo_obtido: number;
    diferenca: number;
  }>;
  total_divergencias: number;
} {
  try {
    const result = db.exec(
      `SELECT dm.conta_codigo, dm.saldo_legacy, dm.saldo_ledger, dm.diferenca
       FROM divergencias_migracao dm
       WHERE periodo_id = ?
       ORDER BY ABS(dm.diferenca) DESC`,
      [periodo_id]
    );

    const divergencias: any[] = [];

    if (result[0]?.values) {
      for (const [conta, esperado, obtido, diferenca] of result[0].values) {
        divergencias.push({
          conta,
          saldo_esperado: esperado,
          saldo_obtido: obtido,
          diferenca,
        });
      }
    }

    return {
      divergencias,
      total_divergencias: divergencias.length,
    };
  } catch (erro) {
    console.error('Erro ao gerar relatório de diferenças:', erro);
    return {
      divergencias: [],
      total_divergencias: 0,
    };
  }
}

/**
 * Faz rollback de importação
 */
export function rollbackMigracao(
  db: any,
  migracao_id: number
): { sucesso: boolean; mensagem: string; registros_removidos: number } {
  try {
    // Encontrar referência de documento que identifica a migração
    const result = db.exec(
      `SELECT referencia_documento FROM ledger_entries
       WHERE referencia_documento LIKE 'MIGRACAO_%' AND id <= (
         SELECT MAX(id) FROM ledger_entries WHERE referencia_documento LIKE ?
       ) LIMIT 1`,
      [`MIGRACAO_${migracao_id}_%`]
    );

    // Remover lançamentos da migração
    const deleteResult = db.exec(
      `DELETE FROM ledger_entries WHERE origem_modulo = 'migracao-legacy' AND periodo_id IN (
         SELECT periodo_id FROM migracao_dados WHERE id = ?
       )`,
      [migracao_id]
    );

    // Marcar migração como revertida
    db.run(
      `UPDATE migracao_dados SET status = 'revertida' WHERE id = ?`,
      [migracao_id]
    );

    return {
      sucesso: true,
      mensagem: 'Migração revertida com sucesso',
      registros_removidos: (deleteResult as any)?.changes || 0,
    };
  } catch (erro) {
    return {
      sucesso: false,
      mensagem: `Erro ao reverter migração: ${String(erro)}`,
      registros_removidos: 0,
    };
  }
}
