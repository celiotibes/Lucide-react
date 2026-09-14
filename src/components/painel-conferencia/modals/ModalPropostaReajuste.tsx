import { useState } from "react";
import { ReajusteIPCA, RubricaReajuste } from "@/domain/apontamentos";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle } from "lucide-react";
import { formatarMoeda } from "@/domain/formatarMoeda";

interface ModalPropostaReajusteProps {
  isOpen: boolean;
  onClose: () => void;
  reajusteIPCA?: ReajusteIPCA;
  onConfirm: () => void;
  usuarioId: string;
}

const ModalPropostaReajuste: React.FC<ModalPropostaReajusteProps> = ({
  isOpen,
  onClose,
  reajusteIPCA,
  onConfirm,
  usuarioId,
}) => {
  const [rubricas, setRubricas] = useState<RubricaReajuste[]>(
    reajusteIPCA?.rubricas_reajustadas || []
  );
  const [acaoSelecionada, setAcaoSelecionada] = useState<"aprovar" | "rejeitar" | "editar">(
    reajusteIPCA?.status === "proposta_gerada" ? "editar" : "aprovar"
  );
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string>("");

  if (!reajusteIPCA) return null;

  const handleAlterarRubrica = (idx: number, novoValor: number) => {
    const novasRubricas = [...rubricas];
    novasRubricas[idx].valor_ajustado_manual = novoValor;
    setRubricas(novasRubricas);
  };

  const handleAprovar = async () => {
    setConfirmando(true);
    setErro("");
    try {
      const endpoint = reajusteIPCA.status === "proposta_gerada"
        ? `/api/reajuste-ipca/${reajusteIPCA.id}/aprovar`
        : "/api/reajuste-ipca/aprovar";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": process.env.REACT_APP_API_KEY || "",
        },
        body: JSON.stringify({
          usuario_id: usuarioId,
          reajuste_id: reajusteIPCA.id,
          rubricas_ajustadas: rubricas,
        }),
      });

      if (response.ok) {
        onConfirm();
        onClose();
      } else {
        const data = await response.json();
        setErro(data.erro || "Erro ao aprovar reajuste");
      }
    } catch (error) {
      console.error("Erro ao aprovar:", error);
      setErro("Erro ao aprovar reajuste");
    } finally {
      setConfirmando(false);
    }
  };

  const handleRejeitar = async () => {
    setConfirmando(true);
    setErro("");
    try {
      const endpoint = reajusteIPCA.status === "proposta_gerada"
        ? `/api/reajuste-ipca/${reajusteIPCA.id}/rejeitar`
        : "/api/reajuste-ipca/rejeitar";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": process.env.REACT_APP_API_KEY || "",
        },
        body: JSON.stringify({
          usuario_id: usuarioId,
          reajuste_id: reajusteIPCA.id,
        }),
      });

      if (response.ok) {
        onConfirm();
        onClose();
      } else {
        const data = await response.json();
        setErro(data.erro || "Erro ao rejeitar reajuste");
      }
    } catch (error) {
      console.error("Erro ao rejeitar:", error);
      setErro("Erro ao rejeitar reajuste");
    } finally {
      setConfirmando(false);
    }
  };

  const getRubricaLabel = (rubrica: string) => {
    const labels: Record<string, string> = {
      urgencia_50: "Urgência (R$ 50)",
      urgencia_62_50: "Urgência (R$ 62,50)",
      airbnb_1q: "Airbnb (1º Quarto)",
      airbnb_2q: "Airbnb (2º Quarto)",
      deslocamento: "Deslocamento",
      busca_materiais: "Busca de Materiais",
      diaria_ajudante: "Diária Ajudante",
    };
    return labels[rubrica] || rubrica;
  };

  const totalAumentoBruto = rubricas.reduce(
    (acc, r) => acc + (r.novo_valor - r.valor_atual),
    0
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {reajusteIPCA.status === "proposta_gerada"
              ? "Revisar Proposta de Reajuste"
              : "Gerar Proposta de Reajuste IPCA"}
          </DialogTitle>
          <DialogDescription>
            IPCA {reajusteIPCA.ipca_acumulado.toFixed(2)}% • Vigência:{" "}
            {new Date(reajusteIPCA.data_vigencia_esperada).toLocaleDateString("pt-BR", {
              month: "long",
              year: "numeric",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 max-h-[60vh] overflow-y-auto">
          {/* Tabela de Rubricas */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">
                    Rubrica
                  </th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-700 dark:text-slate-300">
                    Valor Atual
                  </th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-700 dark:text-slate-300">
                    % IPCA
                  </th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-700 dark:text-slate-300">
                    Novo Valor
                  </th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-700 dark:text-slate-300">
                    Aumento
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {rubricas.map((rubrica, idx) => {
                  const novoValor = rubrica.valor_ajustado_manual || rubrica.novo_valor;
                  const aumento = novoValor - rubrica.valor_atual;

                  return (
                    <tr
                      key={idx}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                        {getRubricaLabel(rubrica.rubrica)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">
                        {formatarMoeda(rubrica.valor_atual)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-blue-600 dark:text-blue-400">
                        +{rubrica.percentual_ipca.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-right">
                        {acaoSelecionada === "editar" ? (
                          <Input
                            type="number"
                            value={novoValor}
                            onChange={(e) =>
                              handleAlterarRubrica(idx, Number(e.target.value))
                            }
                            step="0.01"
                            className="w-24 text-right bg-slate-50 dark:bg-slate-700"
                          />
                        ) : (
                          <span className="font-semibold text-green-600 dark:text-green-400">
                            {formatarMoeda(novoValor)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-green-600 dark:text-green-400">
                        +{formatarMoeda(aumento)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Resumo */}
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-green-800 dark:text-green-200">
                  Aumento Total (Bruto)
                </span>
                <span className="font-bold text-green-900 dark:text-green-100">
                  +{formatarMoeda(totalAumentoBruto)}
                </span>
              </div>
              <div className="flex justify-between text-sm text-green-700 dark:text-green-300">
                <span>Impacto Mensal (aprox.)</span>
                <span className="font-semibold">
                  {((totalAumentoBruto / 30) * 4.3).toFixed(0)} apontamentos
                </span>
              </div>
            </div>
          </div>

          {/* Aviso de Combustível */}
          <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Combustível não está incluído no reajuste automático IPCA. Ajuste manual em breve.
            </p>
          </div>

          {/* Erro */}
          {erro && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800 dark:text-red-200">{erro}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleRejeitar}
            disabled={confirmando}
          >
            Rejeitar
          </Button>
          {acaoSelecionada === "editar" && (
            <Button
              variant="secondary"
              onClick={() => setAcaoSelecionada("aprovar")}
              disabled={confirmando}
            >
              Edição Concluída
            </Button>
          )}
          <Button
            onClick={handleAprovar}
            disabled={confirmando}
            className="bg-green-600 hover:bg-green-700"
          >
            {confirmando ? "Processando..." : "Aprovar Reajuste"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ModalPropostaReajuste;
