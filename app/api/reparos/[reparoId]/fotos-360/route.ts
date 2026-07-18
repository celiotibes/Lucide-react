import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';

interface Foto360 {
  id: string;
  url_foto: string;
  comodo: string;
  angulo_horizontal: number;
  angulo_vertical: number;
  data_captura: string;
}

export async function GET(
  request: NextRequest,
  context: any
) {
  try {
    const { reparoId } = await context.params;
    const pool = obterPool();

    const result = await pool.query<Foto360>(
      `select
        id,
        url_foto,
        meta_dados->>'comodo' as comodo,
        cast(meta_dados->>'angulo_horizontal' as numeric) as angulo_horizontal,
        cast(meta_dados->>'angulo_vertical' as numeric) as angulo_vertical,
        data_upload as data_captura
       from fotos_reparo
       where reparo_id = $1 and tipo = '360'
       order by data_upload asc`,
      [reparoId]
    );

    return NextResponse.json({
      success: true,
      fotos: result.rows,
      total: result.rows.length,
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro ao buscar fotos 360:', mensagem);
    return NextResponse.json(
      { error: mensagem, success: false },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: any
) {
  try {
    const { reparoId } = await context.params;
    const { frames, comodo, angulo_horizontal, angulo_vertical } = await request.json();

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return NextResponse.json(
        { error: 'Frames de panorama são obrigatórios' },
        { status: 400 }
      );
    }

    const pool = obterPool();

    // Validar que reparo existe
    const reparoCheck = await pool.query(
      'select id from reparos_vistoria where id = $1',
      [reparoId]
    );

    if (reparoCheck.rows.length === 0) {
      return NextResponse.json(
        { error: 'Reparo não encontrado' },
        { status: 404 }
      );
    }

    // Processar frames panorâmicos
    // Em produção, integrar com serviço de stitch de imagens
    const panoramaUrl = `/api/reparos/${reparoId}/panoramas/${Date.now()}`;

    const { randomUUID } = await import('crypto');
    const fotoId = randomUUID();

    // Registrar panorama no banco de dados
    const fotoResult = await pool.query(
      `insert into fotos_reparo (id, reparo_id, url_foto, tipo, data_upload, meta_dados)
       values ($1, $2, $3, $4, now(), $5)
       returning id, url_foto, data_upload`,
      [
        fotoId,
        reparoId,
        panoramaUrl,
        '360',
        JSON.stringify({
          comodo: comodo || 'geral',
          angulo_horizontal: angulo_horizontal || 360,
          angulo_vertical: angulo_vertical || 180,
          totalFrames: frames.length,
          procesadoEm: new Date().toISOString(),
        }),
      ]
    );

    return NextResponse.json(
      {
        success: true,
        foto: fotoResult.rows[0],
        message: 'Panorama criado com sucesso',
      },
      { status: 201 }
    );
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro ao criar panorama 360:', mensagem);
    return NextResponse.json(
      { error: mensagem, success: false },
      { status: 500 }
    );
  }
}
