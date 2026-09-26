import { useState } from "react";
import {
  Apontamento,
  FiltrosApontamentos,
  StatusApontamento,
} from "../../../domain/apontamentos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Button,
  Badge,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui";
import { AlertCircle, Check, Eye, RefreshCw, RotateCcw } from "lucide-react";
import ModalVisualizacaoApontamento from "../modals/ModalVisualizacaoApontamento";
import ModalRetificacao from "../modals/ModalRetificacao";
import { formatarMoeda } from "../../../domain/formatarMoeda";
import { useDb } from "../../../db/useDb";
import { aprovarApontamento, rejeitarApontamento } from "../data/painelConferenciaRepo";

interface ApontamentosPendentesProps {
  apontamentos: Apontamento[];
  loading: boolean;
  filtros: FiltrosApontamentos;
  onFiltrosChange: (filtros: FiltrosApontamentos) => void;
  onRefresh: () => void;
  usuarioId: string;
}

const ApontamentosPendentes: React.FC<ApontamentosPendentesProps> = ({
  apontamentos,
  loading,
  filtros,
  onFiltrosChange,
  onRefresh,
  usuarioId,
}) => {
  const [modalVisualizacao, setModalVisualizacao] = useState<{
    aberta: boolean;
    apontamento?: Apontamento;
  }>({ aberta: false });

  const [modalRetificacao, setModalRetificacao] = useState<{
    aberta: boolean;
    apontamento?: Apontamento;
  }>({ aberta: false });

  const [aprovando, setAprovando] = useState<string | null>(null);
  const [rejeitando, setRejeitando] = useState<string | null>(null);
  const { db, persistir } = useDb();

  const statusOptions: StatusApontamento[] = [
    "rascunho",
    "enviado",
    "aprovado",
    "retificado",
    "rejeitado",
  ];

  const handleAprovar = async (id: string) => {
    if (!db) return;
    setAprovando(id);
    try {
      aprovarApontamento(db, id);
      await persistir();
      onRefresh();
    } catch (error) {
      console.error("Erro ao aprovar:", error);
      alert(error instanceof Error ? error.message : "Erro ao aprovar apontamento");
    } finally {
      setAprovando(null);
    }
  };

  const handleRejeitar = async (id: string) => {
    setRejeitando(id);
    try {
      // Ver nota de limitações em data/painelConferenciaRepo.ts: o schema atual não tem um
      // status "rejeitado" para apontamentos_diarios, então isto sempre lança um erro claro.
      rejeitarApontamento();
    } catch (error) {
      console.error("Erro ao rejeitar:", error);
      alert(error instanceof Error ? error.message : "Erro ao rejeitar apontamento");
    } finally {
      setRejeitando(null);
    }
  };

  // Filtra apontamentos por status enviado ou com requer_analise
  const apontamentosParaAnalisar = apontamentos.filter(
    (a) => a.status === "enviado" || a.requer_analise
  );

  const getStatusBadge = (status: StatusApontamento, requer_analise?: boolean) => {
    if (requer_analise) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Requer Análise
        </Badge>
      );
    }

    const variants: Record<StatusApontamento, string> = {
      rascunho: "outline",
      enviado: "secondary",
      aprovado: "default",
      retificado: "warning",
      rejeitado: "destructive",
    };

    const labels: Record<StatusApontamento, string> = {
      rascunho: "Rascunho",
      enviado: "Enviado",
      aprovado: "Aprovado",
      retificado: "Retificado",
      rejeitado: "Rejeitado",
    };

    return <Badge variant={variants[status] as any}>{labels[status]}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
              Prestador
            </label>
            <Input
              placeholder="Filtrar por prestador"
              value={filtros.prestador_id || ""}
              onChange={(e) =>
                onFiltrosChange({ ...filtros, prestador_id: e.target.value })
              }
              className="bg-slate-50 dark:bg-slate-700"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
              Status
            </label>
            <Select
              value={filtros.status || ""}
              onValueChange={(value) =>
                onFiltrosChange({
                  ...filtros,
                  status: value ? (value as StatusApontamento) : undefined,
                })
              }
            >
              <SelectTrigger className="bg-slate-50 dark:bg-slate-700">
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos</SelectItem>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
              Data Início
            </label>
            <Input
              type="date"
              value={filtros.data_inicio || ""}
              onChange={(e) =>
                onFiltrosChange({ ...filtros, data_inicio: e.target.value })
              }
              className="bg-slate-50 dark:bg-slate-700"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
              Data Fim
            </label>
            <Input
              type="date"
              value={filtros.data_fim || ""}
              onChange={(e) =>
                onFiltrosChange({ ...filtros, data_fim: e.target.value })
              }
              className="bg-slate-50 dark:bg-slate-700"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button
            onClick={onRefresh}
            disabled={loading}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>

          <Button
            onClick={() =>
              onFiltrosChange({
                prestador_id: undefined,
                status: undefined,
                data_inicio: undefined,
                data_fim: undefined,
              })
            }
            variant="ghost"
            size="sm"
            className="flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Limpar Filtros
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-700/50">
              <TableRow>
                <TableHead>Prestador</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Saída</TableHead>
                <TableHead className="text-right">Intervalo</TableHead>
                <TableHead className="text-right">Horas</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" />
                      <span className="text-slate-600 dark:text-slate-400">
                        Carregando...
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : apontamentosParaAnalisar.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center">
                    <span className="text-slate-600 dark:text-slate-400">
                      Nenhum apontamento para analisar
                    </span>
                  </TableCell>
                </TableRow>
              ) : (
                apontamentosParaAnalisar.map((apontamento) => (
                  <TableRow
                    key={apontamento.id}
                    className={
                      apontamento.requer_analise
                        ? "bg-red-50 dark:bg-red-950/20"
                        : ""
                    }
                  >
                    <TableCell className="font-medium">
                      {apontamento.prestador_nome}
                    </TableCell>
                    <TableCell>
                      {new Date(apontamento.data).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>{apontamento.entrada}</TableCell>
                    <TableCell>{apontamento.saida}</TableCell>
                    <TableCell className="text-right text-sm">
                      {apontamento.intervalo || 0} min
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {apontamento.horas?.toFixed(2) || "0.00"} h
                    </TableCell>
                    <TableCell className="text-right font-semibold text-green-600 dark:text-green-400">
                      {formatarMoeda(apontamento.valor_total || 0)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(apontamento.status, apontamento.requer_analise)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          onClick={() =>
                            setModalVisualizacao({
                              aberta: true,
                              apontamento,
                            })
                          }
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-1"
                        >
                          <Eye className="w-4 h-4" />
                          Ver
                        </Button>

                        {apontamento.status === "enviado" && (
                          <>
                            <Button
                              onClick={() => handleAprovar(apontamento.id)}
                              disabled={aprovando === apontamento.id}
                              size="sm"
                              className="flex items-center gap-1 bg-green-600 hover:bg-green-700"
                            >
                              <Check className="w-4 h-4" />
                              {aprovando === apontamento.id
                                ? "..."
                                : "Aprovar"}
                            </Button>

                            <Button
                              onClick={() =>
                                setModalRetificacao({
                                  aberta: true,
                                  apontamento,
                                })
                              }
                              variant="outline"
                              size="sm"
                            >
                              Retificar
                            </Button>
                          </>
                        )}

                        {apontamento.requer_analise && (
                          <Button
                            onClick={() => handleRejeitar(apontamento.id)}
                            disabled={rejeitando === apontamento.id}
                            variant="destructive"
                            size="sm"
                          >
                            {rejeitando === apontamento.id
                              ? "..."
                              : "Rejeitar"}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Modais */}
      <ModalVisualizacaoApontamento
        isOpen={modalVisualizacao.aberta}
        onClose={() =>
          setModalVisualizacao({ aberta: false, apontamento: undefined })
        }
        apontamento={modalVisualizacao.apontamento}
      />

      <ModalRetificacao
        isOpen={modalRetificacao.aberta}
        onClose={() =>
          setModalRetificacao({ aberta: false, apontamento: undefined })
        }
        apontamento={modalRetificacao.apontamento}
        onConfirm={() => {
          setModalRetificacao({ aberta: false });
          onRefresh();
        }}
        usuarioId={usuarioId}
      />
    </div>
  );
};

export default ApontamentosPendentes;
