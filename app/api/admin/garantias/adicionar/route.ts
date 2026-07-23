// API endpoint para adicionar garantias (seguro-incêndio, etc) a um contrato

import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { adicionarSeguroIncendio } from '@/server/integracao/garantirSeguroIncendio';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Validar autenticação
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { contratoId, tipo, apoliceNumero, dataInicio, dataVencimento, valorCobertura } = body;

    if (!contratoId || !tipo || !dataVencimento || !valorCobertura) {
      return NextResponse.json(
        { erro: 'Dados obrigatórios faltando' },
        { status: 400 }
      );
    }

    const pool = obterPool();

    // Validar que o contrato existe
    const { rows: contratos } = await pool.query('select id from contratos where id = $1', [
      contratoId,
    ]);

    if (contratos.length === 0) {
      return NextResponse.json({ erro: 'Contrato não encontrado' }, { status: 404 });
    }

    // Adicionar garantia baseado no tipo
    let resultado: any;

    if (tipo === 'seguro_incendio') {
      resultado = await adicionarSeguroIncendio(pool, {
        contratoId,
        apoliceNumero,
        dataInicio: new Date(dataInicio),
        dataVencimento: new Date(dataVencimento),
        valorCobertura,
      });
    } else {
      // Outras garantias (caução, fiador, seguro-fiança, etc)
      const { rows } = await pool.query<{ id: string }>(
        `insert into garantias (contrato_id, tipo, valor, data_inicio, data_vencimento_apolice, apolice_numero, status)
         values ($1, $2, $3, $4, $5, $6, 'ativa')
         returning id`,
        [
          contratoId,
          tipo,
          valorCobertura,
          new Date(dataInicio).toISOString().split('T')[0],
          new Date(dataVencimento).toISOString().split('T')[0],
          apoliceNumero || null,
        ]
      );

      if (rows.length === 0) {
        throw new Error('Falha ao inserir garantia');
      }

      resultado = { id: rows[0].id };
    }

    return NextResponse.json({
      sucesso: true,
      garantiaId: resultado.id,
    });
  } catch (erro) {
    console.error('Erro ao adicionar garantia:', erro);
    return NextResponse.json(
      { erro: (erro as Error).message },
      { status: 500 }
    );
  }
}
