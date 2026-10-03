/**
 * Painel para processar reembolsos/devoluções de cobranças Asaas.
 *
 * Oferece:
 * - Modal para registrar devolução com motivo
 * - Detecção automática de tipo (< 24h = reversão, ≥ 24h = devolução)
 * - Override manual de tipo se necessário
 * - Visualização de reembolsos existentes
 * - Status visual do processamento
 */

import { useState } from "react";
import { X, AlertCircle, CheckCircle, Clock, RotateCcw } from "lucide-react";
import { useToast } from "../../ui/useToast";
import { formatarMoeda } from "../../domain/formatarMoeda";

export interface Reembolso {
  id: number;
  asaasChargeId: string;
  motivo: string;
  tipo: "reversao" | "devolucao";
  status: "processando" | "sucesso" | "erro";
  dataProcessamento: string;
  criadoEm: string;
  mensagemErro?: string | null;
}

interface ReembolsosAsaasPanelProps {
  chargeId: string;
  valor: number;
  isAberto: boolean;
  onFechar: () => void;
  reembolsos: Reembolso[];
  onProcessarReembolso: (motivo: string, tipoForce?: "reversao" | "devolucao") => Promise<void>;
  isCarregando?: boolean;
}

export function ReembolsosAsaasPanel({
  chargeId,
  valor,
  isAberto,
  onFechar,
  reembolsos,
  onProcessarReembolso,
  isCarregando = false,
}: ReembolsosAsaasPanelProps) {
  const [motivo, setMotivo] = useState("");
  const [tipoForce, setTipoForce] = useState<"reversao" | "devolucao" | "auto">("auto");
  const [isProcessando, setIsProcessando] = useState(false);
  const { avisar } = useToast();

  async function handleProcessarReembolso() {
    if (!motivo.trim()) {
      avisar("critical", "Informe um motivo para o reembolso");
      return;
    }

    setIsProcessando(true);
    try {
      await onProcessarReembolso(
        motivo,
        tipoForce === "auto" ? undefined : tipoForce,
      );
      avisar("good", "Reembolso processado com sucesso");
      setMotivo("");
      setTipoForce("auto");
      setTimeout(onFechar, 1000);
    } catch (erro) {
      avisar(
        "critical",
        erro instanceof Error ? erro.message : "Falha ao processar reembolso",
      );
    } finally {
      setIsProcessando(false);
    }
  }

  if (!isAberto) return null;

  const reembolsoAtivo = reembolsos.find((r) => r.status === "sucesso");

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Processar Reembolso
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Charge: {chargeId.slice(0, 20)}...
            </p>
          </div>
          <button
            onClick={onFechar}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Valor */}
          <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg">
            <p className="text-sm text-slate-600 dark:text-slate-300">Valor a Reembolsar</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
              {formatarMoeda(valor)}
            </p>
          </div>

          {/* Reembolso Ativo */}
          {reembolsoAtivo && (
            <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-start gap-3">
                <CheckCircle size={20} className="text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-green-900 dark:text-green-100">
                    Reembolso já processado
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                    Tipo: <span className="font-semibold capitalize">{reembolsoAtivo.tipo}</span>
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Data: {new Date(reembolsoAtivo.dataProcessamento).toLocaleDateString("pt-BR")}
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-2">
                    Motivo: <span className="italic">{reembolsoAtivo.motivo}</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Reembolsos com Erro */}
          {reembolsos.filter((r) => r.status === "erro").map((reembolso) => (
            <div
              key={reembolso.id}
              className="bg-red-50 dark:bg-red-900/30 p-4 rounded-lg border border-red-200 dark:border-red-800"
            >
              <div className="flex items-start gap-3">
                <AlertCircle size={20} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900 dark:text-red-100">
                    Falha ao processar reembolso
                  </p>
                  {reembolso.mensagemErro && (
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                      {reembolso.mensagemErro}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Reembolsos Processando */}
          {reembolsos.filter((r) => r.status === "processando").map((reembolso) => (
            <div
              key={reembolso.id}
              className="bg-amber-50 dark:bg-amber-900/30 p-4 rounded-lg border border-amber-200 dark:border-amber-800"
            >
              <div className="flex items-start gap-3">
                <Clock size={20} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-900 dark:text-amber-100">
                    Reembolso sendo processado...
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    Aguarde a conclusão
                  </p>
                </div>
              </div>
            </div>
          ))}

          {/* Formulário (só mostrar se não há reembolso ativo) */}
          {!reembolsoAtivo && (
            <div className="space-y-4 pt-2">
              {/* Seleção de Tipo */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Tipo de Reembolso
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="tipoForce"
                      value="auto"
                      checked={tipoForce === "auto"}
                      onChange={(e) => setTipoForce(e.target.value as any)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      Automático (&lt; 24h: reverter, ≥ 24h: devolução)
                    </span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="tipoForce"
                      value="reversao"
                      checked={tipoForce === "reversao"}
                      onChange={(e) => setTipoForce(e.target.value as any)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      <RotateCcw size={16} className="inline mr-1" /> Reverter na Asaas
                    </span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="tipoForce"
                      value="devolucao"
                      checked={tipoForce === "devolucao"}
                      onChange={(e) => setTipoForce(e.target.value as any)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      Registrar Devolução (lançamento de saída)
                    </span>
                  </label>
                </div>
              </div>

              {/* Motivo */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Motivo do Reembolso *
                </label>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex: Cliente desistiu do contrato, erro na emissão..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  disabled={isProcessando || isCarregando}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!reembolsoAtivo && (
          <div className="flex gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={onFechar}
              disabled={isProcessando || isCarregando}
              className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleProcessarReembolso}
              disabled={isProcessando || isCarregando || !motivo.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessando ? "Processando..." : "Processar Reembolso"}
            </button>
          </div>
        )}

        {reembolsoAtivo && (
          <div className="p-6 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={onFechar}
              className="w-full px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
