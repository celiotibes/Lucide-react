import Link from 'next/link';
import { notFound } from 'next/navigation';
import { obterPool } from '@/server/integracao/db';
import { formatarMoeda, formatarData } from '@/lib/formatacao';
import type { DadosContratoExtraidos } from '@/server/documentos/extrairDadosContrato';
import { aprovarExtracao, rejeitarExtracao } from './actions';

export const dynamic = 'force-dynamic';

interface LinhaExtracao {
  id: string;
  status: string;
  erro_ia: string | null;
  dados_extraidos: DadosContratoExtraidos | null;
  criado_em: string;
}

interface LinhaContrato {
  valor_aluguel: string;
  indice_reajuste: string | null;
  data_inicio: string;
  data_fim: string | null;
  dia_vencimento: number | null;
}

async function buscarExtracao(documentoId: string): Promise<LinhaExtracao | null> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaExtracao>(
    `select id, status, erro_ia, dados_extraidos, criado_em
     from extracoes_documento_ia
     where documento_id = $1
     order by criado_em desc
     limit 1`,
    [documentoId],
  );
  return rows[0] ?? null;
}

async function buscarContrato(contratoId: string): Promise<LinhaContrato | null> {
  const pool = obterPool();
  const { rows } = await pool.query<LinhaContrato>(
    `select valor_aluguel, indice_reajuste, data_inicio, data_fim, dia_vencimento from contratos where id = $1`,
    [contratoId],
  );
  return rows[0] ?? null;
}

async function buscarValorCaucaoAtual(contratoId: string): Promise<number | null> {
  const pool = obterPool();
  const { rows } = await pool.query<{ valor: string }>(
    `select valor from garantias where contrato_id = $1 and tipo = 'caucao' order by criado_em desc limit 1`,
    [contratoId],
  );
  return rows[0] ? Number(rows[0].valor) : null;
}

const RUBRICA_TIPO_CUSTO: Record<string, string> = {
  comodato_moveis: 'Comodato de móveis',
  vaga_garagem: 'Vaga de garagem',
  iptu_repassado: 'IPTU repassado',
  condominio_repassado: 'Condomínio repassado',
  taxa_lixo_repassada: 'Taxa de lixo repassada',
  taxa_bombeiros_repassada: 'Taxa de bombeiros repassada',
  outro: 'Outro',
};

export default async function PaginaRevisaoExtracao({
  params,
}: {
  params: Promise<{ id: string; documentoId: string }>;
}) {
  const { id: contratoId, documentoId } = await params;

  let extracao: LinhaExtracao | null;
  try {
    extracao = await buscarExtracao(documentoId);
  } catch {
    return (
      <>
        <div className="cabecalho-lista">
          <h2>Revisão da leitura por IA</h2>
          <Link href={`/contratos/${contratoId}/documentos`} className="botao-secundario">
            ← Voltar
          </Link>
        </div>
        <p className="erro-conexao">Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).</p>
      </>
    );
  }
  if (!extracao) {
    notFound();
  }

  if (extracao.status === 'falhou') {
    return (
      <>
        <div className="cabecalho-lista">
          <h2>Revisão da leitura por IA</h2>
          <Link href={`/contratos/${contratoId}/documentos`} className="botao-secundario">
            ← Voltar
          </Link>
        </div>
        <p className="erro-conexao">A leitura por IA falhou: {extracao.erro_ia ?? 'erro desconhecido'}</p>
      </>
    );
  }

  if (extracao.status !== 'pendente_revisao') {
    return (
      <>
        <div className="cabecalho-lista">
          <h2>Revisão da leitura por IA</h2>
          <Link href={`/contratos/${contratoId}/documentos`} className="botao-secundario">
            ← Voltar
          </Link>
        </div>
        <p className="section-hint">
          Esta extração já foi revisada (status: <strong>{extracao.status}</strong>).
        </p>
      </>
    );
  }

  const dados = extracao.dados_extraidos;
  if (!dados) {
    notFound();
  }

  const [contrato, valorCaucaoAtual] = await Promise.all([
    buscarContrato(contratoId),
    buscarValorCaucaoAtual(contratoId),
  ]);
  if (!contrato) {
    notFound();
  }

  return (
    <>
      <div className="cabecalho-lista">
        <h2>Revisão da leitura por IA</h2>
        <Link href={`/contratos/${contratoId}/documentos`} className="botao-secundario">
          ← Voltar
        </Link>
      </div>
      <p className="section-hint">
        A IA leu o documento e propôs os valores abaixo. Marque só os campos que você confirma estarem corretos —
        eles serão gravados no contrato. Campos não marcados permanecem como estão hoje.
      </p>

      {dados.observacoes && (
        <p className="section-hint">
          <strong>Observações da IA:</strong> {dados.observacoes}
        </p>
      )}

      <form action={aprovarExtracao}>
        <input type="hidden" name="extracao_id" value={extracao.id} />
        <input type="hidden" name="contrato_id" value={contratoId} />

        <table>
          <thead>
            <tr>
              <th>Campo</th>
              <th>Valor extraído pela IA</th>
              <th>Valor atual no contrato</th>
              <th>Aplicar</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Valor do aluguel</td>
              <td>{dados.valorAluguel != null ? formatarMoeda(dados.valorAluguel) : '—'}</td>
              <td>{formatarMoeda(contrato.valor_aluguel)}</td>
              <td>
                <input type="checkbox" name="aplicar_valorAluguel" disabled={dados.valorAluguel == null} />
              </td>
            </tr>
            <tr>
              <td>Caução</td>
              <td>{dados.valorCaucao != null ? formatarMoeda(dados.valorCaucao) : '—'}</td>
              <td>{valorCaucaoAtual != null ? formatarMoeda(valorCaucaoAtual) : '— (sem garantia cadastrada)'}</td>
              <td>
                <input type="checkbox" name="aplicar_valorCaucao" disabled={dados.valorCaucao == null} />
              </td>
            </tr>
            <tr>
              <td>Índice de reajuste</td>
              <td>{dados.indiceReajuste ?? '—'}</td>
              <td>{contrato.indice_reajuste ?? '—'}</td>
              <td>
                <input type="checkbox" name="aplicar_indiceReajuste" disabled={!dados.indiceReajuste} />
              </td>
            </tr>
            <tr>
              <td>Data de início</td>
              <td>{dados.dataInicio ?? '—'}</td>
              <td>{formatarData(contrato.data_inicio)}</td>
              <td>—</td>
            </tr>
            <tr>
              <td>Data de fim</td>
              <td>{dados.dataFim ?? '—'}</td>
              <td>{contrato.data_fim ? formatarData(contrato.data_fim) : '—'}</td>
              <td>
                <input type="checkbox" name="aplicar_dataFim" disabled={!dados.dataFim} />
              </td>
            </tr>
            <tr>
              <td>Dia de vencimento</td>
              <td>{dados.diaVencimento ?? '—'}</td>
              <td>{contrato.dia_vencimento ?? '—'}</td>
              <td>
                <input type="checkbox" name="aplicar_diaVencimento" disabled={dados.diaVencimento == null} />
              </td>
            </tr>
          </tbody>
        </table>

        {dados.custosObrigatorios.length > 0 && (
          <>
            <h3>Custos obrigatórios encontrados no contrato</h3>
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Descrição</th>
                  <th>Valor</th>
                  <th>Aplicar</th>
                </tr>
              </thead>
              <tbody>
                {dados.custosObrigatorios.map((custo, indice) => (
                  <tr key={`${custo.tipo}-${indice}`}>
                    <td>{RUBRICA_TIPO_CUSTO[custo.tipo] ?? custo.tipo}</td>
                    <td>{custo.descricao ?? '—'}</td>
                    <td>{custo.valor != null ? formatarMoeda(custo.valor) : '—'}</td>
                    <td>
                      <input type="checkbox" name={`aplicar_custo_${custo.tipo}`} disabled={custo.valor == null} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <button type="submit" className="botao-primario">
          Aplicar campos marcados e aprovar
        </button>
      </form>

      <form action={rejeitarExtracao} style={{ marginTop: '1rem' }}>
        <input type="hidden" name="extracao_id" value={extracao.id} />
        <input type="hidden" name="contrato_id" value={contratoId} />
        <button type="submit" className="botao-secundario">
          Rejeitar esta leitura
        </button>
      </form>
    </>
  );
}
