import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enviarEmailVencimento } from '@/server/notificacoes/enviarEmailVencimento';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    // Validar CRON_SECRET
    const authHeader = request.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
    }

    const supabase = await createClient();

    // Query: contratos expirando nos próximos 30 dias
    // Critério: data_fim <= hoje + 30 dias E status = 'ativo'
    // E notificacao_vencimento_enviada_em IS NULL (ainda não notificou)
    const { data: contratos, error } = await supabase
      .from('contratos')
      .select(
        `
        id,
        imovel:imovel_id (identificacao),
        data_fim,
        aviso_previo_dias,
        valor_aluguel,
        status,
        contrato_partes (
          pessoa_id,
          papel,
          pessoa:pessoa_id (nome, email)
        )
      `,
      )
      .eq('status', 'ativo')
      .is('notificacao_vencimento_enviada_em', null)
      .lte('data_fim', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .gte('data_fim', new Date().toISOString().split('T')[0]);

    if (error) {
      console.error('Erro ao buscar contratos:', error);
      return NextResponse.json({ erro: error.message }, { status: 500 });
    }

    if (!contratos || contratos.length === 0) {
      return NextResponse.json({
        mensagem: 'Nenhum contrato para notificar',
        total: 0,
      });
    }

    // Transformar dados para o formato esperado por enviarEmailVencimento
    const contratosFormatados: any[] = [];
    for (const c of contratos || []) {
      const cAny = c as any;
      const locatario = cAny.contrato_partes?.find(
        (p: any) => p.papel === 'locatario_principal' && p.pessoa,
      )?.pessoa;

      if (!locatario) continue;

      const fiador = cAny.contrato_partes?.find(
        (p: any) => p.papel === 'fiador' && p.pessoa,
      )?.pessoa;

      contratosFormatados.push({
        id: cAny.id,
        imovel_identificacao: cAny.imovel?.identificacao || 'N/A',
        locatario_nome: locatario.nome,
        locatario_email: locatario.email,
        locador_nome: fiador?.nome || 'CRMT',
        locador_email: fiador?.email || process.env.SUPORTE_EMAIL || 'suporte@crmt.dev',
        data_fim: cAny.data_fim,
        aviso_previo_dias: cAny.aviso_previo_dias || 30,
        valor_aluguel: cAny.valor_aluguel,
        status: cAny.status,
      });
    }

    if (contratosFormatados.length === 0) {
      return NextResponse.json({
        mensagem: 'Nenhum contrato com locatário para notificar',
        total: 0,
      });
    }

    // Enviar emails
    const resultados = await enviarEmailVencimento(contratosFormatados);

    // Atualizar contratos com timestamp de notificação
    const contratoIdsComSucesso = resultados
      .filter((r) => r.sucesso)
      .map((r) => r.contrato_id);

    if (contratoIdsComSucesso.length > 0) {
      const { error: updateError } = await supabase
        .from('contratos')
        .update({ notificacao_vencimento_enviada_em: new Date().toISOString() })
        .in('id', contratoIdsComSucesso);

      if (updateError) {
        console.error('Erro ao atualizar timestamp de notificação:', updateError);
      }
    }

    return NextResponse.json({
      mensagem: 'Notificações enviadas',
      total: contratosFormatados.length,
      sucesso: resultados.filter((r) => r.sucesso).length,
      falhas: resultados.filter((r) => !r.sucesso).length,
      detalhes: resultados,
    });
  } catch (erro) {
    console.error('Erro no cron de notificações:', erro);
    return NextResponse.json(
      { erro: 'Erro ao processar notificações' },
      { status: 500 },
    );
  }
}
