import { useCallback, useRef, useState } from "react";
import { BookOpen, LayoutDashboard, UploadCloud, ListChecks, FileSignature, Landmark, Banknote, ShieldAlert, FileText, Receipt, BookOpenCheck, Download, Upload as UploadIcon, RotateCcw } from "lucide-react";
import "./App.css";
import { DbProvider, useDb } from "./db/DbContext";
import { exportarArquivo, importarArquivo } from "./db/connection";
import { gerarDadosSimulados, limparBanco } from "./domain/seed/dadosSimulados";
import { Dashboard } from "./components/Dashboard";
import { ImportarView } from "./components/ImportarView";
import { TransacoesView } from "./components/TransacoesView";
import { ContratosInadimplenciaView } from "./components/ContratosInadimplenciaView";
import { CaucaoView } from "./components/CaucaoView";
import { FinanciamentosView } from "./components/FinanciamentosView";
import { AuditoriaView } from "./components/AuditoriaView";
import { LaudoView } from "./components/LaudoView";
import { RendaTributavelView } from "./components/RendaTributavelView";
import { LivroRazaoView } from "./components/LivroRazaoView";

type Aba =
  | "dashboard" | "importar" | "transacoes" | "contratos" | "caucao"
  | "financiamentos" | "auditoria" | "laudo" | "renda" | "razao";

const ABAS: { id: Aba; rotulo: string; icone: typeof LayoutDashboard }[] = [
  { id: "dashboard", rotulo: "Painel", icone: LayoutDashboard },
  { id: "importar", rotulo: "Importar documentos", icone: UploadCloud },
  { id: "transacoes", rotulo: "Transações", icone: ListChecks },
  { id: "contratos", rotulo: "Contratos e inadimplência", icone: FileSignature },
  { id: "caucao", rotulo: "Depósitos caução", icone: Landmark },
  { id: "financiamentos", rotulo: "Financiamentos", icone: Banknote },
  { id: "renda", rotulo: "Renda tributável", icone: Receipt },
  { id: "razao", rotulo: "Livro razão", icone: BookOpenCheck },
  { id: "auditoria", rotulo: "Auditoria forense", icone: ShieldAlert },
  { id: "laudo", rotulo: "Laudo pericial", icone: FileText },
];

function Conteudo() {
  const { db, carregando, persistir, reiniciar } = useDb();
  const [aba, setAba] = useState<Aba>("dashboard");
  const [mensagemSeed, setMensagemSeed] = useState<string | null>(null);
  const inputImportarRef = useRef<HTMLInputElement>(null);

  const carregarDemonstracao = useCallback(async () => {
    if (!db) return;
    limparBanco(db);
    const resultado = gerarDadosSimulados(db);
    await persistir();
    setMensagemSeed(
      `Dados simulados carregados: ${resultado.imoveis} imóveis, ${resultado.contratos} contratos, ${resultado.transacoes} transações, ${resultado.caucoes} cauções.`,
    );
  }, [db, persistir]);

  const exportarBanco = useCallback(() => {
    if (!db) return;
    const blob = exportarArquivo(db);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contabilidade-${new Date().toISOString().slice(0, 10)}.sqlite`;
    a.click();
    URL.revokeObjectURL(url);
  }, [db]);

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
          </button>
        ))}
      </nav>

      <main className="app-main">
        {mensagemSeed && (
          <div className="aviso-caixa" style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "var(--accent)", marginBottom: 20 }}>
            {mensagemSeed}
          </div>
        )}
        {aba === "dashboard" && <Dashboard />}
        {aba === "importar" && <ImportarView />}
        {aba === "transacoes" && <TransacoesView />}
        {aba === "contratos" && <ContratosInadimplenciaView />}
        {aba === "caucao" && <CaucaoView />}
        {aba === "financiamentos" && <FinanciamentosView />}
        {aba === "renda" && <RendaTributavelView />}
        {aba === "razao" && <LivroRazaoView />}
        {aba === "auditoria" && <AuditoriaView />}
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
