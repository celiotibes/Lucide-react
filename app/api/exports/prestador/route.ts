import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exportarDados, ExportType, ExportFormat } from '@/app/actions/prestador/exportar';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();

    // Validar autenticação
    const { data: user, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    }

    // Validar permissão
    const { data: isAdmin } = await supabase.rpc('fn_eh_admin_ou_economista');
    if (!isAdmin) {
      return NextResponse.json({ erro: 'Sem permissão' }, { status: 403 });
    }

    // Extrair parâmetros
    const searchParams = request.nextUrl.searchParams;
    const type = (searchParams.get('type') || 'fechamentos') as ExportType;
    const format = (searchParams.get('format') || 'csv') as ExportFormat;
    const dataInicio = searchParams.get('dataInicio') || undefined;
    const dataFim = searchParams.get('dataFim') || undefined;
    const prestadorId = searchParams.get('prestadorId') || undefined;

    // Validar parâmetros
    const tiposValidos: ExportType[] = ['fechamentos', 'apontamentos', 'resumo_financeiro', 'adiantamentos'];
    const formatosValidos: ExportFormat[] = ['csv', 'excel', 'pdf'];

    if (!tiposValidos.includes(type)) {
      return NextResponse.json({ erro: 'Tipo inválido' }, { status: 400 });
    }

    if (!formatosValidos.includes(format)) {
      return NextResponse.json({ erro: 'Formato inválido' }, { status: 400 });
    }

    // Executar exportação
    const resultado = await exportarDados({
      type,
      format,
      dataInicio,
      dataFim,
      prestadorId,
    });

    if (!resultado.sucesso) {
      return NextResponse.json({ erro: resultado.erro }, { status: 400 });
    }

    return NextResponse.json({
      sucesso: true,
      url: resultado.url,
      nomeArquivo: resultado.nomearquivo,
    });
  } catch (erro) {
    console.error('Erro ao exportar:', erro);
    return NextResponse.json(
      { erro: erro instanceof Error ? erro.message : 'Erro desconhecido' },
      { status: 500 }
    );
  }
}
