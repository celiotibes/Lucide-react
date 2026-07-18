import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const UPLOAD_DIR = path.join(process.cwd(), 'tmp', 'uploads', 'reparos');

async function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureUploadDir();

    const formData = await request.formData();
    const reparoId = formData.get('reparoId') as string;
    const tipo = formData.get('tipo') as string; // antes, durante, depois
    const foto = formData.get('foto') as Blob;

    if (!reparoId || !tipo || !foto) {
      return NextResponse.json(
        { error: 'reparoId, tipo e foto são obrigatórios' },
        { status: 400 }
      );
    }

    if (!['antes', 'durante', 'depois'].includes(tipo)) {
      return NextResponse.json(
        { error: 'Tipo deve ser: antes, durante ou depois' },
        { status: 400 }
      );
    }

    // Validar que reparo existe
    const pool = obterPool();
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

    // Gerar nome único para arquivo
    const fotoId = randomUUID();
    const extension = foto.type.includes('png') ? 'png' : 'jpg';
    const fileName = `${fotoId}.${extension}`;
    const filePath = path.join(UPLOAD_DIR, fileName);

    // Salvar arquivo
    const buffer = Buffer.from(await foto.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    // Registrar no banco de dados
    const fotoResult = await pool.query(
      `insert into fotos_reparo (id, reparo_id, url_foto, tipo, data_upload, meta_dados)
       values ($1, $2, $3, $4, now(), $5)
       returning id, url_foto, tipo, data_upload`,
      [
        fotoId,
        reparoId,
        `/tmp/uploads/reparos/${fileName}`,
        tipo,
        JSON.stringify({
          fileName,
          size: foto.size,
          type: foto.type,
          uploadedAt: new Date().toISOString(),
        }),
      ]
    );

    return NextResponse.json(
      {
        message: 'Foto enviada com sucesso',
        foto: fotoResult.rows[0],
      },
      { status: 201 }
    );
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro ao enviar foto de reparo:', mensagem);
    return NextResponse.json(
      { error: mensagem },
      { status: 500 }
    );
  }
}
