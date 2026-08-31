import Link from 'next/link';
import { obterPool } from '@/server/integracao/db';
import { formatarData, formatarMoeda } from '@/lib/formatacao';

export const dynamic = 'force-dynamic';

interface LinhaContrato {
  id: string;
  tipo: string;
  status: string;
  data_inicio: string;
  data_fim: string | null;
  valor_aluguel: string;
  imovel: string;
  locatario: string | null;
}


async function buscarContratos(): Promise<LinhaContrato[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaContrato>(`
    select c.id, c.tipo, c.status, c.data_inicio, c.data_fim, c.valor_aluguel,
           i.identificacao as imovel,
           p.nome as locatario
    from contratos c
    join imoveis i on i.id = c.imovel_id
    left join contrato_partes cp on cp.contrato_id = c.id and cp.papel = 'locatario_principal'
    left join pessoas p on p.id = cp.pessoa_id
    order by c.status, c.data_inicio desc
  `);
  return rows;
}

const RUBRICA_TIPO: Record<string, string> = {
  locacao_padrao: 'Locação padrão',
  temporada: 'Temporada',
};

const RUBRICA_STATUS: Record<string, string> = {
  ativo: 'Ativo',
  aviso_previo: 'Aviso prévio',
  encerrado: 'Encerrado',
  extrajudicial: 'Extrajudicial',
  em_despejo: 'Em despejo',
};

export default async function PaginaContratos() {
  let contratos: LinhaContrato[] = [];
  let erro: string | null = null;

  try {
    contratos = await buscarContratos();
  } catch {
    erro = 'Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).';
  }

  if (erro) {
    return (
      <>
        <h2>Contratos</h2>
        <p className="erro-conexao">{erro}</p>
      </>
    );
  }

  return (
    <>
      <div className="cabecalho-lista">
        <h2>Contratos ({contratos.length})</h2>
        <Link href="/contratos/novo" className="botao-link">
          + Novo contrato
        </Link>
      </div>
      {contratos.length === 0 ? (
        <p className="vazio">Nenhum contrato cadastrado ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Imóvel</th>
              <th>Locatário</th>
              <th>Tipo</th>
              <th>Início</th>
              <th>Fim</th>
              <th>Aluguel</th>
              <th>Status</th>
              <th>Contrato</th>
            </tr>
          </thead>
          <tbody>
            {contratos.map((contrato) => (
              <tr key={contrato.id}>
                <td>{contrato.imovel}</td>
                <td>{contrato.locatario ?? '—'}</td>
                <td>{RUBRICA_TIPO[contrato.tipo] ?? contrato.tipo}</td>
                <td>{formatarData(contrato.data_inicio)}</td>
                <td>{contrato.data_fim ? formatarData(contrato.data_fim) : '—'}</td>
                <td>{formatarMoeda(contrato.valor_aluguel)}</td>
                <td>
                  <span className="tag">{RUBRICA_STATUS[contrato.status] ?? contrato.status}</span>
                </td>
                <td>
                  <Link href={`/contratos/${contrato.id}/contrato`}>Gerar/ver</Link>
                  {' · '}
                  <Link href={`/contratos/${contrato.id}/editar`}>Editar</Link>
                  {' · '}
                  <Link href={`/contratos/${contrato.id}/documentos`}>Documentos</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
