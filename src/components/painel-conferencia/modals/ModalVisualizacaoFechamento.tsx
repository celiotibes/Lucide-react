import { FechamentoSemanal } from "../../../domain/apontamentos";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Badge } from "../ui";
import { formatarMoeda } from "../../../domain/formatarMoeda";

interface ModalVisualizacaoFechamentoProps {
  isOpen: boolean;
  onClose: () => void;
  fechamento?: FechamentoSemanal;
}

const ModalVisualizacaoFechamento: React.FC<ModalVisualizacaoFechamentoProps> = ({
  isOpen,
  onClose,
  fechamento,
}) => {
  if (!fechamento) return null;

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      rascunho: "bg-slate-100 dark:bg-slate-900/30 text-slate-800 dark:text-slate-200",
      enviado: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200",
      aprovado: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200",
      pago: "bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200",
    };
    return colors[status] || colors.rascunho;
  };

  const formatarSemana = (inicio: string, fim: string) => {
    const dataInicio = new Date(inicio);
    const dataFim = new Date(fim);
    return `${dataInicio.toLocaleDateString("pt-BR")} a ${dataFim.toLocaleDateString("pt-BR")}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detalhes do Fechamento Semanal</DialogTitle>
          <DialogDescription>
            {fechamento.prestador_nome} • {formatarSemana(fechamento.semana_inicio, fechamento.semana_fim)}
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
                {fechamento.prestador_nome}
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">
                Semana
              </p>
              <p className="font-semibold text-slate-900 dark:text-white text-sm">
                {formatarSemana(fechamento.semana_inicio, fechamento.semana_fim)}
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">
                Quantidade de Apontamentos
              </p>
              <p className="font-semibold text-slate-900 dark:text-white">
                {fechamento.apontamentos_ids.length}
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">
                Status
              </p>
              <Badge className={getStatusColor(fechamento.status)}>
                {fechamento.status.charAt(0).toUpperCase() + fechamento.status.slice(1)}
              </Badge>
            </div>
          </div>

          {/* Breakdown de Valores */}
          <div className="space-y-3 bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-4">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
              Breakdown de Valores
            </h3>

            <div className="space-y-3">
              <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-slate-600">
                <span className="text-slate-700 dark:text-slate-300">Valor Bruto</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {formatarMoeda(fechamento.valor_bruto)}
                </span>
              </div>

              <div>
                <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Descontos
                </h4>
                <div className="ml-4 space-y-1">
                  {fechamento.descontos_vale > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600 dark:text-slate-400">Vale</span>
                      <span className="text-red-600 dark:text-red-400">
                        -{formatarMoeda(fechamento.descontos_vale)}
                      </span>
                    </div>
                  )}
                  {fechamento.descontos_emprestimo > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600 dark:text-slate-400">Empréstimo</span>
                      <span className="text-red-600 dark:text-red-400">
                        -{formatarMoeda(fechamento.descontos_emprestimo)}
                      </span>
                    </div>
                  )}
                  {fechamento.descontos_adiantamento > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600 dark:text-slate-400">Adiantamento</span>
                      <span className="text-red-600 dark:text-red-400">
                        -{formatarMoeda(fechamento.descontos_adiantamento)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 flex justify-between items-center text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Total Descontos
                  </span>
                  <span className="font-semibold text-red-600 dark:text-red-400">
                    -{formatarMoeda(fechamento.descontos_total)}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-600 flex justify-between items-center font-bold">
                <span className="text-slate-900 dark:text-white">Valor Líquido</span>
                <span className="text-lg text-green-600 dark:text-green-400">
                  {formatarMoeda(fechamento.valor_liquido)}
                </span>
              </div>
            </div>
          </div>

          {/* Metadados */}
          <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1 bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
            <p>
              Criado em: {new Date(fechamento.data_criacao).toLocaleString("pt-BR")}
            </p>
            <p>
              Atualizado em: {new Date(fechamento.data_atualizacao).toLocaleString("pt-BR")}
            </p>
            {fechamento.observacoes && (
              <p className="mt-2 italic text-slate-700 dark:text-slate-300">
                Observações: {fechamento.observacoes}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ModalVisualizacaoFechamento;
