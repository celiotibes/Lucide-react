import { useCallback, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, RefreshCw, Trash2 } from "lucide-react";
import { useToast } from "./useToast";
import {
  carregarConfiguracaoIA,
  salvarConfiguracaoIA,
  type ConfiguracaoIA,
} from "../domain/ia/config";
import { registroProveniencia, type RegistroChamadaIA } from "../domain/ia/proveniencia";
import type { IdProvedorIA } from "../domain/ia/tipos";

/** Tela de configuração do roteador de IA multi-provedor.
 *
 * Não usa `useDb`: nada aqui é gravado no banco sql.js da contabilidade — a configuração de
 * provedores vive em localStorage (config.ts) e o histórico de chamadas vive em memória do
 * processo (proveniencia.ts), porque persistir isso de verdade exigiria uma tabela nova
 * (ex: `ia_chamadas`) em contabilidade-reconstituicao/schema.sql, fora do escopo de arquivo
 * desta tarefa — ver o aviso de limitação abaixo, também exibido na própria tela. */

const PROVEDORES_ORDEM_EXIBICAO: IdProvedorIA[] = ["anthropic", "openai", "google", "ollama"];

const NOME_PROVEDOR: Record<IdProvedorIA, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (ChatGPT)",
  google: "Google (Gemini)",
  ollama: "Ollama (Llama local)",
};

function formatarUsd(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 4 });
}

function formatarQuando(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

export function ConfiguracaoIA() {
  const { avisar } = useToast();
  const [config, setConfig] = useState<ConfiguracaoIA>(() => carregarConfiguracaoIA());
  const [tick, setTick] = useState(0);

  const historico = useMemo<readonly RegistroChamadaIA[]>(
    () => registroProveniencia.listar(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );
  const custoAcumulado = useMemo(
    () => registroProveniencia.custoAcumuladoUsd(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );

  const salvar = useCallback(
    (proximo: ConfiguracaoIA) => {
      setConfig(proximo);
      salvarConfiguracaoIA(proximo);
    },
    [],
  );

  const alterarProvedor = useCallback(
    (id: IdProvedorIA, patch: Partial<ConfiguracaoIA["provedores"][IdProvedorIA]>) => {
      salvar({
        ...config,
        provedores: { ...config.provedores, [id]: { ...config.provedores[id], ...patch } },
      });
    },
    [config, salvar],
  );

  const moverNaOrdemRodizio = useCallback(
    (id: IdProvedorIA, direcao: -1 | 1) => {
      const ordem = [...config.ordemRodizio];
      const indice = ordem.indexOf(id);
      const alvo = indice + direcao;
      if (indice < 0 || alvo < 0 || alvo >= ordem.length) return;
      [ordem[indice], ordem[alvo]] = [ordem[alvo], ordem[indice]];
      salvar({ ...config, ordemRodizio: ordem });
    },
    [config, salvar],
  );

  const alternarNoRodizio = useCallback(
    (id: IdProvedorIA) => {
      const estaNoRodizio = config.ordemRodizio.includes(id);
      const ordem = estaNoRodizio
        ? config.ordemRodizio.filter((p) => p !== id)
        : [...config.ordemRodizio, id];
      salvar({ ...config, ordemRodizio: ordem });
    },
    [config, salvar],
  );

  const atualizarHistorico = useCallback(() => setTick((t) => t + 1), []);

  const limparHistorico = useCallback(() => {
    registroProveniencia.limpar();
    atualizarHistorico();
    avisar("good", "Histórico de chamadas de IA limpo (só afeta esta sessão do navegador).");
  }, [atualizarHistorico, avisar]);

  const salvarPreferido = useCallback(
    (id: IdProvedorIA) => salvar({ ...config, preferido: id }),
    [config, salvar],
  );

  const salvarBackend = useCallback(
    (endereco: string) => salvar({ ...config, enderecoBackend: endereco.trim() || undefined }),
    [config, salvar],
  );

  return (
    <div>
      <h2 className="section-title">Configuração de IA</h2>
      <p style={{ color: "var(--ink-soft)", marginTop: -8 }}>
        Vários provedores de IA em rodízio, para não esgotar a cota de um só, com escalonamento
        automático para um modelo pago só quando o texto do OCR/documento estiver ruim demais para
        confiar na extração determinística. Todo resultado de IA ainda exige revisão manual antes
        de salvar — nada aqui pula essa etapa.
      </p>

      <div className="aviso-caixa">
        <strong>Aviso de segurança:</strong> chaves de API digitadas abaixo ficam salvas em{" "}
        <code>localStorage</code> deste navegador — nunca são embutidas no código publicado, mas
        ainda são legíveis por qualquer pessoa com acesso a este navegador (DevTools, extensão,
        computador compartilhado). O caminho seguro para produção é configurar um{" "}
        <strong>endereço de backend</strong> abaixo: as chamadas passam a ir para o seu servidor, que
        guarda as chaves reais e nunca as expõe ao navegador. Sem backend configurado, o roteador usa
        as chaves diretas (modo inseguro, aceitável só para uso individual/demonstração).
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="form-grid">
          <label>
            Provedor preferido (começa o rodízio nele)
            <select value={config.preferido} onChange={(e) => salvarPreferido(e.target.value as IdProvedorIA)}>
              {PROVEDORES_ORDEM_EXIBICAO.map((id) => (
                <option key={id} value={id}>
                  {NOME_PROVEDOR[id]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Endereço de backend (recomendado — ver aviso acima)
            <input
              type="text"
              placeholder="https://seu-backend.com/api/ia"
              defaultValue={config.enderecoBackend ?? ""}
              onBlur={(e) => salvarBackend(e.target.value)}
            />
          </label>
        </div>
      </div>

      <h3 className="section-title" style={{ marginTop: 22 }}>Provedores</h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Provedor</th>
              <th>Ativo</th>
              <th>Modelo</th>
              <th>{"Chave de API / endereço local"}</th>
              <th>No rodízio</th>
              <th>Ordem</th>
            </tr>
          </thead>
          <tbody>
            {PROVEDORES_ORDEM_EXIBICAO.map((id) => {
              const cfg = config.provedores[id];
              const local = id === "ollama";
              const noRodizio = config.ordemRodizio.includes(id);
              const posicao = config.ordemRodizio.indexOf(id);
              return (
                <tr key={id}>
                  <td>
                    {NOME_PROVEDOR[id]}
                    {local && <span className="pill good" style={{ marginLeft: 6 }}>local · sem custo</span>}
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={cfg.ativo}
                      onChange={(e) => alterarProvedor(id, { ativo: e.target.checked })}
                      aria-label={`Ativar ${NOME_PROVEDOR[id]}`}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      style={{ width: 160 }}
                      defaultValue={cfg.modelo}
                      onBlur={(e) => alterarProvedor(id, { modelo: e.target.value.trim() })}
                    />
                  </td>
                  <td>
                    {local ? (
                      <input
                        type="text"
                        style={{ width: 200 }}
                        defaultValue={cfg.baseUrl ?? ""}
                        placeholder="http://localhost:11434"
                        onBlur={(e) => alterarProvedor(id, { baseUrl: e.target.value.trim() || undefined })}
                      />
                    ) : (
                      <input
                        type="password"
                        style={{ width: 200 }}
                        defaultValue={cfg.apiKey ?? ""}
                        placeholder={config.enderecoBackend ? "não necessária (via backend)" : "sk-..."}
                        onBlur={(e) => alterarProvedor(id, { apiKey: e.target.value.trim() || undefined })}
                      />
                    )}
                  </td>
                  <td>
                    {!local && (
                      <input
                        type="checkbox"
                        checked={noRodizio}
                        onChange={() => alternarNoRodizio(id)}
                        aria-label={`Incluir ${NOME_PROVEDOR[id]} no rodízio`}
                      />
                    )}
                  </td>
                  <td className="num">
                    {!local && noRodizio && (
                      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                        {posicao + 1}
                        <button
                          className="btn"
                          style={{ padding: "2px 6px" }}
                          onClick={() => moverNaOrdemRodizio(id, -1)}
                          disabled={posicao === 0}
                          aria-label={`Mover ${NOME_PROVEDOR[id]} para cima no rodízio`}
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          className="btn"
                          style={{ padding: "2px 6px" }}
                          onClick={() => moverNaOrdemRodizio(id, 1)}
                          disabled={posicao === config.ordemRodizio.length - 1}
                          aria-label={`Mover ${NOME_PROVEDOR[id]} para baixo no rodízio`}
                        >
                          <ArrowDown size={12} />
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className="section-title" style={{ marginTop: 22 }}>Custo acumulado estimado</h3>
      <div className="card">
        <p style={{ margin: 0 }}>
          <span className="num" style={{ fontSize: 20 }}>{formatarUsd(custoAcumulado)}</span>{" "}
          <span style={{ color: "var(--ink-soft)", fontSize: 12.5 }}>
            (estimativa a partir de preço aproximado por token — nunca é a fatura real do provedor)
          </span>
        </p>
      </div>

      <div className="toolbar-actions" style={{ marginTop: 18, marginBottom: 10 }}>
        <h3 className="section-title" style={{ margin: 0, flex: 1 }}>Histórico de chamadas</h3>
        <button className="btn" onClick={atualizarHistorico}>
          <RefreshCw size={14} /> Atualizar
        </button>
        <button className="btn danger" onClick={limparHistorico} disabled={historico.length === 0}>
          <Trash2 size={14} /> Limpar
        </button>
      </div>

      <div className="aviso-caixa">
        <strong>Limitação conhecida:</strong> este histórico vive só na memória desta aba/sessão do
        navegador — recarregar a página o apaga. Persistir de verdade exigiria uma tabela própria
        (ex.: <code>ia_chamadas</code>) no banco da contabilidade, fora do escopo de arquivos desta
        tarefa. A estrutura de cada registro já está pronta para ser gravada linha a linha assim que
        essa tabela existir.
      </div>

      {historico.length === 0 ? (
        <div className="card" style={{ marginTop: 12 }}>
          <p style={{ margin: 0, color: "var(--ink-soft)" }}>Nenhuma chamada de IA registrada nesta sessão ainda.</p>
        </div>
      ) : (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Provedor</th>
                <th>Modelo</th>
                <th>Motivo</th>
                <th>Confiança</th>
                <th className="num">Tokens (ent./saí.)</th>
                <th className="num">Custo est.</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {[...historico].reverse().map((r) => (
                <tr key={r.id}>
                  <td>{formatarQuando(r.quando)}</td>
                  <td>{NOME_PROVEDOR[r.provedor]}</td>
                  <td>{r.modelo}</td>
                  <td style={{ maxWidth: 260, whiteSpace: "normal" }}>{r.motivo}</td>
                  <td>
                    {r.confianca ? (
                      <span
                        className={`pill ${r.confianca === "alta" ? "good" : r.confianca === "media" ? "warning" : "critical"}`}
                      >
                        {r.confianca}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="num">
                    {r.tokensEntrada ?? "—"} / {r.tokensSaida ?? "—"}
                  </td>
                  <td className="num">{r.custoEstimadoUsd !== undefined ? formatarUsd(r.custoEstimadoUsd) : "—"}</td>
                  <td>
                    {r.sucesso ? (
                      <span className="pill good">sucesso</span>
                    ) : (
                      <span className="pill critical" title={r.erro}>
                        falhou
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
