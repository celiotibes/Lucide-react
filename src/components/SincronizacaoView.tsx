import { useEffect, useState } from "react";
import { RefreshCw, Download, Upload, AlertTriangle } from "lucide-react";
import { useDb } from "../db/useDb";
import { importarArquivo } from "../db/connection";
import {
  obterEstadoServidor, baixarBancoDoServidor, enviarBancoAoServidor,
  ConflitoSincronizacaoError, type EstadoSincronizacao,
} from "../domain/sync/clienteSincronizacao";

const CHAVE_SERVER_URL = "sync-server-url";
const CHAVE_API_KEY = "sync-server-api-key";
const CHAVE_DISPOSITIVO = "sync-nome-dispositivo";
const CHAVE_VERSAO_CONHECIDA = "sync-versao-conhecida";

function lerVersaoConhecida(): number {
  const bruto = localStorage.getItem(CHAVE_VERSAO_CONHECIDA);
  const numero = bruto ? Number(bruto) : 0;
  return Number.isFinite(numero) ? numero : 0;
}

export function SincronizacaoView() {
  const { db } = useDb();
  const [serverUrl, setServerUrl] = useState(() => localStorage.getItem(CHAVE_SERVER_URL) ?? "http://localhost:8788");
  const [chaveApi, setChaveApi] = useState(() => localStorage.getItem(CHAVE_API_KEY) ?? "");
  const [nomeDispositivo, setNomeDispositivo] = useState(() => localStorage.getItem(CHAVE_DISPOSITIVO) ?? "");
  const [versaoConhecida, setVersaoConhecida] = useState(lerVersaoConhecida);
  const [estadoServidor, setEstadoServidor] = useState<EstadoSincronizacao | null>(null);
  const [carregando, setCarregando] = useState<"verificando" | "baixando" | "enviando" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const configurado = serverUrl.trim() !== "" && chaveApi.trim() !== "" && nomeDispositivo.trim() !== "";

  function salvarServerUrl(v: string) {
    setServerUrl(v);
    localStorage.setItem(CHAVE_SERVER_URL, v);
  }
  function salvarChaveApi(v: string) {
    setChaveApi(v);
    localStorage.setItem(CHAVE_API_KEY, v);
  }
  function salvarNomeDispositivo(v: string) {
    setNomeDispositivo(v);
    localStorage.setItem(CHAVE_DISPOSITIVO, v);
  }
  function atualizarVersaoConhecida(v: number) {
    setVersaoConhecida(v);
    localStorage.setItem(CHAVE_VERSAO_CONHECIDA, String(v));
  }

  async function verificar() {
    if (!configurado) return;
    setErro(null);
    setCarregando("verificando");
    try {
      setEstadoServidor(await obterEstadoServidor(serverUrl, chaveApi));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(null);
    }
  }

  // Checagem automática ao abrir a tela (só consulta o estado — leve, não baixa nem envia
  // nada) para já mostrar se há uma versão mais nova esperando, sem exigir clique. Falha
  // silenciosa (servidor pode legitimamente estar desligado agora) — não é um erro bloqueante.
  useEffect(() => {
    if (configurado) verificar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function baixar() {
    if (!configurado) return;
    if (!confirm("Isso substitui todos os dados salvos NESTE dispositivo pelo conteúdo mais recente do servidor de sincronização — irreversível. Continuar?")) return;
    setErro(null);
    setCarregando("baixando");
    try {
      const bytes = await baixarBancoDoServidor(serverUrl, chaveApi);
      await importarArquivo(bytes); // já valida assinatura do arquivo antes de substituir (ver connection.ts)
      const estadoAtualizado = await obterEstadoServidor(serverUrl, chaveApi);
      atualizarVersaoConhecida(estadoAtualizado.versao);
      window.location.reload(); // mesmo padrão de App.tsx::importarBanco — garante que todo o app releia o banco novo
    } catch (e) {
      setErro((e as Error).message);
      setCarregando(null);
    }
  }

  async function enviar() {
    if (!db || !configurado) return;
    setErro(null);
    setCarregando("enviando");
    try {
      const bytes = db.export();
      const novoEstado = await enviarBancoAoServidor(serverUrl, chaveApi, bytes, versaoConhecida, nomeDispositivo.trim());
      atualizarVersaoConhecida(novoEstado.versao);
      setEstadoServidor(novoEstado);
    } catch (e) {
      if (e instanceof ConflitoSincronizacaoError) {
        setEstadoServidor(e.estadoServidor);
        setErro('O servidor já tem uma versão mais nova (de outro dispositivo) — clique em "Baixar do servidor" antes de enviar a sua.');
      } else {
        setErro((e as Error).message);
      }
    } finally {
      setCarregando(null);
    }
  }

  const divergente = estadoServidor !== null && estadoServidor.versao !== versaoConhecida;

  return (
    <div>
      <h2 className="section-title">Sincronização entre dispositivos</h2>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 18 }}>
        Envia/baixa o banco inteiro de um servidor que roda na SUA própria máquina ou rede — nunca um serviço de
        nuvem de terceiro (ver <code>sync-server/README.md</code>). Não é edição simultânea nem faz merge: cada
        envio substitui o banco inteiro do servidor, com um contador de versão que recusa (em vez de sobrescrever
        silenciosamente) um envio feito sem antes ter baixado a versão mais recente.
      </p>

      <div className="form-grid" style={{ maxWidth: 480, marginBottom: 18 }}>
        <label>
          URL do servidor de sincronização
          <input value={serverUrl} onChange={(e) => salvarServerUrl(e.target.value)} placeholder="http://localhost:8788" />
        </label>
        <label>
          Chave de API (X-API-Key)
          <input type="password" value={chaveApi} onChange={(e) => salvarChaveApi(e.target.value)} placeholder="a mesma API_KEY do .env do servidor" />
        </label>
        <label>
          Nome deste dispositivo
          <input value={nomeDispositivo} onChange={(e) => salvarNomeDispositivo(e.target.value)} placeholder="ex: Notebook trabalho" />
        </label>
      </div>

      {erro && (
        <div className="aviso-caixa" style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 16 }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{erro}</span>
        </div>
      )}

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 4 }}>Versão conhecida por este dispositivo</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{versaoConhecida}</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 4 }}>Versão no servidor</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{estadoServidor?.versao ?? "—"}</div>
          {estadoServidor?.dispositivo && estadoServidor.atualizadoEm && (
            <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 2 }}>
              enviado por {estadoServidor.dispositivo} em {new Date(estadoServidor.atualizadoEm).toLocaleString("pt-BR")}
            </div>
          )}
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 4 }}>Situação</div>
          <span className={`pill ${!estadoServidor ? "warning" : divergente ? "critical" : "good"}`}>
            {!estadoServidor ? "não verificado" : divergente ? "divergente" : "sincronizado"}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" disabled={!configurado || carregando !== null} onClick={verificar}>
          <RefreshCw size={14} /> Verificar
        </button>
        <button className="btn" disabled={!configurado || carregando !== null} onClick={baixar}>
          <Download size={14} /> Baixar do servidor
        </button>
        <button className="btn primary" disabled={!db || !configurado || carregando !== null} onClick={enviar}>
          <Upload size={14} /> Enviar para o servidor
        </button>
      </div>
      {!configurado && (
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 10 }}>
          Preencha URL, chave e nome do dispositivo acima para habilitar os botões.
        </p>
      )}
    </div>
  );
}
