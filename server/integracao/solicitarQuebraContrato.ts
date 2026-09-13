// Pedido de quebra de contrato com cálculo automático de multa
// rescisória — item do pedido original do portal do inquilino. Calcula
// quando existe fórmula evidenciada (Florianópolis: cláusula 11.2 +
// bonificação de dezembro do Anexo I, `server/financeiro/
// multaRescisoria.ts`) e abre o chamado sinalizando que não há cálculo
// automático quando não existe (Curitiba: 3 contratos reais, 3 fórmulas
// diferentes, docs/11 — nunca um número adivinhado). Em ambos os casos,
// a decisão final é sempre da gestão (`status = 'em_analise'`) — o
// cálculo é insumo, não aprovação automática.

import type { Pool } from 'pg';
import { calcularMultaRescisoria } from '../financeiro/multaRescisoria';
import { abrirChamado } from './abrirChamado';

export interface SolicitarQuebraContratoInput {
  pessoaId: string;
  contratoId: string;
  dataRescisaoDesejada: string; // 'YYYY-MM-DD'
  dataNotificacao: string; // 'YYYY-MM-DD'
}

export interface ResultadoSolicitarQuebraContrato {
  ordemServicoId: string;
  protocolo: string;
  /** null quando a cidade do contrato ainda não tem fórmula de multa codificada. */
  multaCalculada: number | null;
  faixaBonificacao: string | null;
}

export class SolicitacaoQuebraContratoInvalidaError extends Error {}

const CIDADES_COM_FORMULA_CODIFICADA = new Set(['Florianópolis']);

export async function solicitarQuebraContrato(
  pool: Pool,
  input: SolicitarQuebraContratoInput,
): Promise<ResultadoSolicitarQuebraContrato> {
  const { rows } = await pool.query<{
    imovel_id: string;
    valor_aluguel: string;
    data_inicio: string;
    data_fim: string | null;
    cidade_nome: string;
  }>(
    `select c.imovel_id, c.valor_aluguel, c.data_inicio, c.data_fim, cid.nome as cidade_nome
     from contratos c
     join imoveis i on i.id = c.imovel_id
     join cidades cid on cid.id = i.cidade_id
     where c.id = $1`,
    [input.contratoId],
  );
  if (rows.length === 0) {
    throw new SolicitacaoQuebraContratoInvalidaError(`Contrato ${input.contratoId} não encontrado`);
  }
  const contrato = rows[0];
  if (!contrato.data_fim) {
    throw new SolicitacaoQuebraContratoInvalidaError('Contrato sem data de término definida — não é possível calcular a multa proporcional');
  }

  let multaCalculada: number | null = null;
  let faixaBonificacao: string | null = null;

  if (CIDADES_COM_FORMULA_CODIFICADA.has(contrato.cidade_nome)) {
    const resultado = calcularMultaRescisoria({
      valorMensal: Number(contrato.valor_aluguel),
      dataInicioContrato: new Date(contrato.data_inicio),
      dataFimContrato: new Date(contrato.data_fim),
      dataRescisao: new Date(input.dataRescisaoDesejada),
      dataNotificacao: new Date(input.dataNotificacao),
    });
    multaCalculada = resultado.multaFinal;
    faixaBonificacao = resultado.faixaBonificacao;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const chamado = await abrirChamado(client, {
      pessoaId: input.pessoaId,
      imovelId: contrato.imovel_id,
      natureza: 'contratual',
      categoria: 'quebra_contrato',
      descricao:
        multaCalculada !== null
          ? `Pedido de quebra de contrato — multa calculada: R$ ${multaCalculada.toFixed(2)}`
          : `Pedido de quebra de contrato — sem fórmula de multa codificada para ${contrato.cidade_nome}, cálculo manual pela gestão`,
    });

    await client.query(
      `insert into solicitacoes_quebra_contrato
         (ordem_servico_id, contrato_id, data_rescisao_desejada, data_notificacao, multa_calculada, faixa_bonificacao)
       values ($1, $2, $3, $4, $5, $6)`,
      [chamado.ordemServicoId, input.contratoId, input.dataRescisaoDesejada, input.dataNotificacao, multaCalculada, faixaBonificacao],
    );

    await client.query('COMMIT');

    return {
      ordemServicoId: chamado.ordemServicoId,
      protocolo: chamado.protocolo,
      multaCalculada,
      faixaBonificacao,
    };
  } catch (erro) {
    await client.query('ROLLBACK');
    throw erro;
  } finally {
    client.release();
  }
}
