// Conexão de banco para jobs de backend (cron do n8n chamando uma rota que
// roda este código, ou uma função serverless da Fase 0). Usa `pg` com a
// connection string de service role do Supabase (que ignora RLS, como
// qualquer conexão direta feita com a service_role key) — RLS é a defesa
// para o cliente do portal, não para o backend que já decidiu, em código,
// o que tem permissão de fazer.

import { Pool } from 'pg';

let pool: Pool | undefined;

export function obterPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL não configurada. Defina a connection string do Postgres (Supabase: ' +
          'Settings > Database > Connection string, usando a service role em produção).',
      );
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

export async function encerrarPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
