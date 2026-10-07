import { useMemo, useState } from "react";
import { Users, Landmark, Wallet, ArrowLeftRight, AlertTriangle, Plus, Trash2, Check, X } from "lucide-react";
import { useDb } from "../db/useDb";
import { useToast } from "../ui/useToast";
import { obterEntidadeAtiva } from "../domain/erp/entidadeLegal";
import { listarPeriodosContabeis } from "../domain/fechamento/periodos";
import { PLANO_DE_CONTAS_ERP } from "../domain/erp/planoDeContasErp";
import { CONTA_CAIXA_ERP } from "../domain/erp/mapeamentoPlanoApp";
import {
  cadastrarPessoa,
  listarPessoas,
  removerPessoa,
  cadastrarContaPessoal,
  listarContasPessoais,
  removerContaPessoal,
  registrarMovimentoPessoal,
  relatorioMovimentosPessoais,
  relatorioSegregacaoPatrimonial,
  CATEGORIAS_TRANSFERENCIA_ENTIDADE,
  CONTA_CAPITAL_SOCIAL_ERP,
  CONTA_EMPRESTIMO_SOCIO_ERP,
  type Pessoa,
  type ContaPessoal,
  type TipoRelacaoPessoa,
  type TipoContaPessoal,
  type CategoriaTransferenciaEntidade,
} from "../domain/contasPessoais/contasPessoais";
import { formatarMoeda } from "../domain/formatarMoeda";

const ROTULO_RELACAO: Record<TipoRelacaoPessoa, string> = {
  titular: "Titular",
  socio: "Sócio",
  familiar: "Familiar",
  outro: "Outro",
};

const ROTULO_TIPO_CONTA: Record<TipoContaPessoal, string> = {
  corrente: "Conta corrente",
  poupanca: "Poupança",
  investimento: "Investimento",
};

const ROTULO_CATEGORIA_TRANSFERENCIA: Record<CategoriaTransferenciaEntidade, string> = {
  aporte_capital: "Aporte de capital (pessoa → entidade)",
  retirada_capital: "Retirada de capital (entidade → pessoa)",
  emprestimo_socio: "Empréstimo de sócio (pessoa → entidade)",
  devolucao_emprestimo: "Devolução de empréstimo (entidade → pessoa)",
};

// true = dinheiro sai da conta pessoal rumo à entidade (aporte/empréstimo concedido);
// false = dinheiro entra na conta pessoal vindo da entidade (retirada/devolução) — mesma
// regra de sinal que registrarMovimentoPessoal exige, só que aqui é usada para MOSTRAR ao
// usuário o que vai acontecer antes de ele confirmar, nunca para decidir o sinal sozinha
// (quem decide o sinal final é sempre o domínio, em registrarMovimentoPessoal).
const ENTRA_NA_ENTIDADE: Record<CategoriaTransferenciaEntidade, boolean> = {
  aporte_capital: true,
  emprestimo_socio: true,
  retirada_capital: false,
  devolucao_emprestimo: false,
};

const CONTA_CONTRAPARTIDA: Record<CategoriaTransferenciaEntidade, number> = {
  aporte_capital: CONTA_CAPITAL_SOCIAL_ERP,
  retirada_capital: CONTA_CAPITAL_SOCIAL_ERP,
  emprestimo_socio: CONTA_EMPRESTIMO_SOCIO_ERP,
  devolucao_emprestimo: CONTA_EMPRESTIMO_SOCIO_ERP,
};

const DESCRICAO_CONTA_ERP = new Map<number, string>(
  PLANO_DE_CONTAS_ERP.map((c) => [c.id, `${c.codigo} — ${c.descricao}`] as [number, string]),
);

function nomeConta(id: number): string {
  return DESCRICAO_CONTA_ERP.get(id) ?? `conta ${id}`;
}

function ehCategoriaTransferenciaExibicao(categoria: string | null): categoria is CategoriaTransferenciaEntidade {
  return !!categoria && (CATEGORIAS_TRANSFERENCIA_ENTIDADE as ReadonlySet<string>).has(categoria);
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface RascunhoPessoa {
  nome: string;
  cpf: string;
  tipo_relacao: TipoRelacaoPessoa;
  observacoes: string;
}
const RASCUNHO_PESSOA_VAZIO: RascunhoPessoa = { nome: "", cpf: "", tipo_relacao: "titular", observacoes: "" };

interface RascunhoContaPessoal {
  banco: string;
  agencia: string;
  numero: string;
  tipo: TipoContaPessoal;
  observacoes: string;
}
const RASCUNHO_CONTA_VAZIO: RascunhoContaPessoal = {
  banco: "",
  agencia: "",
  numero: "",
  tipo: "corrente",
  observacoes: "",
};

interface RascunhoMovimento {
  contaPessoalId: string;
  data: string;
  descricao: string;
  ehTransferencia: boolean;
  categoriaTransferencia: CategoriaTransferenciaEntidade;
  categoriaLivre: string;
  direcaoSimples: "entrada" | "saida";
  valor: string;
  periodoId: string;
}
function rascunhoMovimentoVazio(contaPessoalId: string, periodoId: string): RascunhoMovimento {
  return {
    contaPessoalId,
    data: hojeIso(),
    descricao: "",
    ehTransferencia: false,
    categoriaTransferencia: "aporte_capital",
    categoriaLivre: "",
    direcaoSimples: "entrada",
    valor: "",
    periodoId,
  };
}

export function ContasPessoaisView() {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();

  const [pessoaSelecionadaId, setPessoaSelecionadaId] = useState<number | null>(null);
  const [mostrarFormPessoa, setMostrarFormPessoa] = useState(false);
  const [rascunhoPessoa, setRascunhoPessoa] = useState<RascunhoPessoa>(RASCUNHO_PESSOA_VAZIO);
  const [mostrarFormConta, setMostrarFormConta] = useState(false);
  const [rascunhoConta, setRascunhoConta] = useState<RascunhoContaPessoal>(RASCUNHO_CONTA_VAZIO);

  const hoje = hojeIso();
  const [extratoInicio, setExtratoInicio] = useState(
    new Date(new Date(hoje).setMonth(new Date(hoje).getMonth() - 12)).toISOString().slice(0, 10),
  );
  const [extratoFim, setExtratoFim] = useState(hoje);

  const [mostrarFormMovimento, setMostrarFormMovimento] = useState(false);
  const [rascunhoMovimento, setRascunhoMovimento] = useState<RascunhoMovimento>(rascunhoMovimentoVazio("", ""));

  const [periodoSegregacaoManual, setPeriodoSegregacaoManual] = useState("");

  const entidade = useMemo(() => {
    void versao;
    return db ? obterEntidadeAtiva(db) : null;
  }, [db, versao]);
  const periodos = useMemo(
    () => {
      void versao;
      return db && entidade ? listarPeriodosContabeis(db, entidade.id) : [];
    },
    [db, versao, entidade],
  );
  const periodoPadrao = periodos.find((p) => p.status === "aberto") ?? periodos[0] ?? null;

  const pessoas = useMemo<Pessoa[]>(() => {
    void versao;
    return db ? listarPessoas(db) : [];
  }, [db, versao]);
  const pessoaSelecionada = pessoas.find((p) => p.id === pessoaSelecionadaId) ?? null;

  const contasPessoa = useMemo<ContaPessoal[]>(
    () => {
      void versao;
      return db && pessoaSelecionadaId ? listarContasPessoais(db, pessoaSelecionadaId) : [];
    },
    [db, versao, pessoaSelecionadaId],
  );
  const contaPessoalPorId = useMemo(() => {
    const mapa = new Map<number, ContaPessoal>();
    for (const c of contasPessoa) mapa.set(c.id, c);
    return mapa;
  }, [contasPessoa]);

  const extrato = useMemo(
    () => {
      void versao;
      return db && pessoaSelecionadaId
        ? relatorioMovimentosPessoais(db, pessoaSelecionadaId, { inicio: extratoInicio, fim: extratoFim })
        : null;
    },
    [db, versao, pessoaSelecionadaId, extratoInicio, extratoFim],
  );

  const periodoSegregacaoId = periodoSegregacaoManual || (periodoPadrao ? String(periodoPadrao.id) : "");
  const segregacao = useMemo(
    () => {
      void versao;
      return db && entidade && periodoSegregacaoId
        ? relatorioSegregacaoPatrimonial(db, entidade.id, Number(periodoSegregacaoId))
        : null;
    },
    [db, versao, entidade, periodoSegregacaoId],
  );

  function selecionarPessoa(id: number) {
    setPessoaSelecionadaId(id);
    setMostrarFormConta(false);
    setMostrarFormMovimento(false);
  }

  async function salvarPessoa() {
    if (!db) return;
    const resultado = cadastrarPessoa(db, {
      nome: rascunhoPessoa.nome,
      cpf: rascunhoPessoa.cpf.trim() || undefined,
      tipo_relacao: rascunhoPessoa.tipo_relacao,
      observacoes: rascunhoPessoa.observacoes.trim() || undefined,
    });
    if (!resultado.sucesso) {
      avisar("critical", resultado.mensagem);
      return;
    }
    await persistir();
    setRascunhoPessoa(RASCUNHO_PESSOA_VAZIO);
    setMostrarFormPessoa(false);
    avisar("good", resultado.mensagem);
    if (resultado.id) selecionarPessoa(resultado.id);
  }

  async function excluirPessoa(id: number) {
    if (!db) return;
    const resultado = removerPessoa(db, id);
    if (!resultado.sucesso) {
      avisar("critical", resultado.mensagem);
      return;
    }
    await persistir();
    if (pessoaSelecionadaId === id) setPessoaSelecionadaId(null);
    avisar("good", resultado.mensagem);
  }

  async function salvarContaPessoal() {
    if (!db || !pessoaSelecionadaId) return;
    const resultado = cadastrarContaPessoal(db, {
      pessoa_id: pessoaSelecionadaId,
      banco: rascunhoConta.banco,
      agencia: rascunhoConta.agencia.trim() || undefined,
      numero: rascunhoConta.numero,
      tipo: rascunhoConta.tipo,
      observacoes: rascunhoConta.observacoes.trim() || undefined,
    });
    if (!resultado.sucesso) {
      avisar("critical", resultado.mensagem);
      return;
    }
    await persistir();
    setRascunhoConta(RASCUNHO_CONTA_VAZIO);
    setMostrarFormConta(false);
    avisar("good", resultado.mensagem);
  }

  async function excluirContaPessoal(id: number) {
    if (!db) return;
    const resultado = removerContaPessoal(db, id);
    if (!resultado.sucesso) {
      avisar("critical", resultado.mensagem);
      return;
    }
    await persistir();
    avisar("good", resultado.mensagem);
  }

  function abrirFormMovimento() {
    setRascunhoMovimento(
      rascunhoMovimentoVazio(
        contasPessoa[0] ? String(contasPessoa[0].id) : "",
        periodoPadrao ? String(periodoPadrao.id) : "",
      ),
    );
    setMostrarFormMovimento(true);
  }

  async function registrarMovimento() {
    if (!db || !rascunhoMovimento.contaPessoalId) return;
    const valorAbs = Number.parseFloat(rascunhoMovimento.valor.replace(",", "."));
    if (!valorAbs || valorAbs <= 0) {
      avisar("critical", "Informe um valor maior que zero.");
      return;
    }
    try {
      if (rascunhoMovimento.ehTransferencia) {
        if (!entidade) {
          avisar("critical", "Cadastre a entidade titular antes de registrar transferência com a entidade.");
          return;
        }
        if (!rascunhoMovimento.periodoId) {
          avisar("critical", "Selecione o período contábil da entidade para o lançamento espelho.");
          return;
        }
        const entraNaEntidade = ENTRA_NA_ENTIDADE[rascunhoMovimento.categoriaTransferencia];
        registrarMovimentoPessoal(db, {
          conta_pessoal_id: Number(rascunhoMovimento.contaPessoalId),
          data: rascunhoMovimento.data,
          valor: entraNaEntidade ? -valorAbs : valorAbs,
          descricao: rascunhoMovimento.descricao,
          categoria: rascunhoMovimento.categoriaTransferencia,
          transferencia: { entidade_id: entidade.id, periodo_id: Number(rascunhoMovimento.periodoId) },
        });
      } else {
        registrarMovimentoPessoal(db, {
          conta_pessoal_id: Number(rascunhoMovimento.contaPessoalId),
          data: rascunhoMovimento.data,
          valor: rascunhoMovimento.direcaoSimples === "entrada" ? valorAbs : -valorAbs,
          descricao: rascunhoMovimento.descricao,
          categoria: rascunhoMovimento.categoriaLivre.trim() || undefined,
        });
      }
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : String(erro));
      return;
    }
    await persistir();
    setMostrarFormMovimento(false);
    avisar("good", "Movimento registrado.");
  }

  const podeRegistrarMovimento =
    !!rascunhoMovimento.contaPessoalId &&
    !!rascunhoMovimento.data &&
    !!rascunhoMovimento.descricao.trim() &&
    !!rascunhoMovimento.valor.trim() &&
    (!rascunhoMovimento.ehTransferencia || (!!entidade && !!rascunhoMovimento.periodoId));

  return (
    <div>
      <h2 className="section-title">
        <Users size={16} /> Contas pessoais ({pessoas.length})
      </h2>
      <p style={{ maxWidth: "70ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 18 }}>
        Contas bancárias de pessoas físicas (titular, sócio de fato, familiar) — nunca confundir com as contas
        bancárias da entidade. Quando um movimento aqui é uma transferência com a entidade (aporte/retirada de
        capital, empréstimo de sócio/devolução), esta tela lança automaticamente o espelho no razão da entidade,
        e a seção de segregação patrimonial mais abaixo audita se essa contrapartida sempre existiu — dinheiro
        nunca deveria "aparecer" de um lado só ao cruzar a fronteira pessoa física ↔ entidade.
      </p>

      {/* ===================== Pessoas ===================== */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Users size={16} /> Pessoas cadastradas
          </strong>
          <button
            className="btn primary"
            onClick={() => {
              setMostrarFormPessoa((v) => !v);
              setRascunhoPessoa(RASCUNHO_PESSOA_VAZIO);
            }}
          >
            <Plus size={14} /> {mostrarFormPessoa ? "Fechar formulário" : "Nova pessoa"}
          </button>
        </div>

        {mostrarFormPessoa && (
          <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--line-soft)" }}>
            <div className="form-grid">
              <label>
                Nome
                <input
                  value={rascunhoPessoa.nome}
                  onChange={(e) => setRascunhoPessoa((r) => ({ ...r, nome: e.target.value }))}
                />
              </label>
              <label>
                CPF (opcional)
                <input
                  value={rascunhoPessoa.cpf}
                  onChange={(e) => setRascunhoPessoa((r) => ({ ...r, cpf: e.target.value }))}
                />
              </label>
              <label>
                Tipo de relação
                <select
                  value={rascunhoPessoa.tipo_relacao}
                  onChange={(e) =>
                    setRascunhoPessoa((r) => ({ ...r, tipo_relacao: e.target.value as TipoRelacaoPessoa }))
                  }
                >
                  {(Object.entries(ROTULO_RELACAO) as [TipoRelacaoPessoa, string][]).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>
                      {rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Observações (opcional)
                <input
                  value={rascunhoPessoa.observacoes}
                  onChange={(e) => setRascunhoPessoa((r) => ({ ...r, observacoes: e.target.value }))}
                />
              </label>
            </div>
            <button className="btn primary" onClick={salvarPessoa} disabled={!rascunhoPessoa.nome.trim()}>
              <Check size={13} /> Cadastrar pessoa
            </button>
          </div>
        )}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>CPF</th>
                <th>Relação</th>
                <th>Observações</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pessoas.map((p) => (
                <tr
                  key={p.id}
                  style={p.id === pessoaSelecionadaId ? { background: "var(--surface-2)" } : undefined}
                >
                  <td>
                    <button
                      className="btn"
                      style={{ padding: "3px 8px", fontWeight: p.id === pessoaSelecionadaId ? 700 : 400 }}
                      onClick={() => selecionarPessoa(p.id)}
                    >
                      {p.nome}
                    </button>
                  </td>
                  <td>{p.cpf ?? "—"}</td>
                  <td>{ROTULO_RELACAO[p.tipo_relacao]}</td>
                  <td>{p.observacoes ?? "—"}</td>
                  <td>
                    <button
                      className="btn danger"
                      style={{ padding: "4px 8px", fontSize: 12 }}
                      onClick={() => excluirPessoa(p.id)}
                      title="Remover pessoa"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
              {pessoas.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                    Nenhuma pessoa cadastrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pessoaSelecionada && (
        <>
          {/* ===================== Contas pessoais da pessoa selecionada ===================== */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Landmark size={16} /> Contas bancárias pessoais de {pessoaSelecionada.nome}
              </strong>
              <button
                className="btn primary"
                onClick={() => {
                  setMostrarFormConta((v) => !v);
                  setRascunhoConta(RASCUNHO_CONTA_VAZIO);
                }}
              >
                <Plus size={14} /> {mostrarFormConta ? "Fechar formulário" : "Nova conta pessoal"}
              </button>
            </div>

            {mostrarFormConta && (
              <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--line-soft)" }}>
                <div className="form-grid">
                  <label>
                    Banco
                    <input
                      value={rascunhoConta.banco}
                      onChange={(e) => setRascunhoConta((r) => ({ ...r, banco: e.target.value }))}
                    />
                  </label>
                  <label>
                    Agência (opcional)
                    <input
                      value={rascunhoConta.agencia}
                      onChange={(e) => setRascunhoConta((r) => ({ ...r, agencia: e.target.value }))}
                    />
                  </label>
                  <label>
                    Número
                    <input
                      value={rascunhoConta.numero}
                      onChange={(e) => setRascunhoConta((r) => ({ ...r, numero: e.target.value }))}
                    />
                  </label>
                  <label>
                    Tipo
                    <select
                      value={rascunhoConta.tipo}
                      onChange={(e) => setRascunhoConta((r) => ({ ...r, tipo: e.target.value as TipoContaPessoal }))}
                    >
                      {(Object.entries(ROTULO_TIPO_CONTA) as [TipoContaPessoal, string][]).map(([valor, rotulo]) => (
                        <option key={valor} value={valor}>
                          {rotulo}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Observações (opcional)
                    <input
                      value={rascunhoConta.observacoes}
                      onChange={(e) => setRascunhoConta((r) => ({ ...r, observacoes: e.target.value }))}
                    />
                  </label>
                </div>
                <button
                  className="btn primary"
                  onClick={salvarContaPessoal}
                  disabled={!rascunhoConta.banco.trim() || !rascunhoConta.numero.trim()}
                >
                  <Check size={13} /> Cadastrar conta pessoal
                </button>
              </div>
            )}

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Banco</th>
                    <th>Agência</th>
                    <th>Número</th>
                    <th>Tipo</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {contasPessoa.map((c) => (
                    <tr key={c.id}>
                      <td>{c.banco}</td>
                      <td>{c.agencia ?? "—"}</td>
                      <td>{c.numero}</td>
                      <td>{ROTULO_TIPO_CONTA[c.tipo]}</td>
                      <td>
                        <button
                          className="btn danger"
                          style={{ padding: "4px 8px", fontSize: 12 }}
                          onClick={() => excluirContaPessoal(c.id)}
                          title="Remover conta pessoal"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {contasPessoa.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                        Nenhuma conta pessoal cadastrada para {pessoaSelecionada.nome} ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ===================== Extrato ===================== */}
          <div className="card" style={{ marginBottom: 20 }}>
            <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
              <Wallet size={16} /> Extrato de {pessoaSelecionada.nome}
            </strong>

            <div className="form-grid" style={{ maxWidth: 420 }}>
              <label>
                Período — início
                <input type="date" value={extratoInicio} onChange={(e) => setExtratoInicio(e.target.value)} />
              </label>
              <label>
                Período — fim
                <input type="date" value={extratoFim} onChange={(e) => setExtratoFim(e.target.value)} />
              </label>
            </div>

            {extrato && (
              <div className="kpi-grid" style={{ marginBottom: 20 }}>
                <div className="kpi-tile">
                  <div className="label">Depósitos</div>
                  <div className="value good">{formatarMoeda(extrato.total_depositos)}</div>
                </div>
                <div className="kpi-tile">
                  <div className="label">Saques</div>
                  <div className="value critical">{formatarMoeda(extrato.total_saques)}</div>
                </div>
                <div className="kpi-tile">
                  <div className="label">Transferências → entidade</div>
                  <div className="value">{formatarMoeda(extrato.total_transferencias_para_entidade)}</div>
                </div>
                <div className="kpi-tile">
                  <div className="label">Transferências ← entidade</div>
                  <div className="value">{formatarMoeda(extrato.total_transferencias_da_entidade)}</div>
                </div>
                <div className="kpi-tile">
                  <div className="label">Saldo do período</div>
                  <div className={`value ${extrato.saldo_periodo < 0 ? "critical" : "good"}`}>
                    {formatarMoeda(extrato.saldo_periodo)}
                  </div>
                </div>
                <div className="kpi-tile">
                  <div className="label">Saldo atual (todas as contas)</div>
                  <div className={`value ${extrato.saldo_atual < 0 ? "critical" : "good"}`}>
                    {formatarMoeda(extrato.saldo_atual)}
                  </div>
                </div>
              </div>
            )}

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Conta</th>
                    <th>Descrição</th>
                    <th>Categoria</th>
                    <th className="num">Valor</th>
                    <th>Espelho no razão</th>
                  </tr>
                </thead>
                <tbody>
                  {extrato?.movimentos.map((m) => {
                    const conta = contaPessoalPorId.get(m.conta_pessoal_id);
                    const ehTransf = ehCategoriaTransferenciaExibicao(m.categoria);
                    return (
                      <tr key={m.id}>
                        <td>{m.data}</td>
                        <td>{conta ? `${conta.banco} · ${conta.numero}` : `#${m.conta_pessoal_id}`}</td>
                        <td>{m.descricao}</td>
                        <td>{ehTransf ? ROTULO_CATEGORIA_TRANSFERENCIA[m.categoria as CategoriaTransferenciaEntidade] : (m.categoria ?? "—")}</td>
                        <td className="num" style={{ color: m.valor < 0 ? "var(--viz-critical)" : "var(--viz-good)" }}>
                          {formatarMoeda(m.valor)}
                        </td>
                        <td>
                          {ehTransf ? (
                            m.transferencia_entidade_id ? (
                              <span className="pill good">lançamento #{m.transferencia_entidade_id}</span>
                            ) : (
                              <span className="pill critical">
                                <AlertTriangle size={11} /> sem espelho (órfã)
                              </span>
                            )
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {(!extrato || extrato.movimentos.length === 0) && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                        Nenhum movimento no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ===================== Registrar movimento ===================== */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <ArrowLeftRight size={16} /> Registrar movimento
              </strong>
              <button
                className="btn primary"
                onClick={() => (mostrarFormMovimento ? setMostrarFormMovimento(false) : abrirFormMovimento())}
                disabled={contasPessoa.length === 0}
              >
                <Plus size={14} /> {mostrarFormMovimento ? "Fechar formulário" : "Novo movimento"}
              </button>
            </div>

            {contasPessoa.length === 0 && (
              <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>
                Cadastre uma conta pessoal para {pessoaSelecionada.nome} antes de lançar movimentos.
              </p>
            )}

            {mostrarFormMovimento && (
              <div>
                <div className="form-grid">
                  <label>
                    Conta pessoal
                    <select
                      value={rascunhoMovimento.contaPessoalId}
                      onChange={(e) => setRascunhoMovimento((r) => ({ ...r, contaPessoalId: e.target.value }))}
                    >
                      {contasPessoa.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.banco} · {c.numero}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Data
                    <input
                      type="date"
                      value={rascunhoMovimento.data}
                      onChange={(e) => setRascunhoMovimento((r) => ({ ...r, data: e.target.value }))}
                    />
                  </label>
                  <label>
                    Valor (R$)
                    <input
                      value={rascunhoMovimento.valor}
                      onChange={(e) => setRascunhoMovimento((r) => ({ ...r, valor: e.target.value }))}
                      placeholder="0,00"
                    />
                  </label>
                </div>
                <label style={{ fontSize: 12, color: "var(--ink-soft)", display: "block", marginBottom: 12 }}>
                  Descrição
                  <input
                    className="btn"
                    style={{ cursor: "text", width: "100%", marginTop: 4 }}
                    value={rascunhoMovimento.descricao}
                    onChange={(e) => setRascunhoMovimento((r) => ({ ...r, descricao: e.target.value }))}
                    placeholder="ex: salário, supermercado, aporte para reforma do imóvel…"
                  />
                </label>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13.5,
                    fontWeight: 600,
                    marginBottom: 12,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={rascunhoMovimento.ehTransferencia}
                    onChange={(e) =>
                      setRascunhoMovimento((r) => ({
                        ...r,
                        ehTransferencia: e.target.checked,
                        periodoId: e.target.checked ? r.periodoId || (periodoPadrao ? String(periodoPadrao.id) : "") : r.periodoId,
                      }))
                    }
                  />
                  É uma transferência com a entidade? (aporte/retirada de capital, empréstimo de sócio/devolução)
                </label>

                {rascunhoMovimento.ehTransferencia ? (
                  <div style={{ marginBottom: 12 }}>
                    <div className="form-grid">
                      <label>
                        Categoria da transferência
                        <select
                          value={rascunhoMovimento.categoriaTransferencia}
                          onChange={(e) =>
                            setRascunhoMovimento((r) => ({
                              ...r,
                              categoriaTransferencia: e.target.value as CategoriaTransferenciaEntidade,
                            }))
                          }
                        >
                          {(Object.entries(ROTULO_CATEGORIA_TRANSFERENCIA) as [CategoriaTransferenciaEntidade, string][]).map(
                            ([valor, rotulo]) => (
                              <option key={valor} value={valor}>
                                {rotulo}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                      <label>
                        Período contábil da entidade
                        <select
                          value={rascunhoMovimento.periodoId}
                          onChange={(e) => setRascunhoMovimento((r) => ({ ...r, periodoId: e.target.value }))}
                        >
                          <option value="">— selecione —</option>
                          {periodos.map((p) => (
                            <option key={p.id} value={p.id}>
                              {String(p.mes).padStart(2, "0")}/{p.ano} ({p.status})
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {!entidade && (
                      <div className="aviso-caixa">
                        Nenhuma entidade titular cadastrada — cadastre-a em Cadastros antes de registrar uma
                        transferência com a entidade.
                      </div>
                    )}
                    {entidade && periodos.length === 0 && (
                      <div className="aviso-caixa">
                        Nenhum período contábil aberto para {entidade.nome} — abra um período em Fechamento antes
                        de registrar esta transferência.
                      </div>
                    )}

                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        padding: "10px 14px",
                        borderRadius: 6,
                        marginTop: 10,
                        background: "var(--surface-2)",
                        border: "1px solid var(--line)",
                        fontSize: 13,
                        color: "var(--ink-soft)",
                      }}
                    >
                      <ArrowLeftRight size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span>
                        Ao confirmar, além do movimento nesta conta pessoal, será lançado automaticamente um{" "}
                        <strong>lançamento espelho no razão da entidade</strong>:{" "}
                        {ENTRA_NA_ENTIDADE[rascunhoMovimento.categoriaTransferencia] ? "débito" : "crédito"} em{" "}
                        <strong>{nomeConta(CONTA_CAIXA_ERP)}</strong> e{" "}
                        {ENTRA_NA_ENTIDADE[rascunhoMovimento.categoriaTransferencia] ? "crédito" : "débito"} em{" "}
                        <strong>{nomeConta(CONTA_CONTRAPARTIDA[rascunhoMovimento.categoriaTransferencia])}</strong> —
                        mesmo valor, lado oposto. É esse espelho que a seção de segregação patrimonial abaixo audita.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="form-grid" style={{ marginBottom: 12 }}>
                    <label>
                      Direção
                      <select
                        value={rascunhoMovimento.direcaoSimples}
                        onChange={(e) =>
                          setRascunhoMovimento((r) => ({ ...r, direcaoSimples: e.target.value as "entrada" | "saida" }))
                        }
                      >
                        <option value="entrada">Entrada (depósito)</option>
                        <option value="saida">Saída (saque)</option>
                      </select>
                    </label>
                    <label>
                      Categoria (opcional)
                      <input
                        value={rascunhoMovimento.categoriaLivre}
                        onChange={(e) => setRascunhoMovimento((r) => ({ ...r, categoriaLivre: e.target.value }))}
                        placeholder="ex: salario, alimentacao…"
                      />
                    </label>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn primary" onClick={registrarMovimento} disabled={!podeRegistrarMovimento}>
                    <Check size={13} /> Registrar movimento
                  </button>
                  <button className="btn" onClick={() => setMostrarFormMovimento(false)}>
                    <X size={13} /> Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ===================== Segregação patrimonial ===================== */}
      <div className="card">
        <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <Landmark size={16} /> Segregação patrimonial — pessoa física × entidade
        </strong>
        <p style={{ maxWidth: "70ch", color: "var(--ink-soft)", fontSize: 13.5, margin: "6px 0 14px" }}>
          Total confirmado (com espelho no razão) transferido em cada sentido no período contábil selecionado, e a
          checagem de integridade que dá valor pericial a este relatório: movimentos marcados como transferência
          com a entidade mas sem o lançamento espelho correspondente — dinheiro que "aparece" de um lado só.
        </p>

        {!entidade ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>
            Cadastre a entidade titular antes de ver a segregação patrimonial.
          </p>
        ) : periodos.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>
            Nenhum período contábil cadastrado para {entidade.nome} ainda.
          </p>
        ) : (
          <>
            <label style={{ fontSize: 12, color: "var(--ink-soft)", display: "block", maxWidth: 260, marginBottom: 16 }}>
              Período contábil
              <select
                style={{ width: "100%", marginTop: 4 }}
                value={periodoSegregacaoId}
                onChange={(e) => setPeriodoSegregacaoManual(e.target.value)}
              >
                {periodos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {String(p.mes).padStart(2, "0")}/{p.ano} ({p.status})
                  </option>
                ))}
              </select>
            </label>

            {segregacao && (
              <>
                <div className="kpi-grid" style={{ marginBottom: 12 }}>
                  <div className="kpi-tile">
                    <div className="label">Total pessoa → entidade</div>
                    <div className="value">{formatarMoeda(segregacao.total_pessoa_para_entidade)}</div>
                  </div>
                  <div className="kpi-tile">
                    <div className="label">Total entidade → pessoa</div>
                    <div className="value">{formatarMoeda(segregacao.total_entidade_para_pessoa)}</div>
                  </div>
                  <div className="kpi-tile">
                    <div className="label">Saldo líquido</div>
                    <div className={`value ${segregacao.saldo_liquido < 0 ? "critical" : "good"}`}>
                      {formatarMoeda(segregacao.saldo_liquido)}
                    </div>
                  </div>
                  <div className="kpi-tile">
                    <div className="label">Integridade</div>
                    <div className={`value ${segregacao.integro ? "good" : "critical"}`}>
                      {segregacao.integro ? "Íntegro" : `${segregacao.transferencias_orfas.length} órfã(s)`}
                    </div>
                  </div>
                </div>

                {segregacao.integro ? (
                  <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>
                    Nenhuma transferência órfã encontrada — toda transferência com a entidade registrada por esta
                    tela tem o lançamento espelho correspondente no razão.
                  </p>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      padding: "12px 14px",
                      borderRadius: 8,
                      background: "color-mix(in srgb, var(--viz-critical) 10%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--viz-critical) 40%, transparent)",
                    }}
                  >
                    <AlertTriangle size={18} style={{ color: "var(--viz-critical)", flexShrink: 0, marginTop: 2 }} />
                    <div style={{ width: "100%" }}>
                      <strong style={{ color: "var(--viz-critical)" }}>
                        {segregacao.transferencias_orfas.length} transferência(s) sem espelho contábil — possível
                        confusão patrimonial
                      </strong>
                      <p style={{ fontSize: 13, margin: "6px 0 10px", color: "var(--ink-soft)" }}>
                        Estes movimentos foram marcados como transferência com a entidade, mas não têm o lançamento
                        correspondente no razão — não deveria acontecer passando pelo formulário acima; indica um
                        movimento inserido por fora dele (ex.: importação manual, migração malfeita). É exatamente o
                        cenário que perícia de confusão patrimonial PF × sociedade de fato precisa poder flagrar.
                      </p>
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Data</th>
                              <th>Pessoa</th>
                              <th>Categoria</th>
                              <th>Descrição</th>
                              <th className="num">Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {segregacao.transferencias_orfas.map((o) => (
                              <tr key={o.movimento_id}>
                                <td>{o.data}</td>
                                <td>{o.pessoa_nome}</td>
                                <td>{ROTULO_CATEGORIA_TRANSFERENCIA[o.categoria as CategoriaTransferenciaEntidade] ?? o.categoria}</td>
                                <td>{o.descricao}</td>
                                <td className="num">{formatarMoeda(o.valor)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
