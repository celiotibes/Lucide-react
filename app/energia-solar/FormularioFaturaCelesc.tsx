'use client';

import { useActionState } from 'react';
import { criarFaturaCelesc, type EstadoFormularioFaturaCelesc } from './actions';

interface Residencial {
  id: string;
  nome: string;
}

const ESTADO_INICIAL: EstadoFormularioFaturaCelesc = {};

export function FormularioFaturaCelesc({ residenciais }: { residenciais: Residencial[] }) {
  const [estado, formAction, pendente] = useActionState(criarFaturaCelesc, ESTADO_INICIAL);

  return (
    <form action={formAction} className="formulario">
      {estado.erro && <p className="erro-conexao">{estado.erro}</p>}

      <label>
        Residencial
        <select name="residencial_id" required defaultValue="">
          <option value="" disabled>
            Selecione
          </option>
          {residenciais.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
            </option>
          ))}
        </select>
      </label>

      <label>
        Competência
        <input name="competencia" type="month" required />
      </label>

      <label>
        Valor total da fatura (R$)
        <input name="valor_total" type="number" min={0} step="0.01" required />
      </label>

      <label>
        Energia injetada (kWh)
        <input name="energia_injetada_kwh" type="number" min={0} step="0.01" required />
      </label>

      <label>
        Energia consumida da rede (kWh)
        <input name="energia_consumida_rede_kwh" type="number" min={0} step="0.01" required />
      </label>

      <button type="submit" disabled={pendente}>
        {pendente ? 'Salvando…' : 'Lançar fatura'}
      </button>
    </form>
  );
}
