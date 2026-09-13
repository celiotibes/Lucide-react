import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obterPool } from '@/server/integracao/db';
import { formatarMoeda } from '@/lib/formatacao';
import { desativarComodo } from './actions';
import { FormularioComodo } from './FormularioComodo';

export const dynamic = 'force-dynamic';

interface Imovel {
  id: string;
  identificacao: string;
  tipo: string;
  endereco: string | null;
  status: string;
  permite_coliving: boolean;
  cidade: string;
}

interface Comodo {
  id: string;
  identificacao: string;
  area_m2: string | null;
  valor_aluguel_referencia: string | null;
}

const RUBRICA_STATUS: Record<string, string> = {
  disponivel: 'Disponível',
  ocupado: 'Ocupado',
  manutencao: 'Em manutenção',
  indisponivel: 'Indisponível',
  vacancia_anunciada: 'Vacância anunciada',
};

async function buscarImovel(id: string): Promise<Imovel | null> {
  const pool = obterPool();
  const { rows } = await pool.query<Imovel>(
    `select i.id, i.identificacao, i.tipo, i.endereco, i.status, i.permite_coliving, c.nome as cidade
     from imoveis i join cidades c on c.id = i.cidade_id where i.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

async function buscarComodosAtivos(imovelId: string): Promise<Comodo[]> {
  const pool = obterPool();
  const { rows } = await pool.query<Comodo>(
    `select id, identificacao, area_m2, valor_aluguel_referencia from comodos where imovel_id = $1 and ativo order by identificacao`,
    [imovelId],
  );
  return rows;
}

export default async function PaginaDetalheImovel({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let imovel: Imovel | null = null;
  let comodos: Comodo[] = [];
  let erro: string | null = null;

  try {
    [imovel, comodos] = await Promise.all([buscarImovel(id), buscarComodosAtivos(id)]);
  } catch {
    erro = 'Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).';
  }

  if (erro) {
    return <p className="erro-conexao">{erro}</p>;
  }
  if (!imovel) {
    notFound();
  }

  return (
    <>
      <p>
        <Link href="/imoveis">← Voltar</Link>
      </p>
      <h2>{imovel.identificacao}</h2>

      <dl className="ficha">
        <dt>Cidade</dt>
        <dd>{imovel.cidade}</dd>
        <dt>Endereço</dt>
        <dd>{imovel.endereco ?? '—'}</dd>
        <dt>Tipo</dt>
        <dd>{imovel.tipo}</dd>
        <dt>Status</dt>
        <dd>
          <span className="tag">{RUBRICA_STATUS[imovel.status] ?? imovel.status}</span>
        </dd>
        <dt>Permite co-living (locação por cômodo)</dt>
        <dd>{imovel.permite_coliving ? 'Sim' : 'Não'}</dd>
      </dl>

      <h3>Cômodos {imovel.permite_coliving ? `(${comodos.length})` : ''}</h3>
      {!imovel.permite_coliving ? (
        <p className="vazio">
          Este imóvel não permite co-living — cadastrar um cômodo aqui não teria efeito, porque um contrato só pode vincular
          um cômodo quando <code>imoveis.permite_coliving</code> é verdadeiro (trava do banco).
        </p>
      ) : (
        <>
          {comodos.length === 0 ? (
            <p className="vazio">Nenhum cômodo cadastrado ainda.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Identificação</th>
                  <th>Área (m²)</th>
                  <th>Valor de referência</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {comodos.map((c) => (
                  <tr key={c.id}>
                    <td>{c.identificacao}</td>
                    <td>{c.area_m2 ?? '—'}</td>
                    <td>{c.valor_aluguel_referencia ? formatarMoeda(c.valor_aluguel_referencia) : '—'}</td>
                    <td>
                      <form action={desativarComodo}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="imovel_id" value={imovel.id} />
                        <button type="submit" className="botao-secundario">
                          Desativar
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3>Novo cômodo</h3>
          <FormularioComodo imovelId={imovel.id} />
        </>
      )}
    </>
  );
}
