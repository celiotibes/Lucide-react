// Cron: Enviar lembretes de vencimento via WhatsApp (diário às 8:30 AM)

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { enviarNotificacaoEmLote } from '@/server/integracao/whatsappTwilio';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Validar token CRON_SECRET
  const token = request.headers.get('authorization');
  if (token !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
  }

  try {
    const pool = obterPool();

    // Buscar faturas vencendo nos próximos 2-3 dias
    const { rows: faturas } = await pool.query<{
      id: string;
      numero_fatura: string;
      valor_bruto: string;
      vencimento: string;
      locatario_nome: string;
      locatario_celular: string;
    }>(
      `
      select
        f.id,
        f.numero_fatura,
        f.valor_bruto,
        f.vencimento,
        p.nome as locatario_nome,
        p.celular as locatario_celular
      from faturas f
      join contratos c on c.id = f.contrato_id
      join contrato_partes cp on cp.contrato_id = c.id and cp.papel = 'locatario_principal'
      join pessoas p on p.id = cp.pessoa_id
      where f.status = 'emitida'
        and f.vencimento >= current_date
        and f.vencimento <= current_date + interval '3 days'
        and p.celular is not null
      order by f.vencimento asc
    `
    );

    if (faturas.length === 0) {
      return NextResponse.json({ mensagem: 'Nenhuma fatura com vencimento próximo' });
    }

    // Verificar preferências de notificação
    const notificacoes = [];
    for (const fatura of faturas) {
      const { rows: prefs } = await pool.query<{
        notificacoes_ativas: boolean;
      }>(
        `
        select notificacoes_ativas
        from preferencias_notificacao_whatsapp
        where numero_celular = $1
          and (tipos_desejados is null or tipos_desejados @> '["lembrete_pagamento"]')
        limit 1
      `,
        [fatura.locatario_celular]
      );

      // Enviar se preferências permitirem ou se não houver preferência cadastrada
      if (prefs.length === 0 || (prefs.length > 0 && prefs[0].notificacoes_ativas)) {
        notificacoes.push({
          recipienteNumeroCelular: fatura.locatario_celular,
          destinatarioNome: fatura.locatario_nome,
          tipoNotificacao: 'lembrete_pagamento' as const,
          conteudo: '',
          dadosRelevantes: {
            numeroFatura: fatura.numero_fatura,
            valor: parseFloat(fatura.valor_bruto),
            vencimento: new Date(fatura.vencimento).toLocaleDateString('pt-BR'),
          },
        });
      }
    }

    // Enviar em lote
    const { sucessos, falhas } = await enviarNotificacaoEmLote(pool, notificacoes);

    console.log(`WhatsApp lembretes enviados: ${sucessos} sucessos, ${falhas} falhas`);

    return NextResponse.json({
      sucesso: true,
      faturasIdentificadas: faturas.length,
      notificacoesEnviadas: sucessos,
      notificacoesComFalha: falhas,
    });
  } catch (erro) {
    console.error('Erro no cron de lembretes WhatsApp:', erro);
    return NextResponse.json(
      { erro: (erro as Error).message },
      { status: 500 }
    );
  }
}
