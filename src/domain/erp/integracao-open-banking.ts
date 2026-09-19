/**
 * MÓDULO 4c: Open Banking Integration
 * Integração com Sistema de Pagamentos Brasileiro (SPB)
 * Suporte para PIX, TED, DOC com processamento em tempo real
 */

export interface PagamentoPIX {
  id?: string;
  chave_pix: string; // CPF, CNPJ, Email ou Telefone
  valor: number;
  beneficiario: string;
  descricao: string;
  data_solicitacao: string;
  data_processamento?: string;
  status: 'solicitado' | 'processando' | 'concluido' | 'rejeitado';
  motivo_rejeicao?: string;
  txid?: string; // Identificador único PIX
}

export interface PagamentoTED {
  id?: string;
  banco_destino: string;
  agencia_destino: string;
  conta_destino: string;
  cpf_cnpj_destino: string;
  nome_beneficiario: string;
  valor: number;
  descricao: string;
  data_solicitacao: string;
  data_agendado?: string;
  status: 'solicitado' | 'agendado' | 'processando' | 'concluido' | 'rejeitado';
  num_sequencial?: string;
}

export interface PagamentoDOC {
  id?: string;
  banco_destino: string;
  agencia_destino: string;
  conta_destino: string;
  cpf_cnpj_destino: string;
  nome_beneficiario: string;
  valor: number;
  descricao: string;
  data_solicitacao: string;
  status: 'solicitado' | 'processando' | 'concluido' | 'rejeitado';
}

export interface ConfirmacaoPagamento {
  id?: number;
  pagamento_id: string;
  tipo_pagamento: 'PIX' | 'TED' | 'DOC';
  status: 'confirmado' | 'rejeitado' | 'expirado';
  data_confirmacao: string;
  data_credito: string;
  valor_confirmado: number;
  referencia_banco: string;
  detalhes_retorno?: Record<string, any>;
}

export interface SettlementLedger {
  id?: number;
  pagamento_id: string;
  tipo_pagamento: string;
  conta_debito: number; // Conta origem (normalmente 1.1.01 - Caixa)
  conta_credito: number; // Conta destino
  valor: number;
  data_settlement: string;
  status: 'pendente' | 'liquidado' | 'falho';
  referencia_documento: string;
}

export interface ConfiguracaoOpenBanking {
  instituicao_id: string;
  client_id: string;
  client_secret: string;
  api_key: string;
  api_endpoint: string;
  webhook_url?: string;
  rate_limit?: number; // requisições por minuto
  retry_attempts?: number;
  timeout_ms?: number;
}

export type TipoPagamento = 'PIX' | 'TED' | 'DOC';

/**
 * Inicia pagamento via PIX
 * Retorna dados para exibição do QR Code ou confirmação
 */
export function initiarPagamentoPIX(
  db: any,
  entidade_id: number,
  periodo_id: number,
  pagamento: Omit<PagamentoPIX, 'id'>
): PagamentoPIX {
  const txid = gerarTxID();
  const pagamentoComId = {
    ...pagamento,
    id: txid,
    // O txid é o identificador da transação no arranjo PIX e é o que permite conciliar
    // depois com o extrato. Era gravado no banco mas não voltava para quem chamou, que
    // só recebia id — obrigando a reconsultar para descobrir o próprio txid.
    txid,
  };

  try {
    db.run(
      `INSERT INTO pagamentos_pix (entidade_id, periodo_id, txid, chave_pix, valor, beneficiario, descricao, data_solicitacao, status, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'solicitado', ?)`,
      [
        entidade_id,
        periodo_id,
        txid,
        pagamento.chave_pix,
        pagamento.valor,
        pagamento.beneficiario,
        pagamento.descricao,
        pagamento.data_solicitacao,
        new Date().toISOString(),
      ]
    );
  } catch (erro) {
    console.error('Erro ao registrar pagamento PIX:', erro);
  }

  return pagamentoComId;
}

/**
 * Inicia pagamento via TED (Transferência Eletrônica de Débito)
 */
export function initiarPagamentoTED(
  db: any,
  entidade_id: number,
  periodo_id: number,
  pagamento: Omit<PagamentoTED, 'id'>
): PagamentoTED {
  const id = gerarPagamentoID();
  const numSequencial = gerarNumSequencial();

  const pagamentoComId = {
    ...pagamento,
    id,
    num_sequencial: numSequencial,
  };

  try {
    db.run(
      `INSERT INTO pagamentos_ted (entidade_id, periodo_id, banco_destino, agencia_destino, conta_destino, cpf_cnpj_destino, nome_beneficiario, valor, descricao, data_solicitacao, data_agendado, num_sequencial, status, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'solicitado', ?)`,
      [
        entidade_id,
        periodo_id,
        pagamento.banco_destino,
        pagamento.agencia_destino,
        pagamento.conta_destino,
        pagamento.cpf_cnpj_destino,
        pagamento.nome_beneficiario,
        pagamento.valor,
        pagamento.descricao,
        pagamento.data_solicitacao,
        pagamento.data_agendado || null,
        numSequencial,
        new Date().toISOString(),
      ]
    );
  } catch (erro) {
    console.error('Erro ao registrar pagamento TED:', erro);
  }

  return pagamentoComId;
}

/**
 * Inicia pagamento via DOC (Documento de Crédito)
 */
export function initiarPagamentoDOC(
  db: any,
  entidade_id: number,
  periodo_id: number,
  pagamento: Omit<PagamentoDOC, 'id'>
): PagamentoDOC {
  const id = gerarPagamentoID();

  const pagamentoComId = {
    ...pagamento,
    id,
  };

  try {
    db.run(
      `INSERT INTO pagamentos_doc (entidade_id, periodo_id, banco_destino, agencia_destino, conta_destino, cpf_cnpj_destino, nome_beneficiario, valor, descricao, data_solicitacao, status, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'solicitado', ?)`,
      [
        entidade_id,
        periodo_id,
        pagamento.banco_destino,
        pagamento.agencia_destino,
        pagamento.conta_destino,
        pagamento.cpf_cnpj_destino,
        pagamento.nome_beneficiario,
        pagamento.valor,
        pagamento.descricao,
        pagamento.data_solicitacao,
        new Date().toISOString(),
      ]
    );
  } catch (erro) {
    console.error('Erro ao registrar pagamento DOC:', erro);
  }

  return pagamentoComId;
}

/**
 * Consulta status de pagamento TED junto ao banco
 */
export async function consultarStatusTED(
  db: any,
  pagamento_id: string,
  config: ConfiguracaoOpenBanking
): Promise<PagamentoTED | null> {
  try {
    const result = db.exec(
      `SELECT * FROM pagamentos_ted WHERE id = ?`,
      [pagamento_id]
    );

    if (!result[0]?.values[0]) {
      return null;
    }

    // Simular chamada à API de consulta
    // Em produção, fazer chamada real: GET /api/transfers/{num_sequencial}
    const tedData = result[0].values[0];

    // Simular resposta da API
    const statusAtualizado = simularConsultaStatusAPI();

    // Atualizar status no banco
    if (statusAtualizado !== 'solicitado') {
      db.run(
        `UPDATE pagamentos_ted SET status = ? WHERE id = ?`,
        [statusAtualizado, pagamento_id]
      );
    }

    return {
      id: tedData[0],
      banco_destino: tedData[3],
      agencia_destino: tedData[4],
      conta_destino: tedData[5],
      cpf_cnpj_destino: tedData[6],
      nome_beneficiario: tedData[7],
      valor: tedData[8],
      descricao: tedData[9],
      data_solicitacao: tedData[10],
      status: statusAtualizado as any,
    };
  } catch (erro) {
    console.error('Erro ao consultar status TED:', erro);
    return null;
  }
}

/**
 * Registra confirmação de pagamento recebida via webhook
 */
export function registrarConfirmacaoPagamento(
  db: any,
  entidade_id: number,
  periodo_id: number,
  confirmacao: Omit<ConfirmacaoPagamento, 'id'>
): ConfirmacaoPagamento {
  const id = Math.floor(Math.random() * 1000000);

  try {
    db.run(
      `INSERT INTO confirmacoes_pagamento (pagamento_id, tipo_pagamento, status, data_confirmacao, data_credito, valor_confirmado, referencia_banco, detalhes_retorno, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        confirmacao.pagamento_id,
        confirmacao.tipo_pagamento,
        confirmacao.status,
        confirmacao.data_confirmacao,
        confirmacao.data_credito,
        confirmacao.valor_confirmado,
        confirmacao.referencia_banco,
        JSON.stringify(confirmacao.detalhes_retorno || {}),
        new Date().toISOString(),
      ]
    );

    // Se confirmado, fazer auto-settlement no ledger
    if (confirmacao.status === 'confirmado') {
      executarSettlementAuto(db, entidade_id, periodo_id, confirmacao);
    }
  } catch (erro) {
    console.error('Erro ao registrar confirmação de pagamento:', erro);
  }

  return {
    ...confirmacao,
    id,
  };
}

/**
 * Executa settlement automático (débito e crédito no ledger)
 */
function executarSettlementAuto(
  db: any,
  entidade_id: number,
  periodo_id: number,
  confirmacao: ConfirmacaoPagamento
): void {
  try {
    const contaCaixa = 1; // 1.1.01 - Caixa
    const contaBancoExterno = 2; // Conta no banco destino (simulado)

    // Débito em Caixa (origem)
    db.run(
      `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, descricao, origem_modulo, referencia_documento)
       VALUES (?, ?, ?, ?, ?, ?, 'open-banking', ?)`,
      [
        entidade_id,
        periodo_id,
        contaCaixa,
        confirmacao.data_credito,
        confirmacao.valor_confirmado,
        `Pagamento ${confirmacao.tipo_pagamento} - ${confirmacao.pagamento_id}`,
        confirmacao.referencia_banco,
      ]
    );

    console.log(`Settlement executado para pagamento ${confirmacao.pagamento_id}`);
  } catch (erro) {
    console.error('Erro ao executar settlement:', erro);
  }
}

/**
 * Gera TxID único para PIX (formato: YYYYMMDDHHMMSSNNNNN)
 */
function gerarTxID(): string {
  const agora = new Date();
  const timestamp = agora
    .toISOString()
    .replace(/[-:.Z]/g, '')
    .substring(0, 14);
  const aleatorio = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, '0');
  return `${timestamp}${aleatorio}`;
}

/**
 * Gera ID único para pagamento
 */
function gerarPagamentoID(): string {
  return `PAG-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Gera número sequencial para TED
 */
function gerarNumSequencial(): string {
  return Math.floor(Math.random() * 999999999)
    .toString()
    .padStart(9, '0');
}

/**
 * Simula consulta de status em API (mock)
 */
function simularConsultaStatusAPI(): string {
  const statuses = ['processando', 'concluido', 'rejeitado'];
  return statuses[Math.floor(Math.random() * statuses.length)];
}

/**
 * Processa webhook de confirmação de pagamento PIX
 */
export function processarWebhookPIX(
  db: any,
  payload: Record<string, any>
): boolean {
  try {
    const confirmacao: ConfirmacaoPagamento = {
      pagamento_id: payload.txid,
      tipo_pagamento: 'PIX',
      status: payload.infoPagador?.nome ? 'confirmado' : 'rejeitado',
      data_confirmacao: new Date().toISOString(),
      data_credito: payload.dataHoraTransacao || new Date().toISOString(),
      valor_confirmado: payload.valor?.original || 0,
      referencia_banco: payload.endToEndId || '',
      detalhes_retorno: payload,
    };

    // Registrar confirmação (seria chamado do webhook receiver)
    registrarConfirmacaoPagamento(db, 0, 0, confirmacao);

    return true;
  } catch (erro) {
    console.error('Erro ao processar webhook PIX:', erro);
    return false;
  }
}

/**
 * Valida chave PIX
 */
export function validarChavePIX(chave: string): boolean {
  // CPF: 11 dígitos
  if (/^\d{11}$/.test(chave)) return true;

  // CNPJ: 14 dígitos
  if (/^\d{14}$/.test(chave)) return true;

  // Email
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(chave)) return true;

  // Telefone: 11 dígitos com +55
  if (/^\+?55\d{11}$/.test(chave)) return true;

  return false;
}

/**
 * Calcula tarifas de diferentes tipos de pagamento
 */
export function calcularTarifa(
  tipo_pagamento: TipoPagamento,
  valor: number
): number {
  switch (tipo_pagamento) {
    case 'PIX':
      return 0; // PIX é gratuito
    case 'TED':
      return valor > 5000 ? 6.50 : 3.50;
    case 'DOC':
      return valor > 10000 ? 10.00 : 5.00;
    default:
      return 0;
  }
}

/**
 * Lista pagamentos pendentes para uma entidade
 */
export function listarPagamentosPendentes(
  db: any,
  entidade_id: number
): {
  pix: PagamentoPIX[];
  ted: PagamentoTED[];
  doc: PagamentoDOC[];
} {
  const pagementos = {
    pix: [] as PagamentoPIX[],
    ted: [] as PagamentoTED[],
    doc: [] as PagamentoDOC[],
  };

  try {
    const pixResult = db.exec(
      `SELECT * FROM pagamentos_pix WHERE entidade_id = ? AND status IN ('solicitado', 'processando')`,
      [entidade_id]
    );

    const tedResult = db.exec(
      `SELECT * FROM pagamentos_ted WHERE entidade_id = ? AND status IN ('solicitado', 'agendado', 'processando')`,
      [entidade_id]
    );

    const docResult = db.exec(
      `SELECT * FROM pagamentos_doc WHERE entidade_id = ? AND status IN ('solicitado', 'processando')`,
      [entidade_id]
    );

    if (pixResult[0]?.values) {
      pagementos.pix = pixResult[0].values.map(row => ({
        id: row[3],
        chave_pix: row[4],
        valor: row[5],
        beneficiario: row[6],
        descricao: row[7],
        data_solicitacao: row[8],
        status: row[10] as any,
      }));
    }

    if (tedResult[0]?.values) {
      pagementos.ted = tedResult[0].values.map(row => ({
        id: row[0],
        banco_destino: row[3],
        agencia_destino: row[4],
        conta_destino: row[5],
        cpf_cnpj_destino: row[6],
        nome_beneficiario: row[7],
        valor: row[8],
        descricao: row[9],
        data_solicitacao: row[10],
        status: row[14] as any,
      }));
    }

    if (docResult[0]?.values) {
      pagementos.doc = docResult[0].values.map(row => ({
        id: row[0],
        banco_destino: row[3],
        agencia_destino: row[4],
        conta_destino: row[5],
        cpf_cnpj_destino: row[6],
        nome_beneficiario: row[7],
        valor: row[8],
        descricao: row[9],
        data_solicitacao: row[10],
        status: row[11] as any,
      }));
    }
  } catch (erro) {
    console.error('Erro ao listar pagamentos pendentes:', erro);
  }

  return pagementos;
}
