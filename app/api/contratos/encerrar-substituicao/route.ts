import { NextRequest, NextResponse } from 'next/server';
import { encerrarContratoPorSubstituicao } from '@/server/integracao/encerrarContratoPorSubstituicao';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contratoAntigoId, novoContratoCandidatoId, motivoEncerramento } = body;

    if (!contratoAntigoId || !motivoEncerramento) {
      return NextResponse.json(
        { erro: 'contratoAntigoId e motivoEncerramento são obrigatórios' },
        { status: 400 }
      );
    }

    const resultado = await encerrarContratoPorSubstituicao({
      contratoAntigoId,
      novoContratoCandidatoId,
      motivoEncerramento,
    });

    if (resultado.status === 'erro') {
      return NextResponse.json({ erro: resultado.mensagem }, { status: 400 });
    }

    return NextResponse.json({
      status: resultado.status,
      contratoEncerradoId: resultado.contratoEncerradoId,
      vistoriaIdCriada: resultado.vistoriaIdCriada,
      novoContratoId: resultado.novoContratoId,
    });
  } catch (erro) {
    console.error('Erro ao encerrar contrato:', erro);
    return NextResponse.json(
      { erro: 'Erro ao encerrar contrato' },
      { status: 500 }
    );
  }
}
