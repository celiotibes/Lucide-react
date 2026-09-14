import { useState } from "react";
import {
  FechamentoSemanal,
  FiltrosFechamentos,
  StatusFechamento,
} from "@/domain/apontamentos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, CreditCard, Eye, RefreshCw, RotateCcw } from "lucide-react";
import ModalVisualizacaoFechamento from "../modals/ModalVisualizacaoFechamento";
import { formatarMoeda } from "@/domain/formatarMoeda";

interface FechamentosSemamanaisProps {
  fechamentos: FechamentoSemanal[];
  loading: boolean;
  filtros: FiltrosFechamentos;
  onFiltrosChange: (filtros: FiltrosFechamentos) => void;
  onRefresh: () => void;
  usuarioId: string;
}

const FechamentosSemamanais: React.FC<FechamentosSemamanaisProps> = ({
  fechamentos,
  loading,
  filtros,
  onFiltrosChange,
  onRefresh,
  usuarioId,
}) => {
  const [modalVisualizacao, setModalVisualizacao] = useState<{
    aberta: boolean;
    fechamento?: FechamentoSemanal;
  }>({ aberta: false });

  const [aprovando, setAprovando] = useState<string | null>(null);
  const [gerando, setGerando] = useState<string | null>(null);

  const statusOptions: StatusFechamento[] = [
    "rascunho",
    "enviado",
    "aprovado",
    "pago",
  ];

  const handleAprovar = async (id: string) => {
    setAprovando(id);
    try {
      const response = await fetch(`/api/fechamentos-semanais/${id}/aprovar`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": process.env.REACT_APP_API_KEY || "",
        },
        body: JSON.stringify({
          usuario_id: usuarioId,
          motivo: "Aprovado pelo gestor",
        }),
      });

      if (response.ok) {
        onRefresh();
      } else {
        alert("Erro ao aprovar fechamento");
      }
    } catch (error) {
      console.error("Erro ao aprovar:", error);
      alert("Erro ao aprovar fechamento");
    } finally {
      setAprovando(null);
    }
  };

  const handleGerarPagamento = async (id: string) => {
    setGerando(id);
    try {
      const response = await fetch(`/api/fechamentos-semanais/${id}/gerar-pagamento`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": process.env.REACT_APP_API_KEY || "",
        },
        body: JSON.stringify({
          usuario_id: usuarioId,
          metodo_pagamento: "transferencia_bancaria",
        }),
      });

      if (response.ok) {
        alert("Pagamento gerado com sucesso!");
        onRefresh();
      } else {
        alert("Erro ao gerar pagamento");
      }
    } catch (error) {
      console.error("Erro ao gerar pagamento:", error);
      alert("Erro ao gerar pagamento");
    } finally {
      setGerando(null);
    }
  };

  // Filtra fechamentos pendentes
  const fechamentosParaAnalisar = fechamentos.filter(
    (f) => f.status === "enviado" || f.status === "aprovado"
  );

  const getStatusBadge = (status: StatusFechamento) => {
    const variants: Record<StatusFechamento, string> = {
      rascunho: "outline",
      enviado: "secondary",
      aprovado: "default",
      pago: "success",
    };

    const labels: Record<StatusFechamento, string> = {
      rascunho: "Rascunho",
      enviado: "Enviado",
      aprovado: "Aprovado",
      pago: "Pago",
    };

    return <Badge variant={variants[status] as any}>{labels[status]}</Badge>;
  };

  const formatarSemana = (inicio: string, fim: string) => {
    const dataInicio = new Date(inicio);
    const dataFim = new Date(fim);
    return `${dataInicio.toLocaleDateString("pt-BR")} - ${dataFim.toLocaleDateString("pt-BR")}`;
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
                  status: value ? (value as StatusFechamento) : undefined,
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
              Semana Início
            </label>
            <Input
              type="date"
              value={filtros.semana_inicio || ""}
              onChange={(e) =>
                onFiltrosChange({ ...filtros, semana_inicio: e.target.value })
              }
              className="bg-slate-50 dark:bg-slate-700"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
              Semana Fim
            </label>
            <Input
              type="date"
              value={filtros.semana_fim || ""}
              onChange={(e) =>
                onFiltrosChange({ ...filtros, semana_fim: e.target.value })
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
                semana_inicio: undefined,
                semana_fim: undefined,
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
                <TableHead>Semana</TableHead>
                <TableHead className="text-right">Valor Bruto</TableHead>
                <TableHead className="text-right">Descontos</TableHead>
                <TableHead className="text-right">Valor Líquido</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" />
                      <span className="text-slate-600 dark:text-slate-400">
                        Carregando...
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : fechamentosParaAnalisar.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <span className="text-slate-600 dark:text-slate-400">
                      Nenhum fechamento para analisar
                    </span>
                  </TableCell>
                </TableRow>
              ) : (
                fechamentosParaAnalisar.map((fechamento) => (
                  <TableRow key={fechamento.id}>
                    <TableCell className="font-medium">
                      {fechamento.prestador_nome}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatarSemana(fechamento.semana_inicio, fechamento.semana_fim)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatarMoeda(fechamento.valor_bruto)}
                    </TableCell>
                    <TableCell className="text-right text-red-600 dark:text-red-400">
                      {formatarMoeda(fechamento.descontos_total)}
                    </TableCell>
                    <TableCell className="text-right font-bold text-green-600 dark:text-green-400">
                      {formatarMoeda(fechamento.valor_liquido)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(fechamento.status)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          onClick={() =>
                            setModalVisualizacao({
                              aberta: true,
                              fechamento,
                            })
                          }
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-1"
                        >
                          <Eye className="w-4 h-4" />
                          Ver
                        </Button>

                        {fechamento.status === "enviado" && (
                          <Button
                            onClick={() => handleAprovar(fechamento.id)}
                            disabled={aprovando === fechamento.id}
                            size="sm"
                            className="flex items-center gap-1 bg-green-600 hover:bg-green-700"
                          >
                            <Check className="w-4 h-4" />
                            {aprovando === fechamento.id
                              ? "..."
                              : "Aprovar"}
                          </Button>
                        )}

                        {fechamento.status === "aprovado" && (
                          <Button
                            onClick={() => handleGerarPagamento(fechamento.id)}
                            disabled={gerando === fechamento.id}
                            size="sm"
                            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700"
                          >
                            <CreditCard className="w-4 h-4" />
                            {gerando === fechamento.id
                              ? "..."
                              : "Gerar Pagamento"}
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

      {/* Modal */}
      <ModalVisualizacaoFechamento
        isOpen={modalVisualizacao.aberta}
        onClose={() =>
          setModalVisualizacao({ aberta: false, fechamento: undefined })
        }
        fechamento={modalVisualizacao.fechamento}
      />
    </div>
  );
};

export default FechamentosSemamanais;
