import { obterPool } from '@/server/integracao/db';
import { FormularioContrato } from './FormularioContrato';

export const dynamic = 'force-dynamic';

export default async function PaginaNovoContrato() {
  const pool = obterPool();
  const { rows: imoveis } = await pool.query<{ id: string; identificacao: string }>(
    `select id, identificacao from imoveis where status in ('disponivel', 'vacancia_anunciada') order by identificacao`,
  );

  return (
    <>
      <h2>Novo contrato</h2>
      {imoveis.length === 0 ? (
        <p className="vazio">Nenhum imóvel disponível para locação no momento.</p>
      ) : (
        <FormularioContrato imoveis={imoveis} />
      )}
    </>
  );
}
