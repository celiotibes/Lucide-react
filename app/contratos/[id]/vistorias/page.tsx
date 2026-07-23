import Link from 'next/link';
import { obterPool } from '@/server/integracao/db';
import { formatarDataHora } from '@/lib/formatacao';
import { criarVistoria } from './actions';

export const dynamic = 'force-dynamic';

interface LinhaVistoria {
  id: string;
  tipo: string;
  status: string;
  data: string;
}

const RUBRICA_TIPO: Record<string, string> = {
  entrada: 'Entrada',
  periodica: 'Periódica',
  saida: 'Saída',
};

const RUBRICA_STATUS: Record<string, string> = {
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
};

async function buscarVistorias(contratoId: string): Promise<LinhaVistoria[]> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaVistoria>(
    `select id, tipo, status, data from vistorias where contrato_id = $1 order by data desc`,
    [contratoId],
  );
  return rows;
}

export default async function PaginaVistoriasContrato({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let vistorias: LinhaVistoria[] = [];
  let erro: string | null = null;
  try {
    vistorias = await buscarVistorias(id);
  } catch {
    erro = 'Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).';
  }

  if (erro) {
    return (
      <>
        <div className="cabecalho-lista">
          <h2>Vistorias do contrato</h2>
          <Link href={`/contratos/${id}/documentos`} className="botao-secundario">
            ← Voltar
          </Link>
        </div>
        <p className="erro-conexao">{erro}</p>
      </>
    );
  }

  return (
    <>
      <div className="cabecalho-lista">
        <h2>Vistorias do contrato</h2>
        <Link href={`/contratos/${id}/documentos`} className="botao-secundario">
          ← Voltar
        </Link>
      </div>

      <form action={criarVistoria} className="formulario">
        <input type="hidden" name="contrato_id" value={id} />
        <label>
          Nova vistoria
          <select name="tipo" required defaultValue="">
            <option value="" disabled>
              Selecione o tipo
            </option>
            <option value="entrada">Entrada</option>
            <option value="periodica">Periódica</option>
            <option value="saida">Saída</option>
          </select>
        </label>
        <label className="checkbox-area-comum">
          <input type="checkbox" name="eh_area_comum" value="true" />
          ☑️ Vistoria de área comum (sem atribuição específica de quarto)
        </label>
        <button type="submit" className="botao-primario">
          Iniciar vistoria
        </button>
      </form>

      {vistorias.length === 0 ? (
        <p className="vazio">Nenhuma vistoria registrada ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Status</th>
              <th>Data</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vistorias.map((v) => (
              <tr key={v.id}>
                <td>{RUBRICA_TIPO[v.tipo] ?? v.tipo}</td>
                <td>
                  <span className="tag">{RUBRICA_STATUS[v.status] ?? v.status}</span>
                </td>
                <td>{formatarDataHora(v.data)}</td>
                <td>
                  <Link href={`/contratos/${id}/vistorias/${v.id}`}>Abrir</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <style jsx>{`
        .checkbox-area-comum {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 15px;
          padding: 10px;
          background: #f0f8ff;
          border: 1px solid #b3d9ff;
          border-radius: 4px;
          cursor: pointer;
        }

        .checkbox-area-comum input[type='checkbox'] {
          cursor: pointer;
          width: 18px;
          height: 18px;
        }
      `}</style>
    </>
  );
}
