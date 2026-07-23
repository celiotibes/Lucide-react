import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';

export async function GET(request: NextRequest) {
  try {
    const pool = obterPool();
    const { rows } = await pool.query(`
      select id, nome, cpf_cnpj, email, telefone, endereco, criado_em
      from pessoas
      order by nome
    `);
    return NextResponse.json(rows);
  } catch (erro) {
    console.error('Erro ao buscar pessoas:', erro);
    return NextResponse.json({ erro: 'Erro ao buscar pessoas' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { nome, cpf_cnpj, email, telefone, endereco, papeis } = await request.json();

    if (!nome) {
      return NextResponse.json(
        { erro: 'Nome é obrigatório' },
        { status: 400 }
      );
    }

    const pool = obterPool();

    const { rows: pessoaRows } = await pool.query(
      `insert into pessoas (nome, cpf_cnpj, email, telefone, endereco)
       values ($1, $2, $3, $4, $5)
       returning id, nome, cpf_cnpj, email, telefone, endereco, criado_em`,
      [nome, cpf_cnpj || null, email || null, telefone || null, endereco || null]
    );

    const pessoa = pessoaRows[0];

    if (papeis && Array.isArray(papeis) && papeis.length > 0) {
      for (const papel of papeis) {
        await pool.query(
          `insert into pessoa_papeis (pessoa_id, papel)
           values ($1, $2)
           on conflict do nothing`,
          [pessoa.id, papel]
        );
      }
    }

    return NextResponse.json(pessoa, { status: 201 });
  } catch (erro: any) {
    console.error('Erro ao criar pessoa:', erro);
    if (erro.code === '23505') {
      return NextResponse.json(
        { erro: 'CPF/CNPJ já cadastrado' },
        { status: 409 }
      );
    }
    return NextResponse.json({ erro: 'Erro ao criar pessoa' }, { status: 500 });
  }
}
