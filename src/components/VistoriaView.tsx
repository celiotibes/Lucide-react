import { Fragment, useMemo, useState } from "react";
import {
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  History,
  Loader2,
  Paperclip,
  Plus,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { useDb } from "../db/useDb";
import { consultar, executar } from "../db/connection";
import { useToast } from "../ui/useToast";
import { formatarMoeda } from "../domain/formatarMoeda";
import type { ContratoLocacao, Imovel, StatusVistoria, TipoAnexo, TipoItemVistoria, Vistoria, VistoriaAnexo } from "../domain/types";
import { agendar, type AgendaVistoriaDTO } from "../domain/vistorias/agenda";
import { realizarInspecao, obterItens, type ItemInspecaoDTO } from "../domain/vistorias/inspecao";
import { concluirInspecao, aprovar, rejeitar } from "../domain/vistorias/aprova";
import { obterAudit } from "../domain/vistorias/audit";
import { gerarDadosLaudo, registrarGeracaoLaudo, obterLaudosGerados, formatarLaudoTexto } from "../domain/vistorias/laudo";
import { formatarData, formatarDataHora } from "../domain/vistorias/utils";
import { avaliarEnvioLaudo, montarAssuntoLaudo } from "../domain/vistorias/envioLaudo";
import { resolverDestinatariosPorContratoId } from "../domain/notificacoes/resolverDestinatarios";
import { dispararNotificacaoComunicado, type ResultadoDisparo } from "../domain/notificacoes/despachoCliente";
import { criarNotificacoesApiClientHttp } from "../domain/notificacoes/vinculosExternos";
import { VincularTelegramExterno } from "./integracoes/VincularTelegramExterno";

/**
 * Tela de vistoria de imóveis — agendamento, inspeção, aprovação/rejeição, laudo e envio do
 * laudo por notificação (e-mail/WhatsApp/Telegram). Toda a regra de negócio e transição de
 * estado vem de `src/domain/vistorias/*` (já testado em `vistorias.test.ts`); esta tela só
 * monta formulários e chama essas funções — nenhuma lógica de domínio é reimplementada aqui.
 *
 * LIMITAÇÃO CONHECIDA (documentada, não "resolvida" por invenção): este sistema não tem
 * armazenamento de arquivo binário (nenhuma tela grava em `vistoria_anexo.url_storage` um
 * arquivo real — ver `Dropzone.tsx`/`DocumentosView.tsx`, que extraem TEXTO do arquivo, nunca
 * guardam o binário em lugar nenhum consultável depois). Por isso "anexo" aqui é só uma
 * REFERÊNCIA/descrição textual (nome do arquivo, link externo, etc.) — não um upload de
 * verdade. `vistoria_anexo` também não tem nenhuma função de domínio própria (nenhum arquivo
 * liberado para edição toca essa tabela), então o INSERT/SELECT dela é feito direto aqui via
 * `executar`/`consultar`, do mesmo jeito que outras telas já acessam tabela sem função de
 * domínio dedicada (ex: `CaucaoView.tsx` em `caucoes`).
 */

// ============================================================================
// Config local (backend + token de sessão) para o envio de notificação do laudo — mesmo
// padrão de `CobrancasAsaasView.tsx`/`CapturasTelegramView.tsx`.
// ============================================================================

interface ConfigNotificacaoLaudo {
  enderecoBackend: string;
  tokenSessao: string;
}

const CHAVE_LOCALSTORAGE_CONFIG = "vistorias:notificacao-config:v1";
const CONFIG_PADRAO: ConfigNotificacaoLaudo = { enderecoBackend: "", tokenSessao: "" };

function carregarConfigNotificacao(): ConfigNotificacaoLaudo {
  try {
    const bruto = localStorage.getItem(CHAVE_LOCALSTORAGE_CONFIG);
    if (!bruto) return { ...CONFIG_PADRAO };
    return { ...CONFIG_PADRAO, ...(JSON.parse(bruto) as Partial<ConfigNotificacaoLaudo>) };
  } catch {
    return { ...CONFIG_PADRAO };
  }
}

function salvarConfigNotificacao(config: ConfigNotificacaoLaudo): void {
  try {
    localStorage.setItem(CHAVE_LOCALSTORAGE_CONFIG, JSON.stringify(config));
  } catch {
    // Storage bloqueado/cheio — a configuração continua valendo em memória para esta sessão.
  }
}

// ============================================================================
// Formulários locais
// ============================================================================

interface FormNovaVistoria {
  imovelId: string;
  contratoId: string;
  data: string; // valor de <input type="datetime-local">
  responsavel: string;
  tipo: AgendaVistoriaDTO["tipo"];
  observacoes: string;
}

function amanhaInputDatetime(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formNovaVistoriaPadrao(): FormNovaVistoria {
  return { imovelId: "", contratoId: "", data: amanhaInputDatetime(), responsavel: "", tipo: "entrada", observacoes: "" };
}

interface ItemRascunho {
  tipo: TipoItemVistoria;
  descricao: string;
  severidade: "" | "baixa" | "media" | "alta";
  valor_estimado: string;
}

function itemVazio(): ItemRascunho {
  return { tipo: "dano", descricao: "", severidade: "", valor_estimado: "" };
}

interface FormInspecao {
  responsavel: string;
  itens: ItemRascunho[];
}

function formInspecaoPadrao(): FormInspecao {
  return { responsavel: "", itens: [itemVazio()] };
}

interface FormAnexo {
  tipo: TipoAnexo | "";
  referencia: string;
}

function formAnexoPadrao(): FormAnexo {
  return { tipo: "foto", referencia: "" };
}

const ROTULO_TIPO_ITEM: Record<TipoItemVistoria, string> = {
  dano: "Dano",
  necessidade_reparo: "Necessidade de reparo",
  achado_positivo: "Achado positivo",
};

const ROTULO_STATUS: Record<StatusVistoria, string> = {
  agendada: "Agendada",
  em_progresso: "Em progresso",
  concluida: "Concluída",
  aprovada: "Aprovada",
};

const CLASSE_PILL_STATUS: Record<StatusVistoria, "good" | "warning"> = {
  agendada: "warning",
  em_progresso: "warning",
  concluida: "good",
  aprovada: "good",
};

async function calcularHashSha256(texto: string): Promise<{ hash: string; tamanhoBytes: number }> {
  const bytes = new TextEncoder().encode(texto);
  const bufferHash = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(bufferHash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { hash, tamanhoBytes: bytes.length };
}

function baixarTexto(nomeArquivo: string, conteudo: string): void {
  const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

export function VistoriaView() {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();

  // ---------------------------------------------------------------- filtros
  const [filtroImovelId, setFiltroImovelId] = useState("");
  const [filtroContratoId, setFiltroContratoId] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");

  // ---------------------------------------------------------- agendamento
  const [mostrarFormNovaVistoria, setMostrarFormNovaVistoria] = useState(false);
  const [formNovaVistoria, setFormNovaVistoria] = useState<FormNovaVistoria>(() => formNovaVistoriaPadrao());
  const [agendando, setAgendando] = useState(false);

  // --------------------------------------------------------- detalhe/expand
  const [vistoriaExpandidaId, setVistoriaExpandidaId] = useState<number | null>(null);

  // -------------------------------------------------------------- inspeção
  const [formsInspecao, setFormsInspecao] = useState<Record<number, FormInspecao>>({});
  const [salvandoInspecaoId, setSalvandoInspecaoId] = useState<number | null>(null);

  // ---------------------------------------------------- concluir/aprovar/rejeitar
  const [ocupadoPor, setOcupadoPor] = useState<{ tipo: string; id: number } | null>(null);
  function ocupado(tipo: string, id: number): boolean {
    return ocupadoPor?.tipo === tipo && ocupadoPor?.id === id;
  }

  // ---------------------------------------------------------------- anexos
  const [formsAnexo, setFormsAnexo] = useState<Record<number, FormAnexo>>({});

  // ----------------------------------------------------------------- laudo
  const [gerandoLaudoId, setGerandoLaudoId] = useState<number | null>(null);

  // --------------------------------------------------------- envio de laudo
  const [config, setConfig] = useState<ConfigNotificacaoLaudo>(() => carregarConfigNotificacao());
  const configurado = config.enderecoBackend.trim().length > 0 && config.tokenSessao.trim().length > 0;
  const [enviandoLaudoId, setEnviandoLaudoId] = useState<number | null>(null);
  const [resultadosEnvio, setResultadosEnvio] = useState<Record<number, ResultadoDisparo[]>>({});

  function atualizarConfig(patch: Partial<ConfigNotificacaoLaudo>) {
    setConfig((atual) => {
      const proximo = { ...atual, ...patch };
      salvarConfigNotificacao(proximo);
      return proximo;
    });
  }

  // ============================================================================
  // Dados
  // ============================================================================

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `versao` força o recálculo após persistir() mutar o mesmo `db` em memória.
  const imoveis = useMemo<Imovel[]>(() => (db ? consultar<Imovel>(db, "SELECT * FROM imoveis ORDER BY apelido") : []), [db, versao]);
  const imoveisPorId = useMemo(() => new Map(imoveis.map((i) => [i.id, i])), [imoveis]);

  const contratos = useMemo<ContratoLocacao[]>(
    () => (db ? consultar<ContratoLocacao>(db, "SELECT * FROM contratos_locacao ORDER BY locatario") : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `versao` força o recálculo após persistir() mutar o mesmo `db` em memória.
    [db, versao],
  );
  const contratosPorId = useMemo(() => new Map(contratos.map((c) => [c.id, c])), [contratos]);
  const contratosPorImovel = useMemo(() => {
    const mapa = new Map<number, ContratoLocacao[]>();
    for (const c of contratos) {
      if (!mapa.has(c.imovel_id)) mapa.set(c.imovel_id, []);
      mapa.get(c.imovel_id)!.push(c);
    }
    return mapa;
  }, [contratos]);

  // Id de `contrato_locatarios` do locatário principal de cada contrato — mesma query que
  // `resolverDestinatariosPorContratoId` já usa internamente (resolverDestinatarios.ts), só
  // que aqui é o ID em si que importa (para `VincularTelegramExterno`), não o contato
  // resolvido. Não há função de domínio pronta que devolva só o id.
  const contratoLocatarioIdPorContrato = useMemo(() => {
    const mapa = new Map<number, number>();
    if (!db) return mapa;
    for (const c of contratos) {
      const [linha] = consultar<{ id: number }>(
        db,
        "SELECT id FROM contrato_locatarios WHERE contrato_id = ? AND papel = 'locatario' ORDER BY id ASC LIMIT 1",
        [c.id],
      );
      if (linha) mapa.set(c.id, linha.id);
    }
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `versao` força o recálculo após persistir() mutar o mesmo `db` em memória.
  }, [db, versao, contratos]);

  // Listagem com filtros — combina imóvel/contrato/status ao mesmo tempo, o que nenhuma
  // função isolada de `agenda.ts` (listarPorImovel/listarPorStatus) cobre sozinha; é uma
  // leitura simples (SELECT), sem nenhuma regra de transição de estado reimplementada.
  const vistorias = useMemo<Vistoria[]>(() => {
    if (!db) return [];
    const condicoes: string[] = [];
    const parametros: (string | number)[] = [];
    if (filtroImovelId) {
      condicoes.push("imovel_id = ?");
      parametros.push(Number(filtroImovelId));
    }
    if (filtroContratoId) {
      condicoes.push("contrato_id = ?");
      parametros.push(Number(filtroContratoId));
    }
    if (filtroStatus) {
      condicoes.push("status = ?");
      parametros.push(filtroStatus);
    }
    const where = condicoes.length > 0 ? ` WHERE ${condicoes.join(" AND ")}` : "";
    return consultar<Vistoria>(db, `SELECT * FROM vistorias${where} ORDER BY data_agendada DESC, id DESC`, parametros);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `versao` força o recálculo após persistir() mutar o mesmo `db` em memória.
  }, [db, versao, filtroImovelId, filtroContratoId, filtroStatus]);

  // ============================================================================
  // Agendamento
  // ============================================================================

  async function agendarNovaVistoria() {
    if (!db) return;
    if (!formNovaVistoria.imovelId) {
      avisar("critical", "Selecione o imóvel.");
      return;
    }
    if (!formNovaVistoria.data) {
      avisar("critical", "Informe a data da vistoria.");
      return;
    }
    if (!formNovaVistoria.responsavel.trim()) {
      avisar("critical", "Informe o responsável pela vistoria.");
      return;
    }
    setAgendando(true);
    try {
      const vistoria = agendar(db, {
        imovel_id: Number(formNovaVistoria.imovelId),
        data: new Date(formNovaVistoria.data),
        responsavel: formNovaVistoria.responsavel.trim(),
        tipo: formNovaVistoria.tipo,
        observacoes: formNovaVistoria.observacoes.trim() || undefined,
      });
      if (formNovaVistoria.contratoId) {
        // agendar() não aceita contrato_id (AgendaVistoriaDTO não tem esse campo) — vínculo
        // feito aqui com UPDATE direto, mesma coluna que `vistorias.test.ts` já usa para
        // simular uma vistoria vinculada a contrato (ver teste de gerarDadosLaudo).
        executar(db, "UPDATE vistorias SET contrato_id = ? WHERE id = ?", [Number(formNovaVistoria.contratoId), vistoria.id]);
      }
      await persistir();
      setFormNovaVistoria(formNovaVistoriaPadrao());
      setMostrarFormNovaVistoria(false);
      avisar("good", `Vistoria #${vistoria.id} agendada.`);
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Falha ao agendar vistoria.");
    } finally {
      setAgendando(false);
    }
  }

  // ============================================================================
  // Inspeção
  // ============================================================================

  function obterFormInspecao(vistoriaId: number): FormInspecao {
    return formsInspecao[vistoriaId] ?? formInspecaoPadrao();
  }

  function atualizarFormInspecao(vistoriaId: number, patch: Partial<FormInspecao>) {
    setFormsInspecao((atual) => ({ ...atual, [vistoriaId]: { ...obterFormInspecao(vistoriaId), ...patch } }));
  }

  function atualizarItemInspecao(vistoriaId: number, indice: number, patch: Partial<ItemRascunho>) {
    const form = obterFormInspecao(vistoriaId);
    atualizarFormInspecao(vistoriaId, { itens: form.itens.map((item, i) => (i === indice ? { ...item, ...patch } : item)) });
  }

  function adicionarItemInspecao(vistoriaId: number) {
    const form = obterFormInspecao(vistoriaId);
    atualizarFormInspecao(vistoriaId, { itens: [...form.itens, itemVazio()] });
  }

  function removerItemInspecao(vistoriaId: number, indice: number) {
    const form = obterFormInspecao(vistoriaId);
    atualizarFormInspecao(vistoriaId, { itens: form.itens.filter((_, i) => i !== indice) });
  }

  async function submeterInspecao(vistoriaId: number) {
    if (!db) return;
    const form = obterFormInspecao(vistoriaId);
    if (!form.responsavel.trim()) {
      avisar("critical", "Informe o responsável pela inspeção.");
      return;
    }
    const itensDto: ItemInspecaoDTO[] = form.itens
      .filter((item) => item.descricao.trim() !== "")
      .map((item) => ({
        tipo: item.tipo,
        descricao: item.descricao.trim(),
        severidade: item.severidade || undefined,
        valor_estimado: item.valor_estimado.trim() === "" ? undefined : Number.parseFloat(item.valor_estimado.replace(",", ".")),
      }));
    setSalvandoInspecaoId(vistoriaId);
    try {
      realizarInspecao(db, vistoriaId, itensDto, form.responsavel.trim());
      await persistir();
      setFormsInspecao((atual) => {
        const copia = { ...atual };
        delete copia[vistoriaId];
        return copia;
      });
      avisar("good", `Inspeção registrada (${itensDto.length} item(ns)).`);
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Falha ao registrar inspeção.");
    } finally {
      setSalvandoInspecaoId(null);
    }
  }

  // ============================================================================
  // Concluir / aprovar / rejeitar
  // ============================================================================

  async function concluir(vistoriaId: number) {
    if (!db) return;
    const motivo = prompt("Observação sobre a conclusão da inspeção (opcional):");
    if (motivo === null) return;
    setOcupadoPor({ tipo: "concluir", id: vistoriaId });
    try {
      concluirInspecao(db, vistoriaId, motivo.trim() || undefined);
      await persistir();
      avisar("good", "Inspeção concluída.");
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Falha ao concluir inspeção.");
    } finally {
      setOcupadoPor(null);
    }
  }

  async function aprovarVistoria(vistoriaId: number) {
    if (!db) return;
    const motivo = prompt("Motivo da aprovação (opcional):");
    if (motivo === null) return;
    setOcupadoPor({ tipo: "aprovar", id: vistoriaId });
    try {
      aprovar(db, { vistoria_id: vistoriaId, motivo: motivo.trim() || undefined });
      await persistir();
      avisar("good", "Vistoria aprovada.");
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Falha ao aprovar vistoria.");
    } finally {
      setOcupadoPor(null);
    }
  }

  async function rejeitarVistoria(vistoriaId: number) {
    if (!db) return;
    const motivo = prompt("Motivo da rejeição (obrigatório):");
    if (motivo === null) return;
    if (!motivo.trim()) {
      avisar("critical", "Rejeição exige motivo.");
      return;
    }
    setOcupadoPor({ tipo: "rejeitar", id: vistoriaId });
    try {
      rejeitar(db, { vistoria_id: vistoriaId, motivo: motivo.trim() });
      await persistir();
      avisar("good", "Vistoria rejeitada — voltou para o status 'agendada'.");
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Falha ao rejeitar vistoria.");
    } finally {
      setOcupadoPor(null);
    }
  }

  // ============================================================================
  // Anexos (referência textual — ver limitação no cabeçalho do arquivo)
  // ============================================================================

  function obterFormAnexo(vistoriaId: number): FormAnexo {
    return formsAnexo[vistoriaId] ?? formAnexoPadrao();
  }

  function atualizarFormAnexo(vistoriaId: number, patch: Partial<FormAnexo>) {
    setFormsAnexo((atual) => ({ ...atual, [vistoriaId]: { ...obterFormAnexo(vistoriaId), ...patch } }));
  }

  async function registrarAnexo(vistoriaId: number) {
    if (!db) return;
    const form = obterFormAnexo(vistoriaId);
    if (!form.referencia.trim()) {
      avisar("critical", "Informe uma referência/descrição do anexo (nome do arquivo, link externo, etc.).");
      return;
    }
    executar(
      db,
      `INSERT INTO vistoria_anexo (vistoria_id, tipo, url_storage, criado_em) VALUES (?, ?, ?, ?)`,
      [vistoriaId, form.tipo || null, form.referencia.trim(), new Date().toISOString()],
    );
    await persistir();
    setFormsAnexo((atual) => {
      const copia = { ...atual };
      delete copia[vistoriaId];
      return copia;
    });
    avisar("good", "Referência de anexo registrada.");
  }

  // ============================================================================
  // Laudo
  // ============================================================================

  async function registrarLaudo(vistoria: Vistoria) {
    if (!db) return;
    setGerandoLaudoId(vistoria.id);
    try {
      const laudo = gerarDadosLaudo(db, vistoria.id);
      const texto = formatarLaudoTexto(laudo);
      const { hash, tamanhoBytes } = await calcularHashSha256(texto);
      const nomeArquivo = `laudo-vistoria-${vistoria.id}-${new Date().toISOString().slice(0, 10)}.txt`;
      registrarGeracaoLaudo(db, vistoria.id, nomeArquivo, hash, tamanhoBytes);
      await persistir();
      avisar("good", `Laudo "${nomeArquivo}" registrado em Documentos gerados.`);
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Falha ao registrar o laudo.");
    } finally {
      setGerandoLaudoId(null);
    }
  }

  function baixarLaudo(vistoria: Vistoria) {
    if (!db) return;
    const laudo = gerarDadosLaudo(db, vistoria.id);
    baixarTexto(`laudo-vistoria-${vistoria.id}.txt`, formatarLaudoTexto(laudo));
  }

  // ============================================================================
  // Envio do laudo por notificação (e-mail/WhatsApp/Telegram)
  // ============================================================================

  async function enviarLaudoPorNotificacao(vistoria: Vistoria) {
    if (!db) return;
    const avaliacao = avaliarEnvioLaudo(vistoria);
    if (!avaliacao.podeEnviar) {
      avisar("critical", avaliacao.motivo ?? "Envio não permitido para esta vistoria.");
      return;
    }
    if (!configurado) {
      avisar("critical", "Configure o endereço do backend e o token de sessão antes de enviar o laudo.");
      return;
    }
    setEnviandoLaudoId(vistoria.id);
    try {
      const laudo = gerarDadosLaudo(db, vistoria.id);
      const texto = formatarLaudoTexto(laudo);
      const assunto = montarAssuntoLaudo(vistoria, laudo.imovel.apelido);
      const destinatarios = resolverDestinatariosPorContratoId(db, vistoria.contrato_id!);
      const apiClient = criarNotificacoesApiClientHttp(config.enderecoBackend.trim(), config.tokenSessao.trim());
      const resultados = await dispararNotificacaoComunicado(db, apiClient, destinatarios, { assunto, mensagem: texto });
      await persistir();
      setResultadosEnvio((atual) => ({ ...atual, [vistoria.id]: resultados }));
      const algumEnviado = resultados.some((r) => r.status === "enviado");
      avisar(algumEnviado ? "good" : "warning", "Envio do laudo processado — veja o resultado por canal abaixo.");
    } catch (erro) {
      avisar("critical", erro instanceof Error ? erro.message : "Falha ao enviar o laudo.");
    } finally {
      setEnviandoLaudoId(null);
    }
  }

  // ============================================================================
  // Render
  // ============================================================================

  if (!db) {
    return <p style={{ color: "var(--ink-soft)" }}>Carregando banco de dados…</p>;
  }

  return (
    <div>
      <h2 className="section-title">
        <ClipboardCheck size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />
        Vistorias de imóveis ({vistorias.length})
      </h2>
      <p style={{ maxWidth: "72ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 18 }}>
        Agendamento, inspeção (itens de dano/reparo/achado positivo), aprovação/rejeição, laudo e trilha de
        auditoria — toda a regra de transição de estado vem de <code>src/domain/vistorias</code> (já testado em{" "}
        <code>vistorias.test.ts</code>). Anexo aqui é só uma <strong>referência textual</strong> (nome do arquivo,
        link externo) — este sistema ainda não tem armazenamento de arquivo binário.
      </p>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Imóvel
            <select className="btn" style={{ width: 200, marginTop: 4 }} value={filtroImovelId} onChange={(e) => setFiltroImovelId(e.target.value)}>
              <option value="">Todos</option>
              {imoveis.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.apelido}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Contrato
            <select className="btn" style={{ width: 220, marginTop: 4 }} value={filtroContratoId} onChange={(e) => setFiltroContratoId(e.target.value)}>
              <option value="">Todos</option>
              {contratos.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.id} — {c.locatario}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Status
            <select className="btn" style={{ width: 160, marginTop: 4 }} value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
              <option value="">Todos</option>
              {(Object.keys(ROTULO_STATUS) as StatusVistoria[]).map((s) => (
                <option key={s} value={s}>
                  {ROTULO_STATUS[s]}
                </option>
              ))}
            </select>
          </label>
          {(filtroImovelId || filtroContratoId || filtroStatus) && (
            <button
              className="btn"
              onClick={() => {
                setFiltroImovelId("");
                setFiltroContratoId("");
                setFiltroStatus("");
              }}
            >
              Limpar filtros
            </button>
          )}
          <button className="btn primary" style={{ marginLeft: "auto" }} onClick={() => setMostrarFormNovaVistoria((atual) => !atual)}>
            <CalendarPlus size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} /> Agendar nova vistoria
          </button>
        </div>
      </div>

      {/* Formulário de agendamento */}
      {mostrarFormNovaVistoria && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 10, fontWeight: 600 }}>
            Agendar nova vistoria
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Imóvel *
              <select
                className="btn"
                style={{ width: "100%", marginTop: 4 }}
                value={formNovaVistoria.imovelId}
                onChange={(e) => setFormNovaVistoria({ ...formNovaVistoria, imovelId: e.target.value, contratoId: "" })}
              >
                <option value="">Selecione…</option>
                {imoveis.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.apelido}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Contrato (opcional — permite enviar o laudo ao locatário depois)
              <select
                className="btn"
                style={{ width: "100%", marginTop: 4 }}
                value={formNovaVistoria.contratoId}
                onChange={(e) => setFormNovaVistoria({ ...formNovaVistoria, contratoId: e.target.value })}
              >
                <option value="">Nenhum</option>
                {(formNovaVistoria.imovelId ? contratosPorImovel.get(Number(formNovaVistoria.imovelId)) ?? [] : contratos).map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.id} — {c.locatario}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Data/hora agendada *
              <input
                type="datetime-local"
                className="btn"
                style={{ width: "100%", marginTop: 4 }}
                value={formNovaVistoria.data}
                onChange={(e) => setFormNovaVistoria({ ...formNovaVistoria, data: e.target.value })}
              />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Responsável *
              <input
                className="btn"
                style={{ width: "100%", marginTop: 4, cursor: "text" }}
                value={formNovaVistoria.responsavel}
                onChange={(e) => setFormNovaVistoria({ ...formNovaVistoria, responsavel: e.target.value })}
              />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Tipo
              <select
                className="btn"
                style={{ width: "100%", marginTop: 4 }}
                value={formNovaVistoria.tipo}
                onChange={(e) => setFormNovaVistoria({ ...formNovaVistoria, tipo: e.target.value as AgendaVistoriaDTO["tipo"] })}
              >
                <option value="entrada">Entrada</option>
                <option value="saída">Saída</option>
                <option value="periódica">Periódica</option>
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-soft)", gridColumn: "1 / -1" }}>
              Observações
              <input
                className="btn"
                style={{ width: "100%", marginTop: 4, cursor: "text" }}
                value={formNovaVistoria.observacoes}
                onChange={(e) => setFormNovaVistoria({ ...formNovaVistoria, observacoes: e.target.value })}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" onClick={agendarNovaVistoria} disabled={agendando}>
              {agendando ? <Loader2 size={13} className="spin" /> : <CalendarPlus size={13} />} Agendar
            </button>
            <button className="btn" onClick={() => setMostrarFormNovaVistoria(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Config backend/token para envio de notificação do laudo */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, marginBottom: 10 }}>Backend e sessão (para o botão "Enviar laudo")</h3>
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
              placeholder="obtido via POST /api/auth/login"
              value={config.tokenSessao}
              onChange={(e) => atualizarConfig({ tokenSessao: e.target.value })}
            />
          </label>
        </div>
        {!configurado && (
          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 10 }}>
            Sem backend/token configurados, o botão "Enviar laudo" fica desabilitado — o resto da tela (agendar,
            inspecionar, aprovar/rejeitar, gerar laudo) funciona normalmente sem essa configuração.
          </p>
        )}
      </div>

      {/* Lista de vistorias */}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Imóvel</th>
              <th>Contrato/Locatário</th>
              <th>Agendada</th>
              <th>Realizada</th>
              <th>Status</th>
              <th className="num">Valor estimado danos</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vistorias.map((v) => {
              const contrato = v.contrato_id ? contratosPorId.get(v.contrato_id) : undefined;
              const expandida = vistoriaExpandidaId === v.id;
              return (
                <Fragment key={v.id}>
                  <tr>
                    <td>{imoveisPorId.get(v.imovel_id)?.apelido ?? v.imovel_id}</td>
                    <td>{contrato ? `#${contrato.id} — ${contrato.locatario}` : "—"}</td>
                    <td>{formatarData(v.data_agendada)}</td>
                    <td>{formatarData(v.data_realizada)}</td>
                    <td>
                      <span className={`pill ${CLASSE_PILL_STATUS[v.status]}`}>{ROTULO_STATUS[v.status]}</span>
                    </td>
                    <td className="num">{v.valor_estimado ? formatarMoeda(v.valor_estimado) : "—"}</td>
                    <td>
                      <button
                        className="btn"
                        style={{ padding: "4px 8px", fontSize: 12 }}
                        onClick={() => setVistoriaExpandidaId(expandida ? null : v.id)}
                      >
                        {expandida ? "Ocultar" : "Detalhar"}
                      </button>
                    </td>
                  </tr>
                  {expandida && (
                    <tr>
                      <td colSpan={7} style={{ background: "var(--surface-2)" }}>
                        <DetalheVistoria
                          vistoria={v}
                          contrato={contrato}
                          db={db}
                          versao={versao}
                          formInspecao={obterFormInspecao(v.id)}
                          salvandoInspecao={salvandoInspecaoId === v.id}
                          onAtualizarFormInspecao={(patch) => atualizarFormInspecao(v.id, patch)}
                          onAtualizarItemInspecao={(indice, patch) => atualizarItemInspecao(v.id, indice, patch)}
                          onAdicionarItemInspecao={() => adicionarItemInspecao(v.id)}
                          onRemoverItemInspecao={(indice) => removerItemInspecao(v.id, indice)}
                          onSubmeterInspecao={() => submeterInspecao(v.id)}
                          onConcluir={() => concluir(v.id)}
                          onAprovar={() => aprovarVistoria(v.id)}
                          onRejeitar={() => rejeitarVistoria(v.id)}
                          ocupadoConcluir={ocupado("concluir", v.id)}
                          ocupadoAprovar={ocupado("aprovar", v.id)}
                          ocupadoRejeitar={ocupado("rejeitar", v.id)}
                          formAnexo={obterFormAnexo(v.id)}
                          onAtualizarFormAnexo={(patch) => atualizarFormAnexo(v.id, patch)}
                          onRegistrarAnexo={() => registrarAnexo(v.id)}
                          gerandoLaudo={gerandoLaudoId === v.id}
                          onRegistrarLaudo={() => registrarLaudo(v)}
                          onBaixarLaudo={() => baixarLaudo(v)}
                          contratoLocatarioId={v.contrato_id ? contratoLocatarioIdPorContrato.get(v.contrato_id) : undefined}
                          configuradoNotificacao={configurado}
                          enviandoLaudo={enviandoLaudoId === v.id}
                          onEnviarLaudo={() => enviarLaudoPorNotificacao(v)}
                          resultadosEnvio={resultadosEnvio[v.id]}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {vistorias.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                  Nenhuma vistoria encontrada {filtroImovelId || filtroContratoId || filtroStatus ? "para os filtros aplicados" : "cadastrada"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Detalhe expandido de uma vistoria
// ============================================================================

interface DetalheVistoriaProps {
  vistoria: Vistoria;
  contrato: ContratoLocacao | undefined;
  db: NonNullable<ReturnType<typeof useDb>["db"]>;
  versao: number;
  formInspecao: FormInspecao;
  salvandoInspecao: boolean;
  onAtualizarFormInspecao: (patch: Partial<FormInspecao>) => void;
  onAtualizarItemInspecao: (indice: number, patch: Partial<ItemRascunho>) => void;
  onAdicionarItemInspecao: () => void;
  onRemoverItemInspecao: (indice: number) => void;
  onSubmeterInspecao: () => void;
  onConcluir: () => void;
  onAprovar: () => void;
  onRejeitar: () => void;
  ocupadoConcluir: boolean;
  ocupadoAprovar: boolean;
  ocupadoRejeitar: boolean;
  formAnexo: FormAnexo;
  onAtualizarFormAnexo: (patch: Partial<FormAnexo>) => void;
  onRegistrarAnexo: () => void;
  gerandoLaudo: boolean;
  onRegistrarLaudo: () => void;
  onBaixarLaudo: () => void;
  contratoLocatarioId: number | undefined;
  configuradoNotificacao: boolean;
  enviandoLaudo: boolean;
  onEnviarLaudo: () => void;
  resultadosEnvio: ResultadoDisparo[] | undefined;
}

function DetalheVistoria({
  vistoria,
  contrato,
  db,
  versao,
  formInspecao,
  salvandoInspecao,
  onAtualizarFormInspecao,
  onAtualizarItemInspecao,
  onAdicionarItemInspecao,
  onRemoverItemInspecao,
  onSubmeterInspecao,
  onConcluir,
  onAprovar,
  onRejeitar,
  ocupadoConcluir,
  ocupadoAprovar,
  ocupadoRejeitar,
  formAnexo,
  onAtualizarFormAnexo,
  onRegistrarAnexo,
  gerandoLaudo,
  onRegistrarLaudo,
  onBaixarLaudo,
  contratoLocatarioId,
  configuradoNotificacao,
  enviandoLaudo,
  onEnviarLaudo,
  resultadosEnvio,
}: DetalheVistoriaProps) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `versao` força recálculo após persistir() mutar o mesmo `db`.
  const itens = useMemo(() => obterItens(db, vistoria.id), [db, versao, vistoria.id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const audit = useMemo(() => obterAudit(db, vistoria.id), [db, versao, vistoria.id]);
  const anexos = useMemo(
    () => consultar<VistoriaAnexo>(db, "SELECT * FROM vistoria_anexo WHERE vistoria_id = ? ORDER BY criado_em DESC", [vistoria.id]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, versao, vistoria.id],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const laudo = useMemo(() => gerarDadosLaudo(db, vistoria.id), [db, versao, vistoria.id]);
  const textoLaudo = useMemo(() => formatarLaudoTexto(laudo), [laudo]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const laudosGerados = useMemo(() => obterLaudosGerados(db, vistoria.id), [db, versao, vistoria.id]);

  const avaliacaoEnvio = avaliarEnvioLaudo(vistoria);
  const podeInspecionar = vistoria.status === "agendada" || vistoria.status === "em_progresso";

  return (
    <div style={{ padding: "14px 4px", display: "grid", gap: 20 }}>
      {/* Itens de inspeção */}
      <div>
        <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <ClipboardCheck size={15} /> Itens da inspeção
        </strong>
        {itens.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "0 0 10px" }}>Nenhum item registrado ainda.</p>
        ) : (
          <div className="table-wrap" style={{ marginBottom: 10 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Descrição</th>
                  <th>Severidade</th>
                  <th className="num">Valor estimado</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => (
                  <tr key={item.id}>
                    <td>{ROTULO_TIPO_ITEM[item.tipo]}</td>
                    <td>{item.descricao}</td>
                    <td>{item.severidade ?? "—"}</td>
                    <td className="num">{item.valor_estimado ? formatarMoeda(item.valor_estimado) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {podeInspecionar && (
          <div className="card" style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 8, fontWeight: 600 }}>
              {vistoria.status === "agendada" ? "Realizar inspeção" : "Registrar mais itens da inspeção"}
            </div>
            <label style={{ fontSize: 12, color: "var(--ink-soft)", display: "block", marginBottom: 10 }}>
              Responsável pela inspeção *
              <input
                className="btn"
                style={{ width: 260, marginTop: 4, cursor: "text" }}
                value={formInspecao.responsavel}
                onChange={(e) => onAtualizarFormInspecao({ responsavel: e.target.value })}
              />
            </label>
            {formInspecao.itens.map((item, indice) => (
              <div key={indice} style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8, flexWrap: "wrap" }}>
                <label style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                  Tipo
                  <select
                    className="btn"
                    style={{ width: 170, marginTop: 4 }}
                    value={item.tipo}
                    onChange={(e) => onAtualizarItemInspecao(indice, { tipo: e.target.value as TipoItemVistoria })}
                  >
                    <option value="dano">Dano</option>
                    <option value="necessidade_reparo">Necessidade de reparo</option>
                    <option value="achado_positivo">Achado positivo</option>
                  </select>
                </label>
                <label style={{ fontSize: 11.5, color: "var(--ink-soft)", flex: 1, minWidth: 180 }}>
                  Descrição
                  <input
                    className="btn"
                    style={{ width: "100%", marginTop: 4, cursor: "text" }}
                    value={item.descricao}
                    onChange={(e) => onAtualizarItemInspecao(indice, { descricao: e.target.value })}
                  />
                </label>
                <label style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                  Severidade
                  <select
                    className="btn"
                    style={{ width: 110, marginTop: 4 }}
                    value={item.severidade}
                    onChange={(e) => onAtualizarItemInspecao(indice, { severidade: e.target.value as ItemRascunho["severidade"] })}
                  >
                    <option value="">—</option>
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                  </select>
                </label>
                <label style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                  Valor estimado (R$)
                  <input
                    className="btn"
                    style={{ width: 110, marginTop: 4, cursor: "text" }}
                    value={item.valor_estimado}
                    onChange={(e) => onAtualizarItemInspecao(indice, { valor_estimado: e.target.value })}
                  />
                </label>
                {formInspecao.itens.length > 1 && (
                  <button className="btn" style={{ padding: "6px 8px" }} onClick={() => onRemoverItemInspecao(indice)} title="Remover item">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" style={{ padding: "6px 10px", fontSize: 12.5 }} onClick={onAdicionarItemInspecao}>
                <Plus size={13} /> Adicionar item
              </button>
              <button className="btn primary" style={{ padding: "6px 10px", fontSize: 12.5 }} onClick={onSubmeterInspecao} disabled={salvandoInspecao}>
                {salvandoInspecao ? <Loader2 size={13} className="spin" /> : <ClipboardCheck size={13} />} Registrar inspeção
              </button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {vistoria.status === "em_progresso" && (
            <button className="btn primary" style={{ padding: "6px 10px", fontSize: 12.5 }} onClick={onConcluir} disabled={ocupadoConcluir}>
              {ocupadoConcluir ? <Loader2 size={13} className="spin" /> : <CheckCircle2 size={13} />} Concluir inspeção
            </button>
          )}
          {vistoria.status === "concluida" && (
            <button className="btn primary" style={{ padding: "6px 10px", fontSize: 12.5 }} onClick={onAprovar} disabled={ocupadoAprovar}>
              {ocupadoAprovar ? <Loader2 size={13} className="spin" /> : <CheckCircle2 size={13} />} Aprovar
            </button>
          )}
          {(vistoria.status === "em_progresso" || vistoria.status === "concluida") && (
            <button className="btn" style={{ padding: "6px 10px", fontSize: 12.5 }} onClick={onRejeitar} disabled={ocupadoRejeitar}>
              {ocupadoRejeitar ? <Loader2 size={13} className="spin" /> : <XCircle size={13} />} Rejeitar (volta para agendada)
            </button>
          )}
        </div>
      </div>

      {/* Anexos */}
      <div>
        <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <Paperclip size={15} /> Anexos (referência textual — sem upload de arquivo real)
        </strong>
        {anexos.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "0 0 10px" }}>Nenhum anexo registrado.</p>
        ) : (
          <ul style={{ fontSize: 12.5, margin: "0 0 10px", paddingLeft: 18 }}>
            {anexos.map((a) => (
              <li key={a.id}>
                {a.tipo ? `[${a.tipo}] ` : ""}
                {a.url_storage} — {formatarData(a.criado_em)}
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
            Tipo
            <select
              className="btn"
              style={{ width: 130, marginTop: 4 }}
              value={formAnexo.tipo}
              onChange={(e) => onAtualizarFormAnexo({ tipo: e.target.value as TipoAnexo })}
            >
              <option value="foto">Foto</option>
              <option value="documento">Documento</option>
              <option value="laudo">Laudo</option>
            </select>
          </label>
          <label style={{ fontSize: 11.5, color: "var(--ink-soft)", flex: 1, minWidth: 220 }}>
            Referência/descrição (nome do arquivo, link externo…)
            <input
              className="btn"
              style={{ width: "100%", marginTop: 4, cursor: "text" }}
              value={formAnexo.referencia}
              onChange={(e) => onAtualizarFormAnexo({ referencia: e.target.value })}
            />
          </label>
          <button className="btn" style={{ padding: "6px 10px", fontSize: 12.5 }} onClick={onRegistrarAnexo}>
            <Plus size={13} /> Registrar
          </button>
        </div>
      </div>

      {/* Trilha de auditoria */}
      <div>
        <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <History size={15} /> Trilha de auditoria
        </strong>
        <ul style={{ fontSize: 12.5, margin: 0, paddingLeft: 18 }}>
          {audit.acoes.map((acao, indice) => {
            const { data, hora } = formatarDataHora(acao.criado_em);
            return (
              <li key={indice}>
                {data} {hora} — <strong>{acao.acao}</strong>
                {acao.motivo ? ` (${acao.motivo})` : ""}
                {acao.tempo_desde_anterior ? ` — +${acao.tempo_desde_anterior} desde a ação anterior` : ""}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Laudo */}
      <div>
        <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <FileText size={15} /> Laudo
        </strong>
        <pre
          style={{
            fontSize: 11.5,
            background: "var(--surface-1, #fff)",
            padding: 12,
            borderRadius: 6,
            maxHeight: 280,
            overflow: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {textoLaudo}
        </pre>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <button className="btn" style={{ padding: "6px 10px", fontSize: 12.5 }} onClick={onRegistrarLaudo} disabled={gerandoLaudo}>
            {gerandoLaudo ? <Loader2 size={13} className="spin" /> : <FileText size={13} />} Registrar geração do laudo
          </button>
          <button className="btn" style={{ padding: "6px 10px", fontSize: 12.5 }} onClick={onBaixarLaudo}>
            <Download size={13} /> Baixar laudo (.txt)
          </button>
        </div>
        {laudosGerados.length > 0 && (
          <>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 4 }}>Laudos já gerados para este imóvel:</div>
            <ul style={{ fontSize: 12, margin: "0 0 10px", paddingLeft: 18 }}>
              {laudosGerados.map((l) => (
                <li key={l.id}>
                  {l.nome_arquivo} — emitido {formatarData(l.data_emissao)}, gerado {formatarData(l.gerado_em)}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Envio do laudo por notificação */}
      <div>
        <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <Send size={15} /> Enviar laudo ao locatário
        </strong>
        {!avaliacaoEnvio.podeEnviar ? (
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 10 }}>{avaliacaoEnvio.motivo}</p>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 10, maxWidth: "64ch" }}>
              Envia o texto do laudo acima por e-mail/WhatsApp/Telegram ao locatário principal do contrato #{contrato?.id} (
              {contrato?.locatario}), resolvido via <code>resolverDestinatariosPorContratoId</code>.
            </p>
            <button
              className="btn primary"
              style={{ padding: "6px 10px", fontSize: 12.5, marginBottom: 12 }}
              onClick={onEnviarLaudo}
              disabled={enviandoLaudo || !configuradoNotificacao}
              title={!configuradoNotificacao ? "Configure o backend e o token de sessão acima" : undefined}
            >
              {enviandoLaudo ? <Loader2 size={13} className="spin" /> : <Send size={13} />} Enviar laudo
            </button>
            {resultadosEnvio && resultadosEnvio.length > 0 && (
              <ul style={{ fontSize: 12.5, margin: "0 0 12px", paddingLeft: 18 }}>
                {resultadosEnvio.map((r, indice) => (
                  <li key={indice}>
                    <span className={`pill ${r.status === "enviado" ? "good" : r.status === "falha" ? "critical" : "warning"}`} style={{ marginRight: 6 }}>
                      {r.canal}
                    </span>
                    {r.destinatario} — {r.status}
                    {r.motivo ? ` (${r.motivo})` : ""}
                  </li>
                ))}
              </ul>
            )}
            {contratoLocatarioId !== undefined && (
              <VincularTelegramExterno referenciaTipo="contrato_locatario" referenciaId={contratoLocatarioId} nomeExibicao={contrato?.locatario} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
