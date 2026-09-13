import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
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

    // Buscar contratos
    const { data: contratos, error } = await supabase
      .from('contratos')
      .select(
        `
        id,
        imovel:imovel_id (identificacao),
        data_inicio,
        data_fim,
        valor_aluguel,
        status,
        contrato_partes (
          papel,
          pessoa:pessoa_id (nome)
        )
      `,
      )
      .order('data_inicio', { ascending: false });

    if (error) {
      console.error('Erro ao buscar contratos:', error);
      return NextResponse.json({ erro: error.message }, { status: 500 });
    }

    // Transformar dados
    const contratosFormatados = (contratos || []).map((c: any) => {
      const locatario = c.contrato_partes?.find(
        (p: any) => p.papel === 'locatario_principal' && p.pessoa,
      )?.pessoa;

      return {
        id: c.id,
        imovel_identificacao: c.imovel?.identificacao || 'N/A',
        locatario_nome: locatario?.nome || 'Sem locatário',
        valor_aluguel: c.valor_aluguel,
        data_inicio: c.data_inicio,
        data_fim: c.data_fim,
        status: c.status,
      };
    });

    return NextResponse.json(contratosFormatados);
  } catch (erro) {
    console.error('Erro ao buscar lista de contratos:', erro);
    return NextResponse.json({ erro: 'Erro ao buscar dados' }, { status: 500 });
  }
}
