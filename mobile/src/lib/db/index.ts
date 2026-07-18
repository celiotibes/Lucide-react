import { openDatabaseSync, SQLiteDatabase } from 'expo-sqlite';
import { initializeDatabase } from './schema';

let _db: SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLiteDatabase> {
  if (!_db) {
    _db = openDatabaseSync('vistorias.db');
    await initializeDatabase(_db);
  }
  return _db;
}

export async function closeDatabase() {
  if (_db) {
    await _db.closeAsync();
    _db = null;
  }
}
