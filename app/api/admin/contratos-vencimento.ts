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

    // Verify user is admin
    const { data: usuarioAdmin } = await supabase
      .from('usuarios')
      .select('papel')
      .eq('id', user.id)
      .single();

    if (!usuarioAdmin || !['admin', 'economista'].includes(usuarioAdmin.papel)) {
      return NextResponse.json({ erro: 'Acesso negado' }, { status: 403 });
    }

    // Query: contratos expirando nos próximos 30 dias
    const hoje = new Date();
    const proximo30dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const { data: contratos, error } = await supabase
      .from('contratos')
      .select(
        `
        id,
        imovel:imovel_id (identificacao),
        data_fim,
        valor_aluguel,
        status,
        notificacao_vencimento_enviada_em,
        contrato_partes (
          pessoa:pessoa_id (nome)
        )
      `,
      )
      .eq('status', 'ativo')
      .lte('data_fim', proximo30dias.toISOString().split('T')[0])
      .gte('data_fim', hoje.toISOString().split('T')[0])
      .order('data_fim', { ascending: true });

    if (error) {
      console.error('Erro ao buscar contratos:', error);
      return NextResponse.json({ erro: error.message }, { status: 500 });
    }

    // Transformar dados
    const contratosFormatados = (contratos || []).map((c: any) => {
      const dataFim = new Date(c.data_fim);
      const diasAteVencimento = Math.ceil(
        (dataFim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24),
      );

      const locatario = c.contrato_partes?.find(
        (p: any) => p.pessoa?.nome,
      )?.pessoa?.nome || 'Sem locatário';

      return {
        id: c.id,
        imovel_identificacao: c.imovel?.identificacao || 'N/A',
        locatario_nome: locatario,
        data_fim: c.data_fim,
        valor_aluguel: c.valor_aluguel,
        diasAteVencimento,
        notificacao_enviada: !!c.notificacao_vencimento_enviada_em,
      };
    });

    return NextResponse.json(contratosFormatados);
  } catch (erro) {
    console.error('Erro ao buscar contratos de vencimento:', erro);
    return NextResponse.json({ erro: 'Erro ao buscar dados' }, { status: 500 });
  }
}
