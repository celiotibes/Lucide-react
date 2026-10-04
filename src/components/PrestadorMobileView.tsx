import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Camera, Loader2, RefreshCw, Save, Wifi, WifiOff } from "lucide-react";
import { useDb } from "../db/useDb";
import { consultar } from "../db/connection";
import { useToast } from "../ui/useToast";
import type { Imovel } from "../domain/types";
import {
  criarArmazenamentoPadrao,
  criarFilaOffline,
  ErroAnexoGrande,
  type ContagemFila,
  type EnviarItem,
  type ItemFila,
} from "../domain/apontamentos/filaOffline";
import {
  formatarEspera,
  formatarTamanho,
  montarPayload,
  resumoContagem,
  ROTULO_STATUS_FILA,
  validarFormulario,
  type FormularioApontamentoCampo,
  type PayloadApontamentoCampo,
} from "../domain/apontamentos/prestadorMobile";

/**
 * Tela mobile-first do prestador: registra apontamentos de serviço/vistoria em campo e os
 * guarda numa fila offline (IndexedDB). O envio ao servidor é INJETADO via `enviar` — este
 * repositório não define o endpoint (contrato em `filaOffline.ts` e docs/PWA-PRESTADOR.md).
 * Sem `enviar`, os registros ficam guardados no aparelho e o botão de sincronizar fica
 * desabilitado, com aviso explícito.
 */

const FORM_VAZIO: FormularioApontamentoCampo = { imovelId: "", tipo: "servico", servico: "", horas: "", valor: "", observacoes: "" };
const CONTAGEM_VAZIA: ContagemFila = { pendente: 0, enviando: 0, enviado: 0, erro: 0 };

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function PrestadorMobileView({ enviar }: { enviar?: EnviarItem<PayloadApontamentoCampo> }) {
  const { db, versao } = useDb();
  const { avisar } = useToast();
  const online = useOnline();
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const enviarRef = useRef(enviar);
  enviarRef.current = enviar;

  const imoveis = useMemo<Imovel[]>(() => (db ? consultar<Imovel>(db, "SELECT * FROM imoveis ORDER BY apelido") : []), [db, versao]);

  const { fila, persistente } = useMemo(() => {
    const { armazenamento, persistente } = criarArmazenamentoPadrao<PayloadApontamentoCampo>();
    const fila = criarFilaOffline<PayloadApontamentoCampo>({
      armazenamento,
      enviar: (item) =>
        enviarRef.current
          ? enviarRef.current(item)
          : Promise.resolve({ confirmado: false, mensagem: "Envio ao servidor não configurado" }),
      estaOnline: () => onlineRef.current,
    });
    return { fila, persistente };
  }, []);

  const [form, setForm] = useState<FormularioApontamentoCampo>(FORM_VAZIO);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [foto, setFoto] = useState<File | null>(null);
  const [itens, setItens] = useState<ItemFila<PayloadApontamentoCampo>[]>([]);
  const [contagem, setContagem] = useState<ContagemFila>(CONTAGEM_VAZIA);
  const [sincronizando, setSincronizando] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());
  const inputFotoRef = useRef<HTMLInputElement>(null);

  const recarregar = useCallback(async () => {
    setItens((await fila.listar()).sort((a, b) => b.criadoEm - a.criadoEm));
    setContagem(await fila.contar());
    setAgora(Date.now());
  }, [fila]);

  const sincronizar = useCallback(
    async (silencioso = false) => {
      if (!enviarRef.current) return;
      setSincronizando(true);
      try {
        const r = await fila.sincronizar();
        if (!silencioso) {
          if (r.pulado) avisar("warning", "Sem conexão: a sincronização será feita quando voltar a rede.");
          else if (r.enviados) avisar("good", `${r.enviados} apontamento(s) enviado(s).`);
          else if (r.falhasTransitorias || r.falhasPermanentes) avisar("warning", "Não foi possível enviar agora; tentaremos de novo.");
        }
      } finally {
        setSincronizando(false);
        await recarregar();
      }
    },
    [fila, avisar, recarregar],
  );

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  // Ao voltar a rede, sincroniza sozinho.
  useEffect(() => {
    if (online) void sincronizar(true);
  }, [online, sincronizar]);

  // Reagenda a próxima tentativa conforme o backoff dos itens pendentes.
  useEffect(() => {
    if (!online || !enviar) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelado = false;
    void fila.proximaTentativaEm().then((t) => {
      if (cancelado || t === undefined) return;
      timer = setTimeout(() => void sincronizar(true), Math.max(1000, t - Date.now()));
    });
    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
    };
  }, [itens, online, enviar, fila, sincronizar]);

  async function registrar(e: FormEvent) {
    e.preventDefault();
    const e2 = validarFormulario(form);
    setErros(e2);
    if (Object.keys(e2).length) return;
    try {
      await fila.enfileirar({
        payload: montarPayload(form),
        anexos: foto ? [{ nome: foto.name, tipo: foto.type, tamanho: foto.size, dados: foto }] : [],
      });
      avisar("good", online && enviar ? "Registrado. Enviando..." : "Registrado no aparelho. Será enviado quando houver conexão.");
      setForm({ ...FORM_VAZIO, imovelId: form.imovelId });
      setFoto(null);
      if (inputFotoRef.current) inputFotoRef.current.value = "";
      await recarregar();
      void sincronizar(true);
    } catch (err) {
      avisar("critical", err instanceof ErroAnexoGrande ? err.message : "Não foi possível guardar o registro no aparelho.");
    }
  }

  const campo = <K extends keyof FormularioApontamentoCampo>(k: K) => ({
    value: form[k],
    onChange: (ev: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: ev.target.value as FormularioApontamentoCampo[K] })),
  });
  const apelido = (id: number) => imoveis.find((i) => i.id === id)?.apelido ?? `Imóvel #${id}`;

  return (
    <div className="prestador-mobile">
      <h2 className="section-title">Apontamento em campo</h2>

      <div className="card prestador-mobile__status" role="status" aria-live="polite">
        <span className={`pill ${online ? "good" : "warning"}`}>
          {online ? <Wifi size={14} aria-hidden="true" /> : <WifiOff size={14} aria-hidden="true" />} {online ? "Online" : "Offline"}
        </span>
        <span>{resumoContagem(contagem)}</span>
        <button
          type="button"
          className="btn"
          onClick={() => void sincronizar(false)}
          disabled={sincronizando || !enviar}
          aria-busy={sincronizando}
        >
          {sincronizando ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />} Sincronizar agora
        </button>
      </div>
      {!enviar && (
        <p className="aviso-caixa">
          Envio ao servidor ainda não configurado: os registros ficam guardados neste aparelho e não serão enviados.
        </p>
      )}
      {!persistente && (
        <p className="aviso-caixa">Armazenamento offline indisponível neste navegador: os registros se perdem ao fechar a página.</p>
      )}

      <form className="card" onSubmit={registrar} noValidate>
        <div className="form-grid prestador-mobile__form">
          <label>
            Imóvel
            <select {...campo("imovelId")} aria-invalid={!!erros.imovelId} aria-describedby={erros.imovelId ? "pm-erro-imovel" : undefined}>
              <option value="">Selecione…</option>
              {imoveis.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.apelido}
                </option>
              ))}
            </select>
            {erros.imovelId && <span id="pm-erro-imovel" role="alert" className="prestador-mobile__erro">{erros.imovelId}</span>}
          </label>
          <label>
            Tipo
            <select {...campo("tipo")}>
              <option value="servico">Serviço</option>
              <option value="vistoria">Vistoria</option>
            </select>
          </label>
          <label>
            Serviço realizado
            <input {...campo("servico")} autoComplete="off" aria-invalid={!!erros.servico} aria-describedby={erros.servico ? "pm-erro-servico" : undefined} />
            {erros.servico && <span id="pm-erro-servico" role="alert" className="prestador-mobile__erro">{erros.servico}</span>}
          </label>
          <label>
            Horas
            <input {...campo("horas")} inputMode="decimal" placeholder="ex.: 2,5" aria-invalid={!!erros.horas} aria-describedby={erros.horas ? "pm-erro-horas" : undefined} />
            {erros.horas && <span id="pm-erro-horas" role="alert" className="prestador-mobile__erro">{erros.horas}</span>}
          </label>
          <label>
            Valor (R$)
            <input {...campo("valor")} inputMode="decimal" placeholder="ex.: 150,00" aria-invalid={!!erros.valor} aria-describedby={erros.valor ? "pm-erro-valor" : undefined} />
            {erros.valor && <span id="pm-erro-valor" role="alert" className="prestador-mobile__erro">{erros.valor}</span>}
          </label>
          <label>
            Observações
            <input {...campo("observacoes")} autoComplete="off" />
          </label>
        </div>

        <div className="prestador-mobile__acoes">
          <input
            ref={inputFotoRef}
            id="pm-foto"
            type="file"
            accept="image/*"
            capture="environment"
            className="prestador-mobile__foto-input"
            onChange={(ev) => setFoto(ev.target.files?.[0] ?? null)}
          />
          <label htmlFor="pm-foto" className="btn">
            <Camera size={16} aria-hidden="true" /> {foto ? "Trocar foto" : "Tirar foto (opcional)"}
          </label>
          {foto && (
            <span>
              {foto.name} ({formatarTamanho(foto.size)})
            </span>
          )}
          <button type="submit" className="btn primary">
            <Save size={16} aria-hidden="true" /> Registrar
          </button>
        </div>
      </form>

      <h3 className="section-title">Registros neste aparelho</h3>
      {itens.length === 0 ? (
        <p>Nenhum registro ainda.</p>
      ) : (
        <ul className="prestador-mobile__lista">
          {itens.map((i) => (
            <li key={i.uuid} className="card">
              <div>
                <strong>{apelido(i.payload.imovel_id)}</strong> · {i.payload.servico}
              </div>
              <div>
                <span className={`pill ${i.status === "enviado" ? "good" : i.status === "erro" ? "critical" : "warning"}`}>
                  {ROTULO_STATUS_FILA[i.status]}
                </span>{" "}
                {i.payload.data}
                {i.anexos.length > 0 && ` · ${i.anexos.length} foto(s)`}
                {i.status === "pendente" && i.tentativas > 0 && ` · nova tentativa ${formatarEspera(i.proximaTentativaEm, agora) || "agora"}`}
              </div>
              {i.ultimoErro && i.status !== "enviado" && <div className="prestador-mobile__erro">{i.ultimoErro}</div>}
              {i.status === "erro" && (
                <button type="button" className="btn" onClick={() => void fila.reenviar(i.uuid).then(() => sincronizar(false))} disabled={!enviar}>
                  Tentar novamente
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {contagem.enviado > 0 && (
        <button type="button" className="btn" onClick={() => void fila.limparEnviados().then(recarregar)}>
          Limpar enviados
        </button>
      )}
    </div>
  );
}
