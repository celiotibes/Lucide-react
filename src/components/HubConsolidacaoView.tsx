import { useMemo, useState } from "react";
import { useDb } from "../db/useDb";
import { consultar } from "../db/connection";
import { obterEntidadeAtiva } from "../domain/erp/entidadeLegal";
import { useToast } from "../ui/useToast";
import {
  confirmarLigacao,
  rejeitarLigacao,
  relatorioCoberturaFatos,
  sugerirLigacoesCompetenciaRecebimento,
  type TipoOrigemFato,
} from "../domain/erp/hubConsolidacao";
import { KpiTile } from "./KpiTile";

function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

function formatarData(dataIso: string): string {
  // data_fato é DATE ('YYYY-MM-DD'); new Date('YYYY-MM-DD') interpretaria como UTC meia-noite
  // e poderia exibir o dia anterior no fuso local — monta a data em partes para evitar isso.
  const [ano, mes, dia] = dataIso.slice(0, 10).split("-").map(Number);
  if (!ano || !mes || !dia) return dataIso;
  return new Date(ano, mes - 1, dia).toLocaleDateString("pt-BR");
}

const RODULO_TIPO_ORIGEM: Record<TipoOrigemFato, string> = {
  banco: "Banco",
  competencia: "Competência (aluguel)",
  contas_a_pagar: "Contas a pagar",
  ordem_servico: "Ordem de serviço",
  vistoria: "Vistoria",
  historico: "Histórico",
};

const RODULO_ESTADO_REVISAO: Record<string, string> = {
  pendente: "Pendente",
  revisado: "Revisado",
  rejeitado: "Rejeitado",
};

interface LadoLigacaoPendente {
  fato_id: number;
  tipo_origem: TipoOrigemFato;
  origem_id: number;
  data_fato: string;
  valor: number;
}

interface LigacaoPendente {
  link_id: number;
  tipo_relacao: string;
  criado_em: string;
  fato_a: LadoLigacaoPendente;
  fato_b: LadoLigacaoPendente;
}

/** Componente de tela do Hub de Consolidação Financeira. */
export function HubConsolidacaoView() {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();
  const [sugerindo, setSugerindo] = useState(false);
  const [processandoLinkId, setProcessandoLinkId] = useState<number | null>(null);
  // Tolerância (em dias) usada por "Sugerir ligações" — parâmetro só desta ação, não
  // persistido: reinicia no padrão (10) a cada visita à tela.
  const [toleranciaDiasInput, setToleranciaDiasInput] = useState("10");

  const entidade = useMemo(() => {
    void versao;
    return db ? obterEntidadeAtiva(db) : null;
  }, [db, versao]);

  const cobertura = useMemo(() => {
    void versao;
    if (!db || !entidade) return null;
    return relatorioCoberturaFatos(db, entidade.id);
  }, [db, versao, entidade]);

  const ligacoesPendentes = useMemo<LigacaoPendente[]>(() => {
    void versao;
    if (!db || !entidade) return [];
    const linhas = consultar<{
      link_id: number;
      tipo_relacao: string;
      criado_em: string;
      fato_a_id: number;
      fato_a_tipo: TipoOrigemFato;
      fato_a_origem_id: number;
      fato_a_data: string;
      fato_a_valor: number;
      fato_b_id: number;
      fato_b_tipo: TipoOrigemFato;
      fato_b_origem_id: number;
      fato_b_data: string;
      fato_b_valor: number;
    }>(
      db,
      `SELECT
         l.id AS link_id, l.tipo_relacao AS tipo_relacao, l.criado_em AS criado_em,
         fa.id AS fato_a_id, fa.tipo_origem AS fato_a_tipo, fa.origem_id AS fato_a_origem_id,
         fa.data_fato AS fato_a_data, fa.valor AS fato_a_valor,
         fb.id AS fato_b_id, fb.tipo_origem AS fato_b_tipo, fb.origem_id AS fato_b_origem_id,
         fb.data_fato AS fato_b_data, fb.valor AS fato_b_valor
       FROM fatos_financeiros_links l
       JOIN fatos_financeiros fa ON fa.id = l.fato_a_id
       JOIN fatos_financeiros fb ON fb.id = l.fato_b_id
       WHERE l.status = 'pendente' AND fa.entidade_id = ?
       ORDER BY l.criado_em DESC, l.id DESC`,
      [entidade.id],
    );

    return linhas.map((l) => ({
      link_id: l.link_id,
      tipo_relacao: l.tipo_relacao,
      criado_em: l.criado_em,
      fato_a: {
        fato_id: l.fato_a_id,
        tipo_origem: l.fato_a_tipo,
        origem_id: l.fato_a_origem_id,
        data_fato: l.fato_a_data,
        valor: l.fato_a_valor,
      },
      fato_b: {
        fato_id: l.fato_b_id,
        tipo_origem: l.fato_b_tipo,
        origem_id: l.fato_b_origem_id,
        data_fato: l.fato_b_data,
        valor: l.fato_b_valor,
      },
    }));
  }, [db, versao, entidade]);

  async function sugerirLigacoes() {
    if (!db || !entidade) return;
    const toleranciaDias = Number(toleranciaDiasInput);
    if (!Number.isFinite(toleranciaDias) || toleranciaDias < 1 || toleranciaDias > 60) {
      avisar("warning", "Tolerância (dias) deve ser um número entre 1 e 60.");
      return;
    }
    setSugerindo(true);
    try {
      const criadas = sugerirLigacoesCompetenciaRecebimento(db, entidade.id, { toleranciaDias });
      await persistir();
      avisar(
        "good",
        criadas.length > 0
          ? `${criadas.length} sugestão(ões) criada(s), aguardando confirmação humana.`
          : "Nenhuma sugestão nova: todas as competências pendentes já têm candidato ligado ou nenhum fato bancário compatível foi encontrado.",
      );
    } catch (erro) {
      avisar("critical", `Falha ao sugerir ligações: ${erro instanceof Error ? erro.message : String(erro)}`);
    } finally {
      setSugerindo(false);
    }
  }

  async function confirmar(linkId: number) {
    if (!db) return;
    setProcessandoLinkId(linkId);
    try {
      confirmarLigacao(db, linkId);
      await persistir();
      avisar("good", "Ligação confirmada.");
    } catch (erro) {
      avisar("critical", `Falha ao confirmar ligação: ${erro instanceof Error ? erro.message : String(erro)}`);
    } finally {
      setProcessandoLinkId(null);
    }
  }

  async function rejeitar(linkId: number) {
    if (!db) return;
    setProcessandoLinkId(linkId);
    try {
      rejeitarLigacao(db, linkId);
      await persistir();
      avisar("good", "Ligação rejeitada.");
    } catch (erro) {
      avisar("critical", `Falha ao rejeitar ligação: ${erro instanceof Error ? erro.message : String(erro)}`);
    } finally {
      setProcessandoLinkId(null);
    }
  }

  if (!db) {
    return (
      <div className="p-4 text-center">
        <p>Carregando Hub de Consolidação...</p>
      </div>
    );
  }

  if (!entidade) {
    return (
      <div className="p-4 text-center">
        <p>Nenhuma entidade legal cadastrada ainda — conclua o onboarding para usar o Hub de Consolidação.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Hub de Consolidação Financeira</h2>
      <p className="text-sm text-gray-600">
        Camada de evidência/rastreabilidade acima do razão de partida dobrada — registra fatos de cada
        fonte operacional (banco, competência de aluguel, contas a pagar, ordem de serviço) e liga fatos
        que representam o mesmo evento econômico visto por ângulos diferentes. Nunca substitui o razão e
        nunca confirma uma ligação sozinho: toda sugestão nasce pendente até revisão humana.
      </p>

      {/* Painel de cobertura */}
      <div className="bg-white rounded border">
        <div className="p-4 border-b font-bold">Cobertura de Fatos</div>
        <div className="p-4 space-y-4">
          {!cobertura ? (
            <p className="text-sm text-gray-600">Calculando cobertura...</p>
          ) : (
            <>
              <div className="kpi-grid">
                <KpiTile label="Total de Fatos" value={String(cobertura.total_fatos)} />
                <KpiTile
                  label="Competências sem ligação confirmada"
                  value={String(cobertura.sem_cobertura_confirmada.competencia)}
                  variant={cobertura.sem_cobertura_confirmada.competencia === 0 ? "good" : "critical"}
                />
                <KpiTile
                  label="Contas a pagar sem ligação confirmada"
                  value={String(cobertura.sem_cobertura_confirmada.contas_a_pagar)}
                  variant={cobertura.sem_cobertura_confirmada.contas_a_pagar === 0 ? "good" : "critical"}
                />
                <KpiTile label="Ligações pendentes de revisão" value={String(ligacoesPendentes.length)} />
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="border rounded p-3">
                  <p className="font-semibold mb-2">Fatos por Tipo de Origem</p>
                  <ul className="space-y-1 text-xs">
                    {(Object.keys(RODULO_TIPO_ORIGEM) as TipoOrigemFato[]).map((tipo) => (
                      <li key={tipo} className="flex justify-between">
                        <span>{RODULO_TIPO_ORIGEM[tipo]}</span>
                        <span className="font-mono">{cobertura.por_tipo_origem[tipo] ?? 0}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="border rounded p-3">
                  <p className="font-semibold mb-2">Fatos por Estado de Revisão</p>
                  <ul className="space-y-1 text-xs">
                    {Object.entries(RODULO_ESTADO_REVISAO).map(([estado, rotulo]) => (
                      <li key={estado} className="flex justify-between">
                        <span>{rotulo}</span>
                        <span className="font-mono">{cobertura.por_estado_revisao[estado] ?? 0}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {(cobertura.sem_cobertura_confirmada.competencia > 0 ||
                cobertura.sem_cobertura_confirmada.contas_a_pagar > 0) && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm">
                  <p className="font-semibold text-yellow-900">
                    Achado: existem fatos de competência/contas a pagar reconstituídos que ainda não
                    foram cruzados com nenhum outro ângulo do mesmo evento econômico (ex: o recebimento
                    bancário correspondente). Use "Sugerir ligações" abaixo ou ligue manualmente.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Botão de sugestão automática */}
      <div className="bg-white rounded border p-4 flex items-center justify-between">
        <div>
          <p className="font-bold">Sugerir Ligações (Competência × Recebimento)</p>
          <p className="text-xs text-gray-600 mt-1">
            Procura, para cada competência de aluguel ainda sem ligação confirmada, um fato bancário com
            valor e data compatíveis. Toda sugestão criada nasce <strong>pendente</strong> — nenhuma é
            confirmada automaticamente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600 flex items-center gap-1">
            Tolerância (dias)
            <input
              type="number"
              min={1}
              max={60}
              step={1}
              value={toleranciaDiasInput}
              onChange={(e) => setToleranciaDiasInput(e.target.value)}
              style={{ width: 60 }}
              className="border rounded px-1 py-0.5 text-xs"
            />
          </label>
          <button className="btn primary" onClick={sugerirLigacoes} disabled={sugerindo}>
            {sugerindo ? "Sugerindo..." : "Sugerir ligações"}
          </button>
        </div>
      </div>

      {/* Lista de ligações pendentes */}
      <div className="bg-white rounded border">
        <div className="p-4 border-b font-bold">
          {ligacoesPendentes.length === 0
            ? "Nenhuma ligação pendente de revisão"
            : `${ligacoesPendentes.length} ligação(ões) pendente(s) de revisão`}
        </div>
        {ligacoesPendentes.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tipo de Relação</th>
                  <th>Fato A</th>
                  <th className="num">Data</th>
                  <th className="num">Valor</th>
                  <th>Fato B</th>
                  <th className="num">Data</th>
                  <th className="num">Valor</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {ligacoesPendentes.map((l) => (
                  <tr key={l.link_id}>
                    <td>{l.tipo_relacao}</td>
                    <td>
                      {RODULO_TIPO_ORIGEM[l.fato_a.tipo_origem]}
                      <span className="text-xs text-gray-500"> (#{l.fato_a.origem_id})</span>
                    </td>
                    <td className="num">{formatarData(l.fato_a.data_fato)}</td>
                    <td className="num">{formatarMoeda(l.fato_a.valor)}</td>
                    <td>
                      {RODULO_TIPO_ORIGEM[l.fato_b.tipo_origem]}
                      <span className="text-xs text-gray-500"> (#{l.fato_b.origem_id})</span>
                    </td>
                    <td className="num">{formatarData(l.fato_b.data_fato)}</td>
                    <td className="num">{formatarMoeda(l.fato_b.valor)}</td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          className="btn primary"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => confirmar(l.link_id)}
                          disabled={processandoLinkId === l.link_id}
                        >
                          Confirmar
                        </button>
                        <button
                          className="btn"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => rejeitar(l.link_id)}
                          disabled={processandoLinkId === l.link_id}
                        >
                          Rejeitar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
