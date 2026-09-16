/**
 * MÓDULO 4f: Payment Gateway Integration
 * Integração com Stripe, PayPal, MercadoPago
 * Processamento de pagamentos e reconciliação com ledger
 */

export interface ProcessamentoPagamento {
  id?: string;
  gateway: 'stripe' | 'paypal' | 'mercadopago';
  valor: number;
  moeda: 'BRL' | 'USD' | 'EUR';
  descricao: string;
  cliente_email: string;
  cliente_nome: string;
  data_solicitacao: string;
  status: 'pendente' | 'processando' | 'aprovado' | 'rejeitado' | 'reembolsado';
  id_gateway?: string;
  id_transacao_ledger?: number;
  motivo_rejeicao?: string;
}

export interface TratamentoChargeback {
  id?: number;
  pagamento_id: string;
  data_chargeback: string;
  valor_chargeback: number;
  motivo: string;
  status: 'recebido' | 'em_analise' | 'rejeitado' | 'aceito';
  data_resolucao?: string;
  evidencias?: string[];
}

export interface ReembolsoProcessamento {
  id?: string;
  pagamento_original_id: string;
  valor_reembolso: number;
  motivo_reembolso: string;
  data_solicitacao: string;
  data_processamento?: string;
  status: 'solicitado' | 'processando' | 'concluido' | 'rejeitado';
}

export interface RelatorioProcessamentoPagamentos {
  periodo_inicio: string;
  periodo_fim: string;
  total_pagamentos: number;
  valor_total_processado: number;
  pagamentos_aprovados: number;
  pagamentos_rejeitados: number;
  pagamentos_pendentes: number;
  valor_chargebacks: number;
  valor_reembolsos: number;
  taxa_aprovacao: number;
  lucro_liquido: number;
}

export interface ConfiguracaoGateway {
  tipo_gateway: 'stripe' | 'paypal' | 'mercadopago';
  api_key: string;
  api_secret?: string;
  webhook_url?: string;
  webhook_secret?: string;
  taxa_percentual?: number;
  taxa_fixa?: number;
  moedas_aceitas?: string[];
}

/**
 * Processa pagamento via gateway
 */
export function processarPagamento(
  db: any,
  entidade_id: number,
  periodo_id: number,
  config: ConfiguracaoGateway,
  pagamento: Omit<ProcessamentoPagamento, 'id'>
): ProcessamentoPagamento {
  const id = gerarPagamentoID();
  const pagamentoComId = {
    ...pagamento,
    id,
  };

  try {
    // Simular envio para gateway
    const resposta = enviarParaGateway(config, pagamento);

    pagamentoComId.id_gateway = resposta.id_gateway;
    pagamentoComId.status = resposta.status;

    // Registrar no banco
    db.run(
      `INSERT INTO pagamentos_gateway (entidade_id, periodo_id, gateway, id_gateway, valor, moeda, descricao, cliente_email, cliente_nome, data_solicitacao, status, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entidade_id,
        periodo_id,
        config.tipo_gateway,
        resposta.id_gateway,
        pagamento.valor,
        pagamento.moeda,
        pagamento.descricao,
        pagamento.cliente_email,
        pagamento.cliente_nome,
        pagamento.data_solicitacao,
        resposta.status,
        new Date().toISOString(),
      ]
    );

    // Se aprovado, registrar no ledger
    if (resposta.status === 'aprovado') {
      const idLedger = registrarReceitaNoLedger(db, entidade_id, periodo_id, pagamento);
      pagamentoComId.id_transacao_ledger = idLedger;
    }
  } catch (erro) {
    console.error('Erro ao processar pagamento:', erro);
    pagamentoComId.status = 'rejeitado';
    pagamentoComId.motivo_rejeicao = String(erro);
  }

  return pagamentoComId;
}

/**
 * Trata chargebacks (contestações)
 */
export function handleChargebacks(
  db: any,
  pagamento_id: string,
  chargeback: Omit<TratamentoChargeback, 'id'>
): TratamentoChargeback {
  const id = Math.floor(Math.random() * 1000000);

  try {
    db.run(
      `INSERT INTO chargebacks (pagamento_id, data_chargeback, valor_chargeback, motivo, status, criado_em)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        pagamento_id,
        chargeback.data_chargeback,
        chargeback.valor_chargeback,
        chargeback.motivo,
        'recebido',
        new Date().toISOString(),
      ]
    );

    // Registrar no ledger como despesa/ajuste
    db.run(
      `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, descricao, origem_modulo, referencia_documento)
       SELECT 0, 0, id, ?, ?, 'Chargeback: ' || ?, 'pagamento-gateway', ?
       FROM contas_plano_contas WHERE codigo = '6.5.01'`,
      [
        chargeback.data_chargeback,
        chargeback.valor_chargeback,
        chargeback.motivo,
        `CHARGEBACK_${pagamento_id}`,
      ]
    );
  } catch (erro) {
    console.error('Erro ao registrar chargeback:', erro);
  }

  return {
    ...chargeback,
    id,
    status: 'recebido',
  };
}

/**
 * Processa reembolso de pagamento
 */
export function processarReembolso(
  db: any,
  entidade_id: number,
  periodo_id: number,
  config: ConfiguracaoGateway,
  reembolso: Omit<ReembolsoProcessamento, 'id'>
): ReembolsoProcessamento {
  const id = gerarPagamentoID();
  const reembolsoComId = {
    ...reembolso,
    id,
  };

  try {
    // Buscar pagamento original
    const resultado = db.exec(
      `SELECT id_gateway, valor FROM pagamentos_gateway WHERE id = ?`,
      [reembolso.pagamento_original_id]
    );

    if (!resultado[0]?.values[0]) {
      throw new Error('Pagamento original não encontrado');
    }

    const [_, valorOriginal] = resultado[0].values[0];

    // Enviar reembolso ao gateway
    const resposta = enviarReembolsoGateway(config, {
      id_gateway: resultado[0].values[0][0],
      valor: reembolso.valor_reembolso,
    });

    reembolsoComId.status = resposta.status;

    // Registrar reembolso no banco
    db.run(
      `INSERT INTO reembolsos (pagamento_original_id, valor_reembolso, motivo, data_solicitacao, data_processamento, status, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        reembolso.pagamento_original_id,
        reembolso.valor_reembolso,
        reembolso.motivo_reembolso,
        reembolso.data_solicitacao,
        resposta.status === 'concluido' ? new Date().toISOString() : null,
        resposta.status,
        new Date().toISOString(),
      ]
    );

    // Se concluído, registrar reversão no ledger
    if (resposta.status === 'concluido') {
      db.run(
        `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, descricao, origem_modulo, referencia_documento)
         SELECT ?, ?, id, ?, ?, 'Reembolso: ' || ?, 'pagamento-gateway', ?
         FROM contas_plano_contas WHERE codigo = '1.1.01'`,
        [
          entidade_id,
          periodo_id,
          new Date().toISOString().substring(0, 10),
          reembolso.valor_reembolso,
          reembolso.motivo_reembolso,
          `REEMBOLSO_${reembolso.pagamento_original_id}`,
        ]
      );
    }
  } catch (erro) {
    console.error('Erro ao processar reembolso:', erro);
    reembolsoComId.status = 'rejeitado';
  }

  return reembolsoComId;
}

/**
 * Reconcilia com extrato do gateway
 */
export function reconciliarComGateway(
  db: any,
  entidade_id: number,
  periodo_id: number,
  config: ConfiguracaoGateway,
  transacoes_gateway: ProcessamentoPagamento[]
): {
  reconciliados: number;
  divergencias: number;
  ajustes_necessarios: number;
} {
  let reconciliados = 0;
  let divergencias = 0;
  let ajustes = 0;

  for (const transacao of transacoes_gateway) {
    try {
      // Buscar transação no banco local
      const resultado = db.exec(
        `SELECT id, valor FROM pagamentos_gateway WHERE id_gateway = ?`,
        [transacao.id_gateway]
      );

      if (!resultado[0]?.values[0]) {
        // Nova transação do gateway
        processarPagamento(db, entidade_id, periodo_id, config, transacao);
        ajustes++;
        continue;
      }

      const [id_local, valor_local] = resultado[0].values[0];

      // Verificar se valores coincidem
      if (Math.abs(transacao.valor - valor_local) > 0.01) {
        divergencias++;
      } else if (transacao.status === 'aprovado') {
        reconciliados++;
      }
    } catch (erro) {
      console.error('Erro ao reconciliar transação:', erro);
      divergencias++;
    }
  }

  return { reconciliados, divergencias, ajustes_necessarios: ajustes };
}

/**
 * Gera relatório de processamento de pagamentos
 */
export function gerarRelatorioPagamentos(
  db: any,
  periodo_inicio: string,
  periodo_fim: string
): RelatorioProcessamentoPagamentos {
  const resultTotal = db.exec(
    `SELECT COUNT(*), SUM(valor) FROM pagamentos_gateway WHERE data_solicitacao BETWEEN ? AND ?`,
    [periodo_inicio, periodo_fim]
  );

  const [total_pagamentos, valor_total] = resultTotal[0]?.values[0] || [0, 0];

  const resultAprovados = db.exec(
    `SELECT COUNT(*), SUM(valor) FROM pagamentos_gateway WHERE status = 'aprovado' AND data_solicitacao BETWEEN ? AND ?`,
    [periodo_inicio, periodo_fim]
  );

  const [aprovados, valor_aprovado] = resultAprovados[0]?.values[0] || [0, 0];

  const resultRejeitados = db.exec(
    `SELECT COUNT(*) FROM pagamentos_gateway WHERE status = 'rejeitado' AND data_solicitacao BETWEEN ? AND ?`,
    [periodo_inicio, periodo_fim]
  );

  const rejeitados = resultRejeitados[0]?.values[0]?.[0] || 0;

  const resultChargebacks = db.exec(
    `SELECT SUM(valor_chargeback) FROM chargebacks WHERE data_chargeback BETWEEN ? AND ? AND status != 'rejeitado'`,
    [periodo_inicio, periodo_fim]
  );

  const valor_chargebacks = resultChargebacks[0]?.values[0]?.[0] || 0;

  const resultReembolsos = db.exec(
    `SELECT SUM(valor_reembolso) FROM reembolsos WHERE data_solicitacao BETWEEN ? AND ? AND status = 'concluido'`,
    [periodo_inicio, periodo_fim]
  );

  const valor_reembolsos = resultReembolsos[0]?.values[0]?.[0] || 0;

  const taxa_aprovacao = total_pagamentos > 0 ? (aprovados / total_pagamentos) * 100 : 0;
  const lucro_liquido = (valor_aprovado || 0) - (valor_chargebacks || 0) - (valor_reembolsos || 0);

  return {
    periodo_inicio,
    periodo_fim,
    total_pagamentos: total_pagamentos || 0,
    valor_total_processado: valor_total || 0,
    pagamentos_aprovados: aprovados || 0,
    pagamentos_rejeitados: rejeitados || 0,
    pagamentos_pendentes: (total_pagamentos || 0) - (aprovados || 0) - (rejeitados || 0),
    valor_chargebacks: valor_chargebacks || 0,
    valor_reembolsos: valor_reembolsos || 0,
    taxa_aprovacao,
    lucro_liquido,
  };
}

/**
 * Converte moedas
 */
export function converterMoeda(valor: number, de: string, para: string, taxa_cambio: number): number {
  if (de === para) return valor;
  return valor * taxa_cambio;
}

/**
 * Calcula tarifas do gateway
 */
export function calcularTarifaGateway(
  valor: number,
  config: ConfiguracaoGateway
): { valor_taxa: number; valor_liquido: number } {
  const taxa_percentual = config.taxa_percentual || 0.029; // 2.9% default
  const taxa_fixa = config.taxa_fixa || 0.3; // $0.30 default

  const valor_taxa = valor * taxa_percentual + taxa_fixa;
  const valor_liquido = valor - valor_taxa;

  return { valor_taxa, valor_liquido };
}

/**
 * Simula envio para gateway (mock)
 */
function enviarParaGateway(
  config: ConfiguracaoGateway,
  pagamento: ProcessamentoPagamento
): { id_gateway: string; status: string } {
  // Em produção, faria chamada real à API do gateway
  const id = `${config.tipo_gateway}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const status = Math.random() > 0.1 ? 'aprovado' : 'rejeitado';

  return { id_gateway: id, status };
}

/**
 * Simula envio de reembolso ao gateway (mock)
 */
function enviarReembolsoGateway(
  config: ConfiguracaoGateway,
  dados: { id_gateway: string; valor: number }
): { status: string } {
  // Em produção, faria chamada real à API do gateway
  return { status: 'concluido' };
}

/**
 * Registra receita no ledger
 */
function registrarReceitaNoLedger(
  db: any,
  entidade_id: number,
  periodo_id: number,
  pagamento: ProcessamentoPagamento
): number {
  try {
    db.run(
      `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, data_lancamento, valor_credito, descricao, origem_modulo, referencia_documento)
       SELECT ?, ?, id, ?, ?, 'Pagamento via ' || ?, 'pagamento-gateway', ?
       FROM contas_plano_contas WHERE codigo = '5.1.01'`,
      [
        entidade_id,
        periodo_id,
        pagamento.data_solicitacao,
        pagamento.valor,
        pagamento.gateway,
        `PAGTO_${pagamento.id}`,
      ]
    );

    const resultId = db.exec('SELECT last_insert_rowid() as id');
    return resultId[0]?.values[0]?.[0] || 0;
  } catch (erro) {
    console.error('Erro ao registrar receita no ledger:', erro);
    return 0;
  }
}

/**
 * Gera ID único para pagamento
 */
function gerarPagamentoID(): string {
  return `PAG-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}
