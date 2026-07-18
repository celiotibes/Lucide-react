'use server';

import { obterPool } from '@/server/integracao/db';

export interface Foto360 {
  id: string;
  url_foto: string;
  comodo: string;
  angulo_horizontal: number;
  angulo_vertical: number;
  data_captura: string;
}

export async function obterFotos360(reparoId: string): Promise<Foto360[]> {
  try {
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

    return result.rows;
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro ao buscar fotos 360:', mensagem);
    throw new Error(mensagem);
  }
}

export async function criarPanorama(
  reparoId: string,
  frames: Array<{ uri: string }>,
  comodo: string,
  angulo_horizontal: number = 360,
  angulo_vertical: number = 180
): Promise<Foto360> {
  try {
    const pool = obterPool();

    if (!frames || frames.length < 3) {
      throw new Error('Mínimo de 3 frames necessário');
    }

    // Validar que reparo existe
    const reparoCheck = await pool.query(
      'select id from reparos_vistoria where id = $1',
      [reparoId]
    );

    if (reparoCheck.rows.length === 0) {
      throw new Error('Reparo não encontrado');
    }

    const { randomUUID } = await import('crypto');
    const fotoId = randomUUID();
    const panoramaUrl = `/api/reparos/${reparoId}/panoramas/${Date.now()}`;

    const result = await pool.query<Foto360>(
      `insert into fotos_reparo (id, reparo_id, url_foto, tipo, data_upload, meta_dados)
       values ($1, $2, $3, $4, now(), $5)
       returning
        id,
        url_foto,
        meta_dados->>'comodo' as comodo,
        cast(meta_dados->>'angulo_horizontal' as numeric) as angulo_horizontal,
        cast(meta_dados->>'angulo_vertical' as numeric) as angulo_vertical,
        data_upload as data_captura`,
      [
        fotoId,
        reparoId,
        panoramaUrl,
        '360',
        JSON.stringify({
          comodo,
          angulo_horizontal,
          angulo_vertical,
          totalFrames: frames.length,
          processedAt: new Date().toISOString(),
        }),
      ]
    );

    return result.rows[0];
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro ao criar panorama:', mensagem);
    throw new Error(mensagem);
  }
}

export async function apagarFoto360(fotoId: string): Promise<boolean> {
  try {
    const pool = obterPool();

    const result = await pool.query(
      'delete from fotos_reparo where id = $1 and tipo = $2',
      [fotoId, '360']
    );

    return (result.rowCount ?? 0) > 0;
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro ao apagar foto 360:', mensagem);
    throw new Error(mensagem);
  }
}

export async function listarFotos360PorComodo(
  reparoId: string,
  comodo: string
): Promise<Foto360[]> {
  try {
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
       where reparo_id = $1 and tipo = '360' and meta_dados->>'comodo' = $2
       order by data_upload asc`,
      [reparoId, comodo]
    );

    return result.rows;
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro ao listar fotos 360 por cômodo:', mensagem);
    throw new Error(mensagem);
  }
}
