import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// `cookies()` é assíncrono no Next.js 15 (App Router), então este client
// precisa ser criado com `await createClient()` em cada call site.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chamado a partir de um Server Component sem permissão de
            // escrita em cookies — inofensivo se houver middleware
            // renovando a sessão do usuário.
          }
        },
      },
    },
  );
}
