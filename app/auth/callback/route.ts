import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Create/get usuario entry in RLS bridge table
      try {
        const { data: usuarioData, error: usuarioError } = await supabase.rpc('fn_upsert_usuario');

        if (usuarioData && usuarioData.length > 0) {
          const usuario = usuarioData[0];

          // If pessoa_id is null, redirect to setup page
          if (!usuario.pessoa_id) {
            return NextResponse.redirect(new URL('/auth/setup', request.url));
          }
        } else if (usuarioError) {
          console.error('Erro ao criar usuario entry:', usuarioError);
          // Still allow login but go to setup if RLS entry creation failed
          return NextResponse.redirect(new URL('/auth/setup', request.url));
        }
      } catch (err) {
        console.error('Erro ao chamar fn_upsert_usuario:', err);
        // Don't block login on RLS setup failure, but redirect to setup
        return NextResponse.redirect(new URL('/auth/setup', request.url));
      }

      const redirectUrl = request.cookies.get('next.url')?.value || next;
      return NextResponse.redirect(new URL(redirectUrl, request.url));
    }
  }

  return NextResponse.redirect(new URL('/auth/login?erro=Código de login inválido', request.url));
}
