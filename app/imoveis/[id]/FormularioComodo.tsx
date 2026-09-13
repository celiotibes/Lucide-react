'use client';

import { useActionState } from 'react';
import { criarComodo, type EstadoFormularioComodo } from './actions';

const ESTADO_INICIAL: EstadoFormularioComodo = {};

export function FormularioComodo({ imovelId }: { imovelId: string }) {
  const [estado, formAction, pendente] = useActionState(criarComodo, ESTADO_INICIAL);

  return (
    <form action={formAction} className="formulario">
      <input type="hidden" name="imovel_id" value={imovelId} />
      {estado.erro && <p className="erro-conexao">{estado.erro}</p>}

      <label>
        Identificação
        <input name="identificacao" placeholder="Quarto 1, Suíte A..." required />
      </label>

      <label>
        Área (m², opcional)
        <input name="area_m2" type="number" min={0} step="0.01" />
      </label>

      <label>
        Valor de referência do cômodo isolado (R$, opcional)
        <input name="valor_aluguel_referencia" type="number" min={0} step="0.01" />
      </label>

      <button type="submit" disabled={pendente}>
        {pendente ? 'Salvando…' : 'Adicionar cômodo'}
      </button>
    </form>
  );
}
