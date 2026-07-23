import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const redirectUrl = request.cookies.get('next.url')?.value || next;
      return NextResponse.redirect(new URL(redirectUrl, request.url));
    }
  }

  return NextResponse.redirect(new URL('/auth/login?erro=Código de login inválido', request.url));
}
