import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Apontamento,
  FechamentoSemanal,
  Movimentacao,
  ReajusteIPCA,
  FiltrosApontamentos,
  FiltrosFechamentos,
  FiltrosMovimentacoes,
} from "@/domain/apontamentos";
import ApontamentosPendentes from "./tabs/ApontamentosPendentes";
import FechamentosSemamanais from "./tabs/FechamentosSemamanais";
import MovimentacoesFinanceiras from "./tabs/MovimentacoesFinanceiras";
import ReajusteIPCATab from "./tabs/ReajusteIPCATab";
import { AlertCircle, FileText, TrendingUp, DollarSign } from "lucide-react";

interface PainelConferenciaProps {
  usuarioId?: string;
  usuarioNome?: string;
}

const PainelConferencia: React.FC<PainelConferenciaProps> = ({ usuarioId = "gestor-1", usuarioNome = "Gestor" }) => {
  const [apontamentos, setApontamentos] = useState<Apontamento[]>([]);
  const [fechamentos, setFechamentos] = useState<FechamentoSemanal[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [reajusteIPCA, setReajusteIPCA] = useState<ReajusteIPCA | null>(null);

  const [loadingApontamentos, setLoadingApontamentos] = useState(false);
  const [loadingFechamentos, setLoadingFechamentos] = useState(false);
  const [loadingMovimentacoes, setLoadingMovimentacoes] = useState(false);
  const [loadingReajuste, setLoadingReajuste] = useState(false);

  const [filtrosApontamentos, setFiltrosApontamentos] = useState<FiltrosApontamentos>({});
  const [filtrosFechamentos, setFiltrosFechamentos] = useState<FiltrosFechamentos>({});
  const [filtrosMovimentacoes, setFiltrosMovimentacoes] = useState<FiltrosMovimentacoes>({});

  const [notificacoes, setNotificacoes] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>("apontamentos");

  // Contadores
  const apontamentosPendentes = apontamentos.filter((a) => a.status === "enviado" || a.requer_analise).length;
  const fechamentosPendentes = fechamentos.filter((f) => f.status === "enviado").length;
  const movimentacoesPendentes = movimentacoes.filter((m) => m.status === "solicitado").length;

  // Busca apontamentos
  const fetchApontamentos = async () => {
    setLoadingApontamentos(true);
    try {
      const params = new URLSearchParams();
      if (filtrosApontamentos.prestador_id) params.append("prestador_id", filtrosApontamentos.prestador_id);
      if (filtrosApontamentos.status) params.append("status", filtrosApontamentos.status);
      if (filtrosApontamentos.data_inicio) params.append("data_inicio", filtrosApontamentos.data_inicio);
      if (filtrosApontamentos.data_fim) params.append("data_fim", filtrosApontamentos.data_fim);
      if (filtrosApontamentos.requer_analise) params.append("requer_analise", "true");

      const response = await fetch(`/api/apontamentos?${params.toString()}`, {
        headers: { "X-API-Key": process.env.REACT_APP_API_KEY || "" },
      });

      if (response.ok) {
        const data = await response.json();
        setApontamentos(data);
      }
    } catch (error) {
      console.error("Erro ao buscar apontamentos:", error);
      setNotificacoes((prev) => [...prev, "Erro ao carregar apontamentos"]);
    } finally {
      setLoadingApontamentos(false);
    }
  };

  // Busca fechamentos semanais
  const fetchFechamentos = async () => {
    setLoadingFechamentos(true);
    try {
      const params = new URLSearchParams();
      if (filtrosFechamentos.prestador_id) params.append("prestador_id", filtrosFechamentos.prestador_id);
      if (filtrosFechamentos.status) params.append("status", filtrosFechamentos.status);
      if (filtrosFechamentos.semana_inicio) params.append("semana_inicio", filtrosFechamentos.semana_inicio);
      if (filtrosFechamentos.semana_fim) params.append("semana_fim", filtrosFechamentos.semana_fim);

      const response = await fetch(`/api/fechamentos-semanais?${params.toString()}`, {
        headers: { "X-API-Key": process.env.REACT_APP_API_KEY || "" },
      });

      if (response.ok) {
        const data = await response.json();
        setFechamentos(data);
      }
    } catch (error) {
      console.error("Erro ao buscar fechamentos:", error);
      setNotificacoes((prev) => [...prev, "Erro ao carregar fechamentos semanais"]);
    } finally {
      setLoadingFechamentos(false);
    }
  };

  // Busca movimentações
  const fetchMovimentacoes = async () => {
    setLoadingMovimentacoes(true);
    try {
      const params = new URLSearchParams();
      if (filtrosMovimentacoes.prestador_id) params.append("prestador_id", filtrosMovimentacoes.prestador_id);
      if (filtrosMovimentacoes.tipo) params.append("tipo", filtrosMovimentacoes.tipo);
      if (filtrosMovimentacoes.status) params.append("status", filtrosMovimentacoes.status);
      if (filtrosMovimentacoes.data_inicio) params.append("data_inicio", filtrosMovimentacoes.data_inicio);
      if (filtrosMovimentacoes.data_fim) params.append("data_fim", filtrosMovimentacoes.data_fim);

      const response = await fetch(`/api/movimentacoes?${params.toString()}`, {
        headers: { "X-API-Key": process.env.REACT_APP_API_KEY || "" },
      });

      if (response.ok) {
        const data = await response.json();
        setMovimentacoes(data);
      }
    } catch (error) {
      console.error("Erro ao buscar movimentações:", error);
      setNotificacoes((prev) => [...prev, "Erro ao carregar movimentações financeiras"]);
    } finally {
      setLoadingMovimentacoes(false);
    }
  };

  // Busca reajuste IPCA
  const fetchReajusteIPCA = async () => {
    setLoadingReajuste(true);
    try {
      const response = await fetch("/api/reajuste-ipca/proposta", {
        headers: { "X-API-Key": process.env.REACT_APP_API_KEY || "" },
      });

      if (response.ok) {
        const data = await response.json();
        setReajusteIPCA(data);

        // Verifica se próximo reajuste está próximo (15 dias antes)
        if (data.data_vigencia_esperada) {
          const dataVigencia = new Date(data.data_vigencia_esperada);
          const agora = new Date();
          const diasAte = Math.ceil((dataVigencia.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24));

          if (diasAte <= 15 && diasAte > 0) {
            setNotificacoes((prev) => [...prev, `Proposta de Reajuste IPCA disponível em ${diasAte} dias`]);
          }
        }
      }
    } catch (error) {
      console.error("Erro ao buscar reajuste IPCA:", error);
    } finally {
      setLoadingReajuste(false);
    }
  };

  // Carrega dados ao inicializar
  useEffect(() => {
    fetchApontamentos();
    fetchFechamentos();
    fetchMovimentacoes();
    fetchReajusteIPCA();

    // Recarrega a cada 5 minutos
    const interval = setInterval(() => {
      if (activeTab === "apontamentos") fetchApontamentos();
      if (activeTab === "fechamentos") fetchFechamentos();
      if (activeTab === "movimentacoes") fetchMovimentacoes();
      if (activeTab === "reajuste") fetchReajusteIPCA();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [filtrosApontamentos, filtrosFechamentos, filtrosMovimentacoes, activeTab]);

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
              loading={loadingApontamentos}
              filtros={filtrosApontamentos}
              onFiltrosChange={setFiltrosApontamentos}
              onRefresh={fetchApontamentos}
              usuarioId={usuarioId}
            />
          </TabsContent>

          <TabsContent value="fechamentos" className="mt-6">
            <FechamentosSemamanais
              fechamentos={fechamentos}
              loading={loadingFechamentos}
              filtros={filtrosFechamentos}
              onFiltrosChange={setFiltrosFechamentos}
              onRefresh={fetchFechamentos}
              usuarioId={usuarioId}
            />
          </TabsContent>

          <TabsContent value="movimentacoes" className="mt-6">
            <MovimentacoesFinanceiras
              movimentacoes={movimentacoes}
              loading={loadingMovimentacoes}
              filtros={filtrosMovimentacoes}
              onFiltrosChange={setFiltrosMovimentacoes}
              onRefresh={fetchMovimentacoes}
              usuarioId={usuarioId}
            />
          </TabsContent>

          <TabsContent value="reajuste" className="mt-6">
            <ReajusteIPCATab
              reajusteIPCA={reajusteIPCA}
              loading={loadingReajuste}
              onRefresh={fetchReajusteIPCA}
              usuarioId={usuarioId}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PainelConferencia;
