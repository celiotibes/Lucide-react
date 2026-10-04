import { useCallback, useMemo, useState } from "react";
import { Banknote, Info, QrCode, RefreshCw, Send } from "lucide-react";
import { useDb } from "../../db/useDb";
import { consultar } from "../../db/connection";
import { useToast } from "../../ui/useToast";
import { formatarMoeda } from "../../domain/formatarMoeda";
import {
  emitirCobrancaAluguel,
  emitirCobrancaHonorario,
  listarCobrancas,
  aplicarEventosWebhookAsaas,
  type AsaasApiClient,
  type RespostaCobrancaAsaas,
  type StatusCobrancaAsaas,
  type TipoCobranca,
} from "../../domain/integracoes/asaasCobranca";

/**
 * Tela de emissão de boleto/PIX via Asaas — aluguel de inquilino e honorário da
 * advocacia. Toda a regra de negócio (reuso de cliente Asaas, gravação local,
 * aplicação do webhook) vive em `src/domain/integracoes/asaasCobranca.ts`; esta tela só
 * monta as listas, o formulário de emissão e chama o backend (`server/`) através de um
 * `AsaasApiClient` HTTP fino definido abaixo.
 *
 * Como `GerenciamentoPermissoesView.tsx` (mesmo espírito): só existe quando um backend
 * está configurado — sem isso, a tela explica a dependência e não tenta chamar nada. O
 * endereço do backend e o token de sessão (Bearer) ficam em `localStorage`, por ser
 * conveniência de "para onde apontar", não dado de negócio (a Asaas nunca é chamada
 * direto do navegador: `ASAAS_API_KEY` só existe no servidor).
 */

// ============================================================================
// Configuração local (backend + token de sessão) — mesmo padrão de
// src/domain/permissoesAdmin/config.ts, inline aqui por ser de uso exclusivo desta tela.
// ============================================================================

interface ConfiguracaoAsaasView {
  enderecoBackend: string;
  tokenSessao: string;
}

const CHAVE_LOCALSTORAGE = "integracoes-asaas:config:v1";
const CONFIG_PADRAO: ConfiguracaoAsaasView = { enderecoBackend: "", tokenSessao: "" };

function carregarConfig(): ConfiguracaoAsaasView {
  try {
    const bruto = localStorage.getItem(CHAVE_LOCALSTORAGE);
    if (!bruto) return { ...CONFIG_PADRAO };
    return { ...CONFIG_PADRAO, ...(JSON.parse(bruto) as Partial<ConfiguracaoAsaasView>) };
  } catch {
    return { ...CONFIG_PADRAO };
  }
}

function salvarConfig(config: ConfiguracaoAsaasView): void {
  try {
    localStorage.setItem(CHAVE_LOCALSTORAGE, JSON.stringify(config));
  } catch {
    // Storage bloqueado/cheio — a configuração continua valendo em memória para esta
    // sessão, só não sobrevive a um reload (mesmo princípio de carregarConfig/outras telas).
  }
}

function backendConfigurado(config: ConfiguracaoAsaasView): boolean {
  return config.enderecoBackend.trim().length > 0 && config.tokenSessao.trim().length > 0;
}

// ============================================================================
// Cliente HTTP (chama o PRÓPRIO servidor — nunca a Asaas direto do navegador)
// ============================================================================

async function mensagemErroResposta(resposta: Response, acaoDescricao: string): Promise<string> {
  try {
    const corpo = await resposta.json();
    if (typeof corpo?.erro === "string") return corpo.erro;
  } catch {
    /* corpo não é JSON — segue para a mensagem genérica abaixo */
  }
  return `${acaoDescricao} (HTTP ${resposta.status})`;
}

function criarApiClienteHttp(backendUrl: string, token: string): AsaasApiClient {
  const base = backendUrl.replace(/\/+$/, "");
  const cabecalhos = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  return {
    async criarCliente(dados) {
      const resposta = await fetch(`${base}/api/asaas/clientes`, {
        method: "POST",
        headers: cabecalhos,
        body: JSON.stringify(dados),
      });
      if (!resposta.ok) throw new Error(await mensagemErroResposta(resposta, "Falha ao criar cliente na Asaas"));
      return resposta.json();
    },
    async criarCobranca(dados) {
      const resposta = await fetch(`${base}/api/asaas/cobrancas`, {
        method: "POST",
        headers: cabecalhos,
        body: JSON.stringify(dados),
      });
      if (!resposta.ok) throw new Error(await mensagemErroResposta(resposta, "Falha ao criar cobrança na Asaas"));
      return resposta.json() as Promise<RespostaCobrancaAsaas>;
    },
    async consultarCobranca(asaasChargeId) {
      const resposta = await fetch(`${base}/api/asaas/cobrancas/${encodeURIComponent(asaasChargeId)}`, {
        headers: cabecalhos,
      });
      if (!resposta.ok) throw new Error(await mensagemErroResposta(resposta, "Falha ao consultar cobrança na Asaas"));
      return resposta.json() as Promise<RespostaCobrancaAsaas>;
    },
  };
}

interface EventoWebhookPendente {
  id: string;
  payload: unknown;
}

async function buscarEventosWebhookPendentes(backendUrl: string, token: string): Promise<EventoWebhookPendente[]> {
  const base = backendUrl.replace(/\/+$/, "");
  const resposta = await fetch(`${base}/api/eventos-externos/pendentes?tipo=webhook_asaas`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resposta.ok) throw new Error(await mensagemErroResposta(resposta, "Falha ao buscar eventos pendentes"));
  const corpo: { eventos: EventoWebhookPendente[] } = await resposta.json();
  return corpo.eventos;
}

async function marcarEventoConsumido(backendUrl: string, token: string, id: string): Promise<void> {
  const base = backendUrl.replace(/\/+$/, "");
  const resposta = await fetch(`${base}/api/eventos-externos/${encodeURIComponent(id)}/consumir`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resposta.ok) throw new Error(await mensagemErroResposta(resposta, "Falha ao marcar evento como consumido"));
}

// ============================================================================
// Componente
// ============================================================================

type OrigemItem = "aluguel" | "honorario";

interface RascunhoEmissao {
  tipoCobranca: TipoCobranca;
  multaPercentual: string;
  jurosPercentualMensal: string;
}

interface ItemPendenteAluguel {
  id: number;
  contrato_id: number;
  locatario: string;
  valor_devido: number;
  data_vencimento: string;
  multa_percentual: number | null;
  juros_mensal_percentual: number | null;
}

interface ItemPendenteHonorario {
  id: number;
  processo_id: number;
  cliente: string;
  valor_devido: number;
  data_vencimento: string;
}

const STATUS_VARIANTE: Record<StatusCobrancaAsaas, "good" | "warning" | "critical"> = {
  pago: "good",
  pendente: "warning",
  atrasado: "critical",
  cancelado: "critical",
};

const STATUS_LABEL: Record<StatusCobrancaAsaas, string> = {
  pendente: "Pendente",
  pago: "Pago",
  atrasado: "Atrasado",
  cancelado: "Cancelado",
};

function rascunhoPadrao(multa: number | null = 2, juros: number | null = 1): RascunhoEmissao {
  return { tipoCobranca: "boleto", multaPercentual: String(multa ?? 2), jurosPercentualMensal: String(juros ?? 1) };
}

export function CobrancasAsaasView() {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();

  const [config, setConfig] = useState<ConfiguracaoAsaasView>(() => carregarConfig());
  const configurado = backendConfigurado(config);

  const [rascunhos, setRascunhos] = useState<Record<string, RascunhoEmissao>>({});
  const [emitindo, setEmitindo] = useState<string | null>(null);
  const [verificandoWebhook, setVerificandoWebhook] = useState(false);

  function atualizarConfig(patch: Partial<ConfiguracaoAsaasView>) {
    setConfig((atual) => {
      const proximo = { ...atual, ...patch };
      salvarConfig(proximo);
      return proximo;
    });
  }

  function rascunhoDe(chave: string, multaDefault: number | null, jurosDefault: number | null): RascunhoEmissao {
    return rascunhos[chave] ?? rascunhoPadrao(multaDefault, jurosDefault);
  }

  function atualizarRascunho(chave: string, patch: Partial<RascunhoEmissao>, multaDefault: number | null, jurosDefault: number | null) {
    setRascunhos((atual) => ({ ...atual, [chave]: { ...rascunhoDe(chave, multaDefault, jurosDefault), ...patch } }));
  }

  const pendentesAluguel = useMemo<ItemPendenteAluguel[]>(() => {
    if (!db) return [];
    return consultar<ItemPendenteAluguel>(
      db,
      `SELECT ac.id, ac.contrato_id, cl.locatario, ac.valor_devido, ac.data_vencimento,
              cl.multa_percentual, cl.juros_mensal_percentual
       FROM aluguel_competencias ac
       JOIN contratos_locacao cl ON cl.id = ac.contrato_id
       WHERE ac.status = 'pendente'
         AND ac.id NOT IN (
           SELECT origem_id FROM cobrancas_asaas WHERE origem_tipo = 'aluguel_competencia' AND status != 'cancelado'
         )
       ORDER BY ac.data_vencimento ASC`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, versao]);

  const pendentesHonorarios = useMemo<ItemPendenteHonorario[]>(() => {
    if (!db) return [];
    return consultar<ItemPendenteHonorario>(
      db,
      `SELECT h.id, h.processo_id, el.nome AS cliente, h.valor_devido, h.data_vencimento
       FROM honorarios_advocaticios h
       JOIN processos_legais p ON p.id = h.processo_id
       JOIN entidades_legais el ON el.id = p.entidade_id
       WHERE h.status = 'pendente'
         AND h.id NOT IN (
           SELECT origem_id FROM cobrancas_asaas WHERE origem_tipo = 'honorario_advocaticio' AND status != 'cancelado'
         )
       ORDER BY h.data_vencimento ASC`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, versao]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `versao` força o recálculo após persistir() mutar o mesmo `db` em memória.
  const cobrancasEmitidas = useMemo(() => (db ? listarCobrancas(db) : []), [db, versao]);

  const emitir = useCallback(
    async (origem: OrigemItem, id: number, chave: string, multaDefault: number | null, jurosDefault: number | null) => {
      if (!db) return;
      if (!configurado) {
        avisar("critical", "Configure o endereço do backend e o token de sessão antes de emitir uma cobrança.");
        return;
      }
      const rascunho = rascunhoDe(chave, multaDefault, jurosDefault);
      const multa = Number(rascunho.multaPercentual.replace(",", "."));
      const juros = Number(rascunho.jurosPercentualMensal.replace(",", "."));

      setEmitindo(chave);
      try {
        const apiClient = criarApiClienteHttp(config.enderecoBackend.trim(), config.tokenSessao.trim());
        const opcoes = {
          tipoCobranca: rascunho.tipoCobranca,
          multaPercentual: Number.isFinite(multa) && multa > 0 ? multa : undefined,
          jurosPercentualMensal: Number.isFinite(juros) && juros > 0 ? juros : undefined,
        };
        const cobranca =
          origem === "aluguel"
            ? await emitirCobrancaAluguel(db, apiClient, id, opcoes)
            : await emitirCobrancaHonorario(db, apiClient, id, opcoes);
        await persistir();
        avisar("good", `Cobrança emitida (${cobranca.tipoCobranca === "pix" ? "PIX" : "boleto"}) — status atual: ${STATUS_LABEL[cobranca.status]}.`);
      } catch (erro) {
        avisar("critical", erro instanceof Error ? erro.message : "Erro desconhecido ao emitir a cobrança.");
      } finally {
        setEmitindo(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `rascunhoDe` lê `rascunhos`, já listado como dependência.
    [db, configurado, config, persistir, avisar, rascunhos],
  );

  const verificarWebhook = useCallback(async () => {
    if (!db) return;
    if (!configurado) {
      avisar("critical", "Configure o endereço do backend e o token de sessão antes de verificar pagamentos.");
      return;
    }
    setVerificandoWebhook(true);
    try {
      const backend = config.enderecoBackend.trim();
      const token = config.tokenSessao.trim();
      const eventos = await buscarEventosWebhookPendentes(backend, token);
      if (eventos.length === 0) {
        avisar("good", "Nenhuma atualização pendente da Asaas.");
        return;
      }
      const resultados = aplicarEventosWebhookAsaas(db, eventos);
      let aplicados = 0;
      for (const resultado of resultados) {
        if (resultado.aplicado) {
          aplicados++;
          await marcarEventoConsumido(backend, token, resultado.eventoId);
        }
      }
      await persistir();
      avisar("good", `${aplicados} de ${eventos.length} evento(s) da Asaas aplicado(s).`);
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Erro desconhecido ao verificar pagamentos.");
    } finally {
      setVerificandoWebhook(false);
    }
  }, [db, configurado, config, persistir, avisar]);

  if (!db) {
    return <p style={{ color: "var(--ink-soft)" }}>Carregando banco de dados…</p>;
  }

  return (
    <div>
      <h2 className="section-title">
        <Banknote size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />
        Cobranças Asaas — boleto e PIX (aluguel e honorários)
      </h2>

      <div className="aviso-caixa" style={{ marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Info size={18} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          <strong>A Asaas calcula e cobra multa/juros de atraso automaticamente</strong> conforme os percentuais informados
          abaixo na emissão (campos <code>fine</code>/<code>interest</code> da cobrança) — este sistema nunca recalcula isso
          por conta própria. Essa configuração é <strong>independente</strong> da lógica de inadimplência já existente no
          sistema (Histórico de juros pagos, Priorização de quitação): uma rege o que a Asaas cobra do pagador no boleto/PIX,
          a outra é o controle interno de dívida. A confirmação de pagamento (via webhook, botão abaixo) atualiza o status da
          cobrança e marca a competência/honorário como recebido — ela <strong>não lança nada no razão contábil</strong>: a
          baixa contábil de fato continua exigindo o fluxo de conciliação bancária já existente, com a conta de destino
          escolhida e o documento-fonte correspondente.
        </span>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, marginBottom: 10 }}>Backend e sessão</h3>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Endereço do backend
            <input
              className="btn"
              style={{ width: 280, marginTop: 4, cursor: "text" }}
              placeholder="http://localhost:8787"
              value={config.enderecoBackend}
              onChange={(e) => atualizarConfig({ enderecoBackend: e.target.value })}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Token de sessão (Bearer)
            <input
              className="btn"
              type="password"
              style={{ width: 280, marginTop: 4, cursor: "text" }}
              placeholder="token Bearer (modo legado; prefira o login por sessão)"
              value={config.tokenSessao}
              onChange={(e) => atualizarConfig({ tokenSessao: e.target.value })}
            />
          </label>
          <button className="btn" onClick={verificarWebhook} disabled={!configurado || verificandoWebhook}>
            <RefreshCw size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} className={verificandoWebhook ? "spin" : undefined} />
            Verificar pagamentos (webhook Asaas)
          </button>
        </div>
        {!configurado && (
          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 10 }}>
            Sem backend/token configurados, esta tela só mostra as listas — nenhuma chamada à Asaas é feita (
            <code>ASAAS_API_KEY</code> nunca existe no navegador; só o servidor a lê, no momento da chamada).
          </p>
        )}
      </div>

      {/* Aluguéis pendentes sem cobrança ativa */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Aluguéis pendentes sem cobrança emitida</h3>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12 }}>{pendentesAluguel.length} competência(s).</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Locatário</th>
                <th>Contrato</th>
                <th className="num">Valor</th>
                <th>Vencimento</th>
                <th>Tipo</th>
                <th className="num">Multa %</th>
                <th className="num">Juros %/mês</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {pendentesAluguel.map((item) => {
                const chave = `aluguel-${item.id}`;
                const rascunho = rascunhoDe(chave, item.multa_percentual, item.juros_mensal_percentual);
                return (
                  <tr key={chave}>
                    <td>{item.locatario}</td>
                    <td>#{item.contrato_id}</td>
                    <td className="num">{formatarMoeda(item.valor_devido)}</td>
                    <td>{item.data_vencimento}</td>
                    <td>
                      <select
                        className="btn"
                        value={rascunho.tipoCobranca}
                        onChange={(e) =>
                          atualizarRascunho(chave, { tipoCobranca: e.target.value as TipoCobranca }, item.multa_percentual, item.juros_mensal_percentual)
                        }
                      >
                        <option value="boleto">Boleto</option>
                        <option value="pix">PIX</option>
                      </select>
                    </td>
                    <td className="num">
                      <input
                        className="btn"
                        style={{ width: 70, textAlign: "right", cursor: "text" }}
                        value={rascunho.multaPercentual}
                        onChange={(e) => atualizarRascunho(chave, { multaPercentual: e.target.value }, item.multa_percentual, item.juros_mensal_percentual)}
                      />
                    </td>
                    <td className="num">
                      <input
                        className="btn"
                        style={{ width: 70, textAlign: "right", cursor: "text" }}
                        value={rascunho.jurosPercentualMensal}
                        onChange={(e) =>
                          atualizarRascunho(chave, { jurosPercentualMensal: e.target.value }, item.multa_percentual, item.juros_mensal_percentual)
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="btn primary"
                        disabled={!configurado || emitindo === chave}
                        onClick={() => emitir("aluguel", item.id, chave, item.multa_percentual, item.juros_mensal_percentual)}
                      >
                        <Send size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                        Emitir
                      </button>
                    </td>
                  </tr>
                );
              })}
              {pendentesAluguel.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ color: "var(--ink-soft)" }}>
                    Nenhuma competência de aluguel pendente sem cobrança emitida.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Honorários pendentes sem cobrança ativa */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Honorários advocatícios pendentes sem cobrança emitida</h3>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12 }}>{pendentesHonorarios.length} parcela(s).</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Processo</th>
                <th className="num">Valor</th>
                <th>Vencimento</th>
                <th>Tipo</th>
                <th className="num">Multa %</th>
                <th className="num">Juros %/mês</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {pendentesHonorarios.map((item) => {
                const chave = `honorario-${item.id}`;
                const rascunho = rascunhoDe(chave, null, null);
                return (
                  <tr key={chave}>
                    <td>{item.cliente}</td>
                    <td>#{item.processo_id}</td>
                    <td className="num">{formatarMoeda(item.valor_devido)}</td>
                    <td>{item.data_vencimento}</td>
                    <td>
                      <select
                        className="btn"
                        value={rascunho.tipoCobranca}
                        onChange={(e) => atualizarRascunho(chave, { tipoCobranca: e.target.value as TipoCobranca }, null, null)}
                      >
                        <option value="boleto">Boleto</option>
                        <option value="pix">PIX</option>
                      </select>
                    </td>
                    <td className="num">
                      <input
                        className="btn"
                        style={{ width: 70, textAlign: "right", cursor: "text" }}
                        value={rascunho.multaPercentual}
                        onChange={(e) => atualizarRascunho(chave, { multaPercentual: e.target.value }, null, null)}
                      />
                    </td>
                    <td className="num">
                      <input
                        className="btn"
                        style={{ width: 70, textAlign: "right", cursor: "text" }}
                        value={rascunho.jurosPercentualMensal}
                        onChange={(e) => atualizarRascunho(chave, { jurosPercentualMensal: e.target.value }, null, null)}
                      />
                    </td>
                    <td>
                      <button
                        className="btn primary"
                        disabled={!configurado || emitindo === chave}
                        onClick={() => emitir("honorario", item.id, chave, null, null)}
                      >
                        <Send size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                        Emitir
                      </button>
                    </td>
                  </tr>
                );
              })}
              {pendentesHonorarios.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ color: "var(--ink-soft)" }}>
                    Nenhuma parcela de honorário pendente sem cobrança emitida.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cobranças já emitidas */}
      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Cobranças emitidas</h3>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12 }}>{cobrancasEmitidas.length} cobrança(s).</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Origem</th>
                <th>Tipo</th>
                <th className="num">Valor</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th>Boleto / linha digitável</th>
                <th>PIX</th>
              </tr>
            </thead>
            <tbody>
              {cobrancasEmitidas.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.origemTipo === "aluguel_competencia" ? "Aluguel" : "Honorário"} #{c.origemId}
                  </td>
                  <td>{c.tipoCobranca === "pix" ? "PIX" : "Boleto"}</td>
                  <td className="num">{formatarMoeda(c.valor)}</td>
                  <td>{c.dataVencimento}</td>
                  <td>
                    <span className={`pill ${STATUS_VARIANTE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                  </td>
                  <td>
                    {c.boletoUrl ? (
                      <a href={c.boletoUrl} target="_blank" rel="noreferrer">
                        Abrir boleto
                      </a>
                    ) : c.linhaDigitavel ? (
                      <span style={{ fontFamily: "monospace", fontSize: 11.5 }}>{c.linhaDigitavel}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {c.pixQrcode ? (
                      <span title={c.pixQrcode}>
                        <QrCode size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                        QR disponível
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {cobrancasEmitidas.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ color: "var(--ink-soft)" }}>
                    Nenhuma cobrança emitida ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
