import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger, Button } from "./ui";
import {
  Apontamento,
  FechamentoSemanal,
  Movimentacao,
  ReajusteIPCA,
  FiltrosApontamentos,
  FiltrosFechamentos,
  FiltrosMovimentacoes,
} from "../../domain/apontamentos";
import ApontamentosPendentes from "./tabs/ApontamentosPendentes";
import FechamentosSemamanais from "./tabs/FechamentosSemamanais";
import MovimentacoesFinanceiras from "./tabs/MovimentacoesFinanceiras";
import ReajusteIPCATab from "./tabs/ReajusteIPCATab";
import { AlertCircle, FileText, TrendingUp, DollarSign, RotateCcw } from "lucide-react";
import { useDb } from "../../db/useDb";
import { existemPrestadoresCadastrados, listarApontamentos, listarFechamentos, listarMovimentacoes, obterReajusteIPCA } from "./data/painelConferenciaRepo";
import { gerarDadosDemonstracaoPainelConferencia } from "./data/seedDemoPainelConferencia";

interface PainelConferenciaProps {
  usuarioId?: string;
  usuarioNome?: string;
}

/** Achado de auditoria corrigido aqui: este componente buscava 4 rotas `/api/...` que nunca
 * existiram (server/ só tem Pluggy + health). Todo o banco contábil vive no navegador
 * (sql.js + IndexedDB) — não há nada para o servidor servir. Os dados agora vêm direto do
 * banco local via `useDb()` + as consultas de `./data/painelConferenciaRepo.ts` (que usa
 * `consultar`/`executar` de src/db/connection.ts, o mesmo padrão do resto do app). */
const PainelConferencia: React.FC<PainelConferenciaProps> = ({ usuarioId = "gestor-1", usuarioNome = "Gestor" }) => {
  const { db, carregando: carregandoBanco, persistir } = useDb();

  const [apontamentos, setApontamentos] = useState<Apontamento[]>([]);
  const [fechamentos, setFechamentos] = useState<FechamentoSemanal[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [reajusteIPCA, setReajusteIPCA] = useState<ReajusteIPCA | null>(null);

  const [carregandoDados, setCarregandoDados] = useState(false);
  const [carregandoDemo, setCarregandoDemo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [temPrestadores, setTemPrestadores] = useState<boolean | null>(null);

  const [filtrosApontamentos, setFiltrosApontamentos] = useState<FiltrosApontamentos>({});
  const [filtrosFechamentos, setFiltrosFechamentos] = useState<FiltrosFechamentos>({});
  const [filtrosMovimentacoes, setFiltrosMovimentacoes] = useState<FiltrosMovimentacoes>({});

  const [notificacoes, setNotificacoes] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>("apontamentos");

  const apontamentosPendentes = apontamentos.filter((a) => a.status === "enviado" || a.requer_analise).length;
  const fechamentosPendentes = fechamentos.filter((f) => f.status === "enviado").length;
  const movimentacoesPendentes = movimentacoes.filter((m) => m.status === "solicitado").length;

  const carregarTudo = () => {
    if (!db) return;
    setCarregandoDados(true);
    setErro(null);
    try {
      setTemPrestadores(existemPrestadoresCadastrados(db));
      setApontamentos(listarApontamentos(db, filtrosApontamentos));
      setFechamentos(listarFechamentos(db, filtrosFechamentos));
      setMovimentacoes(listarMovimentacoes(db, filtrosMovimentacoes));

      const reajuste = obterReajusteIPCA(db);
      setReajusteIPCA(reajuste);

      if (reajuste?.data_vigencia_esperada && reajuste.status !== "aprovado" && reajuste.status !== "rejeitado") {
        const dataVigencia = new Date(reajuste.data_vigencia_esperada);
        const agora = new Date();
        const diasAte = Math.ceil((dataVigencia.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24));
        const mensagem = `Proposta de Reajuste IPCA disponível em ${diasAte} dias`;
        if (diasAte <= 15 && diasAte > 0) {
          setNotificacoes((prev) => (prev.includes(mensagem) ? prev : [...prev, mensagem]));
        }
      }
    } catch (erroCapturado) {
      console.error("Erro ao carregar dados do Painel de Conferência:", erroCapturado);
      setErro(erroCapturado instanceof Error ? erroCapturado.message : "Erro ao carregar dados do banco local.");
    } finally {
      setCarregandoDados(false);
    }
  };

  useEffect(() => {
    carregarTudo();
    // carregarTudo é recriada a cada render (depende de filtros em closure); disparar pelos
    // próprios filtros/db evita loop infinito e ainda recarrega quando algum deles muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, filtrosApontamentos, filtrosFechamentos, filtrosMovimentacoes]);

  const handleCarregarDemo = async () => {
    if (!db) return;
    setCarregandoDemo(true);
    setErro(null);
    try {
      gerarDadosDemonstracaoPainelConferencia(db);
      await persistir();
      carregarTudo();
    } catch (erroCapturado) {
      console.error("Erro ao carregar dados de demonstração do Painel:", erroCapturado);
      setErro(erroCapturado instanceof Error ? erroCapturado.message : "Erro ao carregar dados de demonstração.");
    } finally {
      setCarregandoDemo(false);
    }
  };

  const carregando = carregandoBanco || carregandoDados;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            Painel de Conferência
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Gestão, aprovação e auditoria de apontamentos • {usuarioNome}
          </p>
        </div>

        {/* Erro de carregamento — nunca falha em silêncio */}
        {erro && (
          <div className="mb-6 flex items-center gap-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            <span className="text-sm text-red-800 dark:text-red-200">{erro}</span>
            <button onClick={() => setErro(null)} className="ml-auto text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">
              ✕
            </button>
          </div>
        )}

        {/* Notificações */}
        {notificacoes.length > 0 && (
          <div className="mb-6 space-y-2">
            {notificacoes.map((notif, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3"
              >
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <span className="text-sm text-amber-800 dark:text-amber-200">{notif}</span>
                <button
                  onClick={() => setNotificacoes((prev) => prev.filter((_, i) => i !== idx))}
                  className="ml-auto text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {carregandoBanco ? (
          <div className="bg-white dark:bg-slate-800 rounded-lg p-12 shadow-sm border border-slate-200 dark:border-slate-700 text-center text-slate-600 dark:text-slate-400">
            Abrindo banco de dados local...
          </div>
        ) : !db ? (
          <div className="bg-white dark:bg-slate-800 rounded-lg p-12 shadow-sm border border-slate-200 dark:border-slate-700 text-center text-slate-600 dark:text-slate-400">
            Não foi possível abrir o banco de dados local.
          </div>
        ) : temPrestadores === false ? (
          <div className="bg-white dark:bg-slate-800 rounded-lg p-12 shadow-sm border border-slate-200 dark:border-slate-700 text-center">
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Nenhum prestador ou apontamento cadastrado ainda. Carregue os dados de demonstração
              deste painel para ver a tela funcionando com dados reais no banco local.
            </p>
            <Button onClick={handleCarregarDemo} disabled={carregandoDemo}>
              <RotateCcw className={`w-4 h-4 ${carregandoDemo ? "animate-spin" : ""}`} />
              {carregandoDemo ? "Carregando..." : "Carregar dados de demonstração do Painel"}
            </Button>
          </div>
        ) : (
          <>
            {/* Counters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Apontamentos Pendentes</p>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white">{apontamentosPendentes}</p>
                  </div>
                  <FileText className="w-8 h-8 text-blue-500" />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Fechamentos Pendentes</p>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white">{fechamentosPendentes}</p>
                  </div>
                  <DollarSign className="w-8 h-8 text-green-500" />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Movimentações Pendentes</p>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white">{movimentacoesPendentes}</p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-orange-500" />
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Status IPCA</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {reajusteIPCA?.status === "proposta_gerada" ? "Proposta" : "Próximo"}
                    </p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-purple-500" />
                </div>
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <TabsTrigger value="apontamentos">Apontamentos</TabsTrigger>
                <TabsTrigger value="fechamentos">Fechamentos</TabsTrigger>
                <TabsTrigger value="movimentacoes">Movimentações</TabsTrigger>
                <TabsTrigger value="reajuste">Reajuste IPCA</TabsTrigger>
              </TabsList>

              <TabsContent value="apontamentos" className="mt-6">
                <ApontamentosPendentes
                  apontamentos={apontamentos}
                  loading={carregando}
                  filtros={filtrosApontamentos}
                  onFiltrosChange={setFiltrosApontamentos}
                  onRefresh={carregarTudo}
                  usuarioId={usuarioId}
                />
              </TabsContent>

              <TabsContent value="fechamentos" className="mt-6">
                <FechamentosSemamanais
                  fechamentos={fechamentos}
                  loading={carregando}
                  filtros={filtrosFechamentos}
                  onFiltrosChange={setFiltrosFechamentos}
                  onRefresh={carregarTudo}
                  usuarioId={usuarioId}
                />
              </TabsContent>

              <TabsContent value="movimentacoes" className="mt-6">
                <MovimentacoesFinanceiras
                  movimentacoes={movimentacoes}
                  loading={carregando}
                  filtros={filtrosMovimentacoes}
                  onFiltrosChange={setFiltrosMovimentacoes}
                  onRefresh={carregarTudo}
                  usuarioId={usuarioId}
                />
              </TabsContent>

              <TabsContent value="reajuste" className="mt-6">
                <ReajusteIPCATab reajusteIPCA={reajusteIPCA} loading={carregando} onRefresh={carregarTudo} usuarioId={usuarioId} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
};

export default PainelConferencia;
