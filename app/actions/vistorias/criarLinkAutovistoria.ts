'use server';

import { obterPool } from '@/server/integracao/db';
import { z } from 'zod';
import crypto from 'crypto';

const CriarLinkSchema = z.object({
  vistoriaId: z.string(),
  contatoInquilino: z.string(), // email ou telefone
  prazoHoras: z.number().default(72),
});

export async function criarLinkAutovistoria(input: z.infer<typeof CriarLinkSchema>) {
  try {
    const validado = CriarLinkSchema.parse(input);
    const pool = obterPool();

    // Verificar se vistoria existe e é periódica (para autovistoria)
    const vistoria = await pool.query(
      `select id, contrato_id, imovel_id from vistorias where id = $1 and modo = 'autovistoria'`,
      [validado.vistoriaId]
    );

    if (vistoria.rows.length === 0) {
      return { error: 'Vistoria não encontrada ou não é autovistoria' };
    }

    // Gerar token seguro para acesso
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + validado.prazoHoras * 60 * 60 * 1000);

    // Armazenar link em magic_links (já existe no ERP)
    await pool.query(
      `insert into magic_links (id, entity_type, entity_id, token, contato, expires_at, created_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        crypto.randomUUID(),
        'autovistoria',
        validado.vistoriaId,
        token,
        validado.contatoInquilino,
        expiresAt,
        new Date().toISOString(),
      ]
    );

    const linkAutovistoria = `/autovistoria/${validado.vistoriaId}?token=${token}`;

    return {
      data: {
        linkAutovistoria,
        token,
        expiresAt: expiresAt.toISOString(),
        urlComQR: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}${linkAutovistoria}`,
      },
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return { error: mensagem };
  }
}
