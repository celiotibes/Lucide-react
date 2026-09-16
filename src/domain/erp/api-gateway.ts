/**
 * MÓDULO 4e: API Gateway & Webhooks
 * Endpoints RESTful para acesso externo ao ledger
 * Rate limiting, validação de requisições, webhooks de notificações
 */

import crypto from 'crypto';

export interface ChaveAPI {
  id?: number;
  cliente_nome: string;
  chave_publica: string;
  chave_privada_hash: string;
  permissoes: ('read' | 'write' | 'delete' | 'admin')[];
  ativo: boolean;
  rate_limit: number; // requisições por minuto
  criada_em: string;
  ultima_utilizacao?: string;
  expira_em?: string;
}

export interface RegistroWebhook {
  id?: number;
  cliente_id: number;
  url_destino: string;
  eventos: string[]; // ['ledger.entry.created', 'ledger.entry.updated', etc]
  ativo: boolean;
  secret_key?: string;
  tentativas_retentativas?: number;
  ultima_entrega?: string;
  criado_em?: string;
}

export interface RequisicaoAPI {
  timestamp: string;
  cliente_id: number;
  endpoint: string;
  metodo: 'GET' | 'POST' | 'PUT' | 'DELETE';
  ip_origem: string;
  status_resposta: number;
  tempo_processamento_ms: number;
}

export interface RateLimitInfo {
  cliente_id: number;
  requisicoes_minuto: number;
  limite: number;
  excedido: boolean;
}

export interface RequestValidator {
  timestamp: number;
  assinatura: string;
  cliente_id: string;
}

/**
 * Cria nova chave API para um cliente
 */
export function criarChaveAPI(
  db: any,
  cliente_nome: string,
  permissoes: ('read' | 'write' | 'delete' | 'admin')[] = ['read'],
  rate_limit: number = 1000,
  expira_em?: string
): ChaveAPI {
  const chavePublica = gerarChavePublica();
  const chavePrivada = gerarChavePrivada();
  const chavePrivadaHash = hashSHA256(chavePrivada);

  try {
    db.run(
      `INSERT INTO api_chaves (cliente_nome, chave_publica, chave_privada_hash, permissoes, ativo, rate_limit, criada_em, expira_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cliente_nome,
        chavePublica,
        chavePrivadaHash,
        JSON.stringify(permissoes),
        1,
        rate_limit,
        new Date().toISOString(),
        expira_em || null,
      ]
    );
  } catch (erro) {
    console.error('Erro ao criar chave API:', erro);
  }

  return {
    cliente_nome,
    chave_publica: chavePublica,
    chave_privada_hash: chavePrivadaHash,
    permissoes,
    ativo: true,
    rate_limit,
    criada_em: new Date().toISOString(),
    expira_em,
  };
}

/**
 * Autentica requisição usando chave API
 */
export function autenticarRequisicaoAPI(
  db: any,
  cliente_id: string,
  assinatura: string,
  timestamp: number,
  payload: any
): boolean {
  try {
    // Verificar se chave existe e está ativa
    const result = db.exec(
      `SELECT chave_privada_hash FROM api_chaves WHERE chave_publica = ? AND ativo = 1`,
      [cliente_id]
    );

    if (!result[0]?.values[0]) {
      return false;
    }

    // Verificar timestamp (não pode ser muito antigo - 5 minutos)
    const agora = Date.now();
    if (agora - timestamp > 5 * 60 * 1000) {
      return false;
    }

    // Verificar assinatura
    const mensagemEsperada = `${cliente_id}:${timestamp}:${JSON.stringify(payload)}`;
    const assinaturaEsperada = hashSHA256(mensagemEsperada);

    return assinatura === assinaturaEsperada;
  } catch (erro) {
    console.error('Erro ao autenticar requisição:', erro);
    return false;
  }
}

/**
 * Registra webhook para entrega de eventos
 */
export function registrarWebhook(
  db: any,
  cliente_id: number,
  url_destino: string,
  eventos: string[] = ['ledger.entry.created', 'ledger.entry.updated']
): RegistroWebhook {
  const secretKey = gerarChaveSecreta();

  try {
    db.run(
      `INSERT INTO webhooks (cliente_id, url_destino, eventos, ativo, secret_key, criado_em)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        cliente_id,
        url_destino,
        JSON.stringify(eventos),
        1,
        hashSHA256(secretKey),
        new Date().toISOString(),
      ]
    );
  } catch (erro) {
    console.error('Erro ao registrar webhook:', erro);
  }

  return {
    cliente_id,
    url_destino,
    eventos,
    ativo: true,
    secret_key: secretKey,
    criado_em: new Date().toISOString(),
  };
}

/**
 * Processa webhook de notificação
 */
export async function processarWebhookBancario(
  db: any,
  payload: Record<string, any>,
  assinatura: string
): Promise<boolean> {
  try {
    // Verificar assinatura (em produção, validar contra chave do banco)
    const esperada = gerarAssinaturaWebhook(JSON.stringify(payload));
    if (assinatura !== esperada) {
      console.warn('Webhook com assinatura inválida');
      return false;
    }

    // Processar payload do banco
    if (payload.tipo === 'movimentacao_bancaria') {
      // Registrar transação
      db.run(
        `INSERT INTO transacoes_webhook_banco (referencia_externa, tipo_movimentacao, valor, data_movimentacao, status_processamento, payload_json, recebido_em)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.referencia || '',
          payload.tipo_movimentacao || 'credito',
          payload.valor || 0,
          payload.data || new Date().toISOString(),
          'processado',
          JSON.stringify(payload),
          new Date().toISOString(),
        ]
      );

      return true;
    }

    return false;
  } catch (erro) {
    console.error('Erro ao processar webhook bancário:', erro);
    return false;
  }
}

/**
 * Valida e aplica rate limiting
 */
export function verificarRateLimit(
  db: any,
  cliente_id: number
): RateLimitInfo {
  try {
    // Obter limite configurado para o cliente
    const limitResult = db.exec(
      `SELECT rate_limit FROM api_chaves WHERE id = ?`,
      [cliente_id]
    );

    const limiteMaximo = limitResult[0]?.values[0]?.[0] || 1000;

    // Contar requisições no último minuto
    const contResult = db.exec(
      `SELECT COUNT(*) FROM requisicoes_api WHERE cliente_id = ? AND timestamp > datetime('now', '-1 minute')`,
      [cliente_id]
    );

    const requisicoes_minuto = contResult[0]?.values[0]?.[0] || 0;

    return {
      cliente_id,
      requisicoes_minuto,
      limite: limiteMaximo,
      excedido: requisicoes_minuto >= limiteMaximo,
    };
  } catch (erro) {
    console.error('Erro ao verificar rate limit:', erro);
    return {
      cliente_id,
      requisicoes_minuto: 0,
      limite: 1000,
      excedido: false,
    };
  }
}

/**
 * Registra requisição de API para auditoria
 */
export function registrarRequisicaoAPI(
  db: any,
  cliente_id: number,
  endpoint: string,
  metodo: 'GET' | 'POST' | 'PUT' | 'DELETE',
  ip_origem: string,
  status_resposta: number,
  tempo_ms: number
): void {
  try {
    db.run(
      `INSERT INTO requisicoes_api (cliente_id, endpoint, metodo, ip_origem, status_resposta, tempo_processamento_ms, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        cliente_id,
        endpoint,
        metodo,
        ip_origem,
        status_resposta,
        tempo_ms,
        new Date().toISOString(),
      ]
    );
  } catch (erro) {
    console.error('Erro ao registrar requisição:', erro);
  }
}

/**
 * Endpoint: GET /api/v1/ledger/saldos
 * Retorna saldos de contas para um período
 */
export function obterSaldosAPI(
  db: any,
  periodo_id: number,
  conta_id?: number
): Record<string, number> {
  const saldos: Record<string, number> = {};

  try {
    let query = `
      SELECT cp.codigo, cp.descricao,
        COALESCE(SUM(CASE WHEN le.valor_debito IS NOT NULL THEN le.valor_debito ELSE 0 END), 0) as total_debito,
        COALESCE(SUM(CASE WHEN le.valor_credito IS NOT NULL THEN le.valor_credito ELSE 0 END), 0) as total_credito
      FROM contas_plano_contas cp
      LEFT JOIN ledger_entries le ON cp.id = le.conta_id AND le.periodo_id = ?
    `;

    const params = [periodo_id];

    if (conta_id) {
      query += ` WHERE cp.id = ?`;
      params.push(conta_id);
    }

    query += ` GROUP BY cp.id, cp.codigo, cp.descricao`;

    const result = db.exec(query, params);

    if (result[0]?.values) {
      for (const [codigo, desc, debitos, creditos] of result[0].values) {
        saldos[codigo] = creditos - debitos;
      }
    }
  } catch (erro) {
    console.error('Erro ao obter saldos:', erro);
  }

  return saldos;
}

/**
 * Endpoint: GET /api/v1/ledger/entries
 * Retorna lançamentos com filtros
 */
export function listarLancamentosAPI(
  db: any,
  periodo_id: number,
  data_inicio?: string,
  data_fim?: string,
  conta_id?: number,
  limite: number = 100
): any[] {
  const lancamentos: any[] = [];

  try {
    let query = `
      SELECT le.id, le.data_lancamento, cp.codigo, cp.descricao as conta_desc,
        le.descricao, le.valor_debito, le.valor_credito, le.origem_modulo,
        le.referencia_documento, le.criado_em
      FROM ledger_entries le
      JOIN contas_plano_contas cp ON le.conta_id = cp.id
      WHERE le.periodo_id = ?
    `;

    const params = [periodo_id];

    if (data_inicio) {
      query += ` AND le.data_lancamento >= ?`;
      params.push(data_inicio);
    }

    if (data_fim) {
      query += ` AND le.data_lancamento <= ?`;
      params.push(data_fim);
    }

    if (conta_id) {
      query += ` AND le.conta_id = ?`;
      params.push(conta_id);
    }

    query += ` ORDER BY le.data_lancamento DESC LIMIT ?`;
    params.push(limite);

    const result = db.exec(query, params);

    if (result[0]?.values) {
      for (const row of result[0].values) {
        lancamentos.push({
          id: row[0],
          data: row[1],
          conta_codigo: row[2],
          conta_descricao: row[3],
          descricao: row[4],
          debito: row[5] || 0,
          credito: row[6] || 0,
          origem: row[7],
          referencia: row[8],
          criado_em: row[9],
        });
      }
    }
  } catch (erro) {
    console.error('Erro ao listar lançamentos:', erro);
  }

  return lancamentos;
}

/**
 * Endpoint: POST /api/v1/ledger/entries
 * Cria novo lançamento contábil via API
 */
export function criarLancamentoViaAPI(
  db: any,
  entidade_id: number,
  periodo_id: number,
  dados: {
    data_lancamento: string;
    conta_id: number;
    descricao: string;
    valor_debito?: number;
    valor_credito?: number;
    referencia_documento?: string;
  }
): { sucesso: boolean; id?: number; erro?: string } {
  try {
    // Validar dados
    if (!dados.data_lancamento || !dados.conta_id) {
      return { sucesso: false, erro: 'Data e conta são obrigatórias' };
    }

    const valor_debito = dados.valor_debito || 0;
    const valor_credito = dados.valor_credito || 0;

    if (valor_debito === 0 && valor_credito === 0) {
      return { sucesso: false, erro: 'Deve ter débito ou crédito' };
    }

    db.run(
      `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito, descricao, origem_modulo, referencia_documento, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'api-gateway', ?, ?)`,
      [
        entidade_id,
        periodo_id,
        dados.conta_id,
        dados.data_lancamento,
        valor_debito,
        valor_credito,
        dados.descricao,
        dados.referencia_documento || '',
        new Date().toISOString(),
      ]
    );

    const resultId = db.exec('SELECT last_insert_rowid() as id');
    const id = resultId[0]?.values[0]?.[0];

    return { sucesso: true, id };
  } catch (erro) {
    return { sucesso: false, erro: String(erro) };
  }
}

/**
 * Gera chave pública (formato: PK_XXXXX)
 */
function gerarChavePublica(): string {
  return `PK_${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
}

/**
 * Gera chave privada
 */
function gerarChavePrivada(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Gera chave secreta para webhook
 */
function gerarChaveSecreta(): string {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * Hash SHA-256
 */
function hashSHA256(dados: string): string {
  return crypto.createHash('sha256').update(dados).digest('hex');
}

/**
 * Gera assinatura para webhook
 */
function gerarAssinaturaWebhook(payload: string): string {
  return hashSHA256(payload + process.env.WEBHOOK_SECRET_KEY || '');
}

/**
 * Gera documentação OpenAPI 3.0
 */
export function gerarOpenAPIDocumentacao(): Record<string, any> {
  return {
    openapi: '3.0.0',
    info: {
      title: 'ERP Ledger API',
      description: 'API para acesso ao ledger contábil centralizado',
      version: '1.0.0',
      contact: {
        name: 'Suporte',
        email: 'api-support@erp.local',
      },
    },
    servers: [
      {
        url: 'https://api.erp.local/v1',
        description: 'Produção',
      },
    ],
    paths: {
      '/ledger/saldos': {
        get: {
          summary: 'Obter saldos das contas',
          tags: ['Ledger'],
          parameters: [
            {
              name: 'periodo_id',
              in: 'query',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            '200': {
              description: 'Saldos obtidos com sucesso',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
            '401': { description: 'Não autenticado' },
            '429': { description: 'Rate limit excedido' },
          },
        },
      },
      '/ledger/entries': {
        get: {
          summary: 'Listar lançamentos',
          tags: ['Ledger'],
          parameters: [
            {
              name: 'periodo_id',
              in: 'query',
              required: true,
              schema: { type: 'integer' },
            },
            {
              name: 'data_inicio',
              in: 'query',
              schema: { type: 'string', format: 'date' },
            },
            {
              name: 'data_fim',
              in: 'query',
              schema: { type: 'string', format: 'date' },
            },
          ],
          responses: {
            '200': {
              description: 'Lançamentos obtidos',
            },
          },
        },
        post: {
          summary: 'Criar lançamento contábil',
          tags: ['Ledger'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data_lancamento: { type: 'string', format: 'date' },
                    conta_id: { type: 'integer' },
                    descricao: { type: 'string' },
                    valor_debito: { type: 'number' },
                    valor_credito: { type: 'number' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Lançamento criado' },
            '400': { description: 'Dados inválidos' },
          },
        },
      },
    },
  };
}
