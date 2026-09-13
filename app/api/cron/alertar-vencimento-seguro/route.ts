// Alertar sobre vencimento de seguro-incêndio (60 dias antes)
// Roda diariamente para verificar apólices próximas ao vencimento

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { validarSeguroIncendioContratos } from '@/server/integracao/garantirSeguroIncendio';
import { notificarVencimentoSeguroIncendio } from '@/server/integracao/notificacoes';

export const dynamic = 'force-dynamic';

interface GarantiaVencimento {
  contrato_id: string;
  pessoa_id: string;
  pessoa_nome: string;
  pessoa_email: string;
  imovel_identificacao: string;
  data_vencimento_apolice: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return tratarChamada(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return tratarChamada(request);
}

async function tratarChamada(request: NextRequest): Promise<NextResponse> {
  const segredoEsperado = process.env.CRON_SECRET;
  if (!segredoEsperado) {
    return NextResponse.json({ erro: 'CRON_SECRET não configurado no ambiente.' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${segredoEsperado}`) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const pool = obterPool();

    // Buscar seguro-incêndio que vence em 60 dias
    const { rows: garantias } = await pool.query<GarantiaVencimento>(
      `select
         g.contrato_id,
         cp.pessoa_id,
         p.nome as pessoa_nome,
         p.email as pessoa_email,
         i.identificacao as imovel_identificacao,
         g.data_vencimento_apolice
       from garantias g
       join contratos c on c.id = g.contrato_id
       join contrato_partes cp on cp.contrato_id = c.id and cp.papel = 'locatario_principal'
       join pessoas p on p.id = cp.pessoa_id
       join imoveis i on i.id = c.imovel_id
       where g.tipo = 'seguro_incendio'
         and g.status = 'ativa'
         and g.data_vencimento_apolice is not null
         and g.data_vencimento_apolice > current_date
         and g.data_vencimento_apolice <= current_date + interval '60 days'
         and not exists (
           select 1 from auditoria_emails
           where tipo = 'seguro_vencimento'
             and contrato_id = g.contrato_id
             and enviado_em >= current_date - interval '7 days'
         )`
    );

    const alertasEnviados = [];
    const erros = [];

    for (const garantia of garantias) {
      try {
        if (!garantia.pessoa_email) {
          console.warn(`Contrato ${garantia.contrato_id}: locatário sem email cadastrado`);
          continue;
        }

        const dataVencimento = new Date(garantia.data_vencimento_apolice);
        const dataAtual = new Date();
        const diasAteVencimento = Math.ceil(
          (dataVencimento.getTime() - dataAtual.getTime()) / (1000 * 60 * 60 * 24)
        );

        const resultado = await notificarVencimentoSeguroIncendio(pool, {
          contratoId: garantia.contrato_id,
          pessoaEmail: garantia.pessoa_email,
          pessoaNome: garantia.pessoa_nome,
          imovelIdentificacao: garantia.imovel_identificacao,
          dataVencimento: garantia.data_vencimento_apolice,
          diasAteVencimento,
        });

        alertasEnviados.push({
          contratoId: garantia.contrato_id,
          imovel: garantia.imovel_identificacao,
          email: garantia.pessoa_email,
          diasAteVencimento,
          emailId: resultado.id,
        });
      } catch (erro) {
        erros.push({
          contratoId: garantia.contrato_id,
          imovel: garantia.imovel_identificacao,
          erro: (erro as Error).message,
        });
      }
    }

    return NextResponse.json({
      alertasEnviados: alertasEnviados.length,
      detalhes: alertasEnviados,
      erros: erros.length > 0 ? erros : undefined,
    });
  } catch (erro) {
    console.error('Erro ao processar alertas de seguro:', erro);
    return NextResponse.json({ erro: (erro as Error).message }, { status: 500 });
  }
}
