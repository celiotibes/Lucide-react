/**
 * INTEGRAÇÃO DE PAGAMENTOS
 *
 * Sistema de rastreamento de pagamentos com:
 * - Estados: pendente → aprovado → processando → pago/falho
 * - Reconciliação simulada com Pluggy
 * - Rastreamento de tentativas e erros
 * - Status de confirmação bancária
 */

export type PaymentStatus = 'pendente' | 'aprovado' | 'processando' | 'pago' | 'falho';
export type PaymentMethod = 'pix' | 'transferencia' | 'boleto' | 'cartao_credito';
export type ReconciliationStatus = 'nao_reconciliado' | 'reconciliado' | 'discrepancia';

export interface Payment {
  id: string;
  entidade_id: number;
  valor: number;
  descricao: string;
  tipo_pagamento: string;
  metodo_pagamento: PaymentMethod;
  status: PaymentStatus;
  beneficiario: string;
  referencia: string;
  data_criacao: string;
  data_agendado?: string;
  data_processamento?: string;
  data_conclusao?: string;
  tentativas: number;
  ultimo_erro?: string;
  reconciliacao_status: ReconciliationStatus;
  reconciliado_em?: string;
  ledger_entry_id?: number; // ID do lançamento contábil no ledger
}

export interface PaymentAttempt {
  id: string;
  payment_id: string;
  data_tentativa: string;
  resultado: 'sucesso' | 'falho';
  mensagem: string;
  codigo_retorno?: string;
}

export interface ReconciliationResult {
  payment_id: string;
  status: ReconciliationStatus;
  data_reconciliacao: string;
  valor_esperado: number;
  valor_realizado?: number;
  diferenca?: number;
  observacoes?: string;
}

export function criarPagamento(
  db: any,
  pagamento: {
    entidade_id: number;
    valor: number;
    descricao: string;
    tipo_pagamento: string;
    metodo_pagamento: PaymentMethod;
    beneficiario: string;
    referencia: string;
    data_agendado?: string;
  }
): { sucesso: boolean; payment_id?: string; errors?: string[] } {
  const validacao = validarPagamento(pagamento);
  if (!validacao.valida) {
    return { sucesso: false, errors: validacao.erros };
  }

  try {
    const payment_id = `PAG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    db.run(
      `CREATE TABLE IF NOT EXISTS pagamentos (
        id TEXT PRIMARY KEY,
        entidade_id INTEGER NOT NULL,
        valor REAL NOT NULL,
        descricao TEXT NOT NULL,
        tipo_pagamento TEXT NOT NULL,
        metodo_pagamento TEXT NOT NULL,
        status TEXT DEFAULT 'pendente',
        beneficiario TEXT NOT NULL,
        referencia TEXT NOT NULL,
        data_criacao TEXT NOT NULL,
        data_agendado TEXT,
        data_processamento TEXT,
        data_conclusao TEXT,
        tentativas INTEGER DEFAULT 0,
        ultimo_erro TEXT,
        reconciliacao_status TEXT DEFAULT 'nao_reconciliado',
        reconciliado_em TEXT,
        ledger_entry_id INTEGER,
        FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entries(id)
      )`
    );

    db.run(
      `INSERT INTO pagamentos (id, entidade_id, valor, descricao, tipo_pagamento, metodo_pagamento, status, beneficiario, referencia, data_criacao, data_agendado, reconciliacao_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payment_id,
        pagamento.entidade_id,
        pagamento.valor,
        pagamento.descricao,
        pagamento.tipo_pagamento,
        pagamento.metodo_pagamento,
        'pendente',
        pagamento.beneficiario,
        pagamento.referencia,
        new Date().toISOString(),
        pagamento.data_agendado || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        'nao_reconciliado',
      ]
    );

    return { sucesso: true, payment_id };
  } catch (erro) {
    return { sucesso: false, errors: [`Erro ao criar pagamento: ${String(erro)}`] };
  }
}

function validarPagamento(pagamento: any): { valida: boolean; erros: string[] } {
  const erros: string[] = [];
  if (!pagamento.entidade_id) erros.push('entidade_id obrigatório');
  if (pagamento.valor <= 0) erros.push('valor deve ser positivo');
  if (!pagamento.descricao) erros.push('descricao obrigatória');
  if (!pagamento.tipo_pagamento) erros.push('tipo_pagamento obrigatório');
  if (!['pix', 'transferencia', 'boleto', 'cartao_credito'].includes(pagamento.metodo_pagamento)) {
    erros.push('metodo_pagamento inválido');
  }
  if (!pagamento.beneficiario) erros.push('beneficiario obrigatório');
  if (!pagamento.referencia) erros.push('referencia obrigatória');
  return { valida: erros.length === 0, erros };
}

export function aprovarPagamento(
  db: any,
  payment_id: string
): { sucesso: boolean; errors?: string[] } {
  try {
    const resultado = db.exec(
      `SELECT id FROM pagamentos WHERE id = ? AND status = 'pendente'`,
      [payment_id]
    );

    if (!resultado[0]?.values?.length) {
      return { sucesso: false, errors: ['Pagamento não encontrado ou não está pendente'] };
    }

    db.run(
      `UPDATE pagamentos SET status = ? WHERE id = ?`,
      ['aprovado', payment_id]
    );

    registrarTentativa(db, payment_id, 'sucesso', 'Pagamento aprovado para processamento');

    return { sucesso: true };
  } catch (erro) {
    return { sucesso: false, errors: [`Erro ao aprovar: ${String(erro)}`] };
  }
}

export function procesarPagamento(
  db: any,
  payment_id: string
): { sucesso: boolean; errors?: string[] } {
  try {
    const resultado = db.exec(
      `SELECT id, valor, metodo_pagamento FROM pagamentos WHERE id = ? AND status = 'aprovado'`,
      [payment_id]
    );

    if (!resultado[0]?.values?.length) {
      return { sucesso: false, errors: ['Pagamento não encontrado ou não aprovado'] };
    }

    db.run(
      `UPDATE pagamentos SET status = ?, data_processamento = ?, tentativas = tentativas + 1 WHERE id = ?`,
      ['processando', new Date().toISOString(), payment_id]
    );

    registrarTentativa(db, payment_id, 'sucesso', 'Processamento iniciado');

    return { sucesso: true };
  } catch (erro) {
    return { sucesso: false, errors: [`Erro ao processar: ${String(erro)}`] };
  }
}

export function confirmarPagamento(
  db: any,
  payment_id: string,
  entidade_id?: number,
  periodo_id?: number,
  sincronizarComLedger: boolean = true
): { sucesso: boolean; errors?: string[] } {
  try {
    const resultado = db.exec(
      `SELECT id, valor, entidade_id FROM pagamentos WHERE id = ? AND status = 'processando'`,
      [payment_id]
    );

    if (!resultado[0]?.values?.length) {
      return { sucesso: false, errors: ['Pagamento não encontrado ou não está em processamento'] };
    }

    const [, , ent_id] = resultado[0].values[0];

    db.run(
      `UPDATE pagamentos SET status = ?, data_conclusao = ?, reconciliacao_status = ? WHERE id = ?`,
      ['pago', new Date().toISOString(), 'nao_reconciliado', payment_id]
    );

    registrarTentativa(db, payment_id, 'sucesso', 'Pagamento confirmado com sucesso');

    // Sincronizar com ledger após confirmação
    if (sincronizarComLedger && (entidade_id || ent_id) && periodo_id) {
      try {
        const { sincronizarPagamentoImediato } = require('./pagamentos-ledger-integration');
        sincronizarPagamentoImediato(db, payment_id, entidade_id || ent_id, periodo_id);
      } catch (erro) {
        console.warn('Erro ao sincronizar pagamento com ledger:', erro);
        // Não falha a operação se a sincronização falhar
      }
    }

    return { sucesso: true };
  } catch (erro) {
    return { sucesso: false, errors: [`Erro ao confirmar: ${String(erro)}`] };
  }
}

export function marcarPagamentoComFalha(
  db: any,
  payment_id: string,
  mensagem_erro: string
): { sucesso: boolean; errors?: string[] } {
  try {
    const resultado = db.exec(
      `SELECT id, tentativas FROM pagamentos WHERE id = ? AND status IN ('pendente', 'processando', 'falho')`,
      [payment_id]
    );

    if (!resultado[0]?.values?.length) {
      return { sucesso: false, errors: ['Pagamento não encontrado'] };
    }

    db.run(
      `UPDATE pagamentos SET status = ?, ultimo_erro = ?, tentativas = tentativas + 1 WHERE id = ?`,
      ['falho', mensagem_erro, payment_id]
    );

    registrarTentativa(db, payment_id, 'falho', mensagem_erro);

    return { sucesso: true };
  } catch (erro) {
    return { sucesso: false, errors: [`Erro ao marcar falha: ${String(erro)}`] };
  }
}

function registrarTentativa(
  db: any,
  payment_id: string,
  resultado: 'sucesso' | 'falho',
  mensagem: string
): void {
  try {
    db.run(
      `CREATE TABLE IF NOT EXISTS pagamento_tentativas (
        id TEXT PRIMARY KEY,
        payment_id TEXT NOT NULL,
        data_tentativa TEXT NOT NULL,
        resultado TEXT NOT NULL,
        mensagem TEXT NOT NULL,
        codigo_retorno TEXT,
        FOREIGN KEY (payment_id) REFERENCES pagamentos(id)
      )`
    );

    const attempt_id = `ATT_${payment_id}_${Date.now()}`;
    db.run(
      `INSERT INTO pagamento_tentativas (id, payment_id, data_tentativa, resultado, mensagem)
       VALUES (?, ?, ?, ?, ?)`,
      [attempt_id, payment_id, new Date().toISOString(), resultado, mensagem]
    );
  } catch {
    // Silencioso - tentativa é não-crítica
  }
}

export function reconciliarPagamento(
  db: any,
  payment_id: string,
  valor_realizado?: number
): { sucesso: boolean; resultado?: ReconciliationResult; errors?: string[] } {
  try {
    const resultado = db.exec(
      `SELECT id, valor FROM pagamentos WHERE id = ? AND status = 'pago'`,
      [payment_id]
    );

    if (!resultado[0]?.values?.length) {
      return { sucesso: false, errors: ['Pagamento não encontrado ou não está confirmado'] };
    }

    const [, valorEsperado] = resultado[0].values[0];
    const valor = valor_realizado ?? valorEsperado;

    let status: ReconciliationStatus = 'reconciliado';
    let diferenca = 0;

    if (valor !== valorEsperado) {
      status = 'discrepancia';
      diferenca = valor - valorEsperado;
    }

    db.run(
      `UPDATE pagamentos SET reconciliacao_status = ?, reconciliado_em = ? WHERE id = ?`,
      [status, new Date().toISOString(), payment_id]
    );

    const resultadoRec: ReconciliationResult = {
      payment_id,
      status,
      data_reconciliacao: new Date().toISOString(),
      valor_esperado: valorEsperado,
      valor_realizado: valor,
      diferenca,
      observacoes:
        status === 'discrepancia'
          ? `Diferença de ${diferenca > 0 ? '+' : ''}${diferenca.toFixed(2)}`
          : undefined,
    };

    return { sucesso: true, resultado: resultadoRec };
  } catch (erro) {
    return { sucesso: false, errors: [`Erro ao reconciliar: ${String(erro)}`] };
  }
}

export function obterPagamento(
  db: any,
  payment_id: string
): Payment | null {
  try {
    const resultado = db.exec(
      `SELECT id, entidade_id, valor, descricao, tipo_pagamento, metodo_pagamento, status, beneficiario, referencia, data_criacao, data_agendado, data_processamento, data_conclusao, tentativas, ultimo_erro, reconciliacao_status, reconciliado_em, ledger_entry_id
       FROM pagamentos WHERE id = ?`,
      [payment_id]
    );

    if (!resultado[0]?.values?.length) {
      return null;
    }

    const [id, ent, val, desc, tipo, metodo, status, benef, ref, data_cria, data_agend, data_proc, data_conc, tent, erro, rec_status, rec_em, ledger_id] = resultado[0].values[0];

    return {
      id,
      entidade_id: ent,
      valor: val,
      descricao: desc,
      tipo_pagamento: tipo,
      metodo_pagamento: metodo as PaymentMethod,
      status: status as PaymentStatus,
      beneficiario: benef,
      referencia: ref,
      data_criacao: data_cria,
      data_agendado: data_agend,
      data_processamento: data_proc,
      data_conclusao: data_conc,
      tentativas: tent,
      ultimo_erro: erro,
      reconciliacao_status: rec_status as ReconciliationStatus,
      reconciliado_em: rec_em,
      ledger_entry_id: ledger_id,
    };
  } catch {
    return null;
  }
}

export function obterPagamentosComFalha(
  db: any,
  entidade_id: number
): Payment[] {
  try {
    const resultado = db.exec(
      `SELECT id, entidade_id, valor, descricao, tipo_pagamento, metodo_pagamento, status, beneficiario, referencia, data_criacao, data_agendado, data_processamento, data_conclusao, tentativas, ultimo_erro, reconciliacao_status, reconciliado_em
       FROM pagamentos WHERE entidade_id = ? AND status = 'falho'
       ORDER BY data_criacao DESC`,
      [entidade_id]
    );

    if (!resultado[0]?.values) {
      return [];
    }

    return resultado[0].values.map(
      ([id, ent, val, desc, tipo, metodo, status, benef, ref, data_cria, data_agend, data_proc, data_conc, tent, erro, rec_status, rec_em]) => ({
        id,
        entidade_id: ent,
        valor: val,
        descricao: desc,
        tipo_pagamento: tipo,
        metodo_pagamento: metodo as PaymentMethod,
        status: status as PaymentStatus,
        beneficiario: benef,
        referencia: ref,
        data_criacao: data_cria,
        data_agendado: data_agend,
        data_processamento: data_proc,
        data_conclusao: data_conc,
        tentativas: tent,
        ultimo_erro: erro,
        reconciliacao_status: rec_status as ReconciliationStatus,
        reconciliado_em: rec_em,
      })
    );
  } catch {
    return [];
  }
}

export function obterPagamentosAguardandoReconciliacao(
  db: any,
  entidade_id: number
): Payment[] {
  try {
    const resultado = db.exec(
      `SELECT id, entidade_id, valor, descricao, tipo_pagamento, metodo_pagamento, status, beneficiario, referencia, data_criacao, data_agendado, data_processamento, data_conclusao, tentativas, ultimo_erro, reconciliacao_status, reconciliado_em
       FROM pagamentos WHERE entidade_id = ? AND status = 'pago' AND reconciliacao_status = 'nao_reconciliado'
       ORDER BY data_conclusao ASC`,
      [entidade_id]
    );

    if (!resultado[0]?.values) {
      return [];
    }

    return resultado[0].values.map(
      ([id, ent, val, desc, tipo, metodo, status, benef, ref, data_cria, data_agend, data_proc, data_conc, tent, erro, rec_status, rec_em]) => ({
        id,
        entidade_id: ent,
        valor: val,
        descricao: desc,
        tipo_pagamento: tipo,
        metodo_pagamento: metodo as PaymentMethod,
        status: status as PaymentStatus,
        beneficiario: benef,
        referencia: ref,
        data_criacao: data_cria,
        data_agendado: data_agend,
        data_processamento: data_proc,
        data_conclusao: data_conc,
        tentativas: tent,
        ultimo_erro: erro,
        reconciliacao_status: rec_status as ReconciliationStatus,
        reconciliado_em: rec_em,
      })
    );
  } catch {
    return [];
  }
}

export function obterHistoricoTentativas(
  db: any,
  payment_id: string
): PaymentAttempt[] {
  try {
    const resultado = db.exec(
      `SELECT id, payment_id, data_tentativa, resultado, mensagem, codigo_retorno
       FROM pagamento_tentativas WHERE payment_id = ?
       ORDER BY data_tentativa DESC`,
      [payment_id]
    );

    if (!resultado[0]?.values) {
      return [];
    }

    return resultado[0].values.map(([id, pag_id, data, resultado, msg, codigo]) => ({
      id,
      payment_id: pag_id,
      data_tentativa: data,
      resultado: resultado as 'sucesso' | 'falho',
      mensagem: msg,
      codigo_retorno: codigo,
    }));
  } catch {
    return [];
  }
}

export function obterResumoFinanceiro(
  db: any,
  entidade_id: number
): {
  total_pendente: number;
  total_em_processamento: number;
  total_pago: number;
  total_com_falha: number;
  quantidade_reconciliadas: number;
} {
  try {
    const pendente = db.exec(
      `SELECT SUM(valor) as total FROM pagamentos WHERE entidade_id = ? AND status = 'pendente'`,
      [entidade_id]
    );

    const processando = db.exec(
      `SELECT SUM(valor) as total FROM pagamentos WHERE entidade_id = ? AND status = 'processando'`,
      [entidade_id]
    );

    const pago = db.exec(
      `SELECT SUM(valor) as total FROM pagamentos WHERE entidade_id = ? AND status = 'pago'`,
      [entidade_id]
    );

    const falho = db.exec(
      `SELECT SUM(valor) as total FROM pagamentos WHERE entidade_id = ? AND status = 'falho'`,
      [entidade_id]
    );

    const reconciliado = db.exec(
      `SELECT COUNT(*) as count FROM pagamentos WHERE entidade_id = ? AND reconciliacao_status = 'reconciliado'`,
      [entidade_id]
    );

    return {
      total_pendente: pendente[0]?.values[0]?.[0] ?? 0,
      total_em_processamento: processando[0]?.values[0]?.[0] ?? 0,
      total_pago: pago[0]?.values[0]?.[0] ?? 0,
      total_com_falha: falho[0]?.values[0]?.[0] ?? 0,
      quantidade_reconciliadas: reconciliado[0]?.values[0]?.[0] ?? 0,
    };
  } catch {
    return {
      total_pendente: 0,
      total_em_processamento: 0,
      total_pago: 0,
      total_com_falha: 0,
      quantidade_reconciliadas: 0,
    };
  }
}
