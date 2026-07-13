'use client';

import { useActionState } from 'react';
import { criarImovel, type EstadoFormularioImovel } from '../actions';

interface Opcao {
  id: string;
  nome: string;
}

const ESTADO_INICIAL: EstadoFormularioImovel = {};

export function FormularioImovel({ cidades, residenciais }: { cidades: Opcao[]; residenciais: Opcao[] }) {
  const [estado, formAction, pendente] = useActionState(criarImovel, ESTADO_INICIAL);

  return (
    <form action={formAction} className="formulario">
      {estado.erro && <p className="erro-conexao">{estado.erro}</p>}

      <label>
        Identificação
        <input name="identificacao" placeholder="Kitnet 14" required />
      </label>

      <label>
        Tipo
        <select name="tipo" required defaultValue="">
          <option value="" disabled>
            Selecione
          </option>
          <option value="kitnet">Kitnet</option>
          <option value="apartamento">Apartamento</option>
          <option value="sala_comercial">Sala comercial</option>
          <option value="casa">Casa</option>
        </select>
      </label>

      <label>
        Cidade
        <select name="cidade_id" required defaultValue="">
          <option value="" disabled>
            Selecione
          </option>
          {cidades.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>

      <label>
        Residencial (opcional)
        <select name="residencial_id" defaultValue="">
          <option value="">Nenhum (imóvel avulso)</option>
          {residenciais.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
            </option>
          ))}
        </select>
      </label>

      <label>
        Endereço (opcional)
        <input name="endereco" placeholder="Rua, número, bairro, cidade" />
      </label>

      <label className="rotulo-checkbox">
        <input name="permite_coliving" type="checkbox" />
        Permite co-living (locação por cômodo)
      </label>

      <label>
        Valor de avaliação (R$, opcional)
        <input name="valor_avaliacao" type="number" min={0} step="0.01" />
      </label>

      <button type="submit" disabled={pendente}>
        {pendente ? 'Salvando…' : 'Salvar imóvel'}
      </button>
    </form>
  );
}
