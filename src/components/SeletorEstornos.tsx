import { useId } from "react";
import type { TratamentoEstorno } from "../domain/erp/criterioBi";

interface Props {
  valor: TratamentoEstorno;
  onChange: (valor: TratamentoEstorno) => void;
  /** True quando "considerar" e "desconsiderar" estornos produzem números diferentes aqui. */
  divergente: boolean;
}

/**
 * Seletor discreto do critério de estornos nas telas de BI. Padrão = "considerar" (comportamento
 * histórico: soma o razão como está). "Desconsiderar" exclui o par estornado+estornador, o mesmo
 * critério das views v_bi_*. Só altera a leitura; nenhum dado é gravado.
 */
export function SeletorEstornos({ valor, onChange, divergente }: Props) {
  const id = useId();
  return (
    <div className="text-sm">
      <label htmlFor={id} className="text-gray-600 mr-2">
        Estornos:
      </label>
      <select
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value === "liquido" ? "liquido" : "bruto")}
        className="px-2 py-1 border rounded"
      >
        <option value="bruto">considerar</option>
        <option value="liquido">desconsiderar</option>
      </select>
      {divergente && (
        <p role="status" className="mt-1 text-amber-700">
          Atenção: há estornos que alteram estes números. Trocar o critério muda os valores exibidos
          {valor === "bruto" ? " (hoje: estornos considerados)." : " (hoje: estornos desconsiderados)."}
        </p>
      )}
    </div>
  );
}
