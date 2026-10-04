import { useCallback, useEffect, useState } from "react";
import { Send, Loader2, RefreshCw, ImageIcon, FileText, Inbox, UserPlus } from "lucide-react";
import { useDb } from "../../db/useDb";
import { useToast } from "../../ui/useToast";
import {
  buscarCapturasPendentes,
  importarCapturaParaTriagem,
  criarCapturasApiClientHttp,
  type CapturaTelegramPendente,
} from "../../domain/integracoes/capturasPendentes";
import {
  resolverVinculosExternosPendentes,
  criarVinculosExternosApiClientHttp,
  criarNotificacoesApiClientHttp,
  type PendenteVinculoExternoServidor,
} from "../../domain/notificacoes/vinculosExternos";

/**
 * Captura rápida via bot do Telegram: tela "ponte" entre o bot (server/src/routes/
 * telegram-routes.ts) e a fila de triagem de documentos já existente (mesma tabela
 * `documentos` que src/components/DocumentosView.tsx usa para upload manual).
 *
 * Alternativa barata a um app mobile completo (decisão já tomada: o app completo fica para
 * depois de tudo configurado) — o bot só captura texto/foto rápido; a classificação e a
 * confirmação continuam acontecendo neste sistema, nunca no Telegram.
 *
 * Config de backend/sessão guardada em localStorage SÓ NESTE ARQUIVO (sem módulo de config
 * próprio, de propósito: esta tarefa está limitada a um conjunto fechado de arquivos nesta
 * rodada — ver nota no PR). Mesmo espírito e mesmo aviso de segurança de
 * src/domain/permissoesAdmin/config.ts e src/components/ConectarPluggy.tsx: um token em
 * localStorage é legível por qualquer um com acesso a este navegador. O login por sessão
 * (cookie httpOnly + CSRF, src/api/cliente.ts e <LoginView>) já existe e é o caminho
 * recomendado; esta tela ainda usa o modo legado de token Bearer colado à mão — migrá-la para
 * `apiFetch` é o próximo passo (hoje só GerenciamentoPermissoesView usa a sessão).
 *
 * `VITE_TELEGRAM_BOT_USERNAME` é uma env var PÚBLICA (prefixo VITE_, vai pro bundle do
 * navegador) — é só o @usuário do bot, informação que qualquer pessoa já vê ao abrir uma
 * conversa com ele no Telegram. Bem diferente de TELEGRAM_BOT_TOKEN/TELEGRAM_WEBHOOK_SECRET
 * (só no servidor, nunca no bundle) — por isso elas nunca aparecem aqui.
 */

const CHAVE_LOCALSTORAGE = "telegram-captura:config:v1";

interface ConfiguracaoLocal {
  enderecoBackend: string;
  tokenSessao: string;
}

const CONFIGURACAO_PADRAO: ConfiguracaoLocal = { enderecoBackend: "", tokenSessao: "" };

function carregarConfiguracaoLocal(): ConfiguracaoLocal {
  try {
    const bruto = localStorage.getItem(CHAVE_LOCALSTORAGE);
    if (!bruto) return { ...CONFIGURACAO_PADRAO };
    return { ...CONFIGURACAO_PADRAO, ...(JSON.parse(bruto) as Partial<ConfiguracaoLocal>) };
  } catch {
    return { ...CONFIGURACAO_PADRAO };
  }
}

function salvarConfiguracaoLocal(config: ConfiguracaoLocal): void {
  try {
    localStorage.setItem(CHAVE_LOCALSTORAGE, JSON.stringify(config));
  } catch {
    // Storage bloqueado/cheio — a configuração continua valendo em memória para esta sessão.
  }
}

const NOME_BOT = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "";

function previewCaptura(captura: CapturaTelegramPendente): string {
  const { payload } = captura;
  if (payload.texto) return payload.texto;
  if (payload.legenda) return `[foto] ${payload.legenda}`;
  if (payload.foto) return "[foto sem legenda]";
  return "(mensagem sem conteúdo reconhecido)";
}

export function CapturasTelegramView() {
  const { db, persistir } = useDb();
  const { avisar } = useToast();

  const [config, setConfig] = useState<ConfiguracaoLocal>(() => carregarConfiguracaoLocal());
  const configurado = config.enderecoBackend.trim().length > 0 && config.tokenSessao.trim().length > 0;

  const [gerando, setGerando] = useState(false);
  const [codigoGerado, setCodigoGerado] = useState<string | null>(null);
  const [expiraEmMinutos, setExpiraEmMinutos] = useState<number | null>(null);

  const [capturas, setCapturas] = useState<CapturaTelegramPendente[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [importandoId, setImportandoId] = useState<string | null>(null);

  // Vínculos de CONTATOS EXTERNOS (locatário/cliente da advocacia/prestador) — ver
  // domain/notificacoes/vinculosExternos.ts. Lista separada da fila de capturas acima:
  // aqui são só códigos "/vincular CODIGO" que o servidor não soube resolver (não são
  // usuário do sistema), aguardando o cliente casar com `vinculos_telegram_externos`.
  const [pendentesExternos, setPendentesExternos] = useState<PendenteVinculoExternoServidor[]>([]);
  const [carregandoExternos, setCarregandoExternos] = useState(false);
  const [verificandoExternos, setVerificandoExternos] = useState(false);

  const salvarConfig = useCallback((patch: Partial<ConfiguracaoLocal>) => {
    setConfig((atual) => {
      const proximo = { ...atual, ...patch };
      salvarConfiguracaoLocal(proximo);
      return proximo;
    });
  }, []);

  const apiClient = configurado ? criarCapturasApiClientHttp(config.enderecoBackend.trim(), config.tokenSessao.trim()) : null;

  const carregarCapturas = useCallback(async () => {
    if (!apiClient) return;
    setCarregando(true);
    try {
      setCapturas(await buscarCapturasPendentes(apiClient));
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Falha ao buscar capturas pendentes");
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.enderecoBackend, config.tokenSessao]);

  const carregarPendentesExternos = useCallback(async () => {
    if (!configurado) return;
    setCarregandoExternos(true);
    try {
      const vinculosApiClient = criarVinculosExternosApiClientHttp(config.enderecoBackend.trim(), config.tokenSessao.trim());
      setPendentesExternos(await vinculosApiClient.listarPendentes());
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Falha ao buscar vínculos de contatos externos pendentes");
    } finally {
      setCarregandoExternos(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.enderecoBackend, config.tokenSessao, configurado]);

  useEffect(() => {
    if (configurado) {
      carregarCapturas();
      carregarPendentesExternos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configurado]);

  async function verificarVinculosExternos() {
    if (!db || !configurado) return;
    setVerificandoExternos(true);
    try {
      const backend = config.enderecoBackend.trim();
      const token = config.tokenSessao.trim();
      const vinculosApiClient = criarVinculosExternosApiClientHttp(backend, token);
      const notificacoesApiClient = criarNotificacoesApiClientHttp(backend, token);
      const { resolvidos, naoEncontrados } = await resolverVinculosExternosPendentes(db, vinculosApiClient, notificacoesApiClient);
      await persistir();
      await carregarPendentesExternos();
      avisar(
        "good",
        `${resolvidos} vínculo(s) de contato externo confirmado(s)${naoEncontrados > 0 ? `, ${naoEncontrados} não encontrado(s)/expirado(s)` : ""}.`,
      );
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Falha ao verificar vínculos de contatos externos pendentes");
    } finally {
      setVerificandoExternos(false);
    }
  }

  async function gerarCodigo() {
    if (!apiClient) return;
    setGerando(true);
    try {
      const resposta = await fetch(`${config.enderecoBackend.trim()}/api/telegram/gerar-codigo-vinculo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.tokenSessao.trim()}` },
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(corpo?.erro ?? `Falha ao gerar código (HTTP ${resposta.status})`);
      setCodigoGerado(corpo.codigo);
      setExpiraEmMinutos(corpo.expiraEmMinutos ?? null);
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Falha ao gerar código de vínculo");
    } finally {
      setGerando(false);
    }
  }

  async function importar(captura: CapturaTelegramPendente) {
    if (!db || !apiClient) return;
    setImportandoId(captura.id);
    try {
      await importarCapturaParaTriagem(db, apiClient, captura);
      await persistir();
      setCapturas((atual) => atual.filter((c) => c.id !== captura.id));
      avisar("good", "Captura importada para a triagem de documentos — revise e complete os campos lá.");
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Falha ao importar captura");
    } finally {
      setImportandoId(null);
    }
  }

  return (
    <div>
      <h2 className="section-title">
        <Send size={16} /> Captura via Telegram
      </h2>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 18 }}>
        Mande um texto ou foto de recibo/nota para o bot do Telegram e ele entra direto aqui. Mensagens enviadas
        pelo bot entram na <strong>mesma fila de triagem</strong> dos documentos importados manualmente (tela
        "Documentos e classificação") — nada é lançado como fato até você confirmar e, se for o caso, vincular a
        uma transação.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ fontSize: 14 }}>Backend e sessão</div>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 10, maxWidth: "62ch" }}>
          Esta tela consome o backend (<code>server/</code>), não a Asaas/Telegram direto. Informe o endereço e um
          token Bearer de titular/administrador (modo legado). O login por sessão (tela <strong>Entrar</strong>, em
          Permissões) é o caminho recomendado e já funciona; esta tela ainda não foi migrada para ele.
        </p>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 10 }}>
          URL do backend:
          <input
            defaultValue={config.enderecoBackend}
            onBlur={(e) => salvarConfig({ enderecoBackend: e.target.value.trim() })}
            placeholder="http://localhost:8787"
            style={{ flex: 1, maxWidth: 320, padding: "5px 8px" }}
          />
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          Token de sessão:
          <input
            type="password"
            defaultValue={config.tokenSessao}
            onBlur={(e) => salvarConfig({ tokenSessao: e.target.value.trim() })}
            placeholder="token retornado pelo login"
            style={{ flex: 1, maxWidth: 320, padding: "5px 8px" }}
          />
        </label>
      </div>

      {!configurado ? (
        <div className="aviso-caixa">
          Informe o endereço do backend e um token de sessão acima para gerar o código de vínculo e ver as capturas
          pendentes.
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-title" style={{ fontSize: 14 }}>Vincular seu chat do Telegram</div>
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 10 }}>
              Gere um código (válido por alguns minutos) e mande <code>/vincular CODIGO</code>{" "}
              {NOME_BOT ? (
                <>
                  para <strong>@{NOME_BOT}</strong> no Telegram.
                </>
              ) : (
                <>para o bot configurado no servidor (defina <code>VITE_TELEGRAM_BOT_USERNAME</code> para mostrar o nome dele aqui).</>
              )}{" "}
              Depois de vincular, qualquer texto ou foto que você mandar aparece na lista abaixo.
            </p>
            <button className="btn primary" onClick={gerarCodigo} disabled={gerando}>
              {gerando ? <Loader2 className="spin" size={14} /> : <Send size={14} />} Gerar código
            </button>
            {codigoGerado && (
              <div className="pill good" style={{ display: "inline-flex", marginLeft: 10, fontSize: 14, padding: "6px 10px" }}>
                /vincular {codigoGerado} {expiraEmMinutos ? `(expira em ${expiraEmMinutos} min)` : ""}
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <h3 style={{ fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
              <Inbox size={15} /> Capturas pendentes ({capturas.length})
            </h3>
            <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={carregarCapturas} disabled={carregando}>
              {carregando ? <Loader2 className="spin" size={13} /> : <RefreshCw size={13} />} Atualizar
            </button>
          </div>

          {capturas.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
              Nenhuma captura pendente. Depois de vincular o chat, mande uma mensagem ao bot e clique em "Atualizar".
            </p>
          ) : (
            capturas.map((captura) => (
              <div key={captura.id} className="card" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
                {captura.payload.foto ? <ImageIcon size={16} /> : <FileText size={16} />}
                <div style={{ flex: 1, fontSize: 13 }}>
                  <div>{previewCaptura(captura)}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                    {new Date(captura.payload.dataMensagem).toLocaleString("pt-BR")}
                  </div>
                </div>
                <button
                  className="btn primary"
                  style={{ padding: "4px 10px", fontSize: 12 }}
                  onClick={() => importar(captura)}
                  disabled={importandoId === captura.id}
                >
                  {importandoId === captura.id ? <Loader2 className="spin" size={13} /> : null} Importar para triagem
                </button>
              </div>
            ))
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 10 }}>
            <h3 style={{ fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
              <UserPlus size={15} /> Vínculos de contatos externos pendentes ({pendentesExternos.length})
            </h3>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={carregarPendentesExternos} disabled={carregandoExternos}>
                {carregandoExternos ? <Loader2 className="spin" size={13} /> : <RefreshCw size={13} />} Atualizar
              </button>
              <button className="btn primary" style={{ padding: "4px 8px", fontSize: 12 }} onClick={verificarVinculosExternos} disabled={verificandoExternos}>
                {verificandoExternos ? <Loader2 className="spin" size={13} /> : <UserPlus size={13} />} Verificar vínculos pendentes
              </button>
            </div>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 10, maxWidth: "68ch" }}>
            Códigos "/vincular CODIGO" recebidos pelo bot de um chat que <strong>não</strong> é um usuário do sistema — locatário,
            cliente da advocacia ou prestador que gerou o próprio código na tela de cadastro correspondente (ver{" "}
            <code>VincularTelegramExterno</code>). Clique em "Verificar vínculos pendentes" para casar cada código com o cadastro
            certo e confirmar o vínculo ao contato.
          </p>
          {pendentesExternos.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Nenhum vínculo de contato externo pendente.</p>
          ) : (
            pendentesExternos.map((pendente) => (
              <div key={pendente.id} className="card" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
                <UserPlus size={16} />
                <div style={{ flex: 1, fontSize: 13 }}>
                  <div>
                    /vincular {pendente.codigoVinculo} — chat {pendente.chatId}
                  </div>
                  {pendente.recebidoEm && (
                    <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{new Date(pendente.recebidoEm).toLocaleString("pt-BR")}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
