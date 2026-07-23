import { NextRequest, NextResponse } from 'next/server';
import { registrarHospedagemAirbnb } from '@/server/integracao/registrarHospedagemAirbnb';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      imovelId,
      comodoDid,
      periodoInicio,
      periodoFim,
      diasHospedados,
      valorDiaria,
      plataforma,
      platformaIdExterno,
    } = body;

    if (!imovelId || !periodoInicio || !periodoFim || !diasHospedados || !valorDiaria || !plataforma) {
      return NextResponse.json(
        { erro: 'Parâmetros obrigatórios faltando' },
        { status: 400 }
      );
    }

    const resultado = await registrarHospedagemAirbnb({
      imovelId,
      comodoDid: comodoDid || undefined,
      periodoInicio: new Date(periodoInicio),
      periodoFim: new Date(periodoFim),
      diasHospedados,
      valorDiaria,
      plataforma: plataforma as 'airbnb' | 'booking' | 'outro',
      platformaIdExterno: platformaIdExterno || undefined,
    });

    if (resultado.status === 'erro') {
      return NextResponse.json({ erro: resultado.mensagem }, { status: 400 });
    }

    return NextResponse.json({
      status: resultado.status,
      hospedagemId: resultado.hospedagemId,
      vistoriaEntradaId: resultado.vistoriaEntradaId,
      vistoriaSaidaId: resultado.vistoriaSaidaId,
    });
  } catch (erro) {
    console.error('Erro ao registrar hospedagem:', erro);
    return NextResponse.json(
      { erro: 'Erro ao registrar hospedagem' },
      { status: 500 }
    );
  }
}
