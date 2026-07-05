import { query } from '../connection';
import { PetitionModel } from '../models';
import { NotFoundError } from '@utils/errors';

export class PetitionRepository {
  async create(data: Omit<PetitionModel, 'id' | 'created_at' | 'updated_at'>): Promise<PetitionModel> {
    const result = await query(
      `INSERT INTO petitions (
        user_id, process_number, title, type, content,
        tribunal, status, ai_provider, confidence_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        data.user_id,
        data.process_number,
        data.title,
        data.type,
        data.content,
        data.tribunal,
        data.status || 'draft',
        data.ai_provider,
        data.confidence_score,
      ],
    );

    return result.rows[0];
  }

  async findById(id: string): Promise<PetitionModel | null> {
    const result = await query('SELECT * FROM petitions WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async findByUserId(userId: string, limit: number = 50, offset: number = 0): Promise<{ data: PetitionModel[]; total: number }> {
    const resultData = await query(
      'SELECT * FROM petitions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset],
    );

    const resultCount = await query('SELECT COUNT(*) as total FROM petitions WHERE user_id = $1', [
      userId,
    ]);

    return {
      data: resultData.rows,
      total: parseInt(resultCount.rows[0].total),
    };
  }

  async findByProcessNumber(processNumber: string): Promise<PetitionModel[]> {
    const result = await query('SELECT * FROM petitions WHERE process_number = $1 ORDER BY created_at DESC', [
      processNumber,
    ]);
    return result.rows;
  }

  async findByStatus(status: string, limit: number = 50): Promise<PetitionModel[]> {
    const result = await query(
      'SELECT * FROM petitions WHERE status = $1 ORDER BY created_at DESC LIMIT $2',
      [status, limit],
    );
    return result.rows;
  }

  async update(id: string, data: Partial<PetitionModel>): Promise<PetitionModel> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(data)) {
      if (key !== 'id' && key !== 'created_at') {
        updates.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (updates.length === 0) {
      return (await this.findById(id)) as PetitionModel;
    }

    updates.push(`updated_at = $${paramCount}`);
    values.push(new Date());
    values.push(id);

    const result = await query(
      `UPDATE petitions SET ${updates.join(', ')} WHERE id = $${paramCount + 1} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Petition', id);
    }

    return result.rows[0];
  }

  async updateStatus(id: string, status: PetitionModel['status']): Promise<void> {
    await query('UPDATE petitions SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
  }

  async updateValidation(
    id: string,
    score: number,
    issues: string[],
  ): Promise<void> {
    await query(
      'UPDATE petitions SET validation_score = $1, validation_issues = $2, status = $3, updated_at = NOW() WHERE id = $4',
      [score, issues, score >= 75 ? 'validated' : 'needs_revision', id],
    );
  }

  async markAsSigned(id: string, signatureHash: string): Promise<void> {
    await query(
      'UPDATE petitions SET status = $1, signed_at = NOW(), signature_hash = $2, updated_at = NOW() WHERE id = $3',
      ['signed', signatureHash, id],
    );
  }

  async markAsSubmitted(id: string, protocolNumber: string): Promise<void> {
    await query(
      'UPDATE petitions SET status = $1, protocol_number = $2, submitted_at = NOW(), updated_at = NOW() WHERE id = $3',
      ['submitted', protocolNumber, id],
    );
  }

  async markAsError(id: string, errorMessage: string): Promise<void> {
    await query(
      'UPDATE petitions SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3',
      ['error', errorMessage, id],
    );
  }

  async delete(id: string): Promise<void> {
    await query('DELETE FROM petitions WHERE id = $1', [id]);
  }

  async list(limit: number = 50, offset: number = 0): Promise<{ data: PetitionModel[]; total: number }> {
    const resultData = await query(
      'SELECT * FROM petitions ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset],
    );

    const resultCount = await query('SELECT COUNT(*) as total FROM petitions');

    return {
      data: resultData.rows,
      total: parseInt(resultCount.rows[0].total),
    };
  }
}

export const petitionRepository = new PetitionRepository();
