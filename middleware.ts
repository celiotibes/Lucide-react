import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Rotas que requerem autenticação
const PROTECTED_ROUTES = [
  '/contratos',
  '/imoveis',
  '/pessoas',
  '/hospedagens',
  '/portal',
  '/extratos',
  '/conciliacao-bancaria',
  '/configuracoes',
];

export async function middleware(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;

    // Rotas públicas (não requerem autenticação)
    if (pathname === '/' || pathname === '/auth/login' || pathname.startsWith('/auth/')) {
      return NextResponse.next();
    }

    // Verifica se está em rota protegida
    const isProtectedRoute = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));

    if (!isProtectedRoute) {
      return NextResponse.next();
    }

    // Cria cliente Supabase para verificar sessão
    let supabaseResponse = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // Redireciona para login se não está autenticado
      const url = request.nextUrl.clone();
      url.pathname = '/auth/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  } catch (erro) {
    console.error('Erro no middleware:', erro);
    // Em caso de erro, redireciona para login por segurança
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: [
    /*
     * Rota por tudo EXCETO:
     * - _next/static (arquivos estáticos)
     * - _next/image (otimização de imagens)
     * - favicon.ico (favicon)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg).*)',
  ],
};
