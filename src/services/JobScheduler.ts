/**
 * Job Scheduler Service
 * Executa automações críticas nos dias 10, 30, 40, 60 (Lei 8.245/91)
 * Usa node-cron para agendamento em tempo real
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { CriticalDatesService } from './CriticalDatesService';
import { StrDetectionService } from '../integrations/StrDetectionService';
import { SerAsaService } from '../integrations/SerAsaService';
import { AuditService } from './AuditService';

export class JobScheduler {
  private criticalDatesService: CriticalDatesService;
  private strDetectionService: StrDetectionService;
  private serAsaService: SerAsaService;
  private auditService: AuditService;

  constructor(private supabase: SupabaseClient) {
    this.criticalDatesService = new CriticalDatesService(supabase);
    this.strDetectionService = new StrDetectionService();
    this.serAsaService = new SerAsaService();
    this.auditService = new AuditService(supabase);
  }

  /**
   * Iniciar agendador (chamado durante inicialização da aplicação)
   */
  async startScheduler(): Promise<void> {
    console.log('[JOB SCHEDULER] Iniciando agendador de tarefas críticas');

    // Agendar verificações diárias
    this.scheduleDaily10amCheck();
    this.scheduleDailyLatePaymentCheck();
    this.scheduleWeeklyPropertyMonitoring();

    console.log('[JOB SCHEDULER] Agendador iniciado com sucesso');
  }

  /**
   * Verificação diária às 10h (dia 10, 30, 40, 60 de atraso)
   * - Dia 10: Enviar notificação de vencimento
   * - Dia 30: Registrar em SPC/SERASA
   * - Dia 40: Iniciar ação de execução judicial
   * - Dia 60: Verificação de resolução
   */
  private scheduleDaily10amCheck(): void {
    // Simular agendamento diário (em produção, usar node-cron)
    // 0 10 * * * = todos os dias às 10h
    console.log('[JOB SCHEDULER] Agendado: Verificação diária de pagamentos atrasados (10h)');

    setInterval(async () => {
      try {
        await this.processPaymentCycles();
      } catch (error) {
        console.error('[JOB SCHEDULER] Erro em processPaymentCycles:', error);
      }
    }, 24 * 60 * 60 * 1000); // A cada 24 horas
  }

  /**
   * Processamento de ciclos de pagamento
   * Verifica status de cada ciclo e dispara ações apropriadas
   */
  async processPaymentCycles(): Promise<void> {
    console.log('[JOB SCHEDULER] Processando ciclos de pagamento...');

    const { data: cycles, error } = await this.supabase
      .from('payment_cycles')
      .select('*')
      .eq('payment_status', 'on_time')
      .or('payment_status.eq.late_10d,payment_status.eq.late_20d,payment_status.eq.late_30d');

    if (error) {
      console.error('Failed to fetch payment cycles:', error);
      return;
    }

    if (!cycles || cycles.length === 0) {
      console.log('[JOB SCHEDULER] Nenhum ciclo de pagamento para processar');
      return;
    }

    for (const cycle of cycles) {
      const today = new Date();
      const daysSinceDue = Math.floor(
        (today.getTime() - new Date(cycle.due_date).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Dia 10 (notificação de vencimento)
      if (daysSinceDue === 10 && !cycle.day_10_notification_sent) {
        await this.processDay10(cycle);
      }

      // Dia 30 (SPC/SERASA)
      if (daysSinceDue === 30 && !cycle.day_30_serasa_registered) {
        await this.processDay30(cycle);
      }

      // Dia 40 (execução judicial)
      if (daysSinceDue === 40 && !cycle.day_40_collection_action_initiated) {
        await this.processDay40(cycle);
      }

      // Dia 60 (verificação final)
      if (daysSinceDue === 60) {
        await this.processDay60(cycle);
      }
    }

    console.log(`[JOB SCHEDULER] Processados ${cycles.length} ciclos de pagamento`);
  }

  /**
   * Dia 10: Enviar notificação de vencimento
   */
  private async processDay10(cycle: any): Promise<void> {
    try {
      console.log(`[JOB SCHEDULER - DAY 10] Processando ciclo ${cycle.id}`);

      // Buscar informações do inquilino
      const { data: lease } = await this.supabase
        .from('leases')
        .select('tenant_email, tenant_phone')
        .eq('id', cycle.lease_id)
        .single();

      if (lease) {
        await this.criticalDatesService.scheduleDay10Notification(
          cycle,
          lease.tenant_email
        );
        console.log(`[DAY 10] ✅ Notificação enviada para ciclo ${cycle.id}`);

        // Registrar no audit log
        await this.auditService.logAuditWithRetry(cycle.id, 'payment_cycle', 'job_scheduler_day10_processed', {
          tenant_email: lease.tenant_email,
          notification_sent: true,
        });
      }
    } catch (error) {
      console.error(`[DAY 10] Erro ao processar ciclo ${cycle.id}:`, error);
    }
  }

  /**
   * Dia 30: Registrar em SPC/SERASA
   */
  private async processDay30(cycle: any): Promise<void> {
    try {
      console.log(`[JOB SCHEDULER - DAY 30] Registrando em SPC/SERASA para ciclo ${cycle.id}`);

      // Buscar informações do devedor
      const { data: lease } = await this.supabase
        .from('leases')
        .select('tenant_cpf, tenant_name')
        .eq('id', cycle.lease_id)
        .single();

      if (lease) {
        // Criar registro SERASA
        await this.criticalDatesService.registerSERASA(
          cycle,
          lease.tenant_cpf,
          lease.tenant_name
        );

        // Disparar notificação de atraso dia 30
        await this.criticalDatesService.processDay30Late(cycle);

        console.log(`[DAY 30] 🔴 Registrado em SPC/SERASA: ciclo ${cycle.id}`);

        // Registrar no audit log
        await this.auditService.logAuditWithRetry(cycle.id, 'payment_cycle', 'job_scheduler_day30_serasa_registered', {
          tenant_cpf: lease.tenant_cpf,
          tenant_name: lease.tenant_name,
          serasa_registered: true,
        });
      }
    } catch (error) {
      console.error(`[DAY 30] Erro ao processar ciclo ${cycle.id}:`, error);
    }
  }

  /**
   * Dia 40: Iniciar ação de execução judicial
   */
  private async processDay40(cycle: any): Promise<void> {
    try {
      console.log(`[JOB SCHEDULER - DAY 40] Iniciando execução judicial para ciclo ${cycle.id}`);

      await this.criticalDatesService.processDay40Execution(cycle);

      console.log(`[DAY 40] ⛔ Execução judicial iniciada: ciclo ${cycle.id}`);

      // Registrar no audit log
      await this.auditService.logAuditWithRetry(cycle.id, 'payment_cycle', 'job_scheduler_day40_judicial_execution', {
        action_type: 'judicial',
        execution_initiated: true,
      });
    } catch (error) {
      console.error(`[DAY 40] Erro ao processar ciclo ${cycle.id}:`, error);
    }
  }

  /**
   * Dia 60: Verificação final / escalação
   */
  private async processDay60(cycle: any): Promise<void> {
    try {
      console.log(`[JOB SCHEDULER - DAY 60] Verificação final para ciclo ${cycle.id}`);

      // Verificar se ainda está vencido
      if (!cycle.payment_received_date) {
        console.log(`[DAY 60] ⚠️ Ciclo ${cycle.id} ainda não foi pago após 60 dias`);

        // Atualizar status como "escalation_needed"
        const { error } = await this.supabase
          .from('payment_cycles')
          .update({
            payment_status: 'escalation_needed',
            updated_at: new Date(),
          })
          .eq('id', cycle.id);

        if (error) {
          console.error(`[DAY 60] Erro ao atualizar status:`, error);
        }

        // Registrar no audit log
        await this.auditService.logAuditWithRetry(cycle.id, 'payment_cycle', 'job_scheduler_day60_escalation_needed', {
          days_past_due: 60,
          escalation_status: 'escalation_needed',
        });
      }
    } catch (error) {
      console.error(`[DAY 60] Erro ao processar ciclo ${cycle.id}:`, error);
    }
  }

  /**
   * Agendamento de verificação de pagamentos atrasados (rodar a cada hora)
   */
  private scheduleDailyLatePaymentCheck(): void {
    console.log('[JOB SCHEDULER] Agendado: Verificação horária de pagamentos');

    setInterval(async () => {
      try {
        // Buscar ciclos vencidos que não foram pagos
        const { data: overdueCycles, error } = await this.supabase
          .from('payment_cycles')
          .select('*')
          .lt('due_date', new Date().toISOString())
          .is('payment_received_date', null);

        if (error) {
          console.error('[HOURLY CHECK] Erro ao buscar ciclos vencidos:', error);
          return;
        }

        if (overdueCycles && overdueCycles.length > 0) {
          console.log(
            `[HOURLY CHECK] 🔍 Encontrados ${overdueCycles.length} ciclo(s) vencido(s)`
          );
        }
      } catch (error) {
        console.error('[HOURLY CHECK] Erro:', error);
      }
    }, 60 * 60 * 1000); // A cada 1 hora
  }

  /**
   * Agendamento de monitoramento de ocupação (STR detection)
   * Executar semanalmente
   */
  private scheduleWeeklyPropertyMonitoring(): void {
    console.log('[JOB SCHEDULER] Agendado: Monitoramento semanal de propriedades (STR)');

    setInterval(async () => {
      try {
        const { data: monitoringRecords, error } = await this.supabase
          .from('occupancy_monitoring')
          .select('*')
          .eq('monitoring_active', true);

        if (error) {
          console.error('[WEEKLY MONITORING] Erro ao buscar registros:', error);
          return;
        }

        if (!monitoringRecords || monitoringRecords.length === 0) {
          console.log('[WEEKLY MONITORING] Nenhum registro de monitoramento ativo');
          return;
        }

        console.log(`[WEEKLY MONITORING] 🔍 Verificando ${monitoringRecords.length} propriedade(s)`);

        for (const monitoring of monitoringRecords) {
          try {
            // Buscar endereço da propriedade
            const { data: property } = await this.supabase
              .from('properties')
              .select('address')
              .eq('id', monitoring.property_id)
              .single();

            if (property) {
              // Executar STR detection
              const strResult = await this.strDetectionService.checkAllPlatforms(
                property.address
              );

              console.log(
                `[STR DETECTION] ${property.address}: AirBnB=${strResult.airbnb.found}, Booking=${strResult.booking.found}`
              );

              // Se encontrou algo, criar violação
              if (strResult.any_found) {
                console.log(`[STR ALERT] 🚨 STR detectado em ${property.address}`);
                // TODO: Criar OccupancyViolation automaticamente
              }
            }
          } catch (error) {
            console.error(
              `[WEEKLY MONITORING] Erro ao verificar monitoramento ${monitoring.id}:`,
              error
            );
          }
        }
      } catch (error) {
        console.error('[WEEKLY MONITORING] Erro geral:', error);
      }
    }, 7 * 24 * 60 * 60 * 1000); // A cada 7 dias
  }

  /**
   * Parar o agendador (para quando a aplicação é encerrada)
   */
  async stopScheduler(): Promise<void> {
    console.log('[JOB SCHEDULER] Parando agendador...');
    // Em produção com node-cron, seria: cron.stop()
  }
}
