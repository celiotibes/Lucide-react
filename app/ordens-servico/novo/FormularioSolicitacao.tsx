'use client';

import { useActionState, useState } from 'react';
import { criarSolicitacao, type EstadoFormularioSolicitacao } from '../actions';

interface ContratoOpcao {
  id: string;
  imovel: string;
  locatario: string;
}

const ESTADO_INICIAL: EstadoFormularioSolicitacao = {};

export function FormularioSolicitacao({ contratos }: { contratos: ContratoOpcao[] }) {
  const [estado, formAction, pendente] = useActionState(criarSolicitacao, ESTADO_INICIAL);
  const [tipo, setTipo] = useState('geral');

  return (
    <form action={formAction} className="formulario">
      {estado.erro && <p className="erro-conexao">{estado.erro}</p>}

      <label>
        Imóvel / locatário
        <select name="contrato_id" required defaultValue="">
          <option value="" disabled>
            Selecione
          </option>
          {contratos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.imovel} — {c.locatario}
            </option>
          ))}
        </select>
      </label>

      <label>
        Tipo de solicitação
        <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="geral">Chamado geral</option>
          <option value="chave_reserva">Chave reserva / cópia</option>
          <option value="imagens_cameras">Imagens de câmera de segurança</option>
          <option value="internet_particular">Autorização de internet particular</option>
        </select>
      </label>

      {tipo === 'geral' && (
        <>
          <label>
            Natureza
            <select name="natureza" required defaultValue="">
              <option value="" disabled>
                Selecione
              </option>
              <option value="emergencia">Emergência</option>
              <option value="financeiro">Financeiro</option>
              <option value="contratual">Contratual</option>
              <option value="manutencao">Manutenção</option>
              <option value="juridico">Jurídico</option>
            </select>
          </label>

          <label>
            Categoria
            <input name="categoria" placeholder="ex.: vazamento_hidraulico" required />
          </label>

          <label>
            Descrição (opcional)
            <textarea name="descricao" rows={3} />
          </label>

          <label>
            Urgência
            <select name="urgencia" defaultValue="media">
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </label>
        </>
      )}

      {tipo === 'chave_reserva' && (
        <label>
          Motivo (opcional)
          <textarea name="motivo" rows={3} placeholder="Perda, cópia adicional, etc." />
        </label>
      )}

      {tipo === 'imagens_cameras' && (
        <>
          <p className="aviso">
            O Anexo III do contrato de Florianópolis veda esse pedido por inquilino, exceto sob ordem judicial ou policial — o
            chamado é sempre encaminhado ao jurídico para análise, nunca liberado automaticamente.
          </p>
          <label>
            Data da gravação pedida
            <input name="data_solicitada" type="date" required />
          </label>
          <label>
            Horário
            <input name="horario_solicitado" type="time" required />
          </label>
          <label>
            Justificativa
            <textarea name="justificativa" rows={3} required />
          </label>
        </>
      )}

      {tipo === 'internet_particular' && (
        <label>
          Provedor pretendido (opcional)
          <input name="provedor_pretendido" placeholder="ex.: Vivo Fibra" />
        </label>
      )}

      <button type="submit" disabled={pendente}>
        {pendente ? 'Enviando…' : 'Abrir solicitação'}
      </button>
    </form>
  );
}
