/**
 * MÓDULO 4a: Banking Integration
 * Integrações com sistemas bancários para reconciliação de extratos e sincronização
 * Suporta: OFX, CNAB240, CSV
 */

export interface ExtratoTransacao {
  id?: number;
  data: string;
  descricao: string;
  tipo: 'credito' | 'debito';
  valor: number;
  saldo?: number;
  referencia_externa?: string;
  banco?: string;
  agencia?: string;
  conta?: string;
}

export interface ExtratoRaw {
  linhas: string[];
  formato: 'OFX' | 'CNAB240' | 'CSV';
  data_inicio: string;
  data_fim: string;
  banco?: string;
}

export interface TransacaoMatching {
  extrato_id: number;
  ledger_id: number;
  data_extrato: string;
  data_ledger: string;
  valor: number;
  descricao_extrato: string;
  descricao_ledger: string;
  status: 'match' | 'divergencia' | 'pendente';
  dias_diferenca: number;
}

export interface ConciliacaoBancaria {
  periodo_id: number;
  data_inicio: string;
  data_fim: string;
  saldo_inicial_ledger: number;
  saldo_inicial_banco: number;
  total_creditos_ledger: number;
  total_creditos_banco: number;
  total_debitos_ledger: number;
  total_debitos_banco: number;
  saldo_final_ledger: number;
  saldo_final_banco: number;
  diferenca_total: number;
  reconciliado: boolean;
  status: 'reconciliado' | 'pendente' | 'divergencia';
  relacao_matching: TransacaoMatching[];
  transacoes_nao_reconciliadas: ExtratoTransacao[];
  criado_em?: string;
}

/**
 * Parseia extrato bancário em formato OFX
 */
export function parseOFX(conteudo: string): ExtratoTransacao[] {
  const transacoes: ExtratoTransacao[] = [];
  const linhas = conteudo.split('\n');

  let inTransaction = false;
  let currentTransaction: Partial<ExtratoTransacao> = {};

  for (const linha of linhas) {
    if (linha.includes('<STMTTRN>')) {
      inTransaction = true;
      currentTransaction = {};
    } else if (linha.includes('</STMTTRN>')) {
      inTransaction = false;
      if (currentTransaction.data && currentTransaction.valor !== undefined) {
        transacoes.push({
          data: currentTransaction.data || '',
          descricao: currentTransaction.descricao || '',
          tipo: currentTransaction.tipo || 'credito',
          valor: currentTransaction.valor || 0,
          referencia_externa: currentTransaction.referencia_externa,
        });
      }
    }

    if (inTransaction) {
      if (linha.includes('<DTPOSTED>')) {
        const match = linha.match(/<DTPOSTED>(\d{8})/);
        if (match) {
          const dateStr = match[1];
          currentTransaction.data = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
        }
      } else if (linha.includes('<TRNAMT>')) {
        const match = linha.match(/<TRNAMT>([-\d.]+)/);
        if (match) {
          const valor = parseFloat(match[1]);
          currentTransaction.valor = Math.abs(valor);
          currentTransaction.tipo = valor < 0 ? 'debito' : 'credito';
        }
      } else if (linha.includes('<MEMO>')) {
        const match = linha.match(/<MEMO>([^<]+)/);
        if (match) {
          currentTransaction.descricao = match[1];
        }
      } else if (linha.includes('<FITID>')) {
        const match = linha.match(/<FITID>([^<]+)/);
        if (match) {
          currentTransaction.referencia_externa = match[1];
        }
      }
    }
  }

  return transacoes;
}

/**
 * Parseia extrato bancário em formato CNAB240
 */
export function parseCNAB240(linhas: string[]): ExtratoTransacao[] {
  const transacoes: ExtratoTransacao[] = [];

  for (const linha of linhas) {
    // CNAB240 tem formato fixo de 240 caracteres
    if (linha.length !== 240) continue;

    const tipoRegistro = linha.substring(0, 1);
    // Registro tipo 3 = detalhe do movimento
    if (tipoRegistro !== '3') continue;

    const banco = linha.substring(0, 3);
    const agencia = linha.substring(4, 11).trim();
    const conta = linha.substring(12, 20).trim();
    const movimento = linha.substring(109, 110); // D=débito, C=crédito
    const data = linha.substring(33, 41);
    const valor = parseInt(linha.substring(115, 130)) / 100;
    const descricao = linha.substring(167, 181).trim();
    const referencia = linha.substring(197, 212).trim();

    if (valor === 0) continue;

    transacoes.push({
      data: `${data.substring(4, 8)}-${data.substring(2, 4)}-${data.substring(0, 2)}`,
      descricao,
      tipo: movimento === 'D' ? 'debito' : 'credito',
      valor,
      banco,
      agencia,
      conta,
      referencia_externa: referencia || undefined,
    });
  }

  return transacoes;
}

/**
 * Parseia extrato bancário em formato CSV
 */
export function parseCSV(linhas: string[], hasHeader: boolean = true): ExtratoTransacao[] {
  const transacoes: ExtratoTransacao[] = [];
  const start = hasHeader ? 1 : 0;

  for (let i = start; i < linhas.length; i++) {
    const campos = linhas[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));

    if (campos.length < 4) continue;

    // Esperado: Data, Descrição, Tipo, Valor
    const data = campos[0];
    const descricao = campos[1];
    const tipo = campos[2].toLowerCase() === 'debito' ? 'debito' : 'credito';
    const valor = parseFloat(campos[3]);

    if (!data || isNaN(valor)) continue;

    transacoes.push({
      data,
      descricao,
      tipo,
      valor: Math.abs(valor),
      referencia_externa: campos[4] || undefined,
    });
  }

  return transacoes;
}

/**
 * Algoritmo de matching: encontra transações correspondentes entre extrato e ledger
 * Critérios: data ±2 dias, valor igual, descrição similar
 */
export function matchearTransacoes(
  db: any,
  periodo_id: number,
  conta_caixa_id: number,
  transacoes_extrato: ExtratoTransacao[]
): TransacaoMatching[] {
  const matching: TransacaoMatching[] = [];
  const ledgerResult = db.exec(
    `SELECT id, data_lancamento, valor_debito, valor_credito, descricao
     FROM ledger_entries
     WHERE periodo_id = ? AND conta_id = ?
     ORDER BY data_lancamento DESC`,
    [periodo_id, conta_caixa_id]
  );

  const ledgerEntries = ledgerResult[0]?.values || [];

  for (const transacao of transacoes_extrato) {
    let melhorMatch: TransacaoMatching | null = null;
    let melhorScore = 0;

    for (const [id, data_ledger, debito, credito, desc_ledger] of ledgerEntries) {
      const valor_ledger = debito || credito;

      // Calcular diferença de datas
      const dataExt = new Date(transacao.data);
      const dataLed = new Date(data_ledger);
      const difDias = Math.abs((dataExt.getTime() - dataLed.getTime()) / (1000 * 60 * 60 * 24));

      // Valor deve ser exato
      if (Math.abs(transacao.valor - valor_ledger) > 0.01) continue;

      // Data deve ser no máximo 2 dias de diferença
      if (difDias > 2) continue;

      // Calcular score de similaridade da descrição
      const descScore = calcularSimilaridade(transacao.descricao, desc_ledger || '');

      // Score total
      let score = 100; // Base 100 para match de valor
      score -= difDias * 10; // Reduz 10 pontos por dia de diferença
      score += descScore; // Adiciona score de descrição (0-50)

      if (score > melhorScore) {
        melhorScore = score;
        melhorMatch = {
          extrato_id: 0,
          ledger_id: id,
          data_extrato: transacao.data,
          data_ledger: data_ledger,
          valor: transacao.valor,
          descricao_extrato: transacao.descricao,
          descricao_ledger: desc_ledger || '',
          status: 'match',
          dias_diferenca: Math.round(difDias),
        };
      }
    }

    if (melhorMatch && melhorScore >= 70) {
      matching.push(melhorMatch);
    } else {
      matching.push({
        extrato_id: 0,
        ledger_id: 0,
        data_extrato: transacao.data,
        data_ledger: '',
        valor: transacao.valor,
        descricao_extrato: transacao.descricao,
        descricao_ledger: '',
        status: 'divergencia',
        dias_diferenca: 0,
      });
    }
  }

  return matching;
}

/**
 * Calcula similaridade entre duas strings (0-50)
 */
function calcularSimilaridade(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  str1 = str1.toLowerCase();
  str2 = str2.toLowerCase();

  // Verificar se uma contém a outra
  if (str1.includes(str2.substring(0, 10)) || str2.includes(str1.substring(0, 10))) {
    return 50;
  }

  // Contar palavras em comum
  const palavras1 = str1.split(/\s+/);
  const palavras2 = str2.split(/\s+/);

  let comuns = 0;
  for (const p1 of palavras1) {
    if (p1.length > 3 && palavras2.some(p2 => p1.includes(p2) || p2.includes(p1))) {
      comuns++;
    }
  }

  return (comuns / Math.max(palavras1.length, palavras2.length)) * 50;
}

/**
 * Sincroniza extrato bancário com o ledger
 */
export function sincronizarExtratoBancario(
  db: any,
  entidade_id: number,
  periodo_id: number,
  extrato_raw: ExtratoRaw,
  conta_caixa_id: number
): ConciliacaoBancaria {
  let transacoes_extrato: ExtratoTransacao[] = [];

  // Parser baseado no formato
  if (extrato_raw.formato === 'OFX') {
    transacoes_extrato = parseOFX(extrato_raw.linhas.join('\n'));
  } else if (extrato_raw.formato === 'CNAB240') {
    transacoes_extrato = parseCNAB240(extrato_raw.linhas);
  } else if (extrato_raw.formato === 'CSV') {
    transacoes_extrato = parseCSV(extrato_raw.linhas);
  }

  // Calcular saldos
  const saldoLedger = obterSaldoLedger(db, periodo_id, conta_caixa_id);
  const saldoBanco = calcularSaldoBanco(transacoes_extrato);

  // Matching de transações
  const matching = matchearTransacoes(db, periodo_id, conta_caixa_id, transacoes_extrato);

  // Reconciliação
  const reconciliacao: ConciliacaoBancaria = {
    periodo_id,
    data_inicio: extrato_raw.data_inicio,
    data_fim: extrato_raw.data_fim,
    saldo_inicial_ledger: saldoLedger.saldo_inicial,
    saldo_inicial_banco: 0, // Seria extraído do arquivo
    total_creditos_ledger: saldoLedger.total_creditos,
    total_creditos_banco: transacoes_extrato
      .filter(t => t.tipo === 'credito')
      .reduce((sum, t) => sum + t.valor, 0),
    total_debitos_ledger: saldoLedger.total_debitos,
    total_debitos_banco: transacoes_extrato
      .filter(t => t.tipo === 'debito')
      .reduce((sum, t) => sum + t.valor, 0),
    saldo_final_ledger: saldoLedger.saldo_final,
    saldo_final_banco: saldoBanco,
    diferenca_total: Math.abs(saldoLedger.saldo_final - saldoBanco),
    reconciliado: Math.abs(saldoLedger.saldo_final - saldoBanco) < 0.01,
    status: Math.abs(saldoLedger.saldo_final - saldoBanco) < 0.01 ? 'reconciliado' : 'divergencia',
    relacao_matching: matching,
    transacoes_nao_reconciliadas: transacoes_extrato.filter((_, i) => matching[i]?.status === 'divergencia'),
    criado_em: new Date().toISOString(),
  };

  // Armazenar no banco de dados
  if (reconciliacao.reconciliado) {
    db.run(
      `INSERT INTO conciliacao_bancaria (periodo_id, conta_id, data_inicio, data_fim, saldo_final_ledger, saldo_final_banco, diferenca, status, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        periodo_id,
        conta_caixa_id,
        extrato_raw.data_inicio,
        extrato_raw.data_fim,
        reconciliacao.saldo_final_ledger,
        reconciliacao.saldo_final_banco,
        reconciliacao.diferenca_total,
        reconciliacao.status,
        reconciliacao.criado_em,
      ]
    );
  }

  return reconciliacao;
}

/**
 * Concilia transações individuais entre extrato e ledger
 */
export function conciliarTransacoes(
  db: any,
  periodo_id: number,
  conta_caixa_id: number,
  matching: TransacaoMatching[]
): { reconciliadas: number; divergencias: number } {
  let reconciliadas = 0;
  let divergencias = 0;

  for (const match of matching) {
    if (match.status === 'match' && match.ledger_id > 0) {
      // Marcar como conciliada no ledger
      db.run(
        `UPDATE ledger_entries SET conciliada_bancaria = 1 WHERE id = ?`,
        [match.ledger_id]
      );
      reconciliadas++;
    } else {
      divergencias++;
    }
  }

  return { reconciliadas, divergencias };
}

/**
 * Gera relatório de conciliação bancária
 */
export function gerarRelatorioConciliacao(
  db: any,
  periodo_id: number
): ConciliacaoBancaria[] {
  const result = db.exec(
    `SELECT * FROM conciliacao_bancaria WHERE periodo_id = ? ORDER BY criado_em DESC`,
    [periodo_id]
  );

  const relatorios: ConciliacaoBancaria[] = [];

  if (result[0]?.values) {
    for (const row of result[0].values) {
      relatorios.push({
        periodo_id: row[1],
        data_inicio: row[3],
        data_fim: row[4],
        saldo_inicial_ledger: 0,
        saldo_inicial_banco: 0,
        total_creditos_ledger: 0,
        total_creditos_banco: 0,
        total_debitos_ledger: 0,
        total_debitos_banco: 0,
        saldo_final_ledger: row[5],
        saldo_final_banco: row[6],
        diferenca_total: row[7],
        reconciliado: row[8] === 'reconciliado',
        status: row[8],
        relacao_matching: [],
        transacoes_nao_reconciliadas: [],
        criado_em: row[9],
      });
    }
  }

  return relatorios;
}

/**
 * Obtém saldo do ledger para a conta
 */
function obterSaldoLedger(
  db: any,
  periodo_id: number,
  conta_id: number
): { saldo_inicial: number; total_creditos: number; total_debitos: number; saldo_final: number } {
  const result = db.exec(
    `SELECT
      COALESCE(SUM(CASE WHEN valor_debito IS NOT NULL THEN valor_debito ELSE 0 END), 0) as total_debitos,
      COALESCE(SUM(CASE WHEN valor_credito IS NOT NULL THEN valor_credito ELSE 0 END), 0) as total_creditos
     FROM ledger_entries
     WHERE periodo_id = ? AND conta_id = ?`,
    [periodo_id, conta_id]
  );

  const [debitos, creditos] = result[0]?.values[0] || [0, 0];

  return {
    saldo_inicial: 0,
    total_creditos: creditos,
    total_debitos: debitos,
    saldo_final: creditos - debitos,
  };
}

/**
 * Calcula saldo do extrato bancário
 */
function calcularSaldoBanco(transacoes: ExtratoTransacao[]): number {
  return transacoes.reduce((sum, t) => {
    return t.tipo === 'credito' ? sum + t.valor : sum - t.valor;
  }, 0);
}

/**
 * Detecta e reporta discrepâncias
 */
export function detectarDiscrepancias(
  db: any,
  periodo_id: number,
  conta_id: number,
  matching: TransacaoMatching[]
): {
  transacoes_duplicadas: number;
  transacoes_faltantes: number;
  valores_incorretos: number;
  datasMismatch: number;
} {
  let transacoes_duplicadas = 0;
  let transacoes_faltantes = 0;
  let valores_incorretos = 0;
  let datasMismatch = 0;

  for (const match of matching) {
    if (match.status === 'divergencia') {
      transacoes_faltantes++;
    }

    if (match.dias_diferenca > 2) {
      datasMismatch++;
    }
  }

  return {
    transacoes_duplicadas,
    transacoes_faltantes,
    valores_incorretos,
    datasMismatch,
  };
}
