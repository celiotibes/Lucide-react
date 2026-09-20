import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, LayoutDashboard, UploadCloud, ListChecks, FileSignature, Landmark, Banknote, ShieldAlert, FileText, Receipt, BookOpenCheck, TrendingUp, LineChart, Building2, FolderSearch, ClipboardList, Scale, Download, Upload as UploadIcon, RotateCcw, AlertTriangle, Copy, Check, ListTodo, RefreshCw } from "lucide-react";
import "./App.css";
import { DbProvider } from "./db/DbContext";
import { ToastProvider } from "./ui/ToastProvider";
import { useToast } from "./ui/useToast";
import { SeletorDensidade, SeletorTema } from "./ui/Preferencias";
import { OnboardingEntidade } from "./ui/OnboardingEntidade";
import { obterEntidadeAtiva, resumirMigracao, sincronizarRazao } from "./domain/erp/entidadeLegal";
import { useDb } from "./db/useDb";
import { exportarArquivo, importarArquivo } from "./db/connection";
import { gerarDadosSimulados, limparBanco } from "./domain/seed/dadosSimulados";
import { registrarBackup, calcularStatusBackup, type RegistroBackup } from "./domain/backupIntegridade";
import { gerarPainelPendencias } from "./domain/auditoria/painelPendencias";
import { Dashboard } from "./components/Dashboard";
import type { FiltroTransacoesInicial } from "./components/TransacoesView";

/** Aviso que precisa sobreviver a um window.location.reload() (hoje, só a confirmação
 *  de importação de backup, que recarrega a página para reabrir o banco novo). */
const CHAVE_AVISO_POS_RELOAD = "crmt:aviso-pos-reload";

// Só uma aba renderiza por vez ({aba === "x" && <X/>}) — carregar as 16 telas que não são o
// Painel (a aba inicial) de forma preguiçosa evita que o bundle de abertura inclua código que
// a maioria das sessões nunca visita (ex: Laudo pericial, Índices econômicos). O Dashboard
// continua com import estático de propósito: é sempre a primeira tela renderizada, então
// adiá-lo só trocaria "esperar o bundle" por "esperar o Suspense" sem ganho nenhum.
const PendenciasView = lazy(() => import("./components/PendenciasView").then((m) => ({ default: m.PendenciasView })));
const ImportarView = lazy(() => import("./components/ImportarView").then((m) => ({ default: m.ImportarView })));
const TransacoesView = lazy(() => import("./components/TransacoesView").then((m) => ({ default: m.TransacoesView })));
const ContratosInadimplenciaView = lazy(() => import("./components/ContratosInadimplenciaView").then((m) => ({ default: m.ContratosInadimplenciaView })));
const CaucaoView = lazy(() => import("./components/CaucaoView").then((m) => ({ default: m.CaucaoView })));
const FinanciamentosView = lazy(() => import("./components/FinanciamentosView").then((m) => ({ default: m.FinanciamentosView })));
const AuditoriaView = lazy(() => import("./components/AuditoriaView").then((m) => ({ default: m.AuditoriaView })));
const LaudoView = lazy(() => import("./components/LaudoView").then((m) => ({ default: m.LaudoView })));
const RendaTributavelView = lazy(() => import("./components/RendaTributavelView").then((m) => ({ default: m.RendaTributavelView })));
const LivroRazaoView = lazy(() => import("./components/LivroRazaoView").then((m) => ({ default: m.LivroRazaoView })));
const ReajustesRescisaoView = lazy(() => import("./components/ReajustesRescisaoView").then((m) => ({ default: m.ReajustesRescisaoView })));
const IndicesEconomicosView = lazy(() => import("./components/IndicesEconomicosView").then((m) => ({ default: m.IndicesEconomicosView })));
const ImoveisView = lazy(() => import("./components/ImoveisView").then((m) => ({ default: m.ImoveisView })));
const DocumentosView = lazy(() => import("./components/DocumentosView").then((m) => ({ default: m.DocumentosView })));
const CadastrosView = lazy(() => import("./components/CadastrosView").then((m) => ({ default: m.CadastrosView })));
const PatrimonioView = lazy(() => import("./components/PatrimonioView").then((m) => ({ default: m.PatrimonioView })));
const SincronizacaoView = lazy(() => import("./components/SincronizacaoView").then((m) => ({ default: m.SincronizacaoView })));
const RelatoriosIntegradosView = lazy(() => import("./components/RelatoriosIntegradosView").then((m) => ({ default: m.RelatoriosIntegradosView })));
const AnalyticsIntegradosView = lazy(() => import("./components/AnalyticsIntegradosView").then((m) => ({ default: m.AnalyticsIntegradosView })));
const SincronizacaoIntegridadeView = lazy(() => import("./components/SincronizacaoIntegridadeView").then((m) => ({ default: m.SincronizacaoIntegridadeView })));
const BudgetVarianceView = lazy(() => import("./components/BudgetVarianceView").then((m) => ({ default: m.BudgetVarianceView })));
const CashForecastView = lazy(() => import("./components/CashForecastView").then((m) => ({ default: m.CashForecastView })));
const ECDExportView = lazy(() => import("./components/ECDExportView").then((m) => ({ default: m.ECDExportView })));
const PainelAuditoria = lazy(() => import("./ui/PainelAuditoria").then((m) => ({ default: m.PainelAuditoria })));
const TriagemImportacao = lazy(() => import("./ui/TriagemImportacao").then((m) => ({ default: m.TriagemImportacao })));
const FechamentoPeriodo = lazy(() => import("./ui/FechamentoPeriodo").then((m) => ({ default: m.FechamentoPeriodo })));
const Conciliacao = lazy(() => import("./ui/Conciliacao").then((m) => ({ default: m.Conciliacao })));
const PainelConferencia = lazy(() => import("./components/painel-conferencia/PainelConferencia"));

type Aba =
  | "dashboard" | "pendencias" | "importar" | "imoveis" | "cadastros" | "documentos" | "transacoes" | "contratos" | "caucao"
  | "financiamentos" | "patrimonio" | "auditoria" | "laudo" | "renda" | "razao" | "reajustes" | "indices" | "sincronizacao"
  | "relatorios" | "analytics" | "integridade" | "budget" | "forecast" | "ecd" | "conferencia" | "trilha" | "triagem" | "fechamento" | "conciliacao";

const ABAS: { id: Aba; rotulo: string; icone: typeof LayoutDashboard }[] = [
  { id: "dashboard", rotulo: "Painel", icone: LayoutDashboard },
  { id: "pendencias", rotulo: "Pendências", icone: ListTodo },
  { id: "imoveis", rotulo: "Imóveis", icone: Building2 },
  { id: "cadastros", rotulo: "Cadastros", icone: ClipboardList },
  { id: "importar", rotulo: "Importar documentos", icone: UploadCloud },
  { id: "triagem", rotulo: "Triagem de importação", icone: ListChecks },
  { id: "documentos", rotulo: "Documentos e classificação", icone: FolderSearch },
  { id: "transacoes", rotulo: "Transações", icone: ListChecks },
  { id: "contratos", rotulo: "Contratos e inadimplência", icone: FileSignature },
  { id: "reajustes", rotulo: "Reajustes e rescisão", icone: TrendingUp },
  { id: "caucao", rotulo: "Depósitos caução", icone: Landmark },
  { id: "financiamentos", rotulo: "Financiamentos", icone: Banknote },
  { id: "patrimonio", rotulo: "Patrimônio e alavancagem", icone: Scale },
  { id: "relatorios", rotulo: "Relatórios integrados", icone: FileText },
  { id: "analytics", rotulo: "Analytics integrados", icone: TrendingUp },
  { id: "integridade", rotulo: "Sincronização e integridade", icone: ShieldAlert },
  { id: "budget", rotulo: "Budget vs Realizado", icone: Banknote },
  { id: "forecast", rotulo: "Projeção de Caixa (12m)", icone: LineChart },
  { id: "ecd", rotulo: "Exportação ECD (Fiscal)", icone: Download },
  { id: "indices", rotulo: "Índices econômicos", icone: LineChart },
  { id: "renda", rotulo: "Renda tributável", icone: Receipt },
  { id: "conciliacao", rotulo: "Conciliação bancária", icone: Scale },
  { id: "razao", rotulo: "Livro razão", icone: BookOpenCheck },
  { id: "fechamento", rotulo: "Fechamento de período", icone: BookOpenCheck },
  { id: "conferencia", rotulo: "Conferência de apontamentos", icone: ClipboardList },
  { id: "auditoria", rotulo: "Auditoria forense", icone: ShieldAlert },
  { id: "trilha", rotulo: "Trilha de auditoria e backup", icone: ShieldAlert },
  { id: "laudo", rotulo: "Laudo pericial", icone: FileText },
  { id: "sincronizacao", rotulo: "Sincronização", icone: RefreshCw },
];

function Conteudo() {
  const { db, versao, carregando, persistir, reiniciar } = useDb();
  const { avisar } = useToast();

  // A importação confirma o resultado depois de recarregar a página; este é o outro
  // lado dessa entrega. Consome a mensagem numa leitura só, senão ela reapareceria
  // a cada recarga seguinte.
  useEffect(() => {
    let pendente: string | null = null;
    try {
      pendente = sessionStorage.getItem(CHAVE_AVISO_POS_RELOAD);
      if (pendente !== null) sessionStorage.removeItem(CHAVE_AVISO_POS_RELOAD);
    } catch {
      /* storage indisponível — nada a exibir */
    }
    if (pendente !== null) avisar("good", pendente);
  }, [avisar]);

  const [aba, setAba] = useState<Aba>("dashboard");
  // Drill-down do Painel (clique numa barra da cascata do DRE ou numa célula do mapa de calor):
  // guarda o filtro e troca de aba pra Transações, que consome esse valor uma única vez ao
  // montar. Qualquer navegação que NÃO seja um drill-down explícito passa por navegarParaAba,
  // que limpa esse filtro antes de trocar de aba — sem isso, o filtro do último clique em "Ver"
  // ficava aplicado silenciosamente mesmo quando o usuário só clica em "Transações" na barra de
  // navegação, mostrando uma lista incompleta sem nenhuma ação que explique o motivo.
  const [filtroTransacoesDrillDown, setFiltroTransacoesDrillDown] = useState<FiltroTransacoesInicial | null>(null);
  const aoDrillDownTransacoes = useCallback((filtro: FiltroTransacoesInicial) => {
    setFiltroTransacoesDrillDown(filtro);
    setAba("transacoes");
  }, []);
  const navegarParaAba = useCallback((destino: Aba) => {
    setFiltroTransacoesDrillDown(null);
    setAba(destino);
  }, []);
  const [mensagemSeed, setMensagemSeed] = useState<string | null>(null);
  const [ultimoRegistroBackup, setUltimoRegistroBackup] = useState<RegistroBackup | null>(null);
  const [hashCopiado, setHashCopiado] = useState(false);
  const [backupTick, setBackupTick] = useState(0);
  const [onboardingTick, setOnboardingTick] = useState(0);
  const inputImportarRef = useRef<HTMLInputElement>(null);
  const temporizadorHash = useRef<ReturnType<typeof setTimeout> | null>(null);

  const limparTemporizadorHash = useCallback(() => {
    if (temporizadorHash.current === null) return;
    clearTimeout(temporizadorHash.current);
    temporizadorHash.current = null;
  }, []);

  /** Volta o rótulo do botão para "copiar hash" depois de 2s. Sem isso o botão ficava
   *  em "copiado" para sempre, e uma segunda cópia — para um segundo documento, por
   *  exemplo — não dava sinal nenhum de ter funcionado. */
  const marcarHashCopiado = useCallback(() => {
    limparTemporizadorHash(); // senão o timer do clique anterior derrubaria este cedo
    setHashCopiado(true);
    temporizadorHash.current = setTimeout(() => {
      temporizadorHash.current = null;
      setHashCopiado(false);
    }, 2000);
  }, [limparTemporizadorHash]);

  /** Desfaz a marca de imediato, cancelando um retorno já agendado. */
  const desmarcarHashCopiado = useCallback(() => {
    limparTemporizadorHash();
    setHashCopiado(false);
  }, [limparTemporizadorHash]);

  useEffect(() => limparTemporizadorHash, [limparTemporizadorHash]);

  // Recalculado a cada persistência real (versao muda) e a cada backup exportado
  // (backupTick muda) — os dois únicos eventos que afetam o status.
  const statusBackup = useMemo(() => calcularStatusBackup(), [versao, backupTick]);

  // Titular da contabilidade. Enquanto não existir, o razão não tem onde pendurar nada
  // (entidade_id NOT NULL em periodos_contabeis, contas_plano_contas e ledger_entries) e
  // o app mostra o onboarding no lugar da aplicação. `versao` muda a cada persistência,
  // o que inclui a criação da própria entidade — daí ser dependência.
  const entidade = useMemo(() => (db ? obterEntidadeAtiva(db) : null), [db, versao, onboardingTick]);

  const hoje = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const pendenciasCriticas = useMemo(
    () => (db ? gerarPainelPendencias(db, hoje).filter((p) => p.severidade === "critica").length : 0),
    [db, versao, hoje, backupTick],
  );

  const carregarDemonstracao = useCallback(async () => {
    if (!db) return;
    try {
      limparBanco(db);
      const resultado = gerarDadosSimulados(db);

      // Sem isto a demonstração povoa `transacoes` e o razão continua vazio — era
      // exatamente o descompasso da auditoria: Painel com quase R$ 1,9 milhão e
      // Relatórios Integrados com R$ 0,00 sobre os mesmos dados.
      const migracao = entidade ? sincronizarRazao(db, entidade.id) : null;

      await persistir();
      // A contagem continua no aviso fixo, e não num toast: é detalhe que a pessoa
      // volta a consultar enquanto confere a demonstração, e sumiria em 4 segundos.
      setMensagemSeed(
        `Dados simulados carregados: ${resultado.imoveis} imóveis, ${resultado.contratos} contratos, ${resultado.transacoes} transações, ${resultado.caucoes} cauções.` +
          (migracao ? ` ${resumirMigracao(migracao)}` : ""),
      );
    } catch (erro) {
      // limparBanco já rodou: falhar aqui deixa o banco vazio ou pela metade, e sem
      // aviso a pessoa só descobre ao ver o painel zerado.
      setMensagemSeed(null);
      avisar("critical", `Falha ao carregar a demonstração: ${erro instanceof Error ? erro.message : "erro desconhecido"}. Os dados anteriores foram apagados — importe um backup para recuperá-los.`);
    }
  }, [db, persistir, avisar, entidade]);

  const exportarBanco = useCallback(async () => {
    if (!db) return;
    let nomeArquivo = "";
    let baixou = false;
    try {
      const blob = exportarArquivo(db);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      nomeArquivo = `contabilidade-${new Date().toISOString().slice(0, 10)}.sqlite`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeArquivo;
      a.click();
      URL.revokeObjectURL(url);
      baixou = true;

      const registro = await registrarBackup(bytes, nomeArquivo);
      setUltimoRegistroBackup(registro);
      // Cancela também um retorno de rótulo agendado: o hash é outro, e a marca de
      // "copiado" do backup anterior não vale para ele.
      desmarcarHashCopiado();
      setBackupTick((t) => t + 1);
      avisar("good", `Backup exportado: ${nomeArquivo}`);
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : "erro desconhecido";
      // O download acontece antes de registrarBackup. Se só o registro falhou, o
      // arquivo baixado é válido — dizer "falha ao exportar" aqui faria a pessoa
      // descartar um backup bom. O que se perde é a marcação de "backup em dia".
      if (baixou) avisar("warning", `${nomeArquivo} foi baixado e é válido, mas não foi possível registrá-lo (${motivo}) — guarde o arquivo; o aviso de backup continuará marcando pendência.`);
      else avisar("critical", `Falha ao exportar o backup: ${motivo}. Nenhum arquivo foi gerado.`);
    }
  }, [db, avisar, desmarcarHashCopiado]);

  const copiarHash = useCallback(async () => {
    if (!ultimoRegistroBackup) return;
    try {
      await navigator.clipboard.writeText(ultimoRegistroBackup.hashSha256);
      // O sucesso não vira toast: o próprio botão passa a "copiado", que é retorno no
      // lugar exato para onde a pessoa está olhando. Um toast aqui seria redundante.
      marcarHashCopiado();
    } catch {
      // O hash continua na tela para cópia manual, mas o silêncio era o problema: quem
      // clica e desvia o olhar assume que copiou, cola outra coisa no laudo e só
      // descobre quando a prova de integridade não bate.
      desmarcarHashCopiado();
      avisar("warning", "Não foi possível copiar pela área de transferência (o navegador pode ter bloqueado o acesso). Selecione o hash na tela e copie manualmente antes de guardar o backup.");
    }
  }, [ultimoRegistroBackup, avisar, marcarHashCopiado, desmarcarHashCopiado]);

  const importarBanco = useCallback(
    async (arquivo: File) => {
      if (!confirm("Isso substitui todos os dados salvos neste navegador pelo conteúdo do arquivo importado — irreversível. Continuar?")) return;
      try {
        const bytes = new Uint8Array(await arquivo.arrayBuffer());
        await importarArquivo(bytes);
        // O sucesso só se manifesta como um reload, que é indistinguível de nada ter
        // acontecido. A confirmação atravessa o reload por sessionStorage e é exibida
        // do outro lado; se o armazenamento falhar, perde-se o aviso, não a importação.
        try {
          sessionStorage.setItem(CHAVE_AVISO_POS_RELOAD, `Backup "${arquivo.name}" importado. Os dados anteriores foram substituídos.`);
        } catch {
          /* aba anônima ou storage bloqueado — segue sem a confirmação */
        }
        window.location.reload();
      } catch (erro) {
        // Trocado por toast em vez de alert(): a importação falhou, então os dados
        // atuais seguem intactos e não há por que travar a tela. Toast crítico não
        // some sozinho, então o motivo fica até ser lido.
        avisar("critical", erro instanceof Error ? erro.message : "Falha ao importar o arquivo — verifique se é um backup .sqlite válido deste sistema.");
      }
    },
    [avisar],
  );

  if (carregando || !db) {
    return (
      <div className="app-shell" style={{ padding: 28, maxWidth: 1180, width: "100%", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <BookOpen size={22} color="var(--accent)" />
          <p style={{ color: "var(--ink-soft)", margin: 0 }}>Carregando banco de dados local…</p>
        </div>
        <div className="kpi-grid">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 74 }} />)}
        </div>
        <div className="grid-2" style={{ marginTop: 20 }}>
          <div className="skeleton" style={{ height: 280 }} />
          <div className="skeleton" style={{ height: 280 }} />
        </div>
      </div>
    );
  }

  // Nenhuma entidade legal cadastrada: o núcleo contábil inteiro depende dela, então a
  // pergunta vem antes da aplicação em vez de o app abrir com metade das telas zerada
  // sem explicação. `persistir()` dentro do onboarding faz `versao` mudar, o que
  // recalcula `entidade` e derruba este bloco sozinho — aoConcluir só força o caso em
  // que a persistência não moveu a versão.
  if (db && !entidade) {
    return <OnboardingEntidade aoConcluir={() => setOnboardingTick((t) => t + 1)} />;
  }

  return (
    <div className="app-shell">
      <div className="app-sticky-top">
        <header className="app-header">
          <div className="brand">
            <BookOpen size={22} color="var(--accent)" />
            <div>
              <h1>CRMT Histórico Contábil & Financeiro</h1>
              <small>Reconstituição contábil · locação de imóveis · pessoa física — todos os dados ficam neste navegador</small>
            </div>
          </div>
          <div className="toolbar-actions">
            <button className="btn" onClick={carregarDemonstracao}>
              <RotateCcw size={14} /> Carregar dados de demonstração
            </button>
            <button className="btn" onClick={exportarBanco}>
              <Download size={14} /> Exportar backup
            </button>
            {statusBackup.ultimoBackupEm === null ? (
              <span className="pill warning" title="Nenhum backup exportado ainda nesta instalação">nunca fez backup</span>
            ) : statusBackup.existeAlteracaoNaoBackupeada ? (
              <span
                className={`pill ${statusBackup.diasDesdeUltimoBackup !== null && statusBackup.diasDesdeUltimoBackup > 7 ? "critical" : "warning"}`}
                title="Há alterações feitas depois do último backup exportado"
              >
                backup desatualizado{statusBackup.diasDesdeUltimoBackup !== null && statusBackup.diasDesdeUltimoBackup > 0 ? ` (${statusBackup.diasDesdeUltimoBackup}d)` : ""}
              </span>
            ) : (
              <span className="pill good" title="Todas as alterações já estão refletidas no último backup exportado">backup em dia</span>
            )}
            <button className="btn" onClick={() => inputImportarRef.current?.click()}>
              <UploadIcon size={14} /> Importar backup
            </button>
            <input
              ref={inputImportarRef}
              type="file"
              accept=".sqlite,.db"
              style={{ display: "none" }}
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo) importarBanco(arquivo);
              }}
            />
            <button
              className="btn danger"
              onClick={() => {
                if (confirm("Isso apaga todos os dados salvos neste navegador. Continuar?")) reiniciar();
              }}
            >
              Limpar tudo
            </button>
            <SeletorDensidade />
            <SeletorTema />
          </div>
        </header>

        <nav className="app-nav">
          {ABAS.map(({ id, rotulo, icone: Icone }) => (
            <button key={id} aria-current={aba === id ? "page" : undefined} onClick={() => navegarParaAba(id)}>
              <Icone size={15} /> {rotulo}
              {id === "pendencias" && pendenciasCriticas > 0 && (
                <span className="pill critical" style={{ marginLeft: 6, padding: "1px 6px" }}>{pendenciasCriticas}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <main className="app-main">
        {ultimoRegistroBackup && (
          <div className="aviso-caixa" style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 20 }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 4 }}>
                Backup exportado: <strong>{ultimoRegistroBackup.arquivo}</strong> ({(ultimoRegistroBackup.tamanhoBytes / 1024).toFixed(0)} KB). Guarde o hash
                SHA-256 abaixo — é a prova de que o arquivo apresentado depois (num laudo, numa petição) é exatamente
                este, sem alteração posterior.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <code style={{ fontSize: 12, wordBreak: "break-all" }}>{ultimoRegistroBackup.hashSha256}</code>
                <button className="btn" style={{ padding: "3px 8px", fontSize: 12 }} onClick={copiarHash}>
                  {hashCopiado ? <><Check size={12} /> copiado</> : <><Copy size={12} /> copiar hash</>}
                </button>
              </div>
            </div>
          </div>
        )}
        {mensagemSeed && (
          <div className="aviso-caixa" style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "var(--accent)", marginBottom: 20 }}>
            {mensagemSeed}
          </div>
        )}
        <div className="tab-content" key={aba}>
          <Suspense fallback={<div className="skeleton" style={{ height: 280 }} />}>
            {aba === "dashboard" && <Dashboard aoDrillDown={aoDrillDownTransacoes} />}
            {aba === "pendencias" && <PendenciasView aoNavegar={(destino) => navegarParaAba(destino as Aba)} />}
            {aba === "imoveis" && <ImoveisView />}
            {aba === "cadastros" && <CadastrosView />}
            {aba === "importar" && <ImportarView />}
            {aba === "triagem" && <TriagemImportacao />}
            {aba === "documentos" && <DocumentosView />}
            {aba === "transacoes" && <TransacoesView filtroInicial={filtroTransacoesDrillDown} />}
            {aba === "contratos" && <ContratosInadimplenciaView />}
            {aba === "reajustes" && <ReajustesRescisaoView />}
            {aba === "caucao" && <CaucaoView />}
            {aba === "financiamentos" && <FinanciamentosView aoDrillDown={aoDrillDownTransacoes} />}
            {aba === "patrimonio" && <PatrimonioView />}
            {aba === "relatorios" && <RelatoriosIntegradosView />}
            {aba === "analytics" && <AnalyticsIntegradosView />}
            {aba === "integridade" && <SincronizacaoIntegridadeView />}
            {aba === "budget" && <BudgetVarianceView />}
            {aba === "forecast" && <CashForecastView />}
            {aba === "ecd" && <ECDExportView />}
            {aba === "indices" && <IndicesEconomicosView />}
            {aba === "renda" && <RendaTributavelView />}
            {aba === "conciliacao" && <Conciliacao />}
            {aba === "razao" && <LivroRazaoView />}
            {aba === "fechamento" && <FechamentoPeriodo />}
            {aba === "conferencia" && <PainelConferencia />}
            {aba === "auditoria" && <AuditoriaView aoDrillDown={aoDrillDownTransacoes} />}
            {aba === "trilha" && <PainelAuditoria />}
            {aba === "laudo" && <LaudoView />}
            {aba === "sincronizacao" && <SincronizacaoView />}
          </Suspense>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <DbProvider>
        <Conteudo />
      </DbProvider>
    </ToastProvider>
  );
}

export default App;
