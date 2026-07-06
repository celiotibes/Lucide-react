'use client';

import { useActionState } from 'react';
import { criarContrato, type EstadoFormularioContrato } from '../actions';

interface Imovel {
  id: string;
  identificacao: string;
}

const ESTADO_INICIAL: EstadoFormularioContrato = {};

export function FormularioContrato({ imoveis }: { imoveis: Imovel[] }) {
  const [estado, formAction, pendente] = useActionState(criarContrato, ESTADO_INICIAL);

  return (
    <form action={formAction} className="formulario">
      {estado.erro && <p className="erro-conexao">{estado.erro}</p>}

      <label>
        Imóvel
        <select name="imovel_id" required defaultValue="">
          <option value="" disabled>
            Selecione
          </option>
          {imoveis.map((i) => (
            <option key={i.id} value={i.id}>
              {i.identificacao}
            </option>
          ))}
        </select>
      </label>

      <label>
        Tipo de contrato
        <select name="tipo" required defaultValue="locacao_padrao">
          <option value="locacao_padrao">Locação padrão</option>
          <option value="temporada">Temporada</option>
        </select>
      </label>

      <label>
        Nome do locatário
        <input name="nome_locatario" placeholder="Maria Souza" required />
      </label>

      <label>
        CPF do locatário (opcional)
        <input name="cpf_locatario" placeholder="000.000.000-00" />
      </label>

      <label>
        Data de início
        <input name="data_inicio" type="date" required />
      </label>

      <label>
        Dia de vencimento
        <input name="dia_vencimento" type="number" min={1} max={31} defaultValue={10} required />
      </label>

      <label>
        Valor do aluguel (R$)
        <input name="valor_aluguel" type="number" min={0.01} step="0.01" required />
      </label>

      <button type="submit" disabled={pendente}>
        {pendente ? 'Salvando…' : 'Salvar contrato'}
      </button>
    </form>
  );
}
