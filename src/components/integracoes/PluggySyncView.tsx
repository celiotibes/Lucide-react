import { useMemo, useState } from "react";
import { Wallet, Info, RefreshCw, Link2 } from "lucide-react";
import { useDb } from "../../db/useDb";
import { consultar } from "../../db/connection";
import { useToast } from "../../ui/useToast";
import {
  vincularContaPluggy,
  listarContasVinculadas,
  sincronizarTransacoes,
  type PluggyMeuApiClient,
  type ContaPluggyMeuDisponivel,
  type ContaVinculadaPluggy,
} from "../../domain/integracoes/pluggySync";
import type { ContaBancaria } from "../../domain/types";

/**
 * Tela de sincronização bancária PESSOAL via MeuPluggy (meu.pluggy.ai — uso gratuito, até 5
 * conexões, atualização a cada 24h), PARALELA ao fluxo comercial já existente
 * (`ConectarPluggy.tsx`, dentro de Importar documentos, que usa o widget Pluggy Connect com
 * credenciais comerciais). Aqui o usuário já conectou as contas por fora, em meu.pluggy.ai;
 * esta tela só lista o que já está conectado (via o backend `server/`, nunca a Pluggy direto
 * do navegador), vincula a uma conta bancária já cadastrada e sincroniza as transações —
 * tudo por `src/domain/integracoes/pluggySync.ts`, que entrega as transações à MESMA triagem
 * (lotes_importacao/importacao_linhas) que a importação manual de extrato usa.
 *
 * Como `CobrancasAsaasView.tsx`/`GerenciamentoPermissoesView.tsx` (mesmo espírito): só existe
 * quando um backend está configurado — sem isso, a tela explica a dependência e não tenta
 * chamar nada. O endereço do backend e o token de sessão (Bearer) ficam em `localStorage`
 * deste navegador — conveniência de "para onde apontar", não dado de negócio. As credenciais
 * PLUGGY_MEU_CLIENT_ID/PLUGGY_MEU_CLIENT_SECRET nunca existem aqui: só o servidor as lê, no
 * momento da chamada (ver server/src/pluggy-meu.ts).
 */

// ============================================================================
// Configuração local (backend + token de sessão) — mesmo padrão de
// src/components/integracoes/CobrancasAsaasView.tsx, inline por ser de uso exclusivo desta tela.
// ============================================================================

interface ConfiguracaoPluggyMeuView {
  enderecoBackend: string;
  tokenSessao: string;
}

const CHAVE_LOCALSTORAGE = "integracoes-pluggy-meu:config:v1";
const CONFIG_PADRAO: ConfiguracaoPluggyMeuView = { enderecoBackend: "", tokenSessao: "" };

function carregarConfig(): ConfiguracaoPluggyMeuView {
  try {
    const bruto = localStorage.getItem(CHAVE_LOCALSTORAGE);
    if (!bruto) return { ...CONFIG_PADRAO };
    return { ...CONFIG_PADRAO, ...(JSON.parse(bruto) as Partial<ConfiguracaoPluggyMeuView>) };
  } catch {
    return { ...CONFIG_PADRAO };
  }
}

function salvarConfig(config: ConfiguracaoPluggyMeuView): void {
  try {
    localStorage.setItem(CHAVE_LOCALSTORAGE, JSON.stringify(config));
  } catch {
    // Storage bloqueado/cheio — a configuração continua valendo em memória para esta sessão,
    // só não sobrevive a um reload (mesmo princípio das outras telas de integração).
  }
}

function backendConfigurado(config: ConfiguracaoPluggyMeuView): boolean {
  return config.enderecoBackend.trim().length > 0 && config.tokenSessao.trim().length > 0;
}

// ============================================================================
// Cliente HTTP (chama o PRÓPRIO servidor — nunca a Pluggy direto do navegador)
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

function criarApiClienteHttp(backendUrl: string, token: string): PluggyMeuApiClient {
  const base = backendUrl.replace(/\/+$/, "");
  const cabecalhos = { Authorization: `Bearer ${token}` };

  return {
    async listarContas() {
      const resposta = await fetch(`${base}/api/pluggy-meu/contas`, { headers: cabecalhos });
      if (!resposta.ok) throw new Error(await mensagemErroResposta(resposta, "Falha ao listar contas do MeuPluggy"));
      const corpo: { contas: ContaPluggyMeuDisponivel[] } = await resposta.json();
      return corpo.contas;
    },
    async buscarTransacoes(accountId, opcoes) {
      const parametros = new URLSearchParams();
      if (opcoes?.dataInicio) parametros.set("dataInicio", opcoes.dataInicio);
      if (opcoes?.dataFim) parametros.set("dataFim", opcoes.dataFim);
      const query = parametros.toString();
      const resposta = await fetch(
        `${base}/api/pluggy-meu/contas/${encodeURIComponent(accountId)}/transacoes${query ? `?${query}` : ""}`,
        { headers: cabecalhos },
      );
      if (!resposta.ok) throw new Error(await mensagemErroResposta(resposta, "Falha ao buscar transações do MeuPluggy"));
      const corpo: { transacoes: Awaited<ReturnType<PluggyMeuApiClient["buscarTransacoes"]>> } = await resposta.json();
      return corpo.transacoes;
    },
  };
}

// ============================================================================
// Componente
// ============================================================================

const ROTULO_STATUS: Record<ContaVinculadaPluggy["status_sincronizacao"], string> = {
  ok: "OK",
  erro: "Erro",
  desconectado: "Desconectado",
};

const VARIANTE_STATUS: Record<ContaVinculadaPluggy["status_sincronizacao"], "good" | "warning" | "critical"> = {
  ok: "good",
  erro: "critical",
  desconectado: "warning",
};

function dataDeHoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function dataNoPassado(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function PluggySyncView() {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();

  const [config, setConfig] = useState<ConfiguracaoPluggyMeuView>(() => carregarConfig());
  const configurado = backendConfigurado(config);

  const [buscandoContas, setBuscandoContas] = useState(false);
  const [contasDisponiveis, setContasDisponiveis] = useState<ContaPluggyMeuDisponivel[]>([]);
  const [contaPluggySelecionada, setContaPluggySelecionada] = useState<string>("");
  const [contaLocalParaVincular, setContaLocalParaVincular] = useState<number | "">("");
  const [vinculando, setVinculando] = useState(false);

  const [janelas, setJanelas] = useState<Record<number, { dataInicio: string; dataFim: string }>>({});
  const [sincronizando, setSincronizando] = useState<number | null>(null);

  function atualizarConfig(patch: Partial<ConfiguracaoPluggyMeuView>) {
    setConfig((atual) => {
      const proximo = { ...atual, ...patch };
      salvarConfig(proximo);
      return proximo;
    });
  }

  const contasLocais = useMemo<ContaBancaria[]>(
    () => (db ? consultar<ContaBancaria>(db, "SELECT * FROM contas_bancarias ORDER BY banco") : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, versao],
  );

  const vinculos = useMemo<ContaVinculadaPluggy[]>(
    () => (db ? listarContasVinculadas(db) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, versao],
  );

  function janelaDe(vinculoId: number): { dataInicio: string; dataFim: string } {
    return janelas[vinculoId] ?? { dataInicio: dataNoPassado(90), dataFim: dataDeHoje() };
  }

  function atualizarJanela(vinculoId: number, patch: Partial<{ dataInicio: string; dataFim: string }>) {
    setJanelas((atual) => ({ ...atual, [vinculoId]: { ...janelaDe(vinculoId), ...patch } }));
  }

  async function buscarContasDisponiveis() {
    if (!configurado) {
      avisar("critical", "Configure o endereço do backend e o token de sessão antes de buscar contas no MeuPluggy.");
      return;
    }
    setBuscandoContas(true);
    try {
      const apiClient = criarApiClienteHttp(config.enderecoBackend.trim(), config.tokenSessao.trim());
      const contas = await apiClient.listarContas();
      setContasDisponiveis(contas);
      setContaPluggySelecionada(contas[0]?.contaId ?? "");
      if (contas.length === 0) {
        avisar(
          "warning",
          "Nenhuma conta encontrada. Confira se PLUGGY_MEU_ITEM_IDS está configurado no servidor e se as contas já terminaram de sincronizar em meu.pluggy.ai.",
        );
      }
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Erro desconhecido ao buscar contas do MeuPluggy.");
    } finally {
      setBuscandoContas(false);
    }
  }

  async function vincular() {
    if (!db || contaPluggySelecionada === "" || contaLocalParaVincular === "") return;
    const contaPluggy = contasDisponiveis.find((c) => c.contaId === contaPluggySelecionada);
    if (!contaPluggy) return;

    setVinculando(true);
    try {
      vincularContaPluggy(db, Number(contaLocalParaVincular), {
        itemId: contaPluggy.itemId,
        accountId: contaPluggy.contaId,
        nomeInstituicao: contaPluggy.nomeInstituicao,
      });
      await persistir();
      avisar("good", `Conta "${contaPluggy.nomeConta}" (${contaPluggy.nomeInstituicao}) vinculada.`);
      setContaPluggySelecionada("");
      setContaLocalParaVincular("");
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Erro desconhecido ao vincular a conta.");
    } finally {
      setVinculando(false);
    }
  }

  async function sincronizar(vinculo: ContaVinculadaPluggy) {
    if (!db) return;
    if (!configurado) {
      avisar("critical", "Configure o endereço do backend e o token de sessão antes de sincronizar.");
      return;
    }
    setSincronizando(vinculo.id);
    try {
      const apiClient = criarApiClienteHttp(config.enderecoBackend.trim(), config.tokenSessao.trim());
      const janela = janelaDe(vinculo.id);
      const resultado = await sincronizarTransacoes(db, apiClient, vinculo.conta_bancaria_id, {
        dataInicio: janela.dataInicio,
        dataFim: janela.dataFim,
      });

      if (resultado.ja_sincronizado_antes) {
        avisar("good", "Nenhuma transação nova nesta janela — já estava sincronizada.");
      } else {
        const partes = [`${resultado.inseridas} linha(s) enviada(s) para a Triagem de importação.`];
        if (resultado.duplicadas > 0) partes.push(`${resultado.duplicadas} marcada(s) como possível duplicidade.`);
        if (resultado.malformadas > 0) partes.push(`${resultado.malformadas} com data ou valor ilegível.`);
        avisar("good", partes.join(" "));
      }
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Erro desconhecido ao sincronizar esta conta.");
    } finally {
      setSincronizando(null);
      // persiste sempre, sucesso ou erro: sincronizarTransacoes (pluggySync.ts) já grava
      // status_sincronizacao='erro'/observacoes no banco mesmo quando rejeita, e esse estado
      // só sobrevive a um reload se for salvo aqui.
      await persistir();
    }
  }

  if (!db) {
    return <p style={{ color: "var(--ink-soft)" }}>Carregando banco de dados…</p>;
  }

  return (
    <div>
      <h2 className="section-title">
        <Wallet size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />
        Sincronização bancária pessoal (MeuPluggy)
      </h2>

      <div className="aviso-caixa" style={{ marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Info size={18} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          <strong>MeuPluggy é o uso pessoal e gratuito da Pluggy</strong> (meu.pluggy.ai): até <strong>5 contas</strong>{" "}
          conectadas, atualizadas a cada <strong>24 horas</strong> pela própria Pluggy. As contas são conectadas por
          fora, direto em meu.pluggy.ai — esta tela só lista o que já está conectado e sincroniza. É{" "}
          <strong>diferente</strong> da integração comercial de Open Finace já existente (aba Importar documentos, com
          o widget de conexão), que usa outras credenciais. Toda transação trazida aqui entra em{" "}
          <strong>triagem</strong>, exatamente como um extrato importado à mão — passa pela mesma classificação manual
          e só vira lançamento no razão depois de aprovada na aba Triagem de importação; nada é lançado direto.
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
        </div>
        {!configurado && (
          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 10 }}>
            Sem backend/token configurados, esta tela só mostra os vínculos já existentes — nenhuma chamada é feita (
            <code>PLUGGY_MEU_CLIENT_ID</code>/<code>PLUGGY_MEU_CLIENT_SECRET</code> nunca existem no navegador; só o
            servidor os lê, no momento da chamada).
          </p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 10 }}>Vincular uma conta do MeuPluggy</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <button className="btn" disabled={!configurado || buscandoContas} onClick={buscarContasDisponiveis}>
            <RefreshCw size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} className={buscandoContas ? "spin" : undefined} />
            Buscar contas disponíveis no MeuPluggy
          </button>
          {contasDisponiveis.length > 0 && <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{contasDisponiveis.length} conta(s) encontrada(s).</span>}
        </div>

        {contasDisponiveis.length > 0 && (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Conta no MeuPluggy
              <select
                className="btn"
                style={{ display: "block", marginTop: 4, minWidth: 260 }}
                value={contaPluggySelecionada}
                onChange={(e) => setContaPluggySelecionada(e.target.value)}
              >
                {contasDisponiveis.map((c) => (
                  <option key={c.contaId} value={c.contaId}>
                    {c.nomeInstituicao} — {c.nomeConta} ({c.numero}) · {c.tipo}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Vincular à conta bancária
              <select
                className="btn"
                style={{ display: "block", marginTop: 4, minWidth: 220 }}
                value={contaLocalParaVincular}
                onChange={(e) => setContaLocalParaVincular(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">— escolher —</option>
                {contasLocais.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.banco} — {c.numero}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn primary" disabled={contaLocalParaVincular === "" || vinculando} onClick={vincular}>
              <Link2 size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
              Vincular
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Contas vinculadas</h3>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12 }}>{vinculos.length} conta(s) vinculada(s).</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Conta bancária</th>
                <th>Instituição (MeuPluggy)</th>
                <th>Última sincronização</th>
                <th>Status</th>
                <th>Período</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {vinculos.map((v) => {
                const janela = janelaDe(v.id);
                return (
                  <tr key={v.id}>
                    <td>
                      {v.banco} — {v.numero}
                    </td>
                    <td>{v.nome_instituicao_pluggy ?? "—"}</td>
                    <td>{v.ultima_sincronizacao ?? "nunca sincronizada"}</td>
                    <td>
                      <span className={`pill ${VARIANTE_STATUS[v.status_sincronizacao]}`} title={v.observacoes ?? undefined}>
                        {ROTULO_STATUS[v.status_sincronizacao]}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          type="date"
                          className="btn"
                          style={{ width: 128 }}
                          value={janela.dataInicio}
                          onChange={(e) => atualizarJanela(v.id, { dataInicio: e.target.value })}
                        />
                        <input
                          type="date"
                          className="btn"
                          style={{ width: 128 }}
                          value={janela.dataFim}
                          onChange={(e) => atualizarJanela(v.id, { dataFim: e.target.value })}
                        />
                      </div>
                    </td>
                    <td>
                      <button className="btn primary" disabled={!configurado || sincronizando === v.id} onClick={() => sincronizar(v)}>
                        <RefreshCw size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} className={sincronizando === v.id ? "spin" : undefined} />
                        Sincronizar agora
                      </button>
                    </td>
                  </tr>
                );
              })}
              {vinculos.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ color: "var(--ink-soft)" }}>
                    Nenhuma conta vinculada ainda — busque as contas disponíveis no MeuPluggy acima e vincule a uma
                    conta bancária já cadastrada.
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
