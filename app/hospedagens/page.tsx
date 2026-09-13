import Link from 'next/link';
import { obterPool } from '@/server/integracao/db';
import { formatarData, formatarMoeda } from '@/lib/formatacao';

export const dynamic = 'force-dynamic';

interface LinhaHospedagem {
  id: string;
  imovel_identificacao: string;
  comodo_identificacao: string | null;
  periodo_inicio: string;
  periodo_fim: string;
  dias_hospedados: number;
  valor_diaria: string;
  receita_total: string;
  plataforma: string;
  data_criacao: string;
}

async function buscarHospedagens(): Promise<LinhaHospedagem[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaHospedagem>(`
    select h.id, i.identificacao as imovel_identificacao,
           co.identificacao as comodo_identificacao,
           h.periodo_inicio, h.periodo_fim, h.dias_hospedados,
           h.valor_diaria, h.receita_total, h.plataforma, h.criado_em as data_criacao
    from airbnb_hospedagens h
    join imoveis i on i.id = h.imovel_id
    left join comodos co on co.id = h.comodo_id
    order by h.periodo_inicio desc
  `);
  return rows;
}

const RUBRICA_PLATAFORMA: Record<string, string> = {
  airbnb: 'Airbnb',
  booking: 'Booking',
  outro: 'Outra',
};

export default async function PaginaHospedagens() {
  let hospedagens: LinhaHospedagem[] = [];
  let erro: string | null = null;

  try {
    hospedagens = await buscarHospedagens();
  } catch {
    erro = 'Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).';
  }

  if (erro) {
    return (
      <>
        <div className="cabecalho-lista">
          <h2>Hospedagens (Airbnb/Booking)</h2>
          <Link href="/hospedagens/novo" className="botao-link">
            + Nova hospedagem
          </Link>
        </div>
        <p className="erro-conexao">{erro}</p>
      </>
    );
  }

  return (
    <>
      <div className="cabecalho-lista">
        <h2>Hospedagens (Airbnb/Booking) ({hospedagens.length})</h2>
        <Link href="/hospedagens/novo" className="botao-link">
          + Nova hospedagem
        </Link>
      </div>

      {hospedagens.length === 0 ? (
        <p className="vazio">Nenhuma hospedagem registrada ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Imóvel</th>
              <th>Quarto</th>
              <th>Período</th>
              <th>Dias</th>
              <th>Diária</th>
              <th>Receita</th>
              <th>Plataforma</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {hospedagens.map((h) => (
              <tr key={h.id}>
                <td>{h.imovel_identificacao}</td>
                <td>{h.comodo_identificacao ?? '(inteiro)'}</td>
                <td>
                  {formatarData(h.periodo_inicio)} a {formatarData(h.periodo_fim)}
                </td>
                <td style={{ textAlign: 'center' }}>{h.dias_hospedados}</td>
                <td>{formatarMoeda(h.valor_diaria)}</td>
                <td style={{ fontWeight: 'bold' }}>{formatarMoeda(h.receita_total)}</td>
                <td>{RUBRICA_PLATAFORMA[h.plataforma] ?? h.plataforma}</td>
                <td>
                  <Link href={`/hospedagens/${h.id}`}>Detalhes</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
