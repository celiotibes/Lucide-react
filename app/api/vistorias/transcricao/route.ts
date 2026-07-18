import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function POST(request: NextRequest) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY não configurada' },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const mediaId = formData.get('mediaId') as string;
    const audioFile = formData.get('audioFile') as File;

    if (!mediaId || !audioFile) {
      return NextResponse.json(
        { error: 'mediaId e audioFile são obrigatórios' },
        { status: 400 }
      );
    }

    // Upload para OpenAI Whisper API
    const whisperFormData = new FormData();
    whisperFormData.append('file', audioFile);
    whisperFormData.append('model', 'whisper-1');
    whisperFormData.append('language', 'pt');

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: whisperFormData,
    });

    if (!whisperResponse.ok) {
      const erro = await whisperResponse.json();
      return NextResponse.json(
        { error: `Erro do Whisper: ${erro.error?.message}` },
        { status: whisperResponse.status }
      );
    }

    const resultado = await whisperResponse.json();
    const transcricao = resultado.text;

    // Atualizar banco com transcricao
    const pool = obterPool();
    await pool.query(
      `UPDATE itens_vistoria
       SET transcricao_audio = $1, updated_at = $2
       WHERE id = $3`,
      [transcricao, new Date().toISOString(), mediaId]
    );

    return NextResponse.json({
      data: {
        transcricao,
        mediaId,
      },
    });
  } catch (erro) {
    console.error('Erro ao transcrever áudio:', erro);
    return NextResponse.json(
      {
        error: erro instanceof Error ? erro.message : 'Erro ao transcrever áudio',
      },
      { status: 500 }
    );
  }
}
