import { useState } from "react";
import { useDb } from "../../../db/useDb";
import { aprovarMovimentacao } from "../data/painelConferenciaRepo";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, Button, Input, Label } from "../ui";
import { Movimentacao, TipoMovimentacao } from "../../../domain/apontamentos";
import { AlertCircle } from "lucide-react";
import { formatarMoeda } from "../../../domain/formatarMoeda";

interface ModalAprovacaoMovimentacaoProps {
  isOpen: boolean;
  onClose: () => void;
  movimentacao?: Movimentacao;
  onConfirm: () => void;
  usuarioId: string;
}

const ModalAprovacaoMovimentacao: React.FC<ModalAprovacaoMovimentacaoProps> = ({
  isOpen,
  onClose,
  movimentacao,
  onConfirm,
  usuarioId,
}) => {
  const { db, persistir } = useDb();
  const [semanaDesconto, setSemanaDesconto] = useState<string>(
    movimentacao?.semana_desconto || ""
  );
  const [parcelas, setParcelas] = useState<number>(movimentacao?.parcelas || 1);
  const [juros, setJuros] = useState<number>(movimentacao?.juros_percentual || 0);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string>("");

  const isEmprestimo = movimentacao?.tipo === "emprestimo";

  const calcularValorParcela = () => {
    if (!movimentacao) return 0;
    const valorComJuros = movimentacao.valor * (1 + juros / 100);
    return valorComJuros / parcelas;
  };

  const handleConfirmar = async () => {
    if (!semanaDesconto) {
      setErro("Semana de desconto é obrigatória");
      return;
    }

    if (isEmprestimo && (parcelas < 1 || parcelas > 12)) {
      setErro("Número de parcelas deve estar entre 1 e 12");
      return;
    }

    setConfirmando(true);
    try {
      // Antes isto chamava PUT /api/movimentacoes/:id/aprovar — rota que nunca existiu:
      // o servidor em server/ só tem Pluggy e health, e o banco contábil inteiro mora no
      // navegador (sql.js + IndexedDB), fora do alcance dele. Aprovar gravava nada e a
      // tela dizia que tinha dado certo.
      if (!db || !movimentacao) throw new Error("Banco de dados indisponível");
      aprovarMovimentacao(db, movimentacao.id, semanaDesconto);
      await persistir();
      onConfirm();
      onClose();
    } catch (error) {
      console.error("Erro ao aprovar:", error);
      setErro(error instanceof Error ? error.message : "Erro ao aprovar movimentação");
    } finally {
      setConfirmando(false);
    }
  };

  if (!movimentacao) return null;

  const tipoLabels: Record<TipoMovimentacao, string> = {
    vale: "Vale",
    emprestimo: "Empréstimo",
    adiantamento: "Adiantamento",
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Aprovar {tipoLabels[movimentacao.tipo]}</DialogTitle>
          <DialogDescription>
            {movimentacao.prestador_nome} • {formatarMoeda(movimentacao.valor)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Informações Gerais */}
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Prestador</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {movimentacao.prestador_nome}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Tipo</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {tipoLabels[movimentacao.tipo]}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Valor</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {formatarMoeda(movimentacao.valor)}
              </span>
            </div>
          </div>

          {/* Semana de Desconto */}
          <div>
            <Label htmlFor="semana-desconto" className="text-sm font-medium">
              Semana de Desconto
            </Label>
            <Input
              id="semana-desconto"
              type="date"
              value={semanaDesconto}
              onChange={(e) => setSemanaDesconto(e.target.value)}
              className="mt-1 bg-slate-50 dark:bg-slate-700"
            />
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              A partir de qual semana o valor será descontado
            </p>
          </div>

          {/* Formulário para Empréstimo */}
          {isEmprestimo && (
            <>
              <div>
                <Label htmlFor="parcelas" className="text-sm font-medium">
                  Número de Parcelas
                </Label>
                <Input
                  id="parcelas"
                  type="number"
                  min="1"
                  max="12"
                  value={parcelas}
                  onChange={(e) => setParcelas(Number(e.target.value))}
                  className="mt-1 bg-slate-50 dark:bg-slate-700"
                />
              </div>

              <div>
                <Label htmlFor="juros" className="text-sm font-medium">
                  Juros (%)
                </Label>
                <Input
                  id="juros"
                  type="number"
                  min="0"
                  step="0.1"
                  value={juros}
                  onChange={(e) => setJuros(Number(e.target.value))}
                  className="mt-1 bg-slate-50 dark:bg-slate-700"
                />
              </div>

              {/* Cálculo de Parcela */}
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <div className="text-sm">
                  <p className="text-blue-800 dark:text-blue-200 mb-2">
                    Cálculo por Parcela
                  </p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span>Valor Original</span>
                      <span className="font-semibold">
                        {formatarMoeda(movimentacao.valor)}
                      </span>
                    </div>
                    {juros > 0 && (
                      <div className="flex justify-between">
                        <span>Juros ({juros.toFixed(1)}%)</span>
                        <span className="font-semibold">
                          +{formatarMoeda(
                            (movimentacao.valor * juros) / 100
                          )}
                        </span>
                      </div>
                    )}
                    <div className="pt-1 border-t border-blue-200 dark:border-blue-700 flex justify-between font-semibold text-blue-900 dark:text-blue-100">
                      <span>Valor da Parcela ({parcelas}x)</span>
                      <span>{formatarMoeda(calcularValorParcela())}</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Erro */}
          {erro && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800 dark:text-red-200">{erro}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={confirmando}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            disabled={confirmando || !semanaDesconto}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {confirmando ? "Aprovando..." : "Confirmar Aprovação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ModalAprovacaoMovimentacao;
