// Central export point for database module
import { Pool } from 'pg';
export { initDatabase, closeDatabase, getConnection, query } from './connection';
export { poolManager } from './poolManager';

// Database type alias for compatibility
export type Database = Pool;
