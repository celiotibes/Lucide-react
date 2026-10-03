import { Apontamento } from "../../../domain/apontamentos";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Badge } from "../ui";
import { formatarMoeda } from "../../../domain/formatarMoeda";
import MemoriaCalculoDetalhada from "./MemoriaCalculoDetalhada";
import { AlertCircle } from "lucide-react";

interface ModalVisualizacaoApontamentoProps {
  isOpen: boolean;
  onClose: () => void;
  apontamento?: Apontamento;
}

const ModalVisualizacaoApontamento: React.FC<ModalVisualizacaoApontamentoProps> = ({
  isOpen,
  onClose,
  apontamento,
}) => {
  if (!apontamento) return null;

  const getTiposLabel = () => {
    return apontamento.tipos.map((t) => {
      const labels: Record<string, string> = {
        diaria: "Diária",
        airbnb: "Airbnb",
        urgencia: "Urgência",
        deslocamento: "Deslocamento",
        busca_materiais: "Busca Materiais",
        ajudante: "Ajudante",
      };
      return labels[t] || t;
    }).join(", ");
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      rascunho: "bg-slate-100 dark:bg-slate-900/30 text-slate-800 dark:text-slate-200",
      enviado: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200",
      aprovado: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200",
      retificado: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200",
      rejeitado: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200",
    };
    return colors[status] || colors.rascunho;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Detalhes do Apontamento</DialogTitle>
          <DialogDescription>
            {apontamento.prestador_nome} • {new Date(apontamento.data).toLocaleDateString("pt-BR")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Informações Gerais */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">
                Prestador
              </p>
              <p className="font-semibold text-slate-900 dark:text-white">
                {apontamento.prestador_nome}
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">
                Data
              </p>
              <p className="font-semibold text-slate-900 dark:text-white">
                {new Date(apontamento.data).toLocaleDateString("pt-BR")}
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">
                Tipos
              </p>
              <p className="font-semibold text-slate-900 dark:text-white text-sm">
                {getTiposLabel()}
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">
                Status
              </p>
              <Badge className={getStatusColor(apontamento.status)}>
                {apontamento.status.charAt(0).toUpperCase() + apontamento.status.slice(1)}
              </Badge>
            </div>
          </div>

          {/* Aviso de Análise Requerida */}
          {apontamento.requer_analise && (
            <div className="flex items-start gap-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-800 dark:text-red-200">
                  Requer Análise
                </p>
                {apontamento.motivo_analise && (
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    {apontamento.motivo_analise}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Memória de Cálculo */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
              Memória de Cálculo Detalhada
            </h3>
            <MemoriaCalculoDetalhada apontamento={apontamento} />
          </div>

          {/* Resumo de Valores */}
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-green-800 dark:text-green-200">Valor Total</span>
                <span className="text-xl font-bold text-green-900 dark:text-green-100">
                  {formatarMoeda(apontamento.valor_total || 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Metadados */}
          <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <p>
              Criado em: {new Date(apontamento.data_criacao).toLocaleString("pt-BR")}
            </p>
            <p>
              Atualizado em: {new Date(apontamento.data_atualizacao).toLocaleString("pt-BR")}
            </p>
            {apontamento.observacoes && (
              <p className="mt-2 italic">
                Observações: {apontamento.observacoes}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ModalVisualizacaoApontamento;
