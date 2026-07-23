// Cron: Alertar sobre faturas em atraso via WhatsApp (diário às 2:00 PM)

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

    // Buscar faturas atrasadas (vencimento há mais de 1 dia, menos de 90 dias)
    const { rows: faturas } = await pool.query<{
      id: string;
      numero_fatura: string;
      valor_bruto: string;
      vencimento: string;
      locatario_nome: string;
      locatario_celular: string;
      dias_atraso: number;
    }>(
      `
      select
        f.id,
        f.numero_fatura,
        f.valor_bruto,
        f.vencimento,
        p.nome as locatario_nome,
        p.celular as locatario_celular,
        floor(extract(epoch from (current_date - f.vencimento)) / 86400)::int as dias_atraso
      from faturas f
      join contratos c on c.id = f.contrato_id
      join contrato_partes cp on cp.contrato_id = c.id and cp.papel = 'locatario_principal'
      join pessoas p on p.id = cp.pessoa_id
      where f.status = 'emitida'
        and f.vencimento < current_date
        and current_date - f.vencimento between '1 day'::interval and '90 days'::interval
        and p.celular is not null
      order by f.vencimento asc
    `
    );

    if (faturas.length === 0) {
      return NextResponse.json({ mensagem: 'Nenhuma fatura em atraso' });
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
          and (tipos_desejados is null or tipos_desejados @> '["alerta_atraso"]')
        limit 1
      `,
        [fatura.locatario_celular]
      );

      // Enviar alerta se preferências permitirem ou se não houver preferência cadastrada
      if (prefs.length === 0 || (prefs.length > 0 && prefs[0].notificacoes_ativas)) {
        // Limitar alertas: não enviar mais de 1x por dia para mesma fatura
        const { rows: alertasRecentes } = await pool.query<{ id: string }>(
          `
          select id from auditoria_whatsapp
          where numero_celular = $1
            and tipo_notificacao = 'alerta_atraso'
            and created_at > now() - interval '24 hours'
          limit 1
        `,
          [fatura.locatario_celular]
        );

        if (alertasRecentes.length === 0) {
          notificacoes.push({
            recipienteNumeroCelular: fatura.locatario_celular,
            destinatarioNome: fatura.locatario_nome,
            tipoNotificacao: 'alerta_atraso' as const,
            conteudo: '',
            dadosRelevantes: {
              numeroFatura: fatura.numero_fatura,
              valor: parseFloat(fatura.valor_bruto),
              diasAtraso: fatura.dias_atraso,
            },
          });
        }
      }
    }

    // Enviar em lote
    const { sucessos, falhas } = await enviarNotificacaoEmLote(pool, notificacoes);

    console.log(`WhatsApp alertas de atraso enviados: ${sucessos} sucessos, ${falhas} falhas`);

    return NextResponse.json({
      sucesso: true,
      faturasEmAtraso: faturas.length,
      alertasEnviados: sucessos,
      alertasComFalha: falhas,
    });
  } catch (erro) {
    console.error('Erro no cron de alertas WhatsApp:', erro);
    return NextResponse.json(
      { erro: (erro as Error).message },
      { status: 500 }
    );
  }
}
