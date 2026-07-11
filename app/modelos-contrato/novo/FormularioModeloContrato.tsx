'use client';

import { useActionState } from 'react';
import { criarModeloContrato, type EstadoFormularioModeloContrato } from '../actions';

interface Cidade {
  id: string;
  nome: string;
  uf: string;
}

const ESTADO_INICIAL: EstadoFormularioModeloContrato = {};

export function FormularioModeloContrato({ cidades }: { cidades: Cidade[] }) {
  const [estado, formAction, pendente] = useActionState(criarModeloContrato, ESTADO_INICIAL);

  return (
    <form action={formAction} className="formulario formulario--largo">
      {estado.erro && <p className="erro-conexao">{estado.erro}</p>}

      <label>
        Cidade
        <select name="cidade_id" required defaultValue="">
          <option value="" disabled>
            Selecione
          </option>
          {cidades.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}/{c.uf}
            </option>
          ))}
        </select>
      </label>

      <label>
        Categoria
        <select name="categoria" required defaultValue="geral">
          <option value="geral">Geral (um único modelo para toda a cidade)</option>
          <option value="residencial">Residencial</option>
          <option value="comercial">Comercial</option>
        </select>
      </label>

      <p className="section-hint">
        &quot;Geral&quot; é o padrão de Florianópolis, onde as kitnets são homogêneas o bastante para um único modelo.
        Cidades com imóveis heterogêneos (ex.: Curitiba) devem cadastrar &quot;Residencial&quot; e &quot;Comercial&quot;
        separadamente — cada categoria mantém sua própria versão ativa.
      </p>

      <label>
        Nome do modelo
        <input name="nome" placeholder="Modelo padrão — locação residencial" required />
      </label>

      <label>
        Corpo HTML
        <textarea name="corpo_html" className="corpo-html" rows={22} required placeholder="<style>...</style>&#10;<div>...</div>" />
      </label>

      <button type="submit" disabled={pendente}>
        {pendente ? 'Salvando…' : 'Salvar modelo (fica ativo imediatamente)'}
      </button>
    </form>
  );
}
