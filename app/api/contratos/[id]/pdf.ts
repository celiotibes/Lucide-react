import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { gerarPdfContrato } from '@/server/documentos/gerarPdfContrato';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: contratoId } = await params;

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 });
    }

    // Buscar contrato
    const { data: contrato, error: erroContrato } = await supabase
      .from('contratos')
      .select(
        `
        id,
        imovel:imovel_id (identificacao),
        data_inicio,
        data_fim,
        valor_aluguel,
        dia_vencimento,
        aviso_previo_dias,
        tipo,
        indice_reajuste,
        status,
        contrato_partes (
          pessoa_id,
          papel,
          pessoa:pessoa_id (nome)
        ),
        garantias (
          tipo,
          valor,
          data_vencimento_apolice
        )
      `,
      )
      .eq('id', contratoId)
      .single();

    if (erroContrato || !contrato) {
      return NextResponse.json({ erro: 'Contrato não encontrado' }, { status: 404 });
    }

    // Verificar permissão: usuário pode baixar se for admin, economista, ou parte do contrato
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('papel')
      .eq('id', user.id)
      .single();

    const eAdmin = usuario?.papel && ['admin', 'economista'].includes(usuario.papel);

    if (!eAdmin) {
      // Verificar se usuário é parte do contrato
      const ehParte = (contrato.contrato_partes || []).some(
        (p: any) => p.pessoa_id === user.id,
      );

      if (!ehParte) {
        return NextResponse.json({ erro: 'Sem permissão para acessar este contrato' }, { status: 403 });
      }
    }

    // Transformar dados para formato de exportação
    const cAny = contrato as any;
    const locatario = cAny.contrato_partes?.find(
      (p: any) => p.papel === 'locatario_principal' && p.pessoa,
    )?.pessoa;
    const fiador = cAny.contrato_partes?.find(
      (p: any) => p.papel === 'fiador' && p.pessoa,
    )?.pessoa;

    const contratoParaExportar = {
      id: cAny.id,
      imovel_identificacao: cAny.imovel?.identificacao || 'N/A',
      locatario_nome: locatario?.nome || 'Sem locatário',
      locador_nome: fiador?.nome || 'Proprietário',
      data_inicio: cAny.data_inicio,
      data_fim: cAny.data_fim,
      valor_aluguel: cAny.valor_aluguel,
      dia_vencimento: cAny.dia_vencimento || 1,
      aviso_previo_dias: cAny.aviso_previo_dias || 30,
      tipo: cAny.tipo,
      indice_reajuste: cAny.indice_reajuste,
      status: cAny.status,
      garantias: cAny.garantias || [],
    };

    // Gerar PDF
    const pdfBuffer = await gerarPdfContrato(contratoParaExportar);

    // Retornar PDF
    const nomeArquivo = `contrato-${contratoParaExportar.imovel_identificacao.replace(/\s+/g, '-')}-${new Date().getTime()}.pdf`;

    return new NextResponse(pdfBuffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (erro) {
    console.error('Erro ao gerar PDF do contrato:', erro);
    return NextResponse.json({ erro: 'Erro ao gerar PDF' }, { status: 500 });
  }
}
