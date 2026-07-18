'use client';

import { useActionState } from 'react';
import { calcularAuditoria, type EstadoCalculoAuditoria } from './actions';

interface Residencial {
  id: string;
  nome: string;
}

const ESTADO_INICIAL: EstadoCalculoAuditoria = {};

export function FormularioCalcularAuditoria({ residenciais }: { residenciais: Residencial[] }) {
  const [estado, formAction, pendente] = useActionState(calcularAuditoria, ESTADO_INICIAL);

  return (
    <form action={formAction} className="formulario-linha">
      {estado.erro && <p className="erro-conexao">{estado.erro}</p>}
      {estado.mensagem && <p className="aviso">{estado.mensagem}</p>}

      <select name="residencial_id" required defaultValue="">
        <option value="" disabled>
          Residencial
        </option>
        {residenciais.map((r) => (
          <option key={r.id} value={r.id}>
            {r.nome}
          </option>
        ))}
      </select>

      <input name="competencia" type="month" required />

      <button type="submit" disabled={pendente}>
        {pendente ? 'Calculando…' : 'Calcular'}
      </button>
    </form>
  );
}
