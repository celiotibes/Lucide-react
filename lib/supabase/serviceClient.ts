import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

// Cliente Supabase com a service_role key — bypassa RLS, mesmo raciocínio já
// usado para o pool `pg` em server/integracao/db.ts: o back-office
// (app/contratos, app/imoveis, app/faturas) já decidiu em código quem tem
// permissão de fazer o quê, sem depender de sessão de usuário via Supabase
// Auth (não há login wireado para essa área ainda). Necessário
// especificamente para Storage, que não tem equivalente via conexão
// Postgres direta — nunca use este client para nada que deva respeitar RLS
// (para isso, lib/supabase/server.ts ou client.ts, que usam a anon key +
// sessão do usuário).
let clienteServico: SupabaseClient | undefined;

export function criarClienteServico(): SupabaseClient {
  if (!clienteServico) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !chave) {
      throw new Error(
        'NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar configurados ' +
          'para operações de Storage do back-office (upload/leitura de documentos anexados).',
      );
    }
    clienteServico = createSupabaseClient(url, chave, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return clienteServico;
}
