'use client';

import { useActionState } from 'react';
import { criarAndamento, type EstadoFormularioAndamento } from './actions';

interface Prestador {
  id: string;
  nome: string;
}

const ESTADO_INICIAL: EstadoFormularioAndamento = {};

const RUBRICA_TIPO: Record<string, string> = {
  atribuida: 'Atribuída a um prestador',
  a_caminho: 'Prestador a caminho',
  iniciada: 'Execução iniciada',
  pausada: 'Execução pausada',
  material_pendente: 'Aguardando material',
  retomada: 'Execução retomada',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
  comentario: 'Comentário',
};

export function FormularioAndamento({ ordemServicoId, prestadores }: { ordemServicoId: string; prestadores: Prestador[] }) {
  const [estado, formAction, pendente] = useActionState(criarAndamento, ESTADO_INICIAL);

  return (
    <form action={formAction} className="formulario">
      <input type="hidden" name="ordem_servico_id" value={ordemServicoId} />
      {estado.erro && <p className="erro-conexao">{estado.erro}</p>}

      <label>
        Tipo de andamento
        <select name="tipo" required defaultValue="">
          <option value="" disabled>
            Selecione
          </option>
          {Object.entries(RUBRICA_TIPO).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>
      </label>

      <label>
        Prestador (só necessário ao atribuir)
        <select name="prestador_id" defaultValue="">
          <option value="">Não alterar</option>
          {prestadores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </label>

      <label>
        Descrição (opcional)
        <textarea name="descricao" rows={3} />
      </label>

      <button type="submit" disabled={pendente}>
        {pendente ? 'Registrando…' : 'Registrar andamento'}
      </button>
    </form>
  );
}
