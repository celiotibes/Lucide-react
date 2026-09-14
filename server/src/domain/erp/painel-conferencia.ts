/**
 * Lógica de Negócio: Painel de Conferência (3A)
 * Aprovação, retificação e auditoria de apontamentos
 */

import { AuditoriaAcao, LancamentoLedger } from "../../src/domain/apontamentos";

/**
 * Aprovação de apontamento - lança no ledger
 */
export async function aprovarApontamento(
  apontamentoId: string,
  usuarioId: string,
  motivo: string
): Promise<{ lancamento_id: string; auditoria_id: string }> {
  // 1. Registra aprovação na auditoria
  const auditoria: AuditoriaAcao = {
    id: `audit_${Date.now()}`,
    entidade_tipo: "apontamento",
    entidade_id: apontamentoId,
    acao: "aprovacao",
    usuario: usuarioId,
    motivo,
    data: new Date().toISOString(),
  };

  // 2. Cria lançamento no ledger
  const lancamento: LancamentoLedger = {
    id: `ledger_${Date.now()}`,
    entidade_tipo: "apontamento",
    entidade_id: apontamentoId,
    descricao: `Apontamento aprovado: ${motivo}`,
    valor: 0, // Seria preenchido com valor do apontamento
    conta_debito: "1.1.1.01", // Despesa com Pessoal
    conta_credito: "2.1.1.01", // Contas a Pagar
    data_lancamento: new Date().toISOString().split("T")[0],
    data_criacao: new Date().toISOString(),
    status: "criado",
  };

  return {
    lancamento_id: lancamento.id,
    auditoria_id: auditoria.id,
  };
}

/**
 * Retificação de apontamento
 */
export async function retificarApontamento(
  apontamentoId: string,
  usuarioId: string,
  campoAlterado: string,
  valorAnterior: string,
  novoValor: string,
  motivo: string
): Promise<{ auditoria_id: string; requer_analise_manual: boolean }> {
  const agora = new Date();
  const dataCriacao = new Date(); // Seria buscada do banco
  const diasPassados = Math.floor(
    (agora.getTime() - dataCriacao.getTime()) / (1000 * 60 * 60 * 24)
  );

  const auditoria: AuditoriaAcao = {
    id: `audit_${Date.now()}`,
    entidade_tipo: "apontamento",
    entidade_id: apontamentoId,
    acao: "retificacao",
    usuario: usuarioId,
    dados_anteriores: { [campoAlterado]: valorAnterior },
    dados_novos: { [campoAlterado]: novoValor },
    motivo,
    data: new Date().toISOString(),
  };

  return {
    auditoria_id: auditoria.id,
    requer_analise_manual: diasPassados > 1, // Passou do prazo de 1 dia
  };
}

/**
 * Aprovação de fechamento semanal - gera título financeiro
 */
export async function aprovarFechamentoSemanal(
  fechamentoId: string,
  usuarioId: string,
  valor_liquido: number
): Promise<{ lancamento_id: string; auditoria_id: string }> {
  const auditoria: AuditoriaAcao = {
    id: `audit_${Date.now()}`,
    entidade_tipo: "fechamento",
    entidade_id: fechamentoId,
    acao: "aprovacao",
    usuario: usuarioId,
    motivo: "Fechamento semanal aprovado",
    data: new Date().toISOString(),
  };

  // Gera título financeiro
  const lancamento: LancamentoLedger = {
    id: `ledger_${Date.now()}`,
    entidade_tipo: "fechamento",
    entidade_id: fechamentoId,
    descricao: "Título de pagamento semanal (Pluggy)",
    valor: valor_liquido,
    conta_debito: "1.1.1.01", // Despesa com Pessoal
    conta_credito: "2.1.1.01", // Contas a Pagar
    data_lancamento: new Date().toISOString().split("T")[0],
    data_criacao: new Date().toISOString(),
    status: "criado",
  };

  return {
    lancamento_id: lancamento.id,
    auditoria_id: auditoria.id,
  };
}

/**
 * Gera pagamento via Pluggy (transferência bancária)
 */
export async function gerarPagamento(
  fechamentoId: string,
  prestadorId: string,
  valor: number,
  usuarioId: string
): Promise<{
  transferencia_id: string;
  status: "solicitado" | "processando" | "concluido" | "erro";
}> {
  // Integraria com Pluggy para criar transferência bancária
  // Por enquanto, retorna estrutura esperada

  return {
    transferencia_id: `transfer_${Date.now()}`,
    status: "solicitado", // Pluggy processará em segundo plano
  };
}

/**
 * Aprova movimentação (vale/empréstimo/adiantamento)
 */
export async function aprovarMovimentacao(
  movimentacaoId: string,
  usuarioId: string,
  semanaDesconto: string,
  parcelas: number = 1,
  juros_percentual: number = 0
): Promise<{ auditoria_id: string }> {
  const auditoria: AuditoriaAcao = {
    id: `audit_${Date.now()}`,
    entidade_tipo: "apontamento", // Registra em apontamentos por enquanto
    entidade_id: movimentacaoId,
    acao: "aprovacao",
    usuario: usuarioId,
    dados_novos: {
      semana_desconto: semanaDesconto,
      parcelas,
      juros_percentual,
    },
    motivo: "Movimentação financeira aprovada",
    data: new Date().toISOString(),
  };

  return {
    auditoria_id: auditoria.id,
  };
}

/**
 * Gera proposta de reajuste IPCA
 */
export async function gerarPropostaReajuste(
  ipca_acumulado: number,
  usuarioId: string
): Promise<{
  proposta_id: string;
  rubricas_reajustadas: Array<{
    rubrica: string;
    valor_atual: number;
    novo_valor: number;
    percentual_ipca: number;
  }>;
}> {
  // Rubricas padrão (sem combustível)
  const rubricas = [
    {
      rubrica: "urgencia_50",
      valor_atual: 50,
      novo_valor: 50 * (1 + ipca_acumulado / 100),
      percentual_ipca: ipca_acumulado,
    },
    {
      rubrica: "urgencia_62_50",
      valor_atual: 62.5,
      novo_valor: 62.5 * (1 + ipca_acumulado / 100),
      percentual_ipca: ipca_acumulado,
    },
    {
      rubrica: "airbnb_1q",
      valor_atual: 150,
      novo_valor: 150 * (1 + ipca_acumulado / 100),
      percentual_ipca: ipca_acumulado,
    },
    {
      rubrica: "airbnb_2q",
      valor_atual: 200,
      novo_valor: 200 * (1 + ipca_acumulado / 100),
      percentual_ipca: ipca_acumulado,
    },
    {
      rubrica: "deslocamento",
      valor_atual: 25,
      novo_valor: 25 * (1 + ipca_acumulado / 100),
      percentual_ipca: ipca_acumulado,
    },
    {
      rubrica: "busca_materiais",
      valor_atual: 30,
      novo_valor: 30 * (1 + ipca_acumulado / 100),
      percentual_ipca: ipca_acumulado,
    },
    {
      rubrica: "diaria_ajudante",
      valor_atual: 80,
      novo_valor: 80 * (1 + ipca_acumulado / 100),
      percentual_ipca: ipca_acumulado,
    },
  ];

  return {
    proposta_id: `reajuste_${Date.now()}`,
    rubricas_reajustadas: rubricas,
  };
}

/**
 * Aprova proposta de reajuste - cria nova vigência
 */
export async function aprovarPropostaReajuste(
  reajusteId: string,
  usuarioId: string,
  rubricas_ajustadas: any[]
): Promise<{ vigor_id: string; auditoria_id: string }> {
  const auditoria: AuditoriaAcao = {
    id: `audit_${Date.now()}`,
    entidade_tipo: "apontamento",
    entidade_id: reajusteId,
    acao: "aprovacao",
    usuario: usuarioId,
    motivo: "Proposta de reajuste IPCA aprovada",
    data: new Date().toISOString(),
  };

  return {
    vigor_id: `vigor_${Date.now()}`,
    auditoria_id: auditoria.id,
  };
}
