/**
 * Sistema de Alertas Automáticos
 * Monitora KPIs e dispara notificações quando limites são atingidos
 */

import { createClient } from '@/lib/supabase/server';
import { Notificador } from '@/server/notificacao/Notificador';

export interface ConfiguracaoAlerta {
  nome: string;
  tipo: 'margem_baixa' | 'anomalia_critica' | 'atraso_recebimento' | 'custo_alto' | 'nenhum_apontamento';
  limiteMinimo?: number;
  limitemaximo?: number;
  periodoVerificacao: number; // minutos
  emailsDestino: string[];
  ativo: boolean;
}

export interface ResultadoAlerta {
  alertaId: string;
  tipo: string;
  severidade: 'info' | 'alerta' | 'critico';
  titulo: string;
  descricao: string;
  dados: Record<string, any>;
  timestamp: Date;
  residencialId?: string;
  prestadorId?: string;
}

/**
 * Verificar margem baixa
 */
export async function verificarMargemBaixa(
  limiteMinimo: number = 25
): Promise<ResultadoAlerta[]> {
  const supabase = await createClient();
  const alertas: ResultadoAlerta[] = [];

  try {
    const { data: kpis } = await supabase.from('vw_kpi_financeiro').select('*').limit(1);

    if (!kpis || kpis.length === 0) return alertas;

    const kpi = kpis[0];
    const margemAtual = parseFloat(kpi.margem_percentual || 0);

    if (margemAtual < limiteMinimo) {
      alertas.push({
        alertaId: `margem_${kpi.ano}_${kpi.mes}`,
        tipo: 'margem_baixa',
        severidade: margemAtual < limiteMinimo * 0.5 ? 'critico' : 'alerta',
        titulo: `Margem baixa em ${kpi.nome_mes}/${kpi.ano}`,
        descricao: `Margem de ${margemAtual.toFixed(1)}% está abaixo do limite de ${limiteMinimo}%`,
        dados: {
          margemAtual,
          limiteMinimo,
          faturamento: kpi.faturamento_total,
          custoTotal: (kpi.custo_operacional || 0) + (kpi.custo_despesas || 0),
        },
        timestamp: new Date(),
      });
    }
  } catch (erro) {
    console.error('Erro ao verificar margem:', erro);
  }

  return alertas;
}

/**
 * Verificar anomalias críticas
 */
export async function verificarAnomaliasCriticas(): Promise<ResultadoAlerta[]> {
  const supabase = await createClient();
  const alertas: ResultadoAlerta[] = [];

  try {
    // Buscar apontamentos com anomalias críticas (score > 80)
    const { data: anomalias } = await supabase
      .from('fact_apontamento')
      .select('*, dim_prestador(*)')
      .gt('score_anomalia', 80)
      .gte(
        'data_carga',
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      );

    if (!anomalias) return alertas;

    for (const anomalia of anomalias) {
      alertas.push({
        alertaId: `anomalia_${anomalia.apontamento_sk}`,
        tipo: 'anomalia_critica',
        severidade: 'critico',
        titulo: `Anomalia crítica detectada`,
        descricao: `Apontamento com score ${anomalia.score_anomalia} (${anomalia.horas_trabalhadas}h) no dia ${anomalia.data_sk}`,
        dados: {
          apontamentoId: anomalia.apontamento_id,
          horas: anomalia.horas_trabalhadas,
          score: anomalia.score_anomalia,
          prestador: anomalia.dim_prestador?.nome_completo,
        },
        timestamp: new Date(),
        prestadorId: anomalia.prestador_sk,
      });
    }
  } catch (erro) {
    console.error('Erro ao verificar anomalias:', erro);
  }

  return alertas;
}

/**
 * Verificar atraso em recebimentos
 */
export async function verificarAtrasoRecebimento(
  diasAtraso: number = 15
): Promise<ResultadoAlerta[]> {
  const supabase = await createClient();
  const alertas: ResultadoAlerta[] = [];

  try {
    // Buscar faturas vencidas não recebidas
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - diasAtraso);

    const { data: faturas } = await supabase
      .from('fact_recebimento')
      .select('*, dim_residencial(*)')
      .eq('status', 'pendente')
      .lt('data_vencimento', dataLimite.toISOString().split('T')[0]);

    if (!faturas) return alertas;

    for (const fatura of faturas) {
      const diasAtrasoReal = Math.floor(
        (new Date().getTime() - new Date(fatura.data_vencimento).getTime()) /
          (1000 * 60 * 60 * 24)
      );

      alertas.push({
        alertaId: `atraso_${fatura.recebimento_id}`,
        tipo: 'atraso_recebimento',
        severidade: diasAtrasoReal > 30 ? 'critico' : 'alerta',
        titulo: `Recebimento em atraso`,
        descricao: `Fatura de ${fatura.dim_residencial?.nome} está ${diasAtrasoReal} dias atrasada`,
        dados: {
          faturaSk: fatura.fatura_sk,
          valor: fatura.valor_recebido,
          diasAtraso: diasAtrasoReal,
          residencial: fatura.dim_residencial?.nome,
        },
        timestamp: new Date(),
        residencialId: fatura.residencial_sk,
      });
    }
  } catch (erro) {
    console.error('Erro ao verificar atrasos:', erro);
  }

  return alertas;
}

/**
 * Verificar custos altos
 */
export async function verificarCustosAltos(
  percentualLimite: number = 70
): Promise<ResultadoAlerta[]> {
  const supabase = await createClient();
  const alertas: ResultadoAlerta[] = [];

  try {
    // Buscar residenciais com custos acima de X% do faturamento
    const { data: residenciais } = await supabase
      .from('vw_resumo_mensal_residencial')
      .select('*');

    if (!residenciais) return alertas;

    for (const res of residenciais) {
      const percentualCusto = (res.custo_total / (res.faturamento || 1)) * 100;

      if (percentualCusto > percentualLimite) {
        alertas.push({
          alertaId: `custo_${res.residencial_id}_${res.ano}_${res.mes}`,
          tipo: 'custo_alto',
          severidade: percentualCusto > percentualLimite * 1.2 ? 'critico' : 'alerta',
          titulo: `Custo elevado em ${res.nome}`,
          descricao: `Custos de ${percentualCusto.toFixed(1)}% do faturamento (limite: ${percentualLimite}%)`,
          dados: {
            residencialId: res.residencial_id,
            custoTotal: res.custo_total,
            faturamento: res.faturamento,
            percentualCusto,
          },
          timestamp: new Date(),
          residencialId: res.residencial_id,
        });
      }
    }
  } catch (erro) {
    console.error('Erro ao verificar custos:', erro);
  }

  return alertas;
}

/**
 * Verificar dias sem apontamento
 */
export async function verificarNenhumApontamento(
  diasSemApontamento: number = 7
): Promise<ResultadoAlerta[]> {
  const supabase = await createClient();
  const alertas: ResultadoAlerta[] = [];

  try {
    // Buscar prestadores com contrato ativo mas sem apontamentos recentes
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - diasSemApontamento);

    const { data: prestadores } = await supabase
      .from('dim_prestador')
      .select('*')
      .eq('is_current', true)
      .eq('status', 'ativo');

    if (!prestadores) return alertas;

    for (const prestador of prestadores) {
      const { data: apontamentos } = await supabase
        .from('fact_apontamento')
        .select('id')
        .eq('prestador_sk', prestador.prestador_sk)
        .gte('data_sk', dataLimite.toISOString().split('T')[0])
        .limit(1);

      if (!apontamentos || apontamentos.length === 0) {
        alertas.push({
          alertaId: `sem_apontamento_${prestador.prestador_sk}`,
          tipo: 'nenhum_apontamento',
          severidade: 'alerta',
          titulo: `${prestador.nome_completo} sem apontamentos`,
          descricao: `Prestador não registrou horas nos últimos ${diasSemApontamento} dias`,
          dados: {
            prestadorId: prestador.prestador_id,
            diasSemApontamento,
            email: prestador.email,
          },
          timestamp: new Date(),
          prestadorId: prestador.prestador_sk,
        });
      }
    }
  } catch (erro) {
    console.error('Erro ao verificar apontamentos:', erro);
  }

  return alertas;
}

/**
 * Disparar notificações para alertas
 */
export async function dispararNotificacoesAlerta(
  alertas: ResultadoAlerta[],
  emailsDestino: string[]
): Promise<void> {
  const notificador = new Notificador();

  for (const alerta of alertas) {
    const iconeSeveridade =
      alerta.severidade === 'critico' ? '🚨' : alerta.severidade === 'alerta' ? '⚠️' : 'ℹ️';

    await notificador.enviar({
      canais: ['email'],
      destinatario: {
        email: emailsDestino[0],
      },
      template: {
        titulo: `${iconeSeveridade} ${alerta.titulo}`,
        corpo: alerta.descricao,
        acaoUrl: 'https://seu-dominio.com/painel-gestao/bi/dashboard',
        acaoTexto: 'Ver Dashboard',
      },
      variaveis: {
        severidade: alerta.severidade.toUpperCase(),
        timestamp: new Date().toLocaleString('pt-BR'),
      },
    });
  }
}

/**
 * Executar verificação completa de alertas
 */
export async function verificarTodosAlertas(): Promise<ResultadoAlerta[]> {
  const todosAlertas: ResultadoAlerta[] = [];

  // Executar todas as verificações
  const [margem, anomalias, atrasos, custos, apontamentos] = await Promise.all([
    verificarMargemBaixa(25),
    verificarAnomaliasCriticas(),
    verificarAtrasoRecebimento(15),
    verificarCustosAltos(70),
    verificarNenhumApontamento(7),
  ]);

  todosAlertas.push(...margem, ...anomalias, ...atrasos, ...custos, ...apontamentos);

  return todosAlertas;
}
