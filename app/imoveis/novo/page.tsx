import { obterPool } from '@/server/integracao/db';
import { FormularioImovel } from './FormularioImovel';

export const dynamic = 'force-dynamic';

export default async function PaginaNovoImovel() {
  const pool = obterPool();
  const [cidades, residenciais] = await Promise.all([
    pool.query<{ id: string; nome: string }>(`select id, nome from cidades order by nome`),
    pool.query<{ id: string; nome: string }>(`select id, nome from residenciais order by nome`),
  ]);

  return (
    <>
      <h2>Novo imóvel</h2>
      <FormularioImovel cidades={cidades.rows} residenciais={residenciais.rows} />
    </>
  );
}
