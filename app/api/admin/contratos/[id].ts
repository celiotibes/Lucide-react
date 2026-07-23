import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: contratoId } = await params;

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    }

    // Verificar se é admin
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('papel')
      .eq('id', user.id)
      .single();

    if (!usuario || !['admin', 'economista'].includes(usuario.papel)) {
      return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });
    }

    // Buscar contrato com garantias
    const { data: contrato, error } = await supabase
      .from('contratos')
      .select(
        `
        id,
        imovel:imovel_id (identificacao),
        data_inicio,
        data_fim,
        valor_aluguel,
        dia_vencimento,
        aviso_previo_dias,
        tipo,
        indice_reajuste,
        status,
        contrato_partes (
          papel,
          pessoa:pessoa_id (nome)
        ),
        garantias (
          id,
          tipo,
          valor,
          data_vencimento_apolice,
          status
        )
      `,
      )
      .eq('id', contratoId)
      .single();

    if (error || !contrato) {
      return NextResponse.json({ erro: 'Contrato não encontrado' }, { status: 404 });
    }

    // Transformar dados
    const cAny = contrato as any;
    const locatario = cAny.contrato_partes?.find(
      (p: any) => p.papel === 'locatario_principal' && p.pessoa,
    )?.pessoa;
    const fiador = cAny.contrato_partes?.find(
      (p: any) => p.papel === 'fiador' && p.pessoa,
    )?.pessoa;

    const contratoFormatado = {
      id: cAny.id,
      imovel_identificacao: cAny.imovel?.identificacao || 'N/A',
      locatario_nome: locatario?.nome || 'Sem locatário',
      locador_nome: fiador?.nome || 'Proprietário',
      data_inicio: cAny.data_inicio,
      data_fim: cAny.data_fim,
      valor_aluguel: cAny.valor_aluguel,
      dia_vencimento: cAny.dia_vencimento || 1,
      aviso_previo_dias: cAny.aviso_previo_dias || 30,
      tipo: cAny.tipo,
      indice_reajuste: cAny.indice_reajuste,
      status: cAny.status,
      garantias: cAny.garantias || [],
    };

    return NextResponse.json(contratoFormatado);
  } catch (erro) {
    console.error('Erro ao buscar contrato:', erro);
    return NextResponse.json({ erro: 'Erro ao buscar dados' }, { status: 500 });
  }
}
