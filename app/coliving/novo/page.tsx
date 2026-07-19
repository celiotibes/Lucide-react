import { obterPool } from '@/server/integracao/db';
import { FormularioInteresse, type ImovelColivingOpcao } from './FormularioInteresse';

export const dynamic = 'force-dynamic';

interface LinhaImovelComodo {
  imovel_id: string;
  imovel_identificacao: string;
  comodo_id: string;
  comodo_identificacao: string;
}

async function buscarImoveisColiving(): Promise<ImovelColivingOpcao[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaImovelComodo>(`
    select i.id as imovel_id, i.identificacao as imovel_identificacao,
           c.id as comodo_id, c.identificacao as comodo_identificacao
    from imoveis i
    join comodos c on c.imovel_id = i.id and c.ativo
    where i.permite_coliving
    order by i.identificacao, c.identificacao
  `);

  const porImovel = new Map<string, ImovelColivingOpcao>();
  for (const linha of rows) {
    if (!porImovel.has(linha.imovel_id)) {
      porImovel.set(linha.imovel_id, { id: linha.imovel_id, identificacao: linha.imovel_identificacao, comodos: [] });
    }
    porImovel.get(linha.imovel_id)!.comodos.push({ id: linha.comodo_id, identificacao: linha.comodo_identificacao });
  }
  return Array.from(porImovel.values());
}

export default async function PaginaInteresseColiving() {
  let imoveis: ImovelColivingOpcao[] = [];
  let erro: string | null = null;

  try {
    imoveis = await buscarImoveisColiving();
  } catch {
    erro = 'Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).';
  }

  return (
    <>
      <h2>Triagem de interesse — Coliving</h2>
      {erro ? (
        <p className="erro-conexao">{erro}</p>
      ) : imoveis.length === 0 ? (
        <p className="vazio">Nenhum imóvel disponível para coliving no momento.</p>
      ) : (
        <FormularioInteresse imoveis={imoveis} />
      )}
    </>
  );
}
