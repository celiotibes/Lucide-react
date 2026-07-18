import { NextRequest, NextResponse } from 'next/server';
import { importarChatWhatsApp, filtrarPorConfianca, agruparPorTipo } from '@/server/vistorias/importador-whatsapp';
import { classificarLoteDanos, agruparPorResponsabilidade } from '@/server/vistorias/classificador-danos';

export async function POST(req: NextRequest) {
  try {
    const { conteudo, formato = 'texto' } = await req.json();

    if (!conteudo || typeof conteudo !== 'string') {
      return NextResponse.json({ error: 'Conteúdo do chat não fornecido' }, { status: 400 });
    }

    // 1. Importar chat WhatsApp
    const importacao = await importarChatWhatsApp(conteudo, formato);

    if (!importacao.sucesso) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: importacao.erro,
        },
        { status: 400 }
      );
    }

    // 2. Filtrar danos por confiança mínima
    const danosConfiáveis = filtrarPorConfianca(importacao.danos, 70);

    if (danosConfiáveis.length === 0) {
      return NextResponse.json({
        sucesso: true,
        totalMensagens: importacao.totalMensagens,
        danosEncontrados: 0,
        danosConfiáveis: 0,
        danos: [],
        avisoAusênciaDanos: 'Nenhum dano com confiança suficiente foi encontrado',
      });
    }

    // 3. Classificar danos com IA
    const descricoes = danosConfiáveis.map((d) => d.danoDescrito);
    const danosClassificados = await classificarLoteDanos(descricoes);

    // 4. Agrupar por responsabilidade
    const agrupadosResponsabilidade = agruparPorResponsabilidade(danosClassificados);
    const agrupadosTipo = agruparPorTipo(danosConfiáveis);

    return NextResponse.json({
      sucesso: true,
      totalMensagens: importacao.totalMensagens,
      danosEncontrados: importacao.dansoEncontrados,
      danosConfiáveis: danosConfiáveis.length,
      danos: danosClassificados.map((d, i) => ({
        ...d,
        confiancaRelato: danosConfiáveis[i]?.confiancaRelato || 0,
        remetente: danosConfiáveis[i]?.remetente,
        dataRelato: danosConfiáveis[i]?.dataRelato,
      })),
      resumo: {
        porResponsabilidade: Object.fromEntries(
          Array.from(agrupadosResponsabilidade.entries()).map(([chave, danos]) => [
            chave,
            {
              quantidade: danos.length,
              severidadeMedia: calcularSeveridadeMedia(danos),
            },
          ])
        ),
        porTipo: Object.fromEntries(
          Array.from(agrupadosTipo.entries()).map(([chave, danos]) => [
            chave,
            danos.length,
          ])
        ),
      },
    });
  } catch (error) {
    console.error('Erro ao importar WhatsApp:', error);
    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : 'Erro ao importar chat',
      },
      { status: 500 }
    );
  }
}

function calcularSeveridadeMedia(danos: any[]): string {
  if (danos.length === 0) return 'indefinida';

  const pesos: Record<string, number> = { leve: 1, média: 2, grave: 3 };
  const media = danos.reduce((acc, d) => acc + (pesos[d.severidade] || 0), 0) / danos.length;

  if (media < 1.5) return 'leve';
  if (media < 2.5) return 'média';
  return 'grave';
}
