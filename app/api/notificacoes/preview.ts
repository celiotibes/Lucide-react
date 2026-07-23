import { NextRequest, NextResponse } from 'next/server';
import { enviarEmailVencimento } from '@/server/notificacoes/enviarEmailVencimento';

export async function POST(request: NextRequest) {
  try {
    // Validar autenticação simples via header (desenvolvimento)
    const token = request.headers.get('X-Preview-Token');
    if (token !== process.env.PREVIEW_TOKEN && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();

    // Validar dados obrigatórios
    const {
      locatario_nome,
      locatario_email,
      locador_nome,
      locador_email,
      imovel_identificacao,
      data_fim,
      valor_aluguel,
      aviso_previo_dias = 30,
    } = body;

    if (!locatario_nome || !locatario_email || !imovel_identificacao || !data_fim) {
      return NextResponse.json(
        {
          erro: 'Campos obrigatórios: locatario_nome, locatario_email, imovel_identificacao, data_fim',
        },
        { status: 400 },
      );
    }

    // Enviar email de preview
    const resultados = await enviarEmailVencimento([
      {
        id: 'preview-' + Date.now(),
        imovel_identificacao,
        locatario_nome,
        locatario_email,
        locador_nome,
        locador_email,
        data_fim,
        aviso_previo_dias,
        valor_aluguel: parseFloat(valor_aluguel),
        status: 'ativo',
      },
    ]);

    return NextResponse.json({
      mensagem: 'Email de preview enviado com sucesso',
      resultados,
    });
  } catch (erro) {
    console.error('Erro ao enviar email de preview:', erro);
    return NextResponse.json(
      {
        erro: erro instanceof Error ? erro.message : 'Erro ao processar preview',
      },
      { status: 500 },
    );
  }
}
