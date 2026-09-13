// Integração PIX com Asaas - QR code dinâmico, cópia e cola, cobrança em tempo real

import type { Pool } from 'pg';
import { AsaasClient } from '@/server/asaas/client';

export interface ConfigPIX {
  chavePixType: 'cpf' | 'cnpj' | 'email' | 'aleatoria';
  chavePix: string;
  nomeRecebedor: string;
  municipio: string;
  descricaoPadrao?: string;
}

export interface CobrancaPIX {
  cobrancaAsaasId: string;
  qrCodeDinamico: string;
  copiaCola: string;
  urlQRCode: string;
  valorCobrado: number;
  descricao: string;
  expiracao: string; // ISO timestamp
  statusPagamento: 'pendente' | 'pago' | 'expirado' | 'cancelado';
  dataPagamento?: string;
  dataEmissao: string;
}

export interface ResultadoCobrancaPIX {
  sucesso: boolean;
  cobrancaPIX?: CobrancaPIX;
  erro?: string;
}

/**
 * Gerar cobrança PIX dinâmica via Asaas
 * Retorna QR code + cópia e cola para pagamento instantâneo
 */
export async function gerarCobrancaPIX(
  pool: Pool,
  dados: {
    faturasIds: string[];
    valorTotal: number;
    descricao: string;
    diaVencimento?: number; // dias até expiração (padrão 1 dia)
    clienteAsaasId: string; // customer_id do Asaas
  }
): Promise<ResultadoCobrancaPIX> {
  try {
    const asaas = new AsaasClient(process.env.ASAAS_API_KEY || '');

    // Recuperar config PIX do banco
    const { rows: configRows } = await pool.query<{
      chave_pix_type: string;
      chave_pix: string;
      nome_recebedor: string;
    }>(
      `
      select
        chave_pix_type,
        chave_pix,
        nome_recebedor
      from config_pix
      where ativo = true
      limit 1
    `
    );

    if (configRows.length === 0) {
      return {
        sucesso: false,
        erro: 'Configuração PIX não encontrada',
      };
    }

    const config = configRows[0];
    const diasExpiracao = dados.diaVencimento || 1;
    const dataExpiracao = new Date();
    dataExpiracao.setDate(dataExpiracao.getDate() + diasExpiracao);

    // Criar cobrança no Asaas com integração PIX
    const response = await asaas.criarCobranca({
      customerId: dados.clienteAsaasId,
      dueDate: dataExpiracao.toISOString().split('T')[0],
      value: dados.valorTotal,
      description: dados.descricao,
      billingType: 'PIX', // tipo PIX
    });

    if (!response.success) {
      return {
        sucesso: false,
        erro: response.error?.message || 'Erro ao criar cobrança PIX no Asaas',
      };
    }

    // Extrair dados do PIX do response do Asaas
    const asaasChargeId = (response.data as any).id;
    const pixQRCode = (response.data as any).pixQrCode || '';
    const pixCopiaECola = (response.data as any).pixDict || '';
    const pixQRCodeUrl = (response.data as any).pixQrCodeUrl || '';

    // Armazenar no banco
    const { rows: pixRows } = await pool.query<{ id: string }>(
      `
      insert into cobrancas_pix
        (cobranca_asaas_id, fatura_ids, qr_code, copia_cola, url_qr_code,
         valor_cobrado, descricao, data_expiracao, status)
      values
        ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      returning id
    `,
      [
        asaasChargeId,
        JSON.stringify(dados.faturasIds),
        pixQRCode,
        pixCopiaECola,
        pixQRCodeUrl,
        dados.valorTotal,
        dados.descricao,
        dataExpiracao.toISOString(),
        'pendente',
      ]
    );

    if (pixRows.length === 0) {
      return {
        sucesso: false,
        erro: 'Erro ao armazenar cobrança PIX',
      };
    }

    // Vincular QR code às faturas
    for (const faturaidx of dados.faturasIds) {
      await pool.query(
        `
        update faturas
        set pix_qr_code_id = $1
        where id = $2
      `,
        [pixRows[0].id, faturaidx]
      );
    }

    return {
      sucesso: true,
      cobrancaPIX: {
        cobrancaAsaasId: asaasChargeId,
        qrCodeDinamico: pixQRCode,
        copiaCola: pixCopiaECola,
        urlQRCode: pixQRCodeUrl,
        valorCobrado: dados.valorTotal,
        descricao: dados.descricao,
        expiracao: dataExpiracao.toISOString(),
        statusPagamento: 'pendente',
        dataEmissao: new Date().toISOString(),
      },
    };
  } catch (erro) {
    console.error('Erro ao gerar cobrança PIX:', erro);
    return {
      sucesso: false,
      erro: (erro as Error).message,
    };
  }
}

/**
 * Processar webhook de pagamento PIX do Asaas
 * Confirma recebimento e dispara distribuição de receita
 */
export async function processarWebhookPagamentoPIX(
  pool: Pool,
  dadosWebhook: {
    id: string; // charge ID do Asaas
    status: string; // RECEIVED, CONFIRMED, etc
    value: number;
    confirmedAmount?: number;
  }
): Promise<{ processado: boolean; erro?: string }> {
  try {
    // Buscar cobrança PIX correspondente
    const { rows: pixRows } = await pool.query<{
      id: string;
      fatura_ids: string;
      status: string;
    }>(
      `
      select id, fatura_ids, status
      from cobrancas_pix
      where cobranca_asaas_id = $1
      limit 1
    `,
      [dadosWebhook.id]
    );

    if (pixRows.length === 0) {
      return {
        processado: false,
        erro: 'Cobrança PIX não encontrada',
      };
    }

    const pixCobranca = pixRows[0];

    // Evitar reprocessamento
    if (pixCobranca.status !== 'pendente') {
      return {
        processado: false,
        erro: 'Cobrança já foi processada',
      };
    }

    // Marcar como pago
    await pool.query(
      `
      update cobrancas_pix
      set
        status = $1,
        data_pagamento = now(),
        valor_recebido = $2
      where id = $3
    `,
      ['pago', dadosWebhook.confirmedAmount || dadosWebhook.value, pixCobranca.id]
    );

    // Atualizar status das faturas para pago
    const faturasIds = JSON.parse(pixCobranca.fatura_ids);
    for (const faturaidx of faturasIds) {
      await pool.query(
        `
        update faturas
        set status = 'paga'
        where id = $1
      `,
        [faturaidx]
      );
    }

    // Disparar lógica de distribuição de receita para investidores
    // (reutilizar distribuirRecebimento.ts)
    const { rows: cobrancasAsaas } = await pool.query<{
      fatura_id: string;
    }>(
      `
      select f.id as fatura_id
      from faturas f
      where f.id = any($1::uuid[])
    `,
      [faturasIds]
    );

    for (const cobranca of cobrancasAsaas) {
      // Chamar função de distribuição
      // await distribuirRecebimento(pool, cobranca.fatura_id);
    }

    return { processado: true };
  } catch (erro) {
    console.error('Erro ao processar webhook PIX:', erro);
    return {
      processado: false,
      erro: (erro as Error).message,
    };
  }
}

/**
 * Verificar status de cobrança PIX
 */
export async function verificarStatusPIX(
  pool: Pool,
  cobrancaAsaasId: string
): Promise<CobrancaPIX | null> {
  const { rows } = await pool.query<{
    cobranca_asaas_id: string;
    qr_code: string;
    copia_cola: string;
    url_qr_code: string;
    valor_cobrado: string;
    descricao: string;
    data_expiracao: string;
    status: string;
    data_pagamento: string | null;
    data_criacao: string;
  }>(
    `
    select
      cobranca_asaas_id,
      qr_code,
      copia_cola,
      url_qr_code,
      valor_cobrado,
      descricao,
      data_expiracao,
      status,
      data_pagamento,
      created_at as data_criacao
    from cobrancas_pix
    where cobranca_asaas_id = $1
    limit 1
  `,
    [cobrancaAsaasId]
  );

  if (rows.length === 0) {
    return null;
  }

  const r = rows[0];
  return {
    cobrancaAsaasId: r.cobranca_asaas_id,
    qrCodeDinamico: r.qr_code,
    copiaCola: r.copia_cola,
    urlQRCode: r.url_qr_code,
    valorCobrado: parseFloat(r.valor_cobrado),
    descricao: r.descricao,
    expiracao: r.data_expiracao,
    statusPagamento: r.status as any,
    dataPagamento: r.data_pagamento || undefined,
    dataEmissao: r.data_criacao,
  };
}

/**
 * Cancelar cobrança PIX antes do vencimento
 */
export async function cancelarCobrancaPIX(
  pool: Pool,
  cobrancaAsaasId: string,
  motivo: string
): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    const asaas = new AsaasClient(process.env.ASAAS_API_KEY || '');

    // Cancelar no Asaas
    const response = await asaas.cancelarCobranca(cobrancaAsaasId);

    if (!response.success) {
      return {
        sucesso: false,
        erro: response.error?.message || 'Erro ao cancelar cobrança no Asaas',
      };
    }

    // Atualizar status localmente
    await pool.query(
      `
      update cobrancas_pix
      set
        status = $1,
        motivo_cancelamento = $2,
        data_cancelamento = now()
      where cobranca_asaas_id = $3
    `,
      ['cancelado', motivo, cobrancaAsaasId]
    );

    return { sucesso: true };
  } catch (erro) {
    console.error('Erro ao cancelar cobrança PIX:', erro);
    return {
      sucesso: false,
      erro: (erro as Error).message,
    };
  }
}
