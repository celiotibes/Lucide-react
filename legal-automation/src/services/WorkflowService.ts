import { pool } from '@/database/connection';
import { logger } from '@utils/logger';
import { AppError } from '@utils/errors';

interface WorkflowTemplate {
  id: string;
  userId: string;
  name: string;
  description?: string;
  triggerType: string;
  isActive: boolean;
  templateVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

interface WorkflowStep {
  id: string;
  workflowTemplateId: string;
  stepOrder: number;
  stepType: string;
  title: string;
  description?: string;
  approverId?: string;
  approverRole?: string;
  timeoutDays?: number;
  autoApproveOnTimeout: boolean;
  conditions: any;
  actions: any;
  createdAt: Date;
}

interface WorkflowInstance {
  id: string;
  workflowTemplateId: string;
  caseId: string;
  userId: string;
  status: string;
  currentStepId?: string;
  startedAt: Date;
  completedAt?: Date;
  rejectedAt?: Date;
  rejectionReason?: string;
  metadata: any;
}

interface WorkflowApproval {
  id: string;
  workflowInstanceId: string;
  stepId: string;
  approverId: string;
  status: string;
  comment?: string;
  decisionAt?: Date;
  createdAt: Date;
}

class WorkflowService {
  async createTemplate(
    userId: string,
    name: string,
    triggerType: string,
    description?: string,
  ): Promise<WorkflowTemplate> {
    try {
      logger.info(`Creating workflow template "${name}" for user ${userId}`);

      const result = await pool.query(
        `INSERT INTO workflow_templates (user_id, name, description, trigger_type)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, name, description || null, triggerType],
      );

      return this.mapRowToTemplate(result.rows[0]);
    } catch (error) {
      logger.error({ err: error }, 'Error creating workflow template');
      throw new AppError(500, 'Erro ao criar modelo de workflow');
    }
  }

  async addStep(
    templateId: string,
    stepOrder: number,
    stepType: string,
    title: string,
    approverId?: string,
    approverRole?: string,
    timeoutDays?: number,
    description?: string,
    conditions?: any,
    actions?: any,
  ): Promise<WorkflowStep> {
    try {
      logger.info(`Adding step to workflow template ${templateId}`);

      const result = await pool.query(
        `INSERT INTO workflow_steps (
          workflow_template_id, step_order, step_type, title, description,
          approver_id, approver_role, timeout_days, conditions, actions
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          templateId,
          stepOrder,
          stepType,
          title,
          description || null,
          approverId || null,
          approverRole || null,
          timeoutDays || null,
          conditions ? JSON.stringify(conditions) : '{}',
          actions ? JSON.stringify(actions) : '{}',
        ],
      );

      return this.mapRowToStep(result.rows[0]);
    } catch (error) {
      logger.error({ err: error }, 'Error adding workflow step');
      throw new AppError(500, 'Erro ao adicionar etapa do workflow');
    }
  }

  async getTemplate(templateId: string): Promise<any> {
    try {
      const template = await pool.query(
        `SELECT * FROM workflow_templates WHERE id = $1`,
        [templateId],
      );

      if (template.rows.length === 0) {
        throw new AppError(404, 'Modelo de workflow não encontrado');
      }

      const steps = await pool.query(
        `SELECT * FROM workflow_steps WHERE workflow_template_id = $1 ORDER BY step_order`,
        [templateId],
      );

      return {
        template: this.mapRowToTemplate(template.rows[0]),
        steps: steps.rows.map(row => this.mapRowToStep(row)),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ err: error }, 'Error fetching workflow template');
      throw new AppError(500, 'Erro ao buscar modelo de workflow');
    }
  }

  async startWorkflow(
    templateId: string,
    caseId: string,
    userId: string,
    metadata?: any,
  ): Promise<WorkflowInstance> {
    try {
      logger.info(`Starting workflow instance for case ${caseId}`);

      // Get first step
      const firstStep = await pool.query(
        `SELECT id FROM workflow_steps
         WHERE workflow_template_id = $1
         ORDER BY step_order ASC LIMIT 1`,
        [templateId],
      );

      if (firstStep.rows.length === 0) {
        throw new AppError(400, 'Modelo de workflow sem etapas');
      }

      const result = await pool.query(
        `INSERT INTO workflow_instances (
          workflow_template_id, case_id, user_id, current_step_id, metadata
        ) VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          templateId,
          caseId,
          userId,
          firstStep.rows[0].id,
          metadata ? JSON.stringify(metadata) : '{}',
        ],
      );

      const instance = this.mapRowToInstance(result.rows[0]);

      // Create approvals for first step
      await this.createApprovalsForStep(instance.id, firstStep.rows[0].id);

      // Send notifications
      await this.notifyApprovers(instance.id, firstStep.rows[0].id);

      return instance;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ err: error }, 'Error starting workflow');
      throw new AppError(500, 'Erro ao iniciar workflow');
    }
  }

  async approveStep(
    instanceId: string,
    approverId: string,
    comment?: string,
  ): Promise<WorkflowApproval> {
    try {
      logger.info(`Approving step in workflow instance ${instanceId}`);

      // Get current step
      const instance = await pool.query(
        `SELECT * FROM workflow_instances WHERE id = $1`,
        [instanceId],
      );

      if (instance.rows.length === 0) {
        throw new AppError(404, 'Instância de workflow não encontrada');
      }

      const currentStepId = instance.rows[0].current_step_id;

      // Update or create approval
      const approval = await pool.query(
        `UPDATE workflow_approvals
         SET status = 'approved', comment = $3, decision_at = CURRENT_TIMESTAMP
         WHERE workflow_instance_id = $1 AND step_id = $2 AND approver_id = $4
         RETURNING *`,
        [instanceId, currentStepId, comment || null, approverId],
      );

      if (approval.rows.length === 0) {
        throw new AppError(404, 'Aprovação não encontrada');
      }

      // Check if all approvals are done
      const pending = await pool.query(
        `SELECT COUNT(*) as count FROM workflow_approvals
         WHERE workflow_instance_id = $1 AND step_id = $2 AND status = 'pending'`,
        [instanceId, currentStepId],
      );

      if (parseInt(pending.rows[0].count, 10) === 0) {
        // Move to next step
        await this.moveToNextStep(instanceId, currentStepId);
      }

      return this.mapRowToApproval(approval.rows[0]);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ err: error }, 'Error approving step');
      throw new AppError(500, 'Erro ao aprovar etapa');
    }
  }

  async rejectWorkflow(
    instanceId: string,
    rejectionReason: string,
    rejectingUserId: string,
  ): Promise<WorkflowInstance> {
    try {
      logger.info(`Rejecting workflow instance ${instanceId}`);

      const result = await pool.query(
        `UPDATE workflow_instances
         SET status = 'rejected', rejected_at = CURRENT_TIMESTAMP, rejection_reason = $2
         WHERE id = $1
         RETURNING *`,
        [instanceId, rejectionReason],
      );

      if (result.rows.length === 0) {
        throw new AppError(404, 'Instância de workflow não encontrada');
      }

      // Log rejection
      await pool.query(
        `INSERT INTO workflow_audit_log (workflow_instance_id, actor_id, action_type, action_details)
         VALUES ($1, $2, $3, $4)`,
        [instanceId, rejectingUserId, 'workflow_rejected', rejectionReason],
      );

      return this.mapRowToInstance(result.rows[0]);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ err: error }, 'Error rejecting workflow');
      throw new AppError(500, 'Erro ao rejeitar workflow');
    }
  }

  async escalateStep(
    instanceId: string,
    stepId: string,
    escalatedToId: string,
    reason: string,
  ): Promise<any> {
    try {
      logger.info(`Escalating step in workflow ${instanceId}`);

      // Get current escalation level
      const lastEscalation = await pool.query(
        `SELECT escalation_level FROM workflow_escalations
         WHERE workflow_instance_id = $1 AND step_id = $2
         ORDER BY escalation_level DESC LIMIT 1`,
        [instanceId, stepId],
      );

      const escalationLevel = lastEscalation.rows.length > 0 ? lastEscalation.rows[0].escalation_level + 1 : 1;

      const result = await pool.query(
        `INSERT INTO workflow_escalations (
          workflow_instance_id, step_id, escalation_level, escalated_to_id, escalation_reason
        ) VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [instanceId, stepId, escalationLevel, escalatedToId, reason],
      );

      // Add escalated user as approver
      await pool.query(
        `INSERT INTO workflow_approvals (workflow_instance_id, step_id, approver_id)
         VALUES ($1, $2, $3)`,
        [instanceId, stepId, escalatedToId],
      );

      return result.rows[0];
    } catch (error) {
      logger.error({ err: error }, 'Error escalating step');
      throw new AppError(500, 'Erro ao escalar etapa');
    }
  }

  async getWorkflowStatus(instanceId: string): Promise<any> {
    try {
      const instance = await pool.query(
        `SELECT * FROM workflow_instances WHERE id = $1`,
        [instanceId],
      );

      if (instance.rows.length === 0) {
        throw new AppError(404, 'Instância de workflow não encontrada');
      }

      const approvals = await pool.query(
        `SELECT * FROM workflow_approvals WHERE workflow_instance_id = $1`,
        [instanceId],
      );

      const auditLog = await pool.query(
        `SELECT * FROM workflow_audit_log WHERE workflow_instance_id = $1
         ORDER BY timestamp DESC`,
        [instanceId],
      );

      const escalations = await pool.query(
        `SELECT * FROM workflow_escalations WHERE workflow_instance_id = $1
         ORDER BY escalated_at DESC`,
        [instanceId],
      );

      return {
        instance: this.mapRowToInstance(instance.rows[0]),
        approvals: approvals.rows.map(row => this.mapRowToApproval(row)),
        auditLog: auditLog.rows,
        escalations: escalations.rows,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ err: error }, 'Error fetching workflow status');
      throw new AppError(500, 'Erro ao buscar status do workflow');
    }
  }

  async getPendingApprovals(userId: string): Promise<WorkflowApproval[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM workflow_approvals
         WHERE approver_id = $1 AND status = 'pending'
         ORDER BY created_at DESC`,
        [userId],
      );

      return result.rows.map(row => this.mapRowToApproval(row));
    } catch (error) {
      logger.error({ err: error }, 'Error fetching pending approvals');
      throw new AppError(500, 'Erro ao buscar aprovações pendentes');
    }
  }

  private async moveToNextStep(instanceId: string, currentStepId: string): Promise<void> {
    try {
      // Get current step order
      const currentStep = await pool.query(
        `SELECT workflow_template_id, step_order FROM workflow_steps WHERE id = $1`,
        [currentStepId],
      );

      if (currentStep.rows.length === 0) return;

      const { workflow_template_id, step_order } = currentStep.rows[0];

      // Get next step
      const nextStep = await pool.query(
        `SELECT id FROM workflow_steps
         WHERE workflow_template_id = $1 AND step_order > $2
         ORDER BY step_order ASC LIMIT 1`,
        [workflow_template_id, step_order],
      );

      if (nextStep.rows.length === 0) {
        // No more steps - workflow is complete
        await pool.query(
          `UPDATE workflow_instances SET status = 'approved', completed_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [instanceId],
        );
      } else {
        // Move to next step
        const nextStepId = nextStep.rows[0].id;
        await pool.query(
          `UPDATE workflow_instances SET current_step_id = $2 WHERE id = $1`,
          [instanceId, nextStepId],
        );

        // Create approvals for next step
        await this.createApprovalsForStep(instanceId, nextStepId);

        // Send notifications
        await this.notifyApprovers(instanceId, nextStepId);
      }
    } catch (error) {
      logger.error({ err: error }, 'Error moving to next step');
    }
  }

  private async createApprovalsForStep(instanceId: string, stepId: string): Promise<void> {
    try {
      const step = await pool.query(
        `SELECT approver_id, approver_role FROM workflow_steps WHERE id = $1`,
        [stepId],
      );

      if (step.rows.length === 0) return;

      const { approver_id, approver_role } = step.rows[0];

      if (approver_id) {
        await pool.query(
          `INSERT INTO workflow_approvals (workflow_instance_id, step_id, approver_id)
           VALUES ($1, $2, $3)`,
          [instanceId, stepId, approver_id],
        );
      } else if (approver_role) {
        // Find users with this role
        const users = await pool.query(
          `SELECT id FROM users WHERE role = $1`,
          [approver_role],
        );

        for (const user of users.rows) {
          await pool.query(
            `INSERT INTO workflow_approvals (workflow_instance_id, step_id, approver_id)
             VALUES ($1, $2, $3)`,
            [instanceId, stepId, user.id],
          );
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Error creating approvals');
    }
  }

  private async notifyApprovers(instanceId: string, stepId: string): Promise<void> {
    try {
      const approvals = await pool.query(
        `SELECT approver_id FROM workflow_approvals
         WHERE workflow_instance_id = $1 AND step_id = $2`,
        [instanceId, stepId],
      );

      for (const approval of approvals.rows) {
        await pool.query(
          `INSERT INTO workflow_notifications (workflow_instance_id, recipient_id, notification_type)
           VALUES ($1, $2, 'approval_request')`,
          [instanceId, approval.approver_id],
        );
      }
    } catch (error) {
      logger.debug({ err: error }, 'Error notifying approvers');
    }
  }

  private mapRowToTemplate(row: any): WorkflowTemplate {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      triggerType: row.trigger_type,
      isActive: row.is_active,
      templateVersion: row.template_version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapRowToStep(row: any): WorkflowStep {
    return {
      id: row.id,
      workflowTemplateId: row.workflow_template_id,
      stepOrder: row.step_order,
      stepType: row.step_type,
      title: row.title,
      description: row.description,
      approverId: row.approver_id,
      approverRole: row.approver_role,
      timeoutDays: row.timeout_days,
      autoApproveOnTimeout: row.auto_approve_on_timeout,
      conditions: typeof row.conditions === 'string' ? JSON.parse(row.conditions) : row.conditions,
      actions: typeof row.actions === 'string' ? JSON.parse(row.actions) : row.actions,
      createdAt: new Date(row.created_at),
    };
  }

  private mapRowToInstance(row: any): WorkflowInstance {
    return {
      id: row.id,
      workflowTemplateId: row.workflow_template_id,
      caseId: row.case_id,
      userId: row.user_id,
      status: row.status,
      currentStepId: row.current_step_id,
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      rejectedAt: row.rejected_at ? new Date(row.rejected_at) : undefined,
      rejectionReason: row.rejection_reason,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
    };
  }

  private mapRowToApproval(row: any): WorkflowApproval {
    return {
      id: row.id,
      workflowInstanceId: row.workflow_instance_id,
      stepId: row.step_id,
      approverId: row.approver_id,
      status: row.status,
      comment: row.comment,
      decisionAt: row.decision_at ? new Date(row.decision_at) : undefined,
      createdAt: new Date(row.created_at),
    };
  }

  async getTemplatesByUser(userId: string): Promise<WorkflowTemplate[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM workflow_templates WHERE user_id = $1 ORDER BY updated_at DESC`,
        [userId],
      );

      return result.rows.map(row => this.mapRowToTemplate(row));
    } catch (error) {
      logger.error({ err: error }, 'Error fetching user templates');
      throw new AppError(500, 'Erro ao buscar modelos de workflow');
    }
  }

  async updateTemplate(
    templateId: string,
    userId: string,
    updates: { name?: string; description?: string; isActive?: boolean },
  ): Promise<WorkflowTemplate> {
    try {
      logger.info(`Updating workflow template ${templateId}`);

      const result = await pool.query(
        `UPDATE workflow_templates
         SET
           name = COALESCE($2, name),
           description = COALESCE($3, description),
           is_active = COALESCE($4, is_active),
           template_version = template_version + 1
         WHERE id = $1 AND user_id = $5
         RETURNING *`,
        [
          templateId,
          updates.name || null,
          updates.description || null,
          updates.isActive !== undefined ? updates.isActive : null,
          userId,
        ],
      );

      if (result.rows.length === 0) {
        throw new AppError(404, 'Modelo de workflow não encontrado');
      }

      return this.mapRowToTemplate(result.rows[0]);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ err: error }, 'Error updating template');
      throw new AppError(500, 'Erro ao atualizar modelo');
    }
  }
}

export const workflowService = new WorkflowService();
