import { obterPool } from '@/server/integracao/db';
import { formatarMoeda, formatarData } from '@/lib/formatacao';
import { calcularPatrimonioLiquidoDoPortfolio } from '@/server/integracao/patrimonioImoveis';
import { quitarFinanciamento } from './actions';
import { FormularioAvaliacao } from './FormularioAvaliacao';
import { FormularioFinanciamento } from './FormularioFinanciamento';

export const dynamic = 'force-dynamic';

interface Imovel {
  id: string;
  identificacao: string;
  endereco: string | null;
  valor_avaliacao: string | null;
}

interface Financiamento {
  id: string;
  imovel_id: string;
  tipo: string;
  instituicao: string | null;
  valor_parcela: string;
  saldo_devedor: string | null;
  data_inicio: string | null;
}

const RUBRICA_TIPO_FINANCIAMENTO: Record<string, string> = {
  financiamento_bancario: 'Financiamento bancário',
  consorcio_hipoteca: 'Consórcio com hipoteca',
};

async function buscarImoveis(): Promise<Imovel[]> {
  const pool = obterPool();
  const { rows } = await pool.query<Imovel>(`select id, identificacao, endereco, valor_avaliacao from imoveis order by identificacao`);
  return rows;
}

async function buscarFinanciamentosAtivos(): Promise<Financiamento[]> {
  const pool = obterPool();
  const { rows } = await pool.query<Financiamento>(
    `select id, imovel_id, tipo, instituicao, valor_parcela, saldo_devedor, data_inicio
     from financiamentos_imoveis where status = 'ativo' order by criado_em`,
  );
  return rows;
}

export default async function PaginaPatrimonio() {
  let imoveis: Imovel[] = [];
  let financiamentos: Financiamento[] = [];
  let erro: string | null = null;

  try {
    [imoveis, financiamentos] = await Promise.all([buscarImoveis(), buscarFinanciamentosAtivos()]);
  } catch {
    erro = 'Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).';
  }

  if (erro) {
    return (
      <>
        <h2>Patrimônio</h2>
        <p className="erro-conexao">{erro}</p>
      </>
    );
  }

  const pool = obterPool();
  const consolidado = await calcularPatrimonioLiquidoDoPortfolio(pool);

  return (
    <>
      <h2>Patrimônio</h2>
      <p>
        Financiamento/hipoteca por imóvel, patrimônio líquido (valor de avaliação − saldo devedor) e a despesa fixa mensal
        recorrente que as parcelas representam para o negócio como um todo.
      </p>

      <div className="resumo-cards">
        <div className="card-resumo">
          <span className="rotulo">Patrimônio líquido consolidado</span>
          <span className="valor">{formatarMoeda(consolidado.patrimonioLiquidoConsolidado)}</span>
          {consolidado.imoveisSemAvaliacao > 0 && (
            <span className="aviso-pequeno">
              {consolidado.imoveisSemAvaliacao} imóve{consolidado.imoveisSemAvaliacao > 1 ? 'is' : 'l'} sem valor de avaliação — não
              {consolidado.imoveisSemAvaliacao > 1 ? ' entram' : ' entra'} nesta soma
            </span>
          )}
        </div>
        <div className="card-resumo">
          <span className="rotulo">Despesa fixa mensal (parcelas)</span>
          <span className="valor">{formatarMoeda(consolidado.despesaFixaMensalTotal)}</span>
        </div>
      </div>

      <h3>Imóveis</h3>
      {imoveis.length === 0 ? (
        <p className="vazio">Nenhum imóvel cadastrado.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Imóvel</th>
              <th>Valor de avaliação</th>
              <th>Financiamentos ativos</th>
              <th>Patrimônio líquido</th>
            </tr>
          </thead>
          <tbody>
            {imoveis.map((imovel) => {
              const financiamentosDoImovel = financiamentos.filter((f) => f.imovel_id === imovel.id);
              const linha = consolidado.imoveis.find((r) => r.imovelId === imovel.id);
              return (
                <tr key={imovel.id}>
                  <td>
                    <strong>{imovel.identificacao}</strong>
                    {imovel.endereco && <div className="linha-do-tempo-data">{imovel.endereco}</div>}
                  </td>
                  <td>
                    <FormularioAvaliacao imovelId={imovel.id} valorAtual={imovel.valor_avaliacao} />
                  </td>
                  <td>
                    {financiamentosDoImovel.length === 0 ? (
                      '—'
                    ) : (
                      <ul>
                        {financiamentosDoImovel.map((f) => (
                          <li key={f.id}>
                            {RUBRICA_TIPO_FINANCIAMENTO[f.tipo] ?? f.tipo}
                            {f.instituicao && ` — ${f.instituicao}`}
                            <br />
                            Parcela: {formatarMoeda(f.valor_parcela)}
                            {f.saldo_devedor !== null && ` · Saldo devedor: ${formatarMoeda(f.saldo_devedor)}`}
                            {f.data_inicio && ` · desde ${formatarData(f.data_inicio)}`}
                            <form action={quitarFinanciamento}>
                              <input type="hidden" name="id" value={f.id} />
                              <button type="submit" className="botao-secundario">
                                Marcar quitado
                              </button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className={linha?.patrimonioLiquido !== null && (linha?.patrimonioLiquido ?? 0) < 0 ? 'valor-negativo' : undefined}>
                    {linha?.patrimonioLiquido === null || linha?.patrimonioLiquido === undefined
                      ? 'sem avaliação cadastrada'
                      : formatarMoeda(linha.patrimonioLiquido)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h3>Registrar financiamento/hipoteca</h3>
      {imoveis.length === 0 ? (
        <p className="vazio">Cadastre um imóvel primeiro.</p>
      ) : (
        <FormularioFinanciamento imoveis={imoveis.map((i) => ({ id: i.id, identificacao: i.identificacao }))} />
      )}
    </>
  );
}
