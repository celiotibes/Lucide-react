import Link from 'next/link';
import { obterPool } from '@/server/integracao/db';
import { formatarDataHora } from '@/lib/formatacao';

export const dynamic = 'force-dynamic';

interface LinhaModeloContrato {
  id: string;
  nome: string;
  categoria: string;
  versao: number;
  ativo: boolean;
  cidade_nome: string;
  cidade_uf: string;
  atualizado_em: string;
}

const RUBRICA_CATEGORIA: Record<string, string> = {
  geral: 'Geral',
  residencial: 'Residencial',
  comercial: 'Comercial',
};

async function buscarModelos(): Promise<LinhaModeloContrato[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaModeloContrato>(`
    select mc.id, mc.nome, mc.categoria, mc.versao, mc.ativo, mc.atualizado_em,
           c.nome as cidade_nome, c.uf as cidade_uf
    from modelos_contrato mc
    join cidades c on c.id = mc.cidade_id
    order by c.nome, mc.categoria, mc.versao desc
  `);
  return rows;
}

export default async function PaginaModelosContrato() {
  let modelos: LinhaModeloContrato[] = [];
  let erro: string | null = null;

  try {
    modelos = await buscarModelos();
  } catch {
    erro = 'Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).';
  }

  if (erro) {
    return (
      <>
        <h2>Modelos de Contrato</h2>
        <p className="erro-conexao">{erro}</p>
      </>
    );
  }

  return (
    <>
      <div className="cabecalho-lista">
        <h2>Modelos de Contrato ({modelos.length})</h2>
        <Link href="/modelos-contrato/novo" className="botao-link">
          + Novo modelo
        </Link>
      </div>
      <p className="section-hint">
        No máximo um modelo ativo por cidade + categoria — cadastrar um novo modelo para a mesma combinação desativa
        automaticamente o anterior, sem apagar contratos já gerados com ele. Cidades diferentes podem ter categorias
        diferentes ativas ao mesmo tempo (ex.: Curitiba Residencial e Curitiba Comercial).
      </p>
      {modelos.length === 0 ? (
        <p className="vazio">Nenhum modelo de contrato cadastrado ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Cidade</th>
              <th>Categoria</th>
              <th>Nome</th>
              <th>Versão</th>
              <th>Status</th>
              <th>Atualizado em</th>
            </tr>
          </thead>
          <tbody>
            {modelos.map((modelo) => (
              <tr key={modelo.id}>
                <td>
                  {modelo.cidade_nome}/{modelo.cidade_uf}
                </td>
                <td>{RUBRICA_CATEGORIA[modelo.categoria] ?? modelo.categoria}</td>
                <td>{modelo.nome}</td>
                <td>v{modelo.versao}</td>
                <td>
                  <span className={`tag${modelo.ativo ? ' tag--concluido' : ''}`}>{modelo.ativo ? 'Ativo' : 'Substituído'}</span>
                </td>
                <td>{formatarDataHora(modelo.atualizado_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
