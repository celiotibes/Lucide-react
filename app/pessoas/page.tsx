import Link from 'next/link';
import { obterPool } from '@/server/integracao/db';

export const dynamic = 'force-dynamic';

interface LinhaPessoa {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  email: string | null;
  telefone: string | null;
  criado_em: string;
}

async function buscarPessoas(): Promise<LinhaPessoa[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaPessoa>(`
    select id, nome, cpf_cnpj, email, telefone, criado_em
    from pessoas
    order by nome
  `);
  return rows;
}

export default async function PaginaPessoas() {
  let pessoas: LinhaPessoa[] = [];
  let erro: string | null = null;

  try {
    pessoas = await buscarPessoas();
  } catch {
    erro = 'Não foi possível conectar ao banco.';
  }

  if (erro) {
    return (
      <>
        <div className="cabecalho-lista">
          <h2>Pessoas</h2>
          <Link href="/pessoas/novo" className="botao-link">
            + Nova pessoa
          </Link>
        </div>
        <p className="erro-conexao">{erro}</p>
      </>
    );
  }

  return (
    <>
      <div className="cabecalho-lista">
        <h2>Pessoas ({pessoas.length})</h2>
        <Link href="/pessoas/novo" className="botao-link">
          + Nova pessoa
        </Link>
      </div>

      {pessoas.length === 0 ? (
        <p className="vazio">Nenhuma pessoa cadastrada ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>CPF/CNPJ</th>
              <th>Email</th>
              <th>Telefone</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pessoas.map((p) => (
              <tr key={p.id}>
                <td>{p.nome}</td>
                <td>{p.cpf_cnpj ?? '—'}</td>
                <td>{p.email ?? '—'}</td>
                <td>{p.telefone ?? '—'}</td>
                <td>
                  <Link href={`/pessoas/${p.id}/editar`}>Editar</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
