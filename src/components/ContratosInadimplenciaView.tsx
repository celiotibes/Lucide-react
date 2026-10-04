import { Fragment, useMemo, useState, type CSSProperties } from "react";
import { Check, Loader2, RefreshCcw, Send, X } from "lucide-react";
import { useDb } from "../db/useDb";
import { consultar } from "../db/connection";
import { useToast } from "../ui/useToast";
import { useConfirmar } from "../hooks/useConfirmar";
import { obterEntidadeAtiva } from "../domain/erp/entidadeLegal";
import { listarContasBancarias } from "../domain/conciliacao/conciliacao";
import {
  gerarCompetenciasPendentes,
  apurarInadimplenciaContratoPorCompetencia,
  baixarCompetencia,
  type InadimplenciaPorCompetencia,
  type Competencia,
} from "../domain/erp/aluguel-competencias";
import {
  provisarJurosMora,
  reverterProvisaoJurosMora,
  PERCENTUAL_PERDA_ESPERADA_PADRAO,
} from "../domain/erp/integracao-inadimplencia";
import { detectarMesesSemReceitaAirbnb } from "../domain/reconcile/airbnb";
import { listarPartes } from "../domain/contratos/locatarios";
import { montarMensagemInadimplencia, obterLocatarioPrincipalId, resumirResultadosDisparo } from "../domain/contratos/mensagensNotificacaoContrato";
import { dispararNotificacaoComunicado } from "../domain/notificacoes/despachoCliente";
import { resolverDestinatariosPorContratoId } from "../domain/notificacoes/resolverDestinatarios";
import { criarNotificacoesApiClientHttp } from "../domain/notificacoes/vinculosExternos";
import { VincularTelegramExterno } from "./integracoes/VincularTelegramExterno";
import type { ContratoLocacao, Imovel } from "../domain/types";
import { formatarMoeda } from "../domain/formatarMoeda";

/**
 * Config de backend/sessão para disparar notificação (e-mail/WhatsApp/Telegram) do locatário
 * inadimplente — mesmo padrão (localStorage, chave própria desta tela) de
 * `CobrancasAsaasView.tsx`/`CapturasTelegramView.tsx`. O endereço do backend e o token nunca
 * são dado de negócio (sql.js) — só "para onde apontar" a chamada de disparo.
 */
interface ConfigNotificar {
  enderecoBackend: string;
  tokenSessao: string;
}

const CHAVE_LOCALSTORAGE_NOTIFICAR = "contratos-notificar:config:v1";
const CONFIG_NOTIFICAR_PADRAO: ConfigNotificar = { enderecoBackend: "", tokenSessao: "" };

function carregarConfigNotificar(): ConfigNotificar {
  try {
    const bruto = localStorage.getItem(CHAVE_LOCALSTORAGE_NOTIFICAR);
    if (!bruto) return { ...CONFIG_NOTIFICAR_PADRAO };
    return { ...CONFIG_NOTIFICAR_PADRAO, ...(JSON.parse(bruto) as Partial<ConfigNotificar>) };
  } catch {
    return { ...CONFIG_NOTIFICAR_PADRAO };
  }
}

function salvarConfigNotificar(config: ConfigNotificar): void {
  try {
    localStorage.setItem(CHAVE_LOCALSTORAGE_NOTIFICAR, JSON.stringify(config));
  } catch {
    // Storage bloqueado/cheio — a configuração continua valendo em memória para esta sessão.
  }
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const ROTULO_STATUS: Record<InadimplenciaPorCompetencia["status"], string> = {
  normal: "Em dia",
  com_atraso: "Com atraso",
  em_cobranca: "Em cobrança",
  litigioso: "Litigioso",
};

// Mesma escala de 3 cores já usada no Painel (Dashboard.tsx: corPorFaixa) para as 3 faixas de
// aging 1-30/31-90/90+ dias — aqui mapeada 1:1 para com_atraso/em_cobranca/litigioso, que são
// exatamente essas 3 faixas de dias_atraso vindas de apurarInadimplenciaContratoPorCompetencia.
const COR_SEVERIDADE: Record<InadimplenciaPorCompetencia["status"], string> = {
  normal: "var(--viz-muted)",
  com_atraso: "var(--viz-warning)",
  em_cobranca: "var(--viz-serious)",
  litigioso: "var(--viz-critical)",
};

// .pill só tem classes "good"/"warning"/"critical" prontas (App.css) — não há uma variante
// "serious" própria. com_atraso usa "warning" tal como está; litigioso usa "critical" tal como
// está (já é o mais destacado do sistema: é o único uso do glow sutil, ver comentário em
// App.css). em_cobranca fica entre os dois: mesma classe "warning" (herda padding/borda/fonte),
// mas com fundo/tinta sobrepostos por --viz-serious, para não ficar visualmente idêntico ao
// com_atraso nem ficar reaproveitando um "critical" que a função não estaria justificando.
function estiloPillSeveridade(status: InadimplenciaPorCompetencia["status"]): CSSProperties | undefined {
  if (status !== "em_cobranca") return undefined;
  return {
    background: "color-mix(in srgb, var(--viz-serious) 26%, transparent)",
    color: "var(--pill-critical-ink)",
  };
}

function classePillSeveridade(status: InadimplenciaPorCompetencia["status"]): string {
  return status === "litigioso" ? "critical" : status === "normal" ? "good" : "warning";
}

export function ContratosInadimplenciaView() {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();
  const { confirmar, dialogo } = useConfirmar();
  const hoje = hojeIso();
  const inicioJanela36m = new Date(new Date(hoje).setMonth(new Date(hoje).getMonth() - 36)).toISOString().slice(0, 10);

  const [gerando, setGerando] = useState(false);
  const [expandidoContratoId, setExpandidoContratoId] = useState<number | null>(null);
  const [baixandoCompetenciaId, setBaixandoCompetenciaId] = useState<number | null>(null);
  const [contaBancariaBaixa, setContaBancariaBaixa] = useState<string>("");
  const [dataRecebimentoBaixa, setDataRecebimentoBaixa] = useState<string>("");
  const [provisionandoCompetenciaId, setProvisionandoCompetenciaId] = useState<number | null>(null);
  const [percentualPerdaInput, setPercentualPerdaInput] = useState<string>(String(PERCENTUAL_PERDA_ESPERADA_PADRAO * 100));
  const [revertendoCompetenciaId, setRevertendoCompetenciaId] = useState<number | null>(null);
  const [motivoReversao, setMotivoReversao] = useState<string>("");

  const [configNotificar, setConfigNotificar] = useState<ConfigNotificar>(() => carregarConfigNotificar());
  const notificarConfigurado = configNotificar.enderecoBackend.trim().length > 0 && configNotificar.tokenSessao.trim().length > 0;
  const [notificandoContratoId, setNotificandoContratoId] = useState<number | null>(null);

  function atualizarConfigNotificar(patch: Partial<ConfigNotificar>) {
    setConfigNotificar((atual) => {
      const proximo = { ...atual, ...patch };
      salvarConfigNotificar(proximo);
      return proximo;
    });
  }

  const entidade = useMemo(() => (db ? obterEntidadeAtiva(db) : null), [db, versao]);
  const contasBancarias = useMemo(() => (db ? listarContasBancarias(db) : []), [db, versao]);

  const contratos = useMemo<ContratoLocacao[]>(() => (db ? consultar<ContratoLocacao>(db, "SELECT * FROM contratos_locacao ORDER BY id") : []), [db, versao]);
  const imoveis = useMemo<Map<number, Imovel>>(
    () => new Map((db ? consultar<Imovel>(db, "SELECT * FROM imoveis") : []).map((i) => [i.id, i])),
    [db, versao],
  );
  const partesPorContrato = useMemo(
    () => new Map(contratos.map((c) => [c.id, db ? listarPartes(db, c.id) : []])),
    [db, versao, contratos],
  );
  const contratosPorId = useMemo(() => new Map(contratos.map((c) => [c.id, c])), [contratos]);

  // Fonte de dados nova: uma linha por CONTRATO, apurada a partir das competências
  // (`aluguel_competencias`) já geradas — não mais gerarCompetencias/conciliar/
  // calcularInadimplencia (reconcile/*), que reconstrói o vencimento a cada chamada a partir
  // do mês corrente e nunca deixa `dias_atraso` ultrapassar ~30 dias (mesma limitação que
  // apurarInadimplenciaContrato tem em integracao-inadimplencia.ts, hoje @deprecated). Aqui
  // `dias_atraso` conta da competência pendente MAIS ANTIGA e `valor_aluguel_vencido` soma
  // TODAS as competências pendentes já vencidas — por isso em_cobranca/litigioso são estados
  // alcançáveis de verdade, e não só com_atraso.
  const statusPorContrato = useMemo<InadimplenciaPorCompetencia[]>(() => {
    if (!db) return [];
    return contratos
      .filter((c) => c.tipo === "residencial_fixo")
      .map((c) => apurarInadimplenciaContratoPorCompetencia(db, c.id, hoje))
      .filter((r): r is InadimplenciaPorCompetencia => r !== null && r.status !== "normal")
      .sort((a, b) => b.dias_atraso - a.dias_atraso);
  }, [db, versao, contratos, hoje]);

  // Detalhe (uma linha por competência pendente) usado no "Detalhar" de cada contrato — é o
  // que dá a ação de Baixar uma competência específica (baixarCompetencia recebe o id de UMA
  // competência, nunca "o contrato" como um todo).
  const competenciasPendentesPorContrato = useMemo(() => {
    const mapa = new Map<number, Competencia[]>();
    if (!db) return mapa;
    for (const s of statusPorContrato) {
      if (s.competencias_pendentes_ids.length === 0) continue;
      const placeholders = s.competencias_pendentes_ids.map(() => "?").join(",");
      const linhas = consultar<Competencia>(
        db,
        `SELECT * FROM aluguel_competencias WHERE id IN (${placeholders}) ORDER BY data_vencimento ASC`,
        s.competencias_pendentes_ids,
      );
      mapa.set(s.contrato_id, linhas);
    }
    return mapa;
  }, [db, versao, statusPorContrato]);

  // Competências (dentre as pendentes acima) que já têm provisão de juros/multa de mora VIVA
  // no razão (provisarJurosMora, integracao-inadimplencia.ts) — mesma condição do índice
  // idx_ledger_origem_unica (schema.sql): estorno_de_id/estornado_por_id nulos. Usado só para
  // decidir, por competência, entre mostrar "Provisionar juros de mora" ou o badge +
  // "Reverter provisão".
  const competenciasProvisionadas = useMemo(() => {
    if (!db) return new Set<number>();
    const ids = Array.from(competenciasPendentesPorContrato.values())
      .flat()
      .map((c) => c.id);
    if (ids.length === 0) return new Set<number>();
    const placeholders = ids.map(() => "?").join(",");
    const linhas = consultar<{ origem_id: number }>(
      db,
      `SELECT DISTINCT origem_id FROM ledger_entries
       WHERE origem_modulo = 'inadimplencia_juros' AND origem_id IN (${placeholders})
         AND estorno_de_id IS NULL AND estornado_por_id IS NULL`,
      ids,
    );
    return new Set(linhas.map((l) => l.origem_id));
  }, [db, versao, competenciasPendentesPorContrato]);

  // Airbnb/temporada não entra em apurarInadimplenciaContratoPorCompetencia (não tem
  // dia_vencimento nem valor mensal fixo — gerarCompetenciasPendentes recusa gerar linha pra
  // esse tipo) — sem essa checagem dedicada, um contrato Airbnb ficava sem nenhum controle
  // além do que caía solto no DRE (achado de auditoria de completude).
  const mesesSemReceitaAirbnb = useMemo(
    () => (db ? detectarMesesSemReceitaAirbnb(db, inicioJanela36m, hoje) : []),
    [db, versao, inicioJanela36m, hoje],
  );

  async function gerarCompetenciasDosVigentes() {
    if (!db) return;
    setGerando(true);
    try {
      const vigentes = contratos.filter((c) => c.tipo === "residencial_fixo" && (!c.data_fim || c.data_fim >= hoje));
      let totalCriadas = 0;
      const falhas: string[] = [];
      for (const contrato of vigentes) {
        const resultado = gerarCompetenciasPendentes(db, contrato.id, hoje);
        if (resultado.sucesso) totalCriadas += resultado.competencias_criadas_ids.length;
        else falhas.push(`Contrato #${contrato.id} (${contrato.locatario}): ${resultado.mensagem}`);
      }
      await persistir();
      if (falhas.length > 0) {
        avisar("critical", falhas.join(" | "));
      } else if (totalCriadas > 0) {
        avisar("good", `${totalCriadas} competência(s) gerada(s) para ${vigentes.length} contrato(s) vigente(s).`);
      } else {
        avisar("good", "Nenhuma competência nova a gerar — os contratos vigentes já estão em dia com a geração.");
      }
    } finally {
      setGerando(false);
    }
  }

  function abrirBaixaCompetencia(competenciaId: number) {
    setBaixandoCompetenciaId(competenciaId);
    setContaBancariaBaixa(contasBancarias[0] ? String(contasBancarias[0].id) : "");
    setDataRecebimentoBaixa(hoje);
  }

  async function confirmarBaixaCompetencia() {
    if (!db || baixandoCompetenciaId === null || !contaBancariaBaixa || !entidade) return;
    const resultado = baixarCompetencia(db, baixandoCompetenciaId, Number(contaBancariaBaixa), dataRecebimentoBaixa, entidade.id);
    if (!resultado.sucesso) {
      avisar("critical", resultado.mensagem);
      return;
    }
    await persistir();
    setBaixandoCompetenciaId(null);
    avisar("good", resultado.mensagem);
  }

  function abrirProvisionarJuros(competenciaId: number) {
    setProvisionandoCompetenciaId(competenciaId);
    setPercentualPerdaInput(String(PERCENTUAL_PERDA_ESPERADA_PADRAO * 100));
  }

  async function confirmarProvisionarJuros() {
    if (!db || provisionandoCompetenciaId === null || !entidade) return;
    const percentual = Number(percentualPerdaInput);
    if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
      avisar("critical", "Informe um percentual de perda esperada entre 0 e 100.");
      return;
    }
    try {
      const resultado = provisarJurosMora(db, provisionandoCompetenciaId, entidade.id, {
        percentualPerdaEsperada: percentual / 100,
      });
      if (!resultado.sucesso) {
        avisar("critical", resultado.mensagem);
        return;
      }
      await persistir();
      setProvisionandoCompetenciaId(null);
      avisar(resultado.jaProvisionado ? "warning" : "good", resultado.mensagem);
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : String(erro));
    }
  }

  function abrirReverterProvisao(competenciaId: number) {
    setRevertendoCompetenciaId(competenciaId);
    setMotivoReversao("");
  }

  async function confirmarReverterProvisao() {
    if (!db || revertendoCompetenciaId === null) return;
    if (!motivoReversao.trim()) {
      avisar("critical", "Informe o motivo da reversão da provisão.");
      return;
    }
    const resultado = await confirmar({
      titulo: "Reverter provisão",
      mensagem: "Reverter a provisão de juros/multa de mora lançada para esta competência? Os lançamentos originais ficam no histórico, estornados.",
      textoConfirmar: "Reverter",
      perigo: true,
    });
    if (!resultado) return;
    try {
      const resultado = reverterProvisaoJurosMora(db, revertendoCompetenciaId, motivoReversao.trim());
      if (!resultado.sucesso) {
        avisar("critical", resultado.mensagem);
        return;
      }
      await persistir();
      setRevertendoCompetenciaId(null);
      avisar("good", resultado.mensagem);
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : String(erro));
    }
  }

  async function notificarLocatario(s: InadimplenciaPorCompetencia) {
    if (!db) return;
    if (!notificarConfigurado) {
      avisar("critical", "Configure o endereço do backend e o token de sessão antes de notificar o locatário.");
      return;
    }
    setNotificandoContratoId(s.contrato_id);
    try {
      const apiClient = criarNotificacoesApiClientHttp(configNotificar.enderecoBackend.trim(), configNotificar.tokenSessao.trim());
      const destinatarios = resolverDestinatariosPorContratoId(db, s.contrato_id);
      const contrato = contratosPorId.get(s.contrato_id);
      const { assunto, mensagem } = montarMensagemInadimplencia({
        locatario: contrato?.locatario ?? s.locatario,
        imovelApelido: imoveis.get(s.imovel_id)?.apelido ?? String(s.imovel_id),
        diasAtraso: s.dias_atraso,
        valorAluguelVencido: s.valor_aluguel_vencido,
        multaValor: s.multa_valor,
        jurosValor: s.juros_valor,
        valorTotalDevido: s.valor_total_devido,
      });
      const resultados = await dispararNotificacaoComunicado(db, apiClient, destinatarios, { assunto, mensagem });
      await persistir();
      avisar(resultados.some((r) => r.status === "enviado") ? "good" : "warning", `Notificação de atraso: ${resumirResultadosDisparo(resultados)}.`);
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Erro desconhecido ao notificar o locatário.");
    } finally {
      setNotificandoContratoId(null);
    }
  }

  return (
    <>
    <div>
      <h2 className="section-title">Contratos de locação ({contratos.length})</h2>
      <div className="table-wrap" style={{ marginBottom: 28 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Imóvel</th>
              <th>Locatário</th>
              <th>Partes solidárias</th>
              <th>Tipo</th>
              <th className="num">Valor</th>
              <th>Início</th>
              <th>Fim</th>
            </tr>
          </thead>
          <tbody>
            {contratos.map((c) => {
              const partes = (partesPorContrato.get(c.id) ?? []).filter((p) => p.papel === "responsavel_solidario");
              const coLocatarios = (partesPorContrato.get(c.id) ?? []).filter((p) => p.papel === "locatario");
              return (
                <tr key={c.id}>
                  <td>{imoveis.get(c.imovel_id)?.apelido ?? c.imovel_id}</td>
                  <td>
                    {c.locatario}
                    {coLocatarios.length > 0 && (
                      <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>+ {coLocatarios.map((p) => p.nome).join(", ")}</div>
                    )}
                  </td>
                  <td style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{partes.length > 0 ? partes.map((p) => p.nome).join(", ") : "—"}</td>
                  <td>{c.tipo === "residencial_fixo" ? "Residencial" : "Airbnb"}</td>
                  <td className="num">{formatarMoeda(c.valor_referencia)}</td>
                  <td>{c.data_inicio}</td>
                  <td>{c.data_fim ?? "vigente"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 4 }}>
        <h2 className="section-title" style={{ marginBottom: 0 }}>Inadimplência por competência</h2>
        <button className="btn primary" onClick={gerarCompetenciasDosVigentes} disabled={gerando}>
          <RefreshCcw size={14} /> {gerando ? "Gerando…" : "Gerar competências pendentes (contratos vigentes)"}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ fontSize: 14 }}>Notificação ao locatário — backend e sessão</div>
        <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10, maxWidth: "64ch" }}>
          Usado só para disparar o resumo de atraso por e-mail/WhatsApp/Telegram (botão "Notificar locatário" abaixo) —
          chama o próprio backend (<code>POST /api/notificacoes/disparar</code>), nunca a Asaas/Telegram direto.
        </p>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Endereço do backend
            <input
              className="btn"
              style={{ width: 240, marginTop: 4, cursor: "text" }}
              placeholder="http://localhost:8787"
              value={configNotificar.enderecoBackend}
              onChange={(e) => atualizarConfigNotificar({ enderecoBackend: e.target.value })}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Token de sessão (Bearer)
            <input
              className="btn"
              type="password"
              style={{ width: 240, marginTop: 4, cursor: "text" }}
              placeholder="obtido via POST /api/auth/login"
              value={configNotificar.tokenSessao}
              onChange={(e) => atualizarConfigNotificar({ tokenSessao: e.target.value })}
            />
          </label>
        </div>
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 10, marginBottom: 12, maxWidth: "72ch" }}>
        Cada mês devido de um contrato residencial vira uma competência própria (vencimento e recebimento
        independentes). Por isso "dias de atraso" conta a partir da competência pendente <strong>mais antiga</strong> —
        não do mês corrente — e "aluguel vencido" soma <strong>todas</strong> as competências ainda em aberto, não só a
        mais recente. Multa (duas faixas) e juros pro-rata die incidem uma única vez sobre esse saldo total, usando os
        dias de atraso da competência mais antiga. Use o botão acima para gerar as competências dos meses ainda não
        lançados de todo contrato residencial vigente até hoje.
      </p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Imóvel</th>
              <th>Locatário</th>
              <th>Competências pendentes</th>
              <th className="num">Dias de atraso</th>
              <th className="num">Aluguel vencido</th>
              <th className="num">Multa</th>
              <th className="num">Juros</th>
              <th className="num">Total devido</th>
              <th>Situação</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {statusPorContrato.map((s) => {
              const contrato = contratosPorId.get(s.contrato_id);
              const pendentes = competenciasPendentesPorContrato.get(s.contrato_id) ?? [];
              const maisAntiga = pendentes[0];
              const expandido = expandidoContratoId === s.contrato_id;
              return (
                <Fragment key={s.contrato_id}>
                  <tr>
                    <td style={{ borderLeft: `4px solid ${COR_SEVERIDADE[s.status]}` }}>
                      {imoveis.get(s.imovel_id)?.apelido ?? s.imovel_id}
                    </td>
                    <td>{contrato?.locatario ?? s.locatario}</td>
                    <td>
                      {pendentes.length} {pendentes.length === 1 ? "competência" : "competências"}
                      {maisAntiga && ` (desde ${String(maisAntiga.mes).padStart(2, "0")}/${maisAntiga.ano})`}
                    </td>
                    <td className="num">{s.dias_atraso}</td>
                    <td className="num">{formatarMoeda(s.valor_aluguel_vencido)}</td>
                    <td className="num">{formatarMoeda(s.multa_valor)}</td>
                    <td className="num">{formatarMoeda(s.juros_valor)}</td>
                    <td className="num">{formatarMoeda(s.valor_total_devido)}</td>
                    <td>
                      <span className={`pill ${classePillSeveridade(s.status)}`} style={estiloPillSeveridade(s.status)}>
                        {ROTULO_STATUS[s.status]}
                      </span>
                    </td>
                    <td style={{ display: "flex", gap: 4 }}>
                      <button
                        className="btn"
                        style={{ padding: "4px 8px", fontSize: 12 }}
                        onClick={() => setExpandidoContratoId(expandido ? null : s.contrato_id)}
                      >
                        {expandido ? "Ocultar" : "Detalhar"}
                      </button>
                      <button
                        className="btn primary"
                        style={{ padding: "4px 8px", fontSize: 12 }}
                        disabled={notificandoContratoId === s.contrato_id}
                        title="Notificar o locatário do débito em atraso (e-mail/WhatsApp/Telegram)"
                        onClick={() => notificarLocatario(s)}
                      >
                        {notificandoContratoId === s.contrato_id ? <Loader2 size={12} className="spin" /> : <Send size={12} />} Notificar locatário
                      </button>
                    </td>
                  </tr>
                  {expandido && (
                    <tr>
                      <td colSpan={10} style={{ background: "var(--surface-2)" }}>
                        <div style={{ padding: "10px 4px" }}>
                          {!entidade && (
                            <p style={{ fontSize: 12.5, color: "var(--warn)", marginTop: 0 }}>
                              Cadastre a entidade titular antes de registrar baixa de competência.
                            </p>
                          )}
                          {(() => {
                            const locatarioPrincipalId = db ? obterLocatarioPrincipalId(db, s.contrato_id) : null;
                            return locatarioPrincipalId !== null ? (
                              <VincularTelegramExterno
                                referenciaTipo="contrato_locatario"
                                referenciaId={locatarioPrincipalId}
                                nomeExibicao={contrato?.locatario ?? s.locatario}
                              />
                            ) : null;
                          })()}
                          <table className="data-table" style={{ minWidth: 0 }}>
                            <thead>
                              <tr>
                                <th>Competência</th>
                                <th>Vencimento</th>
                                <th className="num">Valor</th>
                                <th></th>
                                <th>Provisão de mora</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pendentes.map((comp) => {
                                // Provisionar juros/multa de mora só faz sentido a partir de
                                // em_cobranca/litigioso — a mesma escalada de severidade que já
                                // colore a linha do contrato (COR_SEVERIDADE) acima; com_atraso
                                // (≤30 dias) fica só na cobrança amigável, sem provisão contábil.
                                const podeProvisionar = s.status === "em_cobranca" || s.status === "litigioso";
                                const jaProvisionado = competenciasProvisionadas.has(comp.id);
                                return (
                                <Fragment key={comp.id}>
                                  <tr>
                                    <td>{String(comp.mes).padStart(2, "0")}/{comp.ano}</td>
                                    <td>{comp.data_vencimento}</td>
                                    <td className="num">{formatarMoeda(comp.valor_devido)}</td>
                                    <td>
                                      <button
                                        className="btn primary"
                                        style={{ padding: "4px 8px", fontSize: 12 }}
                                        disabled={!entidade}
                                        onClick={() => abrirBaixaCompetencia(comp.id)}
                                      >
                                        Baixar
                                      </button>
                                    </td>
                                    <td>
                                      {!podeProvisionar ? (
                                        <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>—</span>
                                      ) : jaProvisionado ? (
                                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                          <span className="pill good" style={{ fontSize: 11 }}>Provisionado</span>
                                          <button
                                            className="btn"
                                            style={{ padding: "4px 8px", fontSize: 12 }}
                                            onClick={() => abrirReverterProvisao(comp.id)}
                                          >
                                            Reverter provisão
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          className="btn"
                                          style={{ padding: "4px 8px", fontSize: 12 }}
                                          disabled={!entidade}
                                          onClick={() => abrirProvisionarJuros(comp.id)}
                                        >
                                          Provisionar juros de mora
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                  {provisionandoCompetenciaId === comp.id && (
                                    <tr>
                                      <td colSpan={5}>
                                        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", padding: "8px 4px", flexWrap: "wrap" }}>
                                          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                                            % de perda esperada
                                            <input
                                              type="number"
                                              min={0}
                                              max={100}
                                              step={1}
                                              className="btn"
                                              style={{ width: 90, marginTop: 4 }}
                                              value={percentualPerdaInput}
                                              onChange={(e) => setPercentualPerdaInput(e.target.value)}
                                            />
                                          </label>
                                          <button className="btn primary" onClick={confirmarProvisionarJuros}>
                                            <Check size={13} /> Confirmar provisão
                                          </button>
                                          <button className="btn" onClick={() => setProvisionandoCompetenciaId(null)}>
                                            <X size={13} /> Cancelar
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                  {revertendoCompetenciaId === comp.id && (
                                    <tr>
                                      <td colSpan={5}>
                                        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", padding: "8px 4px", flexWrap: "wrap" }}>
                                          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                                            Motivo da reversão
                                            <input
                                              type="text"
                                              className="btn"
                                              style={{ width: 280, marginTop: 4 }}
                                              value={motivoReversao}
                                              onChange={(e) => setMotivoReversao(e.target.value)}
                                              placeholder="ex.: juros pagos integralmente pelo locatário"
                                            />
                                          </label>
                                          <button className="btn primary" onClick={confirmarReverterProvisao}>
                                            <Check size={13} /> Confirmar reversão
                                          </button>
                                          <button className="btn" onClick={() => setRevertendoCompetenciaId(null)}>
                                            <X size={13} /> Cancelar
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                  {baixandoCompetenciaId === comp.id && (
                                    <tr>
                                      <td colSpan={5}>
                                        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", padding: "8px 4px", flexWrap: "wrap" }}>
                                          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                                            Conta bancária
                                            <select
                                              className="btn"
                                              style={{ width: 220, marginTop: 4 }}
                                              value={contaBancariaBaixa}
                                              onChange={(e) => setContaBancariaBaixa(e.target.value)}
                                            >
                                              {contasBancarias.map((cb) => (
                                                <option key={cb.id} value={cb.id}>
                                                  {cb.banco} · {cb.numero}
                                                </option>
                                              ))}
                                            </select>
                                          </label>
                                          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                                            Data de recebimento
                                            <input
                                              type="date"
                                              className="btn"
                                              style={{ marginTop: 4 }}
                                              value={dataRecebimentoBaixa}
                                              onChange={(e) => setDataRecebimentoBaixa(e.target.value)}
                                            />
                                          </label>
                                          <button
                                            className="btn primary"
                                            onClick={confirmarBaixaCompetencia}
                                            disabled={!contaBancariaBaixa || !dataRecebimentoBaixa}
                                          >
                                            <Check size={13} /> Confirmar baixa
                                          </button>
                                          <button className="btn" onClick={() => setBaixandoCompetenciaId(null)}>
                                            <X size={13} /> Cancelar
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                                );
                              })}
                              {pendentes.length === 0 && (
                                <tr>
                                  <td colSpan={5} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 12 }}>
                                    Nenhuma competência pendente encontrada para este contrato.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {statusPorContrato.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                  Nenhuma competência em aberto encontrada. Se há contrato residencial vigente, gere as competências
                  pendentes com o botão acima antes de conferir a inadimplência.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="section-title" style={{ marginTop: 28 }}>Airbnb / temporada — meses sem receita registrada</h2>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12, maxWidth: "68ch" }}>
        Contrato de temporada não tem dia de vencimento nem valor mensal fixo (reserva por reserva) — não dá para
        calcular "competência esperada" como no residencial fixo acima. O que dá para verificar: um mês em que o
        contrato estava vigente e nenhuma transação de receita Airbnb (conta 1.2.01) foi lançada para o imóvel —
        sinal de repasse da plataforma ainda não importado ou lançado sem categoria, não uma afirmação de quanto
        deveria ter sido recebido.
      </p>
      <div className="table-wrap" style={{ marginBottom: 28 }}>
        <table className="data-table">
          <thead><tr><th>Imóvel</th><th>Contrato</th><th>Mês sem receita</th></tr></thead>
          <tbody>
            {mesesSemReceitaAirbnb.map((m, indice) => (
              <tr key={indice}>
                <td>{m.imovelApelido}</td>
                <td>{m.locatario}</td>
                <td>{m.mesReferencia}</td>
              </tr>
            ))}
            {mesesSemReceitaAirbnb.length === 0 && (
              <tr>
                <td colSpan={3} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                  Nenhum mês sem receita Airbnb registrada nos últimos 36 meses (ou nenhum contrato desse tipo cadastrado).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    {dialogo}
    </>
  );
}
