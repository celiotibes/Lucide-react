'use client';

import { useActionState } from 'react';
import { criarFinanciamento, type EstadoFormularioFinanciamento } from './actions';

interface Imovel {
  id: string;
  identificacao: string;
}

const ESTADO_INICIAL: EstadoFormularioFinanciamento = {};

export function FormularioFinanciamento({ imoveis }: { imoveis: Imovel[] }) {
  const [estado, formAction, pendente] = useActionState(criarFinanciamento, ESTADO_INICIAL);

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
        Tipo
        <select name="tipo" required defaultValue="financiamento_bancario">
          <option value="financiamento_bancario">Financiamento bancário</option>
          <option value="consorcio_hipoteca">Consórcio com hipoteca</option>
        </select>
      </label>

      <label>
        Instituição (opcional)
        <input name="instituicao" placeholder="Caixa, Bradesco, administradora do consórcio..." />
      </label>

      <label>
        Valor financiado (opcional)
        <input name="valor_financiado" type="number" min={0} step="0.01" />
      </label>

      <label>
        Valor da parcela (R$)
        <input name="valor_parcela" type="number" min={0} step="0.01" required />
      </label>

      <label>
        Saldo devedor atual (opcional)
        <input name="saldo_devedor" type="number" min={0} step="0.01" />
      </label>

      <label>
        Data de início (opcional)
        <input name="data_inicio" type="date" />
      </label>

      <label>
        Número de parcelas (opcional)
        <input name="numero_parcelas" type="number" min={1} />
      </label>

      <label>
        Observação (opcional)
        <textarea name="observacao" rows={2} />
      </label>

      <button type="submit" disabled={pendente}>
        {pendente ? 'Salvando…' : 'Registrar financiamento'}
      </button>
    </form>
  );
}
