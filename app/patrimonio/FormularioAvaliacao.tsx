'use client';

import { useActionState } from 'react';
import { atualizarValorAvaliacao, type EstadoFormularioAvaliacao } from './actions';

const ESTADO_INICIAL: EstadoFormularioAvaliacao = {};

export function FormularioAvaliacao({ imovelId, valorAtual }: { imovelId: string; valorAtual: string | null }) {
  const [estado, formAction, pendente] = useActionState(atualizarValorAvaliacao, ESTADO_INICIAL);

  return (
    <form action={formAction} className="formulario-linha">
      <input type="hidden" name="imovel_id" value={imovelId} />
      <input
        name="valor_avaliacao"
        type="number"
        min={0}
        step="0.01"
        defaultValue={valorAtual ?? ''}
        placeholder="Não avaliado"
      />
      <button type="submit" disabled={pendente} className="botao-secundario">
        {pendente ? 'Salvando…' : 'Salvar'}
      </button>
      {estado.erro && <span className="erro-conexao">{estado.erro}</span>}
    </form>
  );
}
