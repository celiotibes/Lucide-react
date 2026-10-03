import { useState } from "react";
import { Button, Badge } from "../ui";
import { ReajusteIPCA } from "../../../domain/apontamentos";
import { AlertCircle, RefreshCw } from "lucide-react";
import ModalPropostaReajuste from "../modals/ModalPropostaReajuste";
import { formatarMoeda } from "../../../domain/formatarMoeda";

interface ReajusteIPCATabProps {
  reajusteIPCA: ReajusteIPCA | null;
  loading: boolean;
  onRefresh: () => void;
  usuarioId: string;
}

const ReajusteIPCATab: React.FC<ReajusteIPCATabProps> = ({
  reajusteIPCA,
  loading,
  onRefresh,
  usuarioId,
}) => {
  const [modalAberta, setModalAberta] = useState(false);

  const calcularDiasAte = (data: string) => {
    const vigencia = new Date(data);
    const agora = new Date();
    return Math.ceil((vigencia.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24));
  };

  if (!reajusteIPCA) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg p-8 shadow-sm border border-slate-200 dark:border-slate-700 text-center">
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Nenhuma proposta de reajuste disponível no momento.
        </p>
        <Button onClick={onRefresh} disabled={loading} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>
    );
  }

  const diasAte = calcularDiasAte(reajusteIPCA.data_vigencia_esperada);
  const tempoProximo = diasAte > 0 ? `em ${diasAte} dias` : "hoje ou já passou";
  const podeGerar = diasAte <= 15 && diasAte > 0;

  const getStatusColor = () => {
    switch (reajusteIPCA.status) {
      case "pendente":
        return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200";
      case "proposta_gerada":
        return "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200";
      case "aprovado":
        return "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200";
      case "rejeitado":
        return "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200";
      default:
        return "bg-slate-100 dark:bg-slate-900/30 text-slate-800 dark:text-slate-200";
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Principal */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-8 shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Próximo Reajuste
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Data de Vigência Esperada
                </p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {new Date(reajusteIPCA.data_vigencia_esperada).toLocaleDateString("pt-BR", {
                    month: "long",
                    year: "numeric",
                  })}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {tempoProximo}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  IPCA Acumulado
                </p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {reajusteIPCA.ipca_acumulado.toFixed(2)}%
                </p>
              </div>

              {reajusteIPCA.data_notificacao && (
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Data da Notificação
                  </p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {new Date(reajusteIPCA.data_notificacao).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Status
            </h2>
            <div className={`rounded-lg p-6 ${getStatusColor()}`}>
              <div className="mb-4">
                <Badge className={getStatusColor()}>
                  {reajusteIPCA.status === "pendente" && "Pendente"}
                  {reajusteIPCA.status === "proposta_gerada" && "Proposta Gerada"}
                  {reajusteIPCA.status === "aprovado" && "Aprovado"}
                  {reajusteIPCA.status === "rejeitado" && "Rejeitado"}
                </Badge>
              </div>

              <p className="text-sm mb-4">
                {reajusteIPCA.status === "pendente" &&
                  "Aguardando a chegada da data de notificação do IPCA."}
                {reajusteIPCA.status === "proposta_gerada" &&
                  "Proposta de reajuste disponível para análise e aprovação."}
                {reajusteIPCA.status === "aprovado" &&
                  "Reajuste aprovado e vigência iniciada."}
                {reajusteIPCA.status === "rejeitado" &&
                  "Reajuste foi rejeitado. Valores mantêm-se inalterados."}
              </p>

              {podeGerar && reajusteIPCA.status === "pendente" && (
                <Button
                  onClick={() => setModalAberta(true)}
                  className="w-full bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4" />
                  Gerar Proposta de Reajuste
                </Button>
              )}

              {reajusteIPCA.status === "proposta_gerada" && (
                <Button
                  onClick={() => setModalAberta(true)}
                  className="w-full bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
                >
                  Revisar Proposta
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabela de Rubricas (se proposta gerada) */}
      {reajusteIPCA.status === "proposta_gerada" && reajusteIPCA.rubricas_reajustadas && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-slate-900 dark:text-white">
              Rubricas do Reajuste
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Rubrica
                  </th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Valor Atual
                  </th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Percentual IPCA
                  </th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Novo Valor
                  </th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Diferença
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {reajusteIPCA.rubricas_reajustadas.map((rubrica) => {
                  const novoValor = rubrica.valor_ajustado_manual || rubrica.novo_valor;
                  const diferenca = novoValor - rubrica.valor_atual;

                  return (
                    <tr
                      key={rubrica.rubrica}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    >
                      <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">
                        {rubrica.rubrica.replace(/_/g, " ")}
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-slate-600 dark:text-slate-400">
                        {formatarMoeda(rubrica.valor_atual)}
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium text-blue-600 dark:text-blue-400">
                        +{rubrica.percentual_ipca.toFixed(2)}%
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-semibold text-green-600 dark:text-green-400">
                        {formatarMoeda(novoValor)}
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-semibold text-green-600 dark:text-green-400">
                        +{formatarMoeda(diferenca)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Observações */}
      {reajusteIPCA.observacoes && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Observações:</strong> {reajusteIPCA.observacoes}
          </p>
        </div>
      )}

      {/* Modal */}
      <ModalPropostaReajuste
        isOpen={modalAberta}
        onClose={() => setModalAberta(false)}
        reajusteIPCA={reajusteIPCA}
        onConfirm={onRefresh}
        usuarioId={usuarioId}
      />
    </div>
  );
};

export default ReajusteIPCATab;
