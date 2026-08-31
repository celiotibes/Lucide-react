import { obterPool } from '@/server/integracao/db';
import { FormularioModeloContrato } from './FormularioModeloContrato';

export const dynamic = 'force-dynamic';

export default async function PaginaNovoModeloContrato() {
  const pool = obterPool();
  const cidades = await pool.query<{ id: string; nome: string; uf: string }>(`select id, nome, uf from cidades order by nome`);

  return (
    <>
      <h2>Novo modelo de contrato</h2>
      <p className="section-hint">
        HTML/CSS completo (Legal Design/Visual Law) com marcadores <code>{'{{variavel}}'}</code> — ver{' '}
        <code>server/legaldesign/modelos/florianopolis.html</code> para um exemplo pronto de referência.
      </p>
      <FormularioModeloContrato cidades={cidades.rows} />
    </>
  );
}
