import { useState } from "react";
import { useDb } from "../../../db/useDb";
import { retificarApontamento } from "../data/painelConferenciaRepo";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, Button, Input, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui";
import { Apontamento } from "../../../domain/apontamentos";
import { AlertCircle } from "lucide-react";
import MemoriaCalculoDetalhada from "./MemoriaCalculoDetalhada";

interface ModalRetificacaoProps {
  isOpen: boolean;
  onClose: () => void;
  apontamento?: Apontamento;
  onConfirm: () => void;
  usuarioId: string;
}

const ModalRetificacao: React.FC<ModalRetificacaoProps> = ({
  isOpen,
  onClose,
  apontamento,
  onConfirm,
  usuarioId,
}) => {
  const { db, persistir } = useDb();
  const [campoAlterado, setCampoAlterado] = useState<string>("");
  const [valorAnterior, setValorAnterior] = useState<string>("");
  const [novoValor, setNovoValor] = useState<string>("");
  const [motivo, setMotivo] = useState<string>("");
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string>("");

  const camposDisponiveis = [
    { valor: "entrada", label: "Entrada (HH:MM)" },
    { valor: "saida", label: "Saída (HH:MM)" },
    { valor: "intervalo", label: "Intervalo (minutos)" },
  ];

  const calcularHoras = (entrada: string, saida: string, intervalo: number = 0) => {
    const [hE, mE] = entrada.split(":").map(Number);
    const [hS, mS] = saida.split(":").map(Number);
    const minE = hE * 60 + mE;
    const minS = hS * 60 + mS;
    const minTrabalhados = minS - minE - intervalo;
    return minTrabalhados / 60;
  };

  const handleCampoChange = (campo: string) => {
    setCampoAlterado(campo);
    setErro("");

    if (apontamento) {
      if (campo === "entrada") {
        setValorAnterior(apontamento.entrada);
      } else if (campo === "saida") {
        setValorAnterior(apontamento.saida);
      } else if (campo === "intervalo") {
        setValorAnterior((apontamento.intervalo || 0).toString());
      }
    }
  };

  const handleNovoValorChange = (valor: string) => {
    setNovoValor(valor);

    // Auto-calcula horas se campos de entrada/saída mudam
    if (apontamento && (campoAlterado === "entrada" || campoAlterado === "saida" || campoAlterado === "intervalo")) {
      let entrada = apontamento.entrada;
      let saida = apontamento.saida;
      let intervalo = apontamento.intervalo || 0;

      if (campoAlterado === "entrada") {
        entrada = valor;
      } else if (campoAlterado === "saida") {
        saida = valor;
      } else if (campoAlterado === "intervalo") {
        intervalo = parseInt(valor) || 0;
      }

      try {
        const horas = calcularHoras(entrada, saida, intervalo);
        console.log(`Horas calculadas: ${horas}`);
      } catch (err) {
        console.error("Erro ao calcular horas:", err);
      }
    }
  };

  const handleConfirmar = async () => {
    if (!campoAlterado || !novoValor || !motivo) {
      setErro("Todos os campos são obrigatórios");
      return;
    }

    setConfirmando(true);
    try {
      // Antes: PUT /api/apontamentos/:id/retificar — rota inexistente. O banco contábil
      // inteiro mora no navegador (sql.js + IndexedDB); o servidor nunca o enxergou.
      if (!db || !apontamento) throw new Error("Banco de dados indisponível");
      retificarApontamento(
        db,
        apontamento.id,
        campoAlterado as "entrada" | "saida" | "intervalo",
        valorAnterior,
        novoValor,
        motivo,
      );
      await persistir();
      onConfirm();
      onClose();
    } catch (error) {
      console.error("Erro ao confirmar retificação:", error);
      setErro(error instanceof Error ? error.message : "Erro ao confirmar retificação");
    } finally {
      setConfirmando(false);
    }
  };

  const agora = new Date();
  const dataCriacao = apontamento ? new Date(apontamento.data_criacao) : new Date();
  const diasPassados = Math.floor((agora.getTime() - dataCriacao.getTime()) / (1000 * 60 * 60 * 24));
  const passouPrazo = diasPassados > 1;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Retificação de Apontamento</DialogTitle>
          <DialogDescription>
            {apontamento?.prestador_nome} • {apontamento?.data && new Date(apontamento.data).toLocaleDateString("pt-BR")}
          </DialogDescription>
        </DialogHeader>

        {apontamento && (
          <div className="space-y-6 max-h-[70vh] overflow-y-auto">
            {/* Aviso de prazo */}
            {passouPrazo && (
              <div className="flex items-start gap-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800 dark:text-red-200">
                    Prazo de 1 dia expirado
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    Esta retificação será marcada para análise manual na auditoria.
                  </p>
                </div>
              </div>
            )}

            {/* Memória de Cálculo */}
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-3">
                Memória de Cálculo Atual
              </h3>
              <MemoriaCalculoDetalhada apontamento={apontamento} />
            </div>

            {/* Formulário de Retificação */}
            <div className="space-y-4 border-t border-slate-200 dark:border-slate-700 pt-4">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                  Campo a Alterar
                </label>
                <Select value={campoAlterado} onValueChange={handleCampoChange}>
                  <SelectTrigger className="bg-slate-50 dark:bg-slate-700">
                    <SelectValue placeholder="Selecione o campo" />
                  </SelectTrigger>
                  <SelectContent>
                    {camposDisponiveis.map((campo) => (
                      <SelectItem key={campo.valor} value={campo.valor}>
                        {campo.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {valorAnterior && (
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                    Valor Anterior
                  </label>
                  <Input
                    value={valorAnterior}
                    disabled
                    className="bg-slate-50 dark:bg-slate-700 cursor-not-allowed"
                  />
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                  Novo Valor
                </label>
                <Input
                  placeholder={
                    campoAlterado === "entrada" || campoAlterado === "saida"
                      ? "HH:MM"
                      : "Número"
                  }
                  value={novoValor}
                  onChange={(e) => handleNovoValorChange(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-700"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                  Motivo da Retificação
                </label>
                <Textarea
                  placeholder="Descreva o motivo da alteração..."
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-700 min-h-24"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                  Data da Retificação (automática)
                </label>
                <Input
                  value={new Date().toISOString().split("T")[0]}
                  disabled
                  className="bg-slate-50 dark:bg-slate-700 cursor-not-allowed"
                />
              </div>
            </div>

            {/* Erro */}
            {erro && (
              <div className="flex items-start gap-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800 dark:text-red-200">{erro}</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={confirmando}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            disabled={confirmando || !campoAlterado || !novoValor || !motivo}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {confirmando ? "Confirmando..." : "Confirmar Retificação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ModalRetificacao;
