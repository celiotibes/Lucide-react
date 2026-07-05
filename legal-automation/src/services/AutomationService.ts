import { Pool } from 'pg';
import { logger } from '@utils/logger';
import { config } from '@utils/config';

export type TriggerType = 'document_uploaded' | 'process_updated' | 'deadline_approaching' | 'manual';
export type ActionType = 'send_email' | 'create_petition' | 'update_process' | 'notify_user' | 'schedule_task';
export type ConditionOperator = 'equals' | 'contains' | 'greater_than' | 'less_than' | 'date_before' | 'date_after';

export interface WorkflowCondition {
  field: string;
  operator: ConditionOperator;
  value: string | number;
}

export interface WorkflowStep {
  id: string;
  name: string;
  action: ActionType;
  config: Record<string, any>;
  condition?: WorkflowCondition;
  retryCount?: number;
  delayMs?: number;
}

export interface WorkflowTrigger {
  type: TriggerType;
  filters?: Record<string, any>;
}

export interface AutomationWorkflow {
  id: string;
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  status: 'active' | 'inactive' | 'draft';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  executionCount: number;
  successCount: number;
  lastExecution?: Date;
}

export interface ExecutionContext {
  workflowId: string;
  triggerId: string;
  triggerData: any;
  userId: string;
}

export interface ExecutionResult {
  workflowId: string;
  executionId: string;
  status: 'success' | 'partial' | 'failed';
  stepsCompleted: number;
  totalSteps: number;
  errors: string[];
  executedAt: Date;
  completedAt: Date;
}

export class AutomationService {
  private pool: Pool;
  private executionQueue: Map<string, ExecutionContext> = new Map();

  constructor() {
    this.pool = new Pool({
      connectionString: config.database_url,
    });
  }

  /**
   * Criar novo fluxo de automação
   */
  async createWorkflow(workflow: Partial<AutomationWorkflow>): Promise<AutomationWorkflow> {
    const client = await this.pool.connect();

    try {
      const id = this.generateId();

      const result = await client.query(
        `INSERT INTO automation_workflows
         (id, name, description, trigger, steps, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, description, trigger, steps, status,
                   created_by, created_at, updated_at, execution_count, success_count`,
        [
          id,
          workflow.name,
          workflow.description || '',
          JSON.stringify(workflow.trigger),
          JSON.stringify(workflow.steps || []),
          workflow.status || 'draft',
          workflow.createdBy,
        ],
      );

      const row = result.rows[0];

      logger.info(`Automação: Fluxo criado - ${row.name} (${id})`);

      return this.rowToWorkflow(row);
    } catch (error) {
      logger.error({ err: error }, 'Erro ao criar fluxo de automação');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Listar fluxos de automação do usuário
   */
  async listWorkflows(userId: string): Promise<AutomationWorkflow[]> {
    try {
      const result = await this.pool.query(
        `SELECT id, name, description, trigger, steps, status,
                created_by, created_at, updated_at, execution_count, success_count, last_execution
         FROM automation_workflows
         WHERE created_by = $1
         ORDER BY created_at DESC`,
        [userId],
      );

      return result.rows.map(row => this.rowToWorkflow(row));
    } catch (error) {
      logger.error({ err: error }, 'Erro ao listar fluxos');
      throw error;
    }
  }

  /**
   * Atualizar fluxo de automação
   */
  async updateWorkflow(id: string, updates: Partial<AutomationWorkflow>): Promise<AutomationWorkflow> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `UPDATE automation_workflows
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             trigger = COALESCE($3, trigger),
             steps = COALESCE($4, steps),
             status = COALESCE($5, status),
             updated_at = NOW()
         WHERE id = $6
         RETURNING id, name, description, trigger, steps, status,
                   created_by, created_at, updated_at, execution_count, success_count`,
        [
          updates.name,
          updates.description,
          updates.trigger ? JSON.stringify(updates.trigger) : null,
          updates.steps ? JSON.stringify(updates.steps) : null,
          updates.status,
          id,
        ],
      );

      if (result.rows.length === 0) {
        throw new Error(`Fluxo não encontrado: ${id}`);
      }

      logger.info(`Automação: Fluxo atualizado - ${id}`);

      return this.rowToWorkflow(result.rows[0]);
    } catch (error) {
      logger.error({ err: error }, `Erro ao atualizar fluxo ${id}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Executar fluxo de automação
   */
  async executeWorkflow(workflowId: string, triggerData: any, userId: string): Promise<ExecutionResult> {
    const executionId = this.generateId();
    const startTime = new Date();

    try {
      logger.info(`Automação: Iniciando execução ${executionId} do fluxo ${workflowId}`);

      const workflow = await this.getWorkflow(workflowId);

      if (!workflow) {
        throw new Error(`Fluxo não encontrado: ${workflowId}`);
      }

      if (workflow.status !== 'active') {
        throw new Error(`Fluxo não está ativo: ${workflow.status}`);
      }

      const context: ExecutionContext = {
        workflowId,
        triggerId: executionId,
        triggerData,
        userId,
      };

      // Executar cada step sequencialmente
      let stepsCompleted = 0;
      const errors: string[] = [];

      for (const step of workflow.steps) {
        try {
          // Verificar condição
          if (step.condition && !this.evaluateCondition(step.condition, triggerData)) {
            logger.debug(`Automação: Condição não atendida para step ${step.id}`);
            continue;
          }

          // Aguardar se houver delay
          if (step.delayMs) {
            await this.delay(step.delayMs);
          }

          // Executar ação
          await this.executeAction(step, context);
          stepsCompleted++;

          logger.debug(`Automação: Step ${step.id} completado`);
        } catch (stepError) {
          const errorMsg = stepError instanceof Error ? stepError.message : 'Erro desconhecido';

          // Retry
          if (step.retryCount && step.retryCount > 0) {
            for (let i = 0; i < step.retryCount; i++) {
              try {
                await this.delay(1000 * (i + 1)); // Backoff exponencial
                await this.executeAction(step, context);
                stepsCompleted++;
                break;
              } catch {
                if (i === step.retryCount - 1) {
                  errors.push(`Step ${step.id}: ${errorMsg} (após ${step.retryCount} tentativas)`);
                }
              }
            }
          } else {
            errors.push(`Step ${step.id}: ${errorMsg}`);
          }
        }
      }

      // Registrar execução
      await this.recordExecution(workflowId, executionId, {
        stepsCompleted,
        totalSteps: workflow.steps.length,
        errors,
        status: errors.length === 0 ? 'success' : errors.length < workflow.steps.length ? 'partial' : 'failed',
      });

      const result: ExecutionResult = {
        workflowId,
        executionId,
        status: errors.length === 0 ? 'success' : errors.length < workflow.steps.length ? 'partial' : 'failed',
        stepsCompleted,
        totalSteps: workflow.steps.length,
        errors,
        executedAt: startTime,
        completedAt: new Date(),
      };

      logger.info(
        `Automação: Execução ${executionId} concluída - ${result.status} (${stepsCompleted}/${workflow.steps.length})`,
      );

      return result;
    } catch (error) {
      logger.error({ err: error }, `Erro na execução do fluxo ${workflowId}`);

      throw error;
    }
  }

  /**
   * Deletar fluxo de automação
   */
  async deleteWorkflow(id: string): Promise<void> {
    try {
      await this.pool.query('DELETE FROM automation_workflows WHERE id = $1', [id]);

      logger.info(`Automação: Fluxo deletado - ${id}`);
    } catch (error) {
      logger.error({ err: error }, `Erro ao deletar fluxo ${id}`);
      throw error;
    }
  }

  /**
   * Privado: Obter fluxo
   */
  private async getWorkflow(id: string): Promise<AutomationWorkflow | null> {
    try {
      const result = await this.pool.query(
        `SELECT id, name, description, trigger, steps, status,
                created_by, created_at, updated_at, execution_count, success_count
         FROM automation_workflows WHERE id = $1`,
        [id],
      );

      return result.rows.length > 0 ? this.rowToWorkflow(result.rows[0]) : null;
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter fluxo ${id}`);
      return null;
    }
  }

  /**
   * Privado: Executar ação de um step
   */
  private async executeAction(step: WorkflowStep, context: ExecutionContext): Promise<void> {
    switch (step.action) {
      case 'send_email':
        await this.sendEmail(step.config, context);
        break;
      case 'create_petition':
        await this.createPetition(step.config, context);
        break;
      case 'notify_user':
        await this.notifyUser(step.config, context);
        break;
      case 'schedule_task':
        await this.scheduleTask(step.config, context);
        break;
      default:
        throw new Error(`Ação desconhecida: ${step.action}`);
    }
  }

  /**
   * Privado: Ações específicas
   */
  private async sendEmail(config: any, context: ExecutionContext): Promise<void> {
    logger.info(`Automação: Enviando email para ${config.to}`);
    // Implementação de envio de email
  }

  private async createPetition(config: any, context: ExecutionContext): Promise<void> {
    logger.info(`Automação: Criando petição - ${config.type}`);
    // Implementação de criação de petição
  }

  private async notifyUser(config: any, context: ExecutionContext): Promise<void> {
    logger.info(`Automação: Notificando usuário ${context.userId}`);
    // Implementação de notificação
  }

  private async scheduleTask(config: any, context: ExecutionContext): Promise<void> {
    logger.info(`Automação: Agendando tarefa - ${config.taskName}`);
    // Implementação de agendamento
  }

  /**
   * Privado: Avaliar condição
   */
  private evaluateCondition(condition: WorkflowCondition, data: any): boolean {
    const value = data[condition.field];

    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'contains':
        return String(value).includes(String(condition.value));
      case 'greater_than':
        return Number(value) > Number(condition.value);
      case 'less_than':
        return Number(value) < Number(condition.value);
      case 'date_before':
        return new Date(value) < new Date(condition.value as string);
      case 'date_after':
        return new Date(value) > new Date(condition.value as string);
      default:
        return false;
    }
  }

  /**
   * Privado: Registrar execução
   */
  private async recordExecution(workflowId: string, executionId: string, result: any): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO workflow_executions
         (id, workflow_id, status, steps_completed, total_steps, errors)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [executionId, workflowId, result.status, result.stepsCompleted, result.totalSteps, JSON.stringify(result.errors)],
      );

      // Atualizar contador no fluxo
      const increment = result.status === 'success' ? 1 : 0;
      await this.pool.query(
        `UPDATE automation_workflows
         SET execution_count = execution_count + 1,
             success_count = success_count + $1,
             last_execution = NOW()
         WHERE id = $2`,
        [increment, workflowId],
      );
    } catch (error) {
      logger.warn(`Erro ao registrar execução: ${error}`);
    }
  }

  /**
   * Privado: Utilitários
   */
  private generateId(): string {
    return `wf_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private rowToWorkflow(row: any): AutomationWorkflow {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      trigger: JSON.parse(row.trigger),
      steps: JSON.parse(row.steps),
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      executionCount: row.execution_count || 0,
      successCount: row.success_count || 0,
      lastExecution: row.last_execution,
    };
  }
}

export const automationService = new AutomationService();
