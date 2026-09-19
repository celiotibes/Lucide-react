import { Apontamento, MemoriaCalculo } from "../../../domain/apontamentos";
import { formatarMoeda } from "../../../domain/formatarMoeda";

interface MemoriaCalculoDetalhadaProps {
  apontamento: Apontamento;
}

const MemoriaCalculoDetalhada: React.FC<MemoriaCalculoDetalhadaProps> = ({ apontamento }) => {
  // Parseia memória de cálculo se disponível, caso contrário constrói a partir dos dados
  let memorias: MemoriaCalculo[] = [];

  if (apontamento.memoria_calculo) {
    try {
      memorias = JSON.parse(apontamento.memoria_calculo);
    } catch (e) {
      console.error("Erro ao parsear memória de cálculo:", e);
    }
  }

  // Se não há memória parsed, constrói dinamicamente
  if (memorias.length === 0) {
    if (apontamento.valor_diaria) {
      memorias.push({
        tipo: "diaria",
        componentes: [
          {
            descricao: "Horas trabalhadas",
            quantidade: apontamento.horas || 0,
            valor_unitario: apontamento.valor_diaria / (apontamento.horas || 1),
            subtotal: apontamento.valor_diaria,
          },
        ],
        total: apontamento.valor_diaria,
      });
    }

    if (apontamento.valor_airbnb) {
      memorias.push({
        tipo: "airbnb",
        componentes: [
          {
            descricao: "Airbnb",
            subtotal: apontamento.valor_airbnb,
          },
        ],
        total: apontamento.valor_airbnb,
      });
    }

    if (apontamento.valor_urgencia) {
      memorias.push({
        tipo: "urgencia",
        componentes: [
          {
            descricao: "Urgência",
            subtotal: apontamento.valor_urgencia,
          },
        ],
        total: apontamento.valor_urgencia,
      });
    }

    if (apontamento.valor_deslocamento) {
      memorias.push({
        tipo: "deslocamento",
        componentes: [
          {
            descricao: "Deslocamento",
            subtotal: apontamento.valor_deslocamento,
          },
        ],
        total: apontamento.valor_deslocamento,
      });
    }

    if (apontamento.valor_busca_materiais) {
      memorias.push({
        tipo: "busca_materiais",
        componentes: [
          {
            descricao: "Busca de Materiais",
            subtotal: apontamento.valor_busca_materiais,
          },
        ],
        total: apontamento.valor_busca_materiais,
      });
    }

    if (apontamento.valor_ajudante) {
      memorias.push({
        tipo: "ajudante",
        componentes: [
          {
            descricao: "Diária Ajudante",
            subtotal: apontamento.valor_ajudante,
          },
        ],
        total: apontamento.valor_ajudante,
      });
    }
  }

  const getTipoLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      diaria: "Diária",
      airbnb: "Airbnb",
      urgencia: "Urgência",
      deslocamento: "Deslocamento",
      busca_materiais: "Busca de Materiais",
      ajudante: "Diária Ajudante",
      desconto: "Desconto",
    };
    return labels[tipo] || tipo;
  };

  const totalBruto = memorias.reduce((acc, m) => acc + m.total, 0);

  return (
    <div className="space-y-4">
      {/* Horário */}
      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400">Entrada</p>
            <p className="font-semibold text-slate-900 dark:text-white">
              {apontamento.entrada}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400">Intervalo</p>
            <p className="font-semibold text-slate-900 dark:text-white">
              {apontamento.intervalo || 0} min
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400">Saída</p>
            <p className="font-semibold text-slate-900 dark:text-white">
              {apontamento.saida}
            </p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-600 text-center">
          <p className="text-xs text-slate-600 dark:text-slate-400">Total de Horas</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {apontamento.horas?.toFixed(2) || "0.00"} h
          </p>
        </div>
      </div>

      {/* Componentes de cálculo */}
      {memorias.map((memoria, idx) => (
        <div key={idx} className="bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-4">
          <h4 className="font-semibold text-slate-900 dark:text-white mb-3">
            {getTipoLabel(memoria.tipo)}
          </h4>

          <div className="space-y-2 mb-3">
            {memoria.componentes.map((comp, cidx) => (
              <div key={cidx} className="flex justify-between items-center text-sm">
                <div>
                  <p className="text-slate-700 dark:text-slate-300">
                    {comp.descricao}
                  </p>
                  {comp.quantidade !== undefined && comp.valor_unitario !== undefined && (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {comp.quantidade.toFixed(2)} × {formatarMoeda(comp.valor_unitario)}
                    </p>
                  )}
                </div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {formatarMoeda(comp.subtotal)}
                </p>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-600 flex justify-between items-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Subtotal {getTipoLabel(memoria.tipo)}
            </p>
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              {formatarMoeda(memoria.total)}
            </p>
          </div>

          {memoria.observacoes && (
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 italic">
              {memoria.observacoes}
            </p>
          )}
        </div>
      ))}

      {/* Resumo Final */}
      <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <p className="text-blue-800 dark:text-blue-200">Valor Bruto</p>
            <p className="font-semibold text-blue-900 dark:text-blue-100">
              {formatarMoeda(totalBruto)}
            </p>
          </div>

          <div className="flex justify-between items-center text-sm">
            <p className="text-blue-800 dark:text-blue-200">
              Descontos (Vale + Empréstimo + Adiantamento)
            </p>
            <p className="font-semibold text-red-600 dark:text-red-400">
              -{formatarMoeda(0)} {/* Seria preenchido com dados reais */}
            </p>
          </div>

          <div className="pt-2 border-t border-blue-200 dark:border-blue-700 flex justify-between items-center">
            <p className="font-semibold text-blue-900 dark:text-blue-100">Valor Final</p>
            <p className="text-lg font-bold text-blue-900 dark:text-blue-100">
              {formatarMoeda(apontamento.valor_total || totalBruto)}
            </p>
          </div>
        </div>
      </div>

      {apontamento.observacoes && (
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">
            Observações
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {apontamento.observacoes}
          </p>
        </div>
      )}
    </div>
  );
};

export default MemoriaCalculoDetalhada;
