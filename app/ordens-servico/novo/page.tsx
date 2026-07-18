import { obterPool } from '@/server/integracao/db';
import { FormularioSolicitacao } from './FormularioSolicitacao';

export const dynamic = 'force-dynamic';

interface ContratoOpcao {
  id: string;
  imovel: string;
  locatario: string;
}

async function buscarContratosAtivos(): Promise<ContratoOpcao[]> {
  const pool = obterPool();
  const { rows } = await pool.query<ContratoOpcao>(
    `select c.id, i.identificacao as imovel, p.nome as locatario
     from contratos c
     join contrato_partes cp on cp.contrato_id = c.id and cp.papel = 'locatario_principal'
     join imoveis i on i.id = c.imovel_id
     join pessoas p on p.id = cp.pessoa_id
     where c.status = 'ativo'
     order by i.identificacao`,
  );
  return rows;
}

export default async function PaginaNovaSolicitacao() {
  const contratos = await buscarContratosAtivos();

  return (
    <>
      <h2>Nova solicitação</h2>
      {contratos.length === 0 ? (
        <p className="vazio">Nenhum contrato ativo — não há para quem abrir uma solicitação.</p>
      ) : (
        <FormularioSolicitacao contratos={contratos} />
      )}
    </>
  );
}
