import { useCallback, useMemo, useRef, useState } from "react";
import { BookOpen, LayoutDashboard, UploadCloud, ListChecks, FileSignature, Landmark, Banknote, ShieldAlert, FileText, Receipt, BookOpenCheck, TrendingUp, LineChart, Building2, FolderSearch, ClipboardList, Scale, Download, Upload as UploadIcon, RotateCcw, AlertTriangle, Copy, Check, ListTodo } from "lucide-react";
import "./App.css";
import { DbProvider, useDb } from "./db/DbContext";
import { exportarArquivo, importarArquivo } from "./db/connection";
import { gerarDadosSimulados, limparBanco } from "./domain/seed/dadosSimulados";
import { registrarBackup, calcularStatusBackup, type RegistroBackup } from "./domain/backupIntegridade";
import { gerarPainelPendencias } from "./domain/auditoria/painelPendencias";
import { Dashboard } from "./components/Dashboard";
import { PendenciasView } from "./components/PendenciasView";
import { ImportarView } from "./components/ImportarView";
import { TransacoesView, type FiltroTransacoesInicial } from "./components/TransacoesView";
import { ContratosInadimplenciaView } from "./components/ContratosInadimplenciaView";
import { CaucaoView } from "./components/CaucaoView";
import { FinanciamentosView } from "./components/FinanciamentosView";
import { AuditoriaView } from "./components/AuditoriaView";
import { LaudoView } from "./components/LaudoView";
import { RendaTributavelView } from "./components/RendaTributavelView";
import { LivroRazaoView } from "./components/LivroRazaoView";
import { ReajustesRescisaoView } from "./components/ReajustesRescisaoView";
import { IndicesEconomicosView } from "./components/IndicesEconomicosView";
import { ImoveisView } from "./components/ImoveisView";
import { DocumentosView } from "./components/DocumentosView";
import { CadastrosView } from "./components/CadastrosView";
import { PatrimonioView } from "./components/PatrimonioView";

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
  // montar. Não é reaproveitado entre navegações — cada clique novo sobrescreve o anterior.
  const [filtroTransacoesDrillDown, setFiltroTransacoesDrillDown] = useState<FiltroTransacoesInicial | null>(null);
  const aoDrillDownTransacoes = useCallback((filtro: FiltroTransacoesInicial) => {
    setFiltroTransacoesDrillDown(filtro);
    setAba("transacoes");
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
      <div className="app-shell" style={{ alignItems: "center", justifyContent: "center" }}>
        <p>Carregando banco de dados local…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <BookOpen size={22} color="var(--accent)" />
          <div>
            <h1>Reconstituição contábil</h1>
            <small>Locação de imóveis · pessoa física — todos os dados ficam neste navegador</small>
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
          <button key={id} aria-current={aba === id ? "page" : undefined} onClick={() => setAba(id)}>
            <Icone size={15} /> {rotulo}
            {id === "pendencias" && pendenciasCriticas > 0 && (
              <span className="pill critical" style={{ marginLeft: 6, padding: "1px 6px" }}>{pendenciasCriticas}</span>
            )}
          </button>
        ))}
      </nav>

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
        {aba === "dashboard" && <Dashboard aoDrillDown={aoDrillDownTransacoes} />}
        {aba === "pendencias" && <PendenciasView aoNavegar={(destino) => setAba(destino as Aba)} />}
        {aba === "imoveis" && <ImoveisView />}
        {aba === "cadastros" && <CadastrosView />}
        {aba === "importar" && <ImportarView />}
        {aba === "documentos" && <DocumentosView />}
        {aba === "transacoes" && <TransacoesView filtroInicial={filtroTransacoesDrillDown} />}
        {aba === "contratos" && <ContratosInadimplenciaView />}
        {aba === "reajustes" && <ReajustesRescisaoView />}
        {aba === "caucao" && <CaucaoView />}
        {aba === "financiamentos" && <FinanciamentosView />}
        {aba === "patrimonio" && <PatrimonioView />}
        {aba === "indices" && <IndicesEconomicosView />}
        {aba === "renda" && <RendaTributavelView />}
        {aba === "razao" && <LivroRazaoView />}
        {aba === "auditoria" && <AuditoriaView aoDrillDown={aoDrillDownTransacoes} />}
        {aba === "laudo" && <LaudoView />}
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
