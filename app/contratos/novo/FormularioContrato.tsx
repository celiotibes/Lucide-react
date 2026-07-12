'use client';

import { useActionState, useState } from 'react';
import { criarContrato, type EstadoFormularioContrato } from '../actions';

interface Imovel {
  id: string;
  identificacao: string;
}

const ESTADO_INICIAL: EstadoFormularioContrato = {};

export function FormularioContrato({ imoveis }: { imoveis: Imovel[] }) {
  const [estado, formAction, pendente] = useActionState(criarContrato, ESTADO_INICIAL);
  const [garantias, setGarantias] = useState<number[]>([]);
  const proximoId = garantias.length > 0 ? Math.max(...garantias) + 1 : 0;

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

      <h3>Locatário</h3>

      <label>
        Nome do locatário
        <input name="nome_locatario" placeholder="Maria Souza" required />
      </label>

      <label>
        CPF do locatário (opcional)
        <input name="cpf_locatario" placeholder="000.000.000-00" />
      </label>

      <label>
        RG do locatário (opcional)
        <input name="rg_locatario" placeholder="00.000.000-0" />
      </label>

      <label>
        Profissão do locatário (opcional)
        <input name="profissao_locatario" placeholder="Analista de Dados" />
      </label>

      <label>
        Estado civil do locatário (opcional)
        <select name="estado_civil_locatario" defaultValue="">
          <option value="">Não informado</option>
          <option value="solteiro">Solteiro(a)</option>
          <option value="casado">Casado(a)</option>
          <option value="divorciado">Divorciado(a)</option>
          <option value="viuvo">Viúvo(a)</option>
          <option value="uniao_estavel">União estável</option>
        </select>
      </label>

      <h3>Responsável financeiro solidário (opcional)</h3>
      <p className="aviso">
        Distinto de fiador — usado quando quem paga não é quem ocupa o imóvel (ex.: pai/responsável de estudante), sem o regime
        formal de fiança da Lei 8.245/91.
      </p>

      <label>
        Nome do responsável (deixe em branco se não houver)
        <input name="responsavel_nome" placeholder="Nome completo" />
      </label>

      <label>
        CPF do responsável (opcional)
        <input name="responsavel_cpf" placeholder="000.000.000-00" />
      </label>

      <label>
        RG do responsável (opcional)
        <input name="responsavel_rg" placeholder="00.000.000-0" />
      </label>

      <label>
        Profissão do responsável (opcional)
        <input name="responsavel_profissao" placeholder="Diretora, Empresa LTDA" />
      </label>

      <h3>Garantias</h3>
      <p className="aviso">
        Um contrato pode ter mais de uma garantia — ex.: uma caução para a locação e outra para o aditivo de comodato de bens
        móveis, cada uma com seu próprio valor.
      </p>

      <input type="hidden" name="garantias_count" value={garantias.length} />
      {garantias.map((idGarantia, indice) => (
        <fieldset key={idGarantia} className="bloco-repetivel">
          <legend>Garantia {indice + 1}</legend>
          <label>
            Tipo
            <select name={`garantia_${indice}_tipo`} defaultValue="caucao">
              <option value="caucao">Caução</option>
              <option value="fiador">Fiador</option>
              <option value="seguro_fianca">Seguro-fiança</option>
              <option value="titulo_capitalizacao">Título de capitalização</option>
              <option value="seguro_incendio">Seguro-incêndio</option>
            </select>
          </label>
          <label>
            Valor (R$)
            <input name={`garantia_${indice}_valor`} type="number" min={0.01} step="0.01" />
          </label>
          <label>
            Finalidade
            <select name={`garantia_${indice}_finalidade`} defaultValue="geral">
              <option value="geral">Geral</option>
              <option value="locacao">Locação</option>
              <option value="comodato">Comodato de bens móveis</option>
            </select>
          </label>
          <label>
            Forma de pagamento (opcional)
            <select name={`garantia_${indice}_forma_pagamento`} defaultValue="">
              <option value="">Não informado</option>
              <option value="pix">PIX</option>
              <option value="boleto">Boleto</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="parcelado">Parcelado</option>
            </select>
          </label>
          <label>
            Parcelas (se parcelado)
            <input name={`garantia_${indice}_parcelas`} type="number" min={1} />
          </label>
          <button
            type="button"
            className="botao-secundario"
            onClick={() => setGarantias((atual) => atual.filter((id) => id !== idGarantia))}
          >
            Remover garantia
          </button>
        </fieldset>
      ))}
      <button type="button" className="botao-secundario" onClick={() => setGarantias((atual) => [...atual, proximoId])}>
        + Adicionar garantia
      </button>

      <h3>Termos do contrato</h3>

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

      <label>
        Cláusulas adicionais / pedidos específicos (opcional)
        <textarea
          name="clausulas_adicionais"
          rows={4}
          placeholder="Um parágrafo por pedido — cada parágrafo vira uma cláusula própria no contrato gerado."
        />
      </label>

      <button type="submit" disabled={pendente}>
        {pendente ? 'Salvando…' : 'Salvar contrato'}
      </button>
    </form>
  );
}
