import { query } from '../connection';
import { UserModel } from '../models';
import { NotFoundError } from '@utils/errors';

export class UserRepository {
  async create(data: Omit<UserModel, 'id' | 'created_at' | 'updated_at'>): Promise<UserModel> {
    const result = await query(
      `INSERT INTO users (
        email, password_hash, oab_number, oab_state,
        first_name, last_name, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        data.email,
        data.password_hash,
        data.oab_number,
        data.oab_state,
        data.first_name,
        data.last_name,
        data.is_active,
      ],
    );

    return result.rows[0];
  }

  async findById(id: string): Promise<UserModel | null> {
    const result = await query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async findByEmail(email: string): Promise<UserModel | null> {
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0] || null;
  }

  async findByOAB(oabNumber: string, oabState: string): Promise<UserModel | null> {
    const result = await query(
      'SELECT * FROM users WHERE oab_number = $1 AND oab_state = $2',
      [oabNumber, oabState],
    );
    return result.rows[0] || null;
  }

  async update(id: string, data: Partial<UserModel>): Promise<UserModel> {
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
      return (await this.findById(id)) as UserModel;
    }

    updates.push(`updated_at = $${paramCount}`);
    values.push(new Date());
    values.push(id);

    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount + 1} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User', id);
    }

    return result.rows[0];
  }

  async updateCertificate(userId: string, fingerprint: string): Promise<void> {
    await query('UPDATE users SET certificate_fingerprint = $1 WHERE id = $2', [fingerprint, userId]);
  }

  async updateLastLogin(userId: string): Promise<void> {
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [userId]);
  }

  async delete(id: string): Promise<void> {
    await query('DELETE FROM users WHERE id = $1', [id]);
  }

  async list(limit: number = 50, offset: number = 0): Promise<{ data: UserModel[]; total: number }> {
    const resultData = await query(
      'SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset],
    );

    const resultCount = await query('SELECT COUNT(*) as total FROM users');

    return {
      data: resultData.rows,
      total: parseInt(resultCount.rows[0].total),
    };
  }
}

export const userRepository = new UserRepository();
