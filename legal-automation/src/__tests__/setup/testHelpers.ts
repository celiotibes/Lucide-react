import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getTestDatabase } from './testDatabase';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  token: string;
  oabNumber: string;
  oabState: string;
}

export const createTestUser = async (overrides?: Partial<TestUser>): Promise<TestUser> => {
  const pool = getTestDatabase();

  const user = {
    email: overrides?.email || `test-${Date.now()}@example.com`,
    password: overrides?.password || 'TestPassword123!',
    oabNumber: overrides?.oabNumber || '123456',
    oabState: overrides?.oabState || 'SP',
    firstName: 'Test',
    lastName: 'User',
  };

  const passwordHash = await bcrypt.hash(user.password, 10);

  const result = await pool.query(
    `INSERT INTO users (email, password_hash, oab_number, oab_state, first_name, last_name, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, email, oab_number, oab_state`,
    [user.email, passwordHash, user.oabNumber, user.oabState, user.firstName, user.lastName, true],
  );

  const testUser = result.rows[0];

  // Create JWT token
  const token = jwt.sign(
    {
      userId: testUser.id,
      email: testUser.email,
      oabNumber: testUser.oab_number,
      oabState: testUser.oab_state,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    process.env.JWT_SECRET || 'default-secret',
    { expiresIn: '24h' },
  );

  return {
    id: testUser.id,
    email: testUser.email,
    password: user.password,
    token,
    oabNumber: testUser.oab_number,
    oabState: testUser.oab_state,
  };
};

export const createTestPetition = async (userId: string, overrides?: any) => {
  const pool = getTestDatabase();

  const petition = {
    user_id: userId,
    process_number: overrides?.processNumber || '0000001-12.2023.8.26.0100',
    tribunal: overrides?.tribunal || 'tjsc',
    title: overrides?.title || 'Test Petition',
    content: overrides?.content || 'Test content',
    status: overrides?.status || 'draft',
  };

  const result = await pool.query(
    `INSERT INTO petitions (user_id, process_number, tribunal, title, content, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, process_number, tribunal, title, content, status, created_at`,
    [petition.user_id, petition.process_number, petition.tribunal, petition.title, petition.content, petition.status],
  );

  return result.rows[0];
};

export const createTestProcess = async (overrides?: any) => {
  const pool = getTestDatabase();

  const process = {
    process_number: overrides?.processNumber || '0000001-12.2023.8.26.0100',
    cnj: overrides?.cnj || '0000001122023082601000',
    tribunal: overrides?.tribunal || 'tjsc',
    status: overrides?.status || 'ativo',
    plaintiff: overrides?.plaintiff || 'Test Plaintiff',
    defendant: overrides?.defendant || 'Test Defendant',
    subject: overrides?.subject || 'Test Subject',
  };

  const result = await pool.query(
    `INSERT INTO processes (process_number, cnj, tribunal, status, plaintiff, defendant, subject)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, process_number, cnj, tribunal, status, plaintiff, defendant, subject`,
    [
      process.process_number,
      process.cnj,
      process.tribunal,
      process.status,
      process.plaintiff,
      process.defendant,
      process.subject,
    ],
  );

  return result.rows[0];
};

export const createAuthHeader = (token: string) => ({
  Authorization: `Bearer ${token}`,
});
