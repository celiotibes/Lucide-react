import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { extrairLeituraMedidor, validarLeituraMedidor } from '@/server/vistorias/ocr-medidor';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const arquivo = formData.get('arquivo') as Blob;
    const leituraAnterior = formData.get('leituraAnterior') as string | null;

    if (!arquivo) {
      return NextResponse.json({ error: 'Arquivo não fornecido' }, { status: 400 });
    }

    // Salvar arquivo temporário
    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const caminhoTemp = join(tmpdir(), `ocr-${Date.now()}.jpg`);
    writeFileSync(caminhoTemp, buffer);

    try {
      // Processar OCR
      const resultado = await extrairLeituraMedidor(caminhoTemp);

      if (!resultado.sucesso) {
        return NextResponse.json(
          {
            sucesso: false,
            erro: resultado.erro,
            texoBruto: resultado.texto_bruto,
            confianca: resultado.confianca,
          },
          { status: 400 }
        );
      }

      // Validar leitura
      const leituraAnt = leituraAnterior ? parseInt(leituraAnterior, 10) : undefined;
      const validacao = validarLeituraMedidor(resultado.leitura!, leituraAnt);

      return NextResponse.json({
        sucesso: true,
        leitura: resultado.leitura,
        confianca: resultado.confianca,
        tipoMedidor: resultado.tipo_medidor,
        textoExtraido: resultado.texto_bruto,
        validacao: {
          valida: validacao.valida,
          avisos: validacao.avisos,
        },
      });
    } finally {
      // Limpar arquivo temporário
      try {
        unlinkSync(caminhoTemp);
      } catch (err) {
        console.warn('Erro ao limpar arquivo temporário:', err);
      }
    }
  } catch (error) {
    console.error('Erro ao processar OCR:', error);
    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : 'Erro ao processar OCR',
      },
      { status: 500 }
    );
  }
}
