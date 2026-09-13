import Link from 'next/link';
import { obterPool } from '@/server/integracao/db';
import { formatarData } from '@/lib/formatacao';

export const dynamic = 'force-dynamic';

interface LinhaImovel {
  id: string;
  identificacao: string;
  tipo: string;
  status: string;
  cidade: string;
  residencial: string | null;
  data_desocupacao: string | null;
}

async function buscarImoveis(): Promise<LinhaImovel[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaImovel>(`
    select i.id, i.identificacao, i.tipo, i.status, i.data_desocupacao,
           c.nome as cidade, r.nome as residencial
    from imoveis i
    join cidades c on c.id = i.cidade_id
    left join residenciais r on r.id = i.residencial_id
    order by c.nome, r.nome nulls last, i.identificacao
  `);
  return rows;
}

const RUBRICA_STATUS: Record<string, string> = {
  disponivel: 'Disponível',
  ocupado: 'Ocupado',
  manutencao: 'Em manutenção',
  indisponivel: 'Indisponível',
  vacancia_anunciada: 'Vacância anunciada',
};

export default async function PaginaImoveis() {
  let imoveis: LinhaImovel[] = [];
  let erro: string | null = null;

  try {
    imoveis = await buscarImoveis();
  } catch {
    erro = 'Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).';
  }

  if (erro) {
    return (
      <>
        <h2>Imóveis</h2>
        <p className="erro-conexao">{erro}</p>
      </>
    );
  }

  return (
    <>
      <div className="cabecalho-lista">
        <h2>Imóveis ({imoveis.length})</h2>
        <Link href="/imoveis/novo" className="botao-link">
          + Novo imóvel
        </Link>
      </div>
      {imoveis.length === 0 ? (
        <p className="vazio">Nenhum imóvel cadastrado ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Identificação</th>
              <th>Cidade</th>
              <th>Residencial</th>
              <th>Tipo</th>
              <th>Status</th>
              <th>Desocupado em</th>
            </tr>
          </thead>
          <tbody>
            {imoveis.map((imovel) => (
              <tr key={imovel.id}>
                <td>
                  <Link href={`/imoveis/${imovel.id}`}>{imovel.identificacao}</Link>
                </td>
                <td>{imovel.cidade}</td>
                <td>{imovel.residencial ?? '—'}</td>
                <td>{imovel.tipo}</td>
                <td>
                  <span className="tag">{RUBRICA_STATUS[imovel.status] ?? imovel.status}</span>
                </td>
                <td>{imovel.data_desocupacao ? formatarData(imovel.data_desocupacao) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
