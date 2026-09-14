import { useState } from "react";
import {
  Movimentacao,
  FiltrosMovimentacoes,
  TipoMovimentacao,
  StatusMovimentacao,
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
import { Check, RotateCcw, RefreshCw, X } from "lucide-react";
import ModalAprovacaoMovimentacao from "../modals/ModalAprovacaoMovimentacao";
import { formatarMoeda } from "@/domain/formatarMoeda";

interface MovimentacoesFinanceirasProps {
  movimentacoes: Movimentacao[];
  loading: boolean;
  filtros: FiltrosMovimentacoes;
  onFiltrosChange: (filtros: FiltrosMovimentacoes) => void;
  onRefresh: () => void;
  usuarioId: string;
}

const MovimentacoesFinanceiras: React.FC<MovimentacoesFinanceirasProps> = ({
  movimentacoes,
  loading,
  filtros,
  onFiltrosChange,
  onRefresh,
  usuarioId,
}) => {
  const [modalAprovacao, setModalAprovacao] = useState<{
    aberta: boolean;
    movimentacao?: Movimentacao;
  }>({ aberta: false });

  const [rejeitando, setRejeitando] = useState<string | null>(null);

  const tiposOptions: TipoMovimentacao[] = ["vale", "emprestimo", "adiantamento"];
  const statusOptions: StatusMovimentacao[] = [
    "solicitado",
    "aprovado",
    "descontado",
    "pago",
    "rejeitado",
  ];

  const handleRejeitar = async (id: string) => {
    setRejeitando(id);
    try {
      const motivo = prompt("Motivo da rejeição:");
      if (!motivo) {
        setRejeitando(null);
        return;
      }

      const response = await fetch(`/api/movimentacoes/${id}/rejeitar`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": process.env.REACT_APP_API_KEY || "",
        },
        body: JSON.stringify({
          usuario_id: usuarioId,
          motivo_rejeicao: motivo,
        }),
      });

      if (response.ok) {
        onRefresh();
      } else {
        alert("Erro ao rejeitar movimentação");
      }
    } catch (error) {
      console.error("Erro ao rejeitar:", error);
      alert("Erro ao rejeitar movimentação");
    } finally {
      setRejeitando(null);
    }
  };

  // Filtra movimentações pendentes
  const movimentacoesPendentes = movimentacoes.filter(
    (m) => m.status === "solicitado" || m.status === "aprovado"
  );

  const getTipoBadge = (tipo: TipoMovimentacao) => {
    const labels: Record<TipoMovimentacao, string> = {
      vale: "Vale",
      emprestimo: "Empréstimo",
      adiantamento: "Adiantamento",
    };

    const colors: Record<TipoMovimentacao, string> = {
      vale: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200",
      emprestimo: "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200",
      adiantamento: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200",
    };

    return (
      <Badge className={colors[tipo]}>
        {labels[tipo]}
      </Badge>
    );
  };

  const getStatusBadge = (status: StatusMovimentacao) => {
    const variants: Record<StatusMovimentacao, string> = {
      solicitado: "secondary",
      aprovado: "default",
      descontado: "outline",
      pago: "success",
      rejeitado: "destructive",
    };

    const labels: Record<StatusMovimentacao, string> = {
      solicitado: "Solicitado",
      aprovado: "Aprovado",
      descontado: "Descontado",
      pago: "Pago",
      rejeitado: "Rejeitado",
    };

    return <Badge variant={variants[status] as any}>{labels[status]}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
              Tipo
            </label>
            <Select
              value={filtros.tipo || ""}
              onValueChange={(value) =>
                onFiltrosChange({
                  ...filtros,
                  tipo: value ? (value as TipoMovimentacao) : undefined,
                })
              }
            >
              <SelectTrigger className="bg-slate-50 dark:bg-slate-700">
                <SelectValue placeholder="Todos os tipos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos</SelectItem>
                {tiposOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                  status: value ? (value as StatusMovimentacao) : undefined,
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
                tipo: undefined,
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
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Data Solicitação</TableHead>
                <TableHead>Semana Desconto</TableHead>
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
              ) : movimentacoesPendentes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <span className="text-slate-600 dark:text-slate-400">
                      Nenhuma movimentação para analisar
                    </span>
                  </TableCell>
                </TableRow>
              ) : (
                movimentacoesPendentes.map((movimentacao) => (
                  <TableRow key={movimentacao.id}>
                    <TableCell className="font-medium">
                      {movimentacao.prestador_nome}
                    </TableCell>
                    <TableCell>
                      {getTipoBadge(movimentacao.tipo)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-green-600 dark:text-green-400">
                      {formatarMoeda(movimentacao.valor)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(movimentacao.data_solicitacao).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-sm">
                      {movimentacao.semana_desconto
                        ? new Date(movimentacao.semana_desconto).toLocaleDateString("pt-BR")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(movimentacao.status)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {movimentacao.status === "solicitado" && (
                          <>
                            <Button
                              onClick={() =>
                                setModalAprovacao({
                                  aberta: true,
                                  movimentacao,
                                })
                              }
                              size="sm"
                              className="flex items-center gap-1 bg-green-600 hover:bg-green-700"
                            >
                              <Check className="w-4 h-4" />
                              Aprovar
                            </Button>

                            <Button
                              onClick={() => handleRejeitar(movimentacao.id)}
                              disabled={rejeitando === movimentacao.id}
                              variant="destructive"
                              size="sm"
                              className="flex items-center gap-1"
                            >
                              <X className="w-4 h-4" />
                              {rejeitando === movimentacao.id
                                ? "..."
                                : "Rejeitar"}
                            </Button>
                          </>
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
      <ModalAprovacaoMovimentacao
        isOpen={modalAprovacao.aberta}
        onClose={() =>
          setModalAprovacao({ aberta: false, movimentacao: undefined })
        }
        movimentacao={modalAprovacao.movimentacao}
        onConfirm={() => {
          setModalAprovacao({ aberta: false });
          onRefresh();
        }}
        usuarioId={usuarioId}
      />
    </div>
  );
};

export default MovimentacoesFinanceiras;
