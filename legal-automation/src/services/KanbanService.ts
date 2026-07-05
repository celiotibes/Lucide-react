import db from '@db/connection';
import { logger } from '@utils/logger';

export interface KanbanColumn {
  id: string;
  name: string;
  order: number;
}

export interface KanbanTask {
  id: string;
  caseId: string;
  title: string;
  description?: string;
  columnId: string;
  lawyerId: string;
  clientId: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: Date;
  assignedTo?: string;
  tags?: string[];
  documentsNeeded?: number;
  documentsReceived?: number;
  tribunal?: string;
  createdAt: Date;
  updatedAt: Date;
  position: number;
}

export interface KanbanBoard {
  userId: string;
  columns: KanbanColumn[];
  tasks: KanbanTask[];
}

export class KanbanService {
  private defaultColumns = [
    { id: 'awaiting-docs', name: 'Aguardando Documentos', order: 1 },
    { id: 'under-review', name: 'Em Análise', order: 2 },
    { id: 'ready-to-file', name: 'Pronto para Protocolo', order: 3 },
    { id: 'filed', name: 'Protocolado', order: 4 },
    { id: 'completed', name: 'Concluído', order: 5 },
  ];

  async getBoard(userId: string, filters?: {
    lawyerId?: string;
    tribunal?: string;
    priority?: string;
    clientId?: string;
  }): Promise<KanbanBoard> {
    logger.info(`Obtendo Kanban board para usuário ${userId}`);

    try {
      // Get or create columns for user
      const columnsResult = await db.query(
        `SELECT * FROM kanban_columns WHERE user_id = $1 ORDER BY "order"`,
        [userId],
      );

      let columns = columnsResult.rows;
      if (columns.length === 0) {
        // Create default columns
        columns = await Promise.all(
          this.defaultColumns.map((col) =>
            db.query(
              `INSERT INTO kanban_columns (user_id, id, name, "order")
               VALUES ($1, $2, $3, $4) RETURNING *`,
              [userId, col.id, col.name, col.order],
            ),
          ),
        ).then((results) => results.flatMap((r) => r.rows));
      }

      // Build WHERE clause
      let whereConditions = ['user_id = $1'];
      let queryParams: any[] = [userId];
      let paramCount = 2;

      if (filters?.lawyerId) {
        whereConditions.push(`lawyer_id = $${paramCount}`);
        queryParams.push(filters.lawyerId);
        paramCount++;
      }

      if (filters?.tribunal) {
        whereConditions.push(`tribunal = $${paramCount}`);
        queryParams.push(filters.tribunal);
        paramCount++;
      }

      if (filters?.priority) {
        whereConditions.push(`priority = $${paramCount}`);
        queryParams.push(filters.priority);
        paramCount++;
      }

      if (filters?.clientId) {
        whereConditions.push(`client_id = $${paramCount}`);
        queryParams.push(filters.clientId);
        paramCount++;
      }

      // Get tasks
      const tasksResult = await db.query(
        `SELECT * FROM kanban_tasks WHERE ${whereConditions.join(' AND ')}
         ORDER BY column_id, position`,
        queryParams,
      );

      return {
        userId,
        columns: columns.map((col: any) => ({
          id: col.id,
          name: col.name,
          order: col.order,
        })),
        tasks: tasksResult.rows.map((task: any) => ({
          id: task.id,
          caseId: task.case_id,
          title: task.title,
          description: task.description,
          columnId: task.column_id,
          lawyerId: task.lawyer_id,
          clientId: task.client_id,
          priority: task.priority,
          dueDate: task.due_date ? new Date(task.due_date) : undefined,
          assignedTo: task.assigned_to,
          tags: task.tags || [],
          documentsNeeded: task.documents_needed,
          documentsReceived: task.documents_received,
          tribunal: task.tribunal,
          createdAt: new Date(task.created_at),
          updatedAt: new Date(task.updated_at),
          position: task.position,
        })),
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter Kanban board');
      throw error;
    }
  }

  async createTask(
    userId: string,
    task: Omit<KanbanTask, 'id' | 'createdAt' | 'updatedAt' | 'position'>,
  ): Promise<KanbanTask> {
    logger.info(`Criando tarefa Kanban para caso ${task.caseId}`);

    try {
      // Get current max position in column
      const posResult = await db.query(
        `SELECT MAX(position) as max_pos FROM kanban_tasks WHERE column_id = $1`,
        [task.columnId],
      );

      const position = (posResult.rows[0]?.max_pos || 0) + 1;

      const result = await db.query(
        `INSERT INTO kanban_tasks (
          user_id, case_id, title, description, column_id, lawyer_id, client_id,
          priority, due_date, assigned_to, tags, documents_needed, documents_received,
          tribunal, position
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING *`,
        [
          userId,
          task.caseId,
          task.title,
          task.description,
          task.columnId,
          task.lawyerId,
          task.clientId,
          task.priority,
          task.dueDate,
          task.assignedTo,
          JSON.stringify(task.tags || []),
          task.documentsNeeded || 0,
          task.documentsReceived || 0,
          task.tribunal,
          position,
        ],
      );

      const row = result.rows[0];
      return {
        id: row.id,
        caseId: row.case_id,
        title: row.title,
        description: row.description,
        columnId: row.column_id,
        lawyerId: row.lawyer_id,
        clientId: row.client_id,
        priority: row.priority,
        dueDate: row.due_date ? new Date(row.due_date) : undefined,
        assignedTo: row.assigned_to,
        tags: row.tags || [],
        documentsNeeded: row.documents_needed,
        documentsReceived: row.documents_received,
        tribunal: row.tribunal,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        position: row.position,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao criar tarefa Kanban');
      throw error;
    }
  }

  async moveTask(userId: string, taskId: string, columnId: string, position: number): Promise<KanbanTask> {
    logger.info(`Movendo tarefa ${taskId} para coluna ${columnId}`);

    try {
      // Update task column and position
      const result = await db.query(
        `UPDATE kanban_tasks SET column_id = $1, position = $2, updated_at = NOW()
         WHERE id = $3 AND user_id = $4 RETURNING *`,
        [columnId, position, taskId, userId],
      );

      if (result.rows.length === 0) {
        throw new Error(`Tarefa ${taskId} não encontrada`);
      }

      const row = result.rows[0];
      return {
        id: row.id,
        caseId: row.case_id,
        title: row.title,
        description: row.description,
        columnId: row.column_id,
        lawyerId: row.lawyer_id,
        clientId: row.client_id,
        priority: row.priority,
        dueDate: row.due_date ? new Date(row.due_date) : undefined,
        assignedTo: row.assigned_to,
        tags: row.tags || [],
        documentsNeeded: row.documents_needed,
        documentsReceived: row.documents_received,
        tribunal: row.tribunal,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        position: row.position,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao mover tarefa');
      throw error;
    }
  }

  async updateTask(userId: string, taskId: string, updates: Partial<KanbanTask>): Promise<KanbanTask> {
    logger.info(`Atualizando tarefa ${taskId}`);

    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (updates.title !== undefined) {
        setClauses.push(`title = $${paramCount++}`);
        values.push(updates.title);
      }
      if (updates.description !== undefined) {
        setClauses.push(`description = $${paramCount++}`);
        values.push(updates.description);
      }
      if (updates.priority !== undefined) {
        setClauses.push(`priority = $${paramCount++}`);
        values.push(updates.priority);
      }
      if (updates.dueDate !== undefined) {
        setClauses.push(`due_date = $${paramCount++}`);
        values.push(updates.dueDate);
      }
      if (updates.assignedTo !== undefined) {
        setClauses.push(`assigned_to = $${paramCount++}`);
        values.push(updates.assignedTo);
      }
      if (updates.documentsReceived !== undefined) {
        setClauses.push(`documents_received = $${paramCount++}`);
        values.push(updates.documentsReceived);
      }

      setClauses.push(`updated_at = NOW()`);

      values.push(taskId, userId);

      const result = await db.query(
        `UPDATE kanban_tasks SET ${setClauses.join(', ')}
         WHERE id = $${paramCount} AND user_id = $${paramCount + 1} RETURNING *`,
        values,
      );

      if (result.rows.length === 0) {
        throw new Error(`Tarefa ${taskId} não encontrada`);
      }

      const row = result.rows[0];
      return {
        id: row.id,
        caseId: row.case_id,
        title: row.title,
        description: row.description,
        columnId: row.column_id,
        lawyerId: row.lawyer_id,
        clientId: row.client_id,
        priority: row.priority,
        dueDate: row.due_date ? new Date(row.due_date) : undefined,
        assignedTo: row.assigned_to,
        tags: row.tags || [],
        documentsNeeded: row.documents_needed,
        documentsReceived: row.documents_received,
        tribunal: row.tribunal,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        position: row.position,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao atualizar tarefa');
      throw error;
    }
  }

  async deleteTask(userId: string, taskId: string): Promise<void> {
    logger.info(`Deletando tarefa ${taskId}`);

    try {
      await db.query(`DELETE FROM kanban_tasks WHERE id = $1 AND user_id = $2`, [taskId, userId]);
    } catch (error) {
      logger.error({ err: error }, 'Erro ao deletar tarefa');
      throw error;
    }
  }
}

export const kanbanService = new KanbanService();
