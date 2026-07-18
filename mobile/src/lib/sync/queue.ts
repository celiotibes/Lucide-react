import { getDatabase } from '../db';
import { v4 as uuidv4 } from 'uuid';

export interface SyncQueueItem {
  id: string;
  tipo: 'vistoria' | 'item' | 'media' | 'anotacao' | 'chave' | 'leitura';
  entidade_id: string;
  acao: 'create' | 'update' | 'delete';
  dados_json: string;
  tentativas: number;
  erro_ultima_tentativa: string | null;
  criado_em: string;
  tentado_em: string | null;
}

export async function adicionarAoSync(
  tipo: SyncQueueItem['tipo'],
  entidade_id: string,
  acao: SyncQueueItem['acao'],
  dados: Record<string, any>
): Promise<string> {
  const db = await getDatabase();
  const id = uuidv4();
  const agora = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO sync_queue (id, tipo, entidade_id, acao, dados_json, criado_em)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, tipo, entidade_id, acao, JSON.stringify(dados), agora]
  );

  return id;
}

export async function obterFilaSync(): Promise<SyncQueueItem[]> {
  const db = await getDatabase();
  const result = await db.getAllAsync<SyncQueueItem>(
    `SELECT * FROM sync_queue ORDER BY criado_em ASC LIMIT 50`
  );
  return result || [];
}

export async function marcarComoSincronizado(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `DELETE FROM sync_queue WHERE id = ?`,
    [id]
  );
}

export async function registrarErroSync(
  id: string,
  erro: string
): Promise<void> {
  const db = await getDatabase();
  const agora = new Date().toISOString();

  await db.runAsync(
    `UPDATE sync_queue
     SET tentativas = tentativas + 1,
         erro_ultima_tentativa = ?,
         tentado_em = ?
     WHERE id = ?`,
    [erro, agora, id]
  );
}

export async function limparFilaSincronizada(): Promise<void> {
  const db = await getDatabase();
  // Remove items que foram sincronizados há mais de 7 dias
  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  await db.runAsync(
    `DELETE FROM sync_queue
     WHERE tentativas > 10 OR (tentado_em < ? AND tentativas > 0)`,
    [seteDiasAtras]
  );
}
