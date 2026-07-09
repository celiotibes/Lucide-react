import { useMemo, useState } from "react";
import { Landmark, Loader2 } from "lucide-react";
import { PluggyConnect } from "pluggy-connect-sdk";
import { useDb } from "../db/DbContext";
import { consultar } from "../db/connection";
import { criarConnectToken, listarContasPluggy, buscarTransacoesPluggy, type ContaPluggy } from "../domain/parsers/pluggyClient";
import type { ResultadoImportacao } from "../domain/parsers/detectarTipo";
import type { ContaBancaria } from "../domain/types";

const CHAVE_BACKEND_URL = "pluggy-backend-url";

interface Props {
  onImportado: (resultado: ResultadoImportacao, nomeFonte: string, contaSugeridaId: number | null) => void;
}

export function ConectarPluggy({ onImportado }: Props) {
  const { db } = useDb();
  const [backendUrl, setBackendUrl] = useState(() => localStorage.getItem(CHAVE_BACKEND_URL) ?? "http://localhost:8787");
  const [etapa, setEtapa] = useState<"inicial" | "conectando" | "contas" | "buscando">("inicial");
  const [erro, setErro] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [contasPluggy, setContasPluggy] = useState<ContaPluggy[]>([]);
  const [contaPluggySelecionada, setContaPluggySelecionada] = useState<string>("");
  const [contaLocalId, setContaLocalId] = useState<number | null>(null);
  const [dataInicio, setDataInicio] = useState(new Date(new Date().setFullYear(new Date().getFullYear() - 3)).toISOString().slice(0, 10));
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 10));

  const contasLocais = useMemo<ContaBancaria[]>(() => (db ? consultar<ContaBancaria>(db, "SELECT * FROM contas_bancarias ORDER BY banco") : []), [db]);

  function salvarBackendUrl(valor: string) {
    setBackendUrl(valor);
    localStorage.setItem(CHAVE_BACKEND_URL, valor);
  }

  async function conectar() {
    setErro(null);
    setEtapa("conectando");
    try {
      const connectToken = await criarConnectToken(backendUrl);
      const widget = new PluggyConnect({
        connectToken,
        includeSandbox: false,
        onSuccess: async ({ item }: { item: { id: string } }) => {
          setItemId(item.id);
          try {
            const contas = await listarContasPluggy(backendUrl, item.id);
            setContasPluggy(contas);
            setContaPluggySelecionada(contas[0]?.id ?? "");
            setContaLocalId(contasLocais[0]?.id ?? null);
            setEtapa("contas");
          } catch (e) {
            setErro((e as Error).message);
            setEtapa("inicial");
          }
        },
        onError: (e: { message: string }) => {
          setErro(e.message);
          setEtapa("inicial");
        },
        onClose: () => {
          if (etapa === "conectando") setEtapa("inicial");
        },
      });
      await widget.init();
    } catch (e) {
      setErro((e as Error).message);
      setEtapa("inicial");
    }
  }

  async function buscarEImportar() {
    if (!contaPluggySelecionada) return;
    setEtapa("buscando");
    setErro(null);
    try {
      const transacoes = await buscarTransacoesPluggy(backendUrl, contaPluggySelecionada, dataInicio, dataFim);
      const contaPluggy = contasPluggy.find((c) => c.id === contaPluggySelecionada);
      const resultado: ResultadoImportacao = {
        tipoDetectado: "open_finance",
        transacoes,
        avisos: transacoes.length === 0 ? ["Nenhuma transação retornada para o período — confira as datas ou se o item terminou de sincronizar."] : [],
      };
      onImportado(resultado, `Open Finance — ${contaPluggy?.nome ?? contaPluggySelecionada}`, contaLocalId);
      setEtapa("inicial");
      setItemId(null);
      setContasPluggy([]);
    } catch (e) {
      setErro((e as Error).message);
      setEtapa("contas");
    }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="section-title">
        <Landmark size={14} /> Conectar banco via Open Finance (Pluggy)
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 14, maxWidth: "62ch" }}>
        Exige um backend rodando com suas credenciais Pluggy (ver <code>server/README.md</code>) — o Client Secret
        nunca pode ficar no navegador. As transações buscadas passam pelo seu próprio backend, não por terceiros
        além da Pluggy.
      </p>

      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 14 }}>
        URL do backend:
        <input value={backendUrl} onChange={(e) => salvarBackendUrl(e.target.value)} style={{ flex: 1, maxWidth: 320, padding: "5px 8px" }} />
      </label>

      {erro && <div className="aviso-caixa">{erro}</div>}

      {etapa === "inicial" && (
        <button className="btn primary" onClick={conectar}>
          Conectar banco
        </button>
      )}
      {etapa === "conectando" && (
        <p style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Loader2 className="spin" size={16} /> Aguardando o widget da Pluggy…
        </p>
      )}

      {etapa === "contas" && itemId && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            Conta Pluggy:
            <select value={contaPluggySelecionada} onChange={(e) => setContaPluggySelecionada(e.target.value)}>
              {contasPluggy.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} · {c.numero} ({c.tipo})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            Importar como (conta local):
            <select value={contaLocalId ?? ""} onChange={(e) => setContaLocalId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— escolher depois na revisão —</option>
              {contasLocais.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.banco} — {c.numero}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", gap: 12 }}>
            <label style={{ fontSize: 13 }}>
              De: <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </label>
            <label style={{ fontSize: 13 }}>
              Até: <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </label>
          </div>
          <button className="btn primary" onClick={buscarEImportar} style={{ alignSelf: "flex-start" }}>
            Buscar transações do período
          </button>
        </div>
      )}
      {etapa === "buscando" && (
        <p style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Loader2 className="spin" size={16} /> Buscando transações…
        </p>
      )}
    </div>
  );
}
