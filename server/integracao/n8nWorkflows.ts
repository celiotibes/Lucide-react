/**
 * Configurações e interface de comunicação com n8n
 * Gerencia workflows de integração ERP (Omie/Bluesoft)
 */

export interface N8nWebhookPayload {
  event: string;
  data: Record<string, any>;
  timestamp: string;
  source: 'omie' | 'bluesoft' | 'crmt';
}

export interface OmieOrder {
  numero: string;
  cliente_id: number;
  cliente_nome: string;
  data_pedido: string;
  data_entrega_prevista: string;
  valor_total: number;
  itens: Array<{
    codigo: string;
    descricao: string;
    quantidade: number;
    preco_unitario: number;
  }>;
  status: 'em_aberto' | 'confirmado' | 'em_preparacao' | 'enviado' | 'entregue' | 'cancelado';
}

export interface BlueSoftOrder {
  pedido_numero: string;
  id_pedido_erp: string;
  cliente: {
    nome: string;
    documento: string;
    email: string;
  };
  data_pedido: string;
  data_entrega: string;
  valor: number;
  status: 'pendente' | 'processado' | 'enviado' | 'entregue' | 'devolvido';
  itens: Array<{
    sku: string;
    descricao: string;
    quantidade: number;
    preco: number;
  }>;
}

export interface CrmtServiceOrder {
  id: string;
  residencial_id: string;
  categoria: string;
  descricao: string;
  urgencia: 'baixa' | 'media' | 'alta' | 'urgente';
  prestador_id?: string;
  status: 'aberto' | 'alocado' | 'em_execucao' | 'concluido' | 'cancelado';
}

/**
 * Fluxos de integração que serão criados em n8n
 * Documentação de cada workflow
 */

export const WORKFLOWS = {
  /**
   * Workflow: Omie → CRMT
   * Sincroniza pedidos do Omie como ordens de serviço
   * Trigger: Polling a cada 30 min OU webhook do Omie
   */
  syncOmieOrders: {
    id: 'omie-sync-orders',
    name: 'Sincronizar Pedidos Omie → CRMT',
    description: 'Busca pedidos no Omie e cria/atualiza ordens de serviço no CRMT',
    trigger: 'Polling (30 min) + Webhook',
    steps: [
      '1. Buscar pedidos no Omie API (filtro: últimos 30 minutos)',
      '2. Validar estrutura e dados obrigatórios',
      '3. Para cada pedido:',
      '   a. Verificar se já existe no CRMT (por ID externo)',
      '   b. Se novo: Criar ordem de serviço',
      '   c. Se existe: Atualizar status e detalhes',
      '4. Registrar sincronização na auditoria',
      '5. Notificar admin em caso de erro',
      '6. Retornar resumo (criados, atualizados, erros)',
    ],
    schedule: 'A cada 30 minutos',
  },

  /**
   * Workflow: Bluesoft → CRMT
   * Sincroniza pedidos do Bluesoft como ordens de serviço
   */
  syncBlueSoftOrders: {
    id: 'bluesoft-sync-orders',
    name: 'Sincronizar Pedidos Bluesoft → CRMT',
    description: 'Busca pedidos no Bluesoft e cria/atualiza ordens de serviço',
    trigger: 'Polling (1 hora) + Webhook',
    steps: [
      '1. Buscar pedidos no Bluesoft API (filtro: últimas 2 horas)',
      '2. Mapear campos Bluesoft → CRMT',
      '3. Para cada pedido:',
      '   a. Verificar se já existe (por pedido_numero)',
      '   b. Se novo: Criar ordem de serviço com detalhes',
      '   c. Se existe: Atualizar progressão de status',
      '4. Buscar endereço completo (CEP, logradouro) via API Bluesoft',
      '5. Vincular com residencial CRMT se disponível',
      '6. Log de auditoria com detalhes da sincronização',
    ],
    schedule: 'A cada 1 hora',
  },

  /**
   * Workflow: CRMT → Omie
   * Envia atualizações de ordens de serviço para Omie
   */
  pushStatusOmie: {
    id: 'crmt-push-omie-status',
    name: 'Atualizar Status em Omie',
    description: 'Quando ordem de serviço muda de status, atualiza no Omie',
    trigger: 'Webhook (quando status muda)',
    steps: [
      '1. Receber webhook do CRMT (ordem_id, novo_status)',
      '2. Buscar ordem original no Omie pelo ID externo',
      '3. Mapear status CRMT → Status Omie',
      '4. Atualizar via Omie API',
      '5. Se sucesso: Registrar sync em auditoria',
      '6. Se erro: Notificar admin e marcar para retry',
    ],
    schedule: 'Trigger em tempo real',
  },

  /**
   * Workflow: CRMT → Bluesoft
   * Atualiza status de pedidos no Bluesoft
   */
  pushStatusBluesoft: {
    id: 'crmt-push-bluesoft-status',
    name: 'Atualizar Status em Bluesoft',
    description: 'Sincroniza mudanças de status para Bluesoft',
    trigger: 'Webhook (quando status muda)',
    steps: [
      '1. Receber webhook com mudança de status',
      '2. Buscar registro em Bluesoft (id_pedido_erp)',
      '3. Mapear status CRMT → Bluesoft',
      '4. Enviar atualização via API',
      '5. Confirmar e logar na auditoria',
      '6. Se falha: Requeue com backoff exponencial',
    ],
    schedule: 'Trigger em tempo real',
  },

  /**
   * Workflow: Reconciliação de dados
   * Verifica consistência entre CRMT e ERPs
   */
  reconciliarDados: {
    id: 'reconciliacao-erp',
    name: 'Reconciliar Dados com ERPs',
    description: 'Verifica se dados estão consistentes entre CRMT e Omie/Bluesoft',
    trigger: 'Cron (diário às 2 AM)',
    steps: [
      '1. Buscar todas as ordens no CRMT com referência ERP',
      '2. Para cada ordem, validar em Omie e Bluesoft',
      '3. Checar: status, valores, datas',
      '4. Gerar relatório de discrepâncias',
      '5. Para cada discrepância:',
      '   a. Determinar fonte correta (CRMT vs ERP)',
      '   b. Atualizar versão desatualizada',
      '   c. Logar como "reconciliação automática"',
      '6. Enviar relatório para admin por email',
    ],
    schedule: 'Diariamente às 02:00 UTC',
  },

  /**
   * Workflow: Sincronização de Prestadores
   * Gerencia correlação entre prestadores CRMT e usuários/vendedores ERP
   */
  syncPrestadores: {
    id: 'sync-prestadores-erp',
    name: 'Sincronizar Prestadores',
    description: 'Mantém prestadores CRMT alinhados com vendedores/responsáveis em ERPs',
    trigger: 'Webhook + Polling (4x ao dia)',
    steps: [
      '1. Buscar lista de prestadores no CRMT',
      '2. Para cada prestador com email registrado:',
      '   a. Buscar vendedor no Omie por email/nome',
      '   b. Buscar usuário no Bluesoft por email',
      '   c. Se encontrado: Registrar ID externo',
      '   d. Se não: Sugerir em log para criação manual',
      '3. Validar prestadores ativos em ambos sistemas',
      '4. Notificar sobre prestadores inativos em ERP',
    ],
    schedule: '6x ao dia (a cada 4 horas)',
  },
};

/**
 * Status mapping: CRMT ↔ ERP
 */
export const STATUS_MAPPING = {
  crmt_to_omie: {
    aberto: 'em_aberto',
    alocado: 'confirmado',
    em_execucao: 'em_preparacao',
    concluido: 'entregue',
    cancelado: 'cancelado',
  },
  crmt_to_bluesoft: {
    aberto: 'pendente',
    alocado: 'processado',
    em_execucao: 'enviado',
    concluido: 'entregue',
    cancelado: 'devolvido',
  },
  omie_to_crmt: {
    em_aberto: 'aberto',
    confirmado: 'alocado',
    em_preparacao: 'em_execucao',
    enviado: 'em_execucao',
    entregue: 'concluido',
    cancelado: 'cancelado',
  },
  bluesoft_to_crmt: {
    pendente: 'aberto',
    processado: 'alocado',
    enviado: 'em_execucao',
    entregue: 'concluido',
    devolvido: 'cancelado',
  },
};

/**
 * Inicializa conexão com n8n
 */
export async function iniciarIntegracaoN8n(): Promise<{
  sucesso: boolean;
  workflows?: string[];
  erro?: string;
}> {
  try {
    const n8nUrl = process.env.N8N_URL || 'http://localhost:5678';
    const n8nApiKey = process.env.N8N_API_KEY;

    if (!n8nApiKey) {
      console.warn('N8N_API_KEY não configurada. Workflows devem ser criados manualmente.');
      return {
        sucesso: false,
        erro: 'N8N_API_KEY não configurada',
      };
    }

    // Verificar saúde de n8n
    const healthCheck = await fetch(`${n8nUrl}/rest/health`, {
      headers: {
        'X-N8N-API-KEY': n8nApiKey,
      },
    });

    if (!healthCheck.ok) {
      return {
        sucesso: false,
        erro: `n8n não respondendo (status ${healthCheck.status})`,
      };
    }

    // Listar workflows existentes
    const workflowsResponse = await fetch(`${n8nUrl}/rest/workflows`, {
      headers: {
        'X-N8N-API-KEY': n8nApiKey,
      },
    });

    if (!workflowsResponse.ok) {
      return {
        sucesso: false,
        erro: 'Erro ao listar workflows',
      };
    }

    const { data: existentes } = await workflowsResponse.json();
    const workflowIds = existentes.map((w: any) => w.id);

    console.log(`✓ n8n conectado. ${existentes.length} workflows ativos.`);

    return {
      sucesso: true,
      workflows: workflowIds,
    };
  } catch (erro) {
    console.error('Erro ao iniciar integração n8n:', erro);
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : 'Erro desconhecido',
    };
  }
}

/**
 * Dispara webhook para sincronização
 */
export async function dispararSincronizacao(workflow: string, dados: N8nWebhookPayload) {
  try {
    const webhookUrl = process.env.N8N_WEBHOOK_URL;

    if (!webhookUrl) {
      console.warn('N8N_WEBHOOK_URL não configurada');
      return { sucesso: false, erro: 'Webhook URL não configurada' };
    }

    const response = await fetch(`${webhookUrl}webhook/${workflow}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const resultado = await response.json();
    return { sucesso: true, resultado };
  } catch (erro) {
    console.error(`Erro ao disparar ${workflow}:`, erro);
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : 'Erro ao disparar webhook',
    };
  }
}
