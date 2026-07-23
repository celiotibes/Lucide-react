import { lazy, Suspense, useCallback, useMemo, useRef, useState } from "react";
import { BookOpen, LayoutDashboard, UploadCloud, ListChecks, FileSignature, Landmark, Banknote, ShieldAlert, FileText, Receipt, BookOpenCheck, TrendingUp, LineChart, Building2, FolderSearch, ClipboardList, Scale, Download, Upload as UploadIcon, RotateCcw, AlertTriangle, Copy, Check, ListTodo } from "lucide-react";
import "./App.css";
import { DbProvider, useDb } from "./db/DbContext";
import { exportarArquivo, importarArquivo } from "./db/connection";
import { gerarDadosSimulados, limparBanco } from "./domain/seed/dadosSimulados";
import { registrarBackup, calcularStatusBackup, type RegistroBackup } from "./domain/backupIntegridade";
import { gerarPainelPendencias } from "./domain/auditoria/painelPendencias";
import { Dashboard } from "./components/Dashboard";
import type { FiltroTransacoesInicial } from "./components/TransacoesView";

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

type Aba =
  | "dashboard" | "pendencias" | "importar" | "imoveis" | "cadastros" | "documentos" | "transacoes" | "contratos" | "caucao"
  | "financiamentos" | "patrimonio" | "auditoria" | "laudo" | "renda" | "razao" | "reajustes" | "indices";

const ABAS: { id: Aba; rotulo: string; icone: typeof LayoutDashboard }[] = [
  { id: "dashboard", rotulo: "Painel", icone: LayoutDashboard },
  { id: "pendencias", rotulo: "Pendências", icone: ListTodo },
  { id: "imoveis", rotulo: "Imóveis", icone: Building2 },
  { id: "cadastros", rotulo: "Cadastros", icone: ClipboardList },
  { id: "importar", rotulo: "Importar documentos", icone: UploadCloud },
  { id: "documentos", rotulo: "Documentos e classificação", icone: FolderSearch },
  { id: "transacoes", rotulo: "Transações", icone: ListChecks },
  { id: "contratos", rotulo: "Contratos e inadimplência", icone: FileSignature },
  { id: "reajustes", rotulo: "Reajustes e rescisão", icone: TrendingUp },
  { id: "caucao", rotulo: "Depósitos caução", icone: Landmark },
  { id: "financiamentos", rotulo: "Financiamentos", icone: Banknote },
  { id: "patrimonio", rotulo: "Patrimônio e alavancagem", icone: Scale },
  { id: "indices", rotulo: "Índices econômicos", icone: LineChart },
  { id: "renda", rotulo: "Renda tributável", icone: Receipt },
  { id: "razao", rotulo: "Livro razão", icone: BookOpenCheck },
  { id: "auditoria", rotulo: "Auditoria forense", icone: ShieldAlert },
  { id: "laudo", rotulo: "Laudo pericial", icone: FileText },
];

function Conteudo() {
  const { db, versao, carregando, persistir, reiniciar } = useDb();
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
  const inputImportarRef = useRef<HTMLInputElement>(null);

  // Recalculado a cada persistência real (versao muda) e a cada backup exportado
  // (backupTick muda) — os dois únicos eventos que afetam o status.
  const statusBackup = useMemo(() => calcularStatusBackup(), [versao, backupTick]);

  const hoje = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const pendenciasCriticas = useMemo(
    () => (db ? gerarPainelPendencias(db, hoje).filter((p) => p.severidade === "critica").length : 0),
    [db, versao, hoje, backupTick],
  );

  const carregarDemonstracao = useCallback(async () => {
    if (!db) return;
    limparBanco(db);
    const resultado = gerarDadosSimulados(db);
    await persistir();
    setMensagemSeed(
      `Dados simulados carregados: ${resultado.imoveis} imóveis, ${resultado.contratos} contratos, ${resultado.transacoes} transações, ${resultado.caucoes} cauções.`,
    );
  }, [db, persistir]);

  const exportarBanco = useCallback(async () => {
    if (!db) return;
    const blob = exportarArquivo(db);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const nomeArquivo = `contabilidade-${new Date().toISOString().slice(0, 10)}.sqlite`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    a.click();
    URL.revokeObjectURL(url);

    const registro = await registrarBackup(bytes, nomeArquivo);
    setUltimoRegistroBackup(registro);
    setHashCopiado(false);
    setBackupTick((t) => t + 1);
  }, [db]);

  const copiarHash = useCallback(async () => {
    if (!ultimoRegistroBackup) return;
    try {
      await navigator.clipboard.writeText(ultimoRegistroBackup.hashSha256);
      setHashCopiado(true);
    } catch {
      // clipboard indisponível (permissão negada, contexto não seguro) — o hash continua
      // visível na tela para cópia manual, só o botão de atalho não funciona.
    }
  }, [ultimoRegistroBackup]);

  const importarBanco = useCallback(
    async (arquivo: File) => {
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      await importarArquivo(bytes);
      window.location.reload();
    },
    [],
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
            {aba === "documentos" && <DocumentosView />}
            {aba === "transacoes" && <TransacoesView filtroInicial={filtroTransacoesDrillDown} />}
            {aba === "contratos" && <ContratosInadimplenciaView />}
            {aba === "reajustes" && <ReajustesRescisaoView />}
            {aba === "caucao" && <CaucaoView />}
            {aba === "financiamentos" && <FinanciamentosView aoDrillDown={aoDrillDownTransacoes} />}
            {aba === "patrimonio" && <PatrimonioView />}
            {aba === "indices" && <IndicesEconomicosView />}
            {aba === "renda" && <RendaTributavelView />}
            {aba === "razao" && <LivroRazaoView />}
            {aba === "auditoria" && <AuditoriaView aoDrillDown={aoDrillDownTransacoes} />}
            {aba === "laudo" && <LaudoView />}
          </Suspense>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <DbProvider>
      <Conteudo />
    </DbProvider>
  );
}

export default App;
