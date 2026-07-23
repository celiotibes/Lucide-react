import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pool = obterPool();

    const { rows } = await pool.query(
      `select id, nome, cpf_cnpj, email, telefone, endereco,
              dados_sensiveis_anonimizados, criado_em
       from pessoas where id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ erro: 'Pessoa não encontrada' }, { status: 404 });
    }

    const pessoa = rows[0];

    const { rows: papelRows } = await pool.query(
      `select papel from pessoa_papeis where pessoa_id = $1`,
      [id]
    );

    return NextResponse.json({
      ...pessoa,
      papeis: papelRows.map((r) => r.papel),
    });
  } catch (erro) {
    console.error('Erro ao buscar pessoa:', erro);
    return NextResponse.json({ erro: 'Erro ao buscar pessoa' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { nome, cpf_cnpj, email, telefone, endereco, papeis } = await request.json();

    if (!nome) {
      return NextResponse.json(
        { erro: 'Nome é obrigatório' },
        { status: 400 }
      );
    }

    const pool = obterPool();

    await pool.query(
      `update pessoas
       set nome = $1, cpf_cnpj = $2, email = $3, telefone = $4, endereco = $5
       where id = $6`,
      [nome, cpf_cnpj || null, email || null, telefone || null, endereco || null, id]
    );

    if (papeis && Array.isArray(papeis)) {
      await pool.query(`delete from pessoa_papeis where pessoa_id = $1`, [id]);
      for (const papel of papeis) {
        await pool.query(
          `insert into pessoa_papeis (pessoa_id, papel) values ($1, $2)`,
          [id, papel]
        );
      }
    }

    const { rows } = await pool.query(
      `select id, nome, cpf_cnpj, email, telefone, endereco, criado_em
       from pessoas where id = $1`,
      [id]
    );

    return NextResponse.json(rows[0]);
  } catch (erro: any) {
    console.error('Erro ao atualizar pessoa:', erro);
    if (erro.code === '23505') {
      return NextResponse.json(
        { erro: 'CPF/CNPJ já cadastrado' },
        { status: 409 }
      );
    }
    return NextResponse.json({ erro: 'Erro ao atualizar pessoa' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pool = obterPool();

    const { rows: checkRows } = await pool.query(
      `select count(*) as cnt from contrato_partes where pessoa_id = $1`,
      [id]
    );

    if (checkRows[0].cnt > 0) {
      return NextResponse.json(
        { erro: 'Não é possível deletar pessoa com contratos associados' },
        { status: 409 }
      );
    }

    const { rowCount } = await pool.query(`delete from pessoas where id = $1`, [id]);

    if (rowCount === 0) {
      return NextResponse.json({ erro: 'Pessoa não encontrada' }, { status: 404 });
    }

    return NextResponse.json({ sucesso: true });
  } catch (erro) {
    console.error('Erro ao deletar pessoa:', erro);
    return NextResponse.json({ erro: 'Erro ao deletar pessoa' }, { status: 500 });
  }
}
