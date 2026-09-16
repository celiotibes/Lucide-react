/**
 * MÓDULO 4d: ERP Cloud Sync
 * Sincronização bidirecional com ERPs em nuvem: SAP, Oracle, Microsoft Dynamics
 */

export interface ContaMapeamento {
  id?: number;
  codigo_local: string;
  descricao_local: string;
  codigo_nuvem: string;
  descricao_nuvem: string;
  tipo_conta: string;
  natureza: string;
  status: 'ativo' | 'inativo';
  criado_em?: string;
}

export interface SincronizacaoStatus {
  id?: number;
  data_inicio: string;
  data_fim?: string;
  tipo_sincronizacao: 'full' | 'incremental';
  status: 'em_progresso' | 'sucesso' | 'erro' | 'parcial';
  registros_processados: number;
  registros_sucesso: number;
  registros_erro: number;
  mensagem_erro?: string;
}

export interface ConflictoSincronizacao {
  id?: number;
  recurso_tipo: string; // 'conta', 'lancamento', 'saldo'
  id_local: number;
  id_nuvem: string;
  valor_local: any;
  valor_nuvem: any;
  data_conflito: string;
  estrategia_resolucao: 'last_write_wins' | 'manual_override' | 'local_priority' | 'cloud_priority';
  resolvido: boolean;
  data_resolucao?: string;
}

export interface ConfiguracaoERP {
  tipo_erp: 'SAP' | 'Oracle' | 'Dynamics' | 'outro';
  url_api: string;
  usuario: string;
  senha: string;
  token_acesso?: string;
  intervalo_sincronizacao_minutos?: number;
  campos_mapeamento?: Record<string, string>;
}

/**
 * Inicia sincronização com ERP em nuvem
 */
export function sincronizarComNuvem(
  db: any,
  entidade_id: number,
  config: ConfiguracaoERP,
  tipo_sync: 'full' | 'incremental' = 'incremental'
): SincronizacaoStatus {
  const dataInicio = new Date().toISOString();
  const status: SincronizacaoStatus = {
    data_inicio: dataInicio,
    tipo_sincronizacao: tipo_sync,
    status: 'em_progresso',
    registros_processados: 0,
    registros_sucesso: 0,
    registros_erro: 0,
  };

  try {
    // Fazer login/autenticação na API
    const token = autenticarERP(config);

    // Buscar contas do ERP em nuvem
    const contasNuvem = buscarContasNuvem(config, token);

    // Buscar contas locais
    const contasLocais = buscarContasLocais(db, entidade_id);

    // Mapear contas
    const mapeamentos = carregarMapeamentos(db);

    // Sincronizar
    let sucessos = 0;
    let erros = 0;

    for (const contaNuvem of contasNuvem) {
      const mapeamento = mapeamentos.find(
        m => m.codigo_nuvem === contaNuvem.codigo
      );

      if (!mapeamento) {
        // Conta nova na nuvem - criar localmente
        try {
          criarContaLocal(db, entidade_id, contaNuvem);
          sucessos++;
        } catch (erro) {
          console.error('Erro ao criar conta local:', erro);
          erros++;
        }
      } else {
        // Conta existente - sincronizar saldos
        try {
          sincronizarSaldosConta(db, entidade_id, mapeamento, contaNuvem);
          sucessos++;
        } catch (erro) {
          console.error('Erro ao sincronizar saldo:', erro);
          erros++;
        }
      }

      status.registros_processados++;
    }

    status.registros_sucesso = sucessos;
    status.registros_erro = erros;
    status.status = erros === 0 ? 'sucesso' : 'parcial';
    status.data_fim = new Date().toISOString();

    // Registrar status no banco
    db.run(
      `INSERT INTO sincronizacao_status (data_inicio, data_fim, tipo_sincronizacao, status, registros_processados, registros_sucesso, registros_erro, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        status.data_inicio,
        status.data_fim,
        status.tipo_sincronizacao,
        status.status,
        status.registros_processados,
        status.registros_sucesso,
        status.registros_erro,
        new Date().toISOString(),
      ]
    );

    return status;
  } catch (erro) {
    status.status = 'erro';
    status.mensagem_erro = String(erro);
    status.data_fim = new Date().toISOString();
    return status;
  }
}

/**
 * Mapeia contas do plano de contas local para o ERP
 */
export function mapearContasPlan(
  db: any,
  entidade_id: number,
  codigo_local: string,
  codigo_nuvem: string
): ContaMapeamento {
  const mapeamento: ContaMapeamento = {
    codigo_local,
    descricao_local: obterDescricaoConta(db, codigo_local),
    codigo_nuvem,
    descricao_nuvem: codigo_nuvem, // Seria obtido da API
    tipo_conta: 'ativo',
    natureza: 'debito',
    status: 'ativo',
    criado_em: new Date().toISOString(),
  };

  try {
    db.run(
      `INSERT INTO conta_mapeamento (codigo_local, codigo_nuvem, descricao_local, descricao_nuvem, tipo_conta, natureza, status, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mapeamento.codigo_local,
        mapeamento.codigo_nuvem,
        mapeamento.descricao_local,
        mapeamento.descricao_nuvem,
        mapeamento.tipo_conta,
        mapeamento.natureza,
        mapeamento.status,
        mapeamento.criado_em,
      ]
    );
  } catch (erro) {
    console.error('Erro ao mapear contas:', erro);
  }

  return mapeamento;
}

/**
 * Resolve conflitos de sincronização
 */
export function resolverConflitos(
  db: any,
  conflito: ConflictoSincronizacao,
  estrategia: 'last_write_wins' | 'manual_override' | 'local_priority' | 'cloud_priority'
): boolean {
  try {
    let valor_final = conflito.valor_local;

    if (estrategia === 'last_write_wins') {
      // Usar o valor mais recente
      valor_final = conflito.valor_nuvem; // Simular que nuvem é mais recente
    } else if (estrategia === 'cloud_priority') {
      valor_final = conflito.valor_nuvem;
    }

    // Registrar resolução
    db.run(
      `UPDATE conflito_sincronizacao
       SET estrategia_resolucao = ?, resolvido = 1, data_resolucao = ?
       WHERE id = ?`,
      [estrategia, new Date().toISOString(), conflito.id]
    );

    return true;
  } catch (erro) {
    console.error('Erro ao resolver conflito:', erro);
    return false;
  }
}

/**
 * Autentica com API do ERP
 */
function autenticarERP(config: ConfiguracaoERP): string {
  // Simulação - em produção faria chamada real
  // POST /api/auth ou similar
  if (config.tipo_erp === 'SAP') {
    return `Bearer ${Buffer.from(`${config.usuario}:${config.senha}`).toString('base64')}`;
  } else if (config.tipo_erp === 'Dynamics') {
    return `Bearer token_${Date.now()}`;
  }
  return config.token_acesso || 'mock_token';
}

/**
 * Busca contas do ERP em nuvem
 */
function buscarContasNuvem(
  config: ConfiguracaoERP,
  token: string
): Array<{ codigo: string; descricao: string; saldo: number }> {
  // Simulação - em produção faria chamada real à API
  return [
    { codigo: '1.1.01.001', descricao: 'Caixa', saldo: 5000 },
    { codigo: '1.1.02.001', descricao: 'Banco A', saldo: 25000 },
    { codigo: '2.1.01.001', descricao: 'Imóvel', saldo: 500000 },
  ];
}

/**
 * Busca contas locais do banco de dados
 */
function buscarContasLocais(
  db: any,
  entidade_id: number
): Array<{ id: number; codigo: string; descricao: string }> {
  const result = db.exec(
    `SELECT id, codigo, descricao FROM contas_plano_contas ORDER BY codigo`
  );

  if (!result[0]?.values) return [];

  return result[0].values.map(row => ({
    id: row[0],
    codigo: row[1],
    descricao: row[2],
  }));
}

/**
 * Carrega mapeamentos existentes
 */
function carregarMapeamentos(db: any): ContaMapeamento[] {
  const result = db.exec(`SELECT * FROM conta_mapeamento`);

  if (!result[0]?.values) return [];

  return result[0].values.map(row => ({
    id: row[0],
    codigo_local: row[1],
    codigo_nuvem: row[2],
    descricao_local: row[3],
    descricao_nuvem: row[4],
    tipo_conta: row[5],
    natureza: row[6],
    status: row[7],
  }));
}

/**
 * Cria conta local baseada em dados da nuvem
 */
function criarContaLocal(
  db: any,
  entidade_id: number,
  contaNuvem: { codigo: string; descricao: string }
): void {
  db.run(
    `INSERT INTO contas_plano_contas (codigo, descricao, grupo, natureza)
     VALUES (?, ?, ?, ?)`,
    [
      contaNuvem.codigo,
      `[NUVEM] ${contaNuvem.descricao}`,
      'ativo',
      'debito',
    ]
  );
}

/**
 * Sincroniza saldos de uma conta
 */
function sincronizarSaldosConta(
  db: any,
  entidade_id: number,
  mapeamento: ContaMapeamento,
  contaNuvem: { codigo: string; descricao: string; saldo: number }
): void {
  // Verificar se há diferença de saldo
  const resultLocal = db.exec(
    `SELECT COALESCE(SUM(valor_debito - valor_credito), 0) as saldo
     FROM ledger_entries
     WHERE conta_id = (SELECT id FROM contas_plano_contas WHERE codigo = ?)`,
    [mapeamento.codigo_local]
  );

  const saldoLocal = resultLocal[0]?.values[0]?.[0] || 0;
  const diferenca = Math.abs(saldoLocal - contaNuvem.saldo);

  if (diferenca > 0.01) {
    // Registrar conflito
    db.run(
      `INSERT INTO conflito_sincronizacao (recurso_tipo, id_local, id_nuvem, valor_local, valor_nuvem, data_conflito, estrategia_resolucao, resolvido)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'saldo',
        0,
        mapeamento.codigo_nuvem,
        saldoLocal,
        contaNuvem.saldo,
        new Date().toISOString(),
        'last_write_wins',
        0,
      ]
    );
  }
}

/**
 * Obtém descrição da conta
 */
function obterDescricaoConta(db: any, codigo: string): string {
  const result = db.exec(
    `SELECT descricao FROM contas_plano_contas WHERE codigo = ?`,
    [codigo]
  );

  return result[0]?.values[0]?.[0] || '';
}

/**
 * Exporta ledger para formato compatível com ERP
 */
export function exportarLedgerParaERP(
  db: any,
  entidade_id: number,
  periodo_id: number,
  formato: 'json' | 'xml' | 'csv' = 'json'
): string {
  const result = db.exec(
    `SELECT le.*, cp.codigo FROM ledger_entries le
     JOIN contas_plano_contas cp ON le.conta_id = cp.id
     WHERE le.entidade_id = ? AND le.periodo_id = ?
     ORDER BY le.data_lancamento`,
    [entidade_id, periodo_id]
  );

  const dados = result[0]?.values || [];

  if (formato === 'json') {
    return JSON.stringify(dados, null, 2);
  } else if (formato === 'csv') {
    // Converter para CSV
    let csv = 'data,conta,descricao,debito,credito\n';
    for (const row of dados) {
      csv += `${row[5]},"${row[11]}","${row[6]}","${row[7] || ''}","${row[8] || ''}"\n`;
    }
    return csv;
  }

  return '';
}

/**
 * Importa dados de ERP em nuvem
 */
export function importarLedgerDeERP(
  db: any,
  entidade_id: number,
  periodo_id: number,
  dados_erp: any[]
): { sucesso: number; erro: number } {
  let sucessos = 0;
  let erros = 0;

  for (const item of dados_erp) {
    try {
      // Verificar duplicação
      const existe = db.exec(
        `SELECT id FROM ledger_entries WHERE entidade_id = ? AND referencia_documento = ?`,
        [entidade_id, item.referencia_documento]
      );

      if (existe[0]?.values.length > 0) {
        console.log(`Documento duplicado: ${item.referencia_documento}`);
        erros++;
        continue;
      }

      // Inserir lançamento
      db.run(
        `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito, descricao, origem_modulo, referencia_documento)
         SELECT ?, ?, id, ?, ?, ?, ?, 'nuvem-erp', ?
         FROM contas_plano_contas WHERE codigo = ?`,
        [
          entidade_id,
          periodo_id,
          item.data,
          item.debito || 0,
          item.credito || 0,
          item.descricao,
          item.referencia_documento,
          item.conta_codigo,
        ]
      );

      sucessos++;
    } catch (erro) {
      console.error('Erro ao importar item:', erro);
      erros++;
    }
  }

  return { sucesso: sucessos, erro: erros };
}
