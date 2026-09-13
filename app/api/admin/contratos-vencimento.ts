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
    // Always use UTC for date operations to avoid timezone bugs
    const hojeUTC = new Date(Date.now()).toISOString().split('T')[0];
    const proximo30diasUTC = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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
      .lte('data_fim', proximo30diasUTC)
      .gte('data_fim', hojeUTC)
      .order('data_fim', { ascending: true });

    if (error) {
      console.error('Erro ao buscar contratos:', error);
      return NextResponse.json({ erro: error.message }, { status: 500 });
    }

    // Transformar dados
    const contratosFormatados = (contratos || []).map((c: any) => {
      // Use UTC dates for consistent calculations
      const dataFim = new Date(c.data_fim + 'T00:00:00Z');
      const hojeData = new Date(hojeUTC + 'T00:00:00Z');
      const diasAteVencimento = Math.ceil(
        (dataFim.getTime() - hojeData.getTime()) / (1000 * 60 * 60 * 24),
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
