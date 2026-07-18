// Pedido de chave reserva/cópia. O valor cobrado não é uma constante do
// sistema — vem da "Planilha de Taxas de Manutenção" de cada contrato
// (Anexo II do contrato de Florianópolis: chaveiro abertura/perda R$
// 140,00), gravada em contrato_tarifario_servicos (schema seção 26.2).
// Esta função só abre o chamado e informa o valor previsto — não emite
// cobrança: como no fluxo de lavanderia (docs/10, item pendente), a forma
// de cobrança (avulsa ou no próximo boleto) ainda depende do motor de
// cobrança avulsa, que não existe.

import type { Pool, PoolClient } from 'pg';
import { abrirChamado } from './abrirChamado';

const SERVICO_CHAVE_RESERVA = 'chaveiro_abertura_perda';

export interface SolicitarChaveReservaInput {
  pessoaId: string;
  imovelId: string;
  contratoId: string;
  motivo?: string;
}

export interface ResultadoSolicitarChaveReserva {
  ordemServicoId: string;
  protocolo: string;
  /** null quando o contrato ainda não tem essa tarifa cadastrada — o chamado abre do mesmo jeito, mas sem valor previsto para exibir. */
  valorPrevisto: number | null;
}

export async function solicitarChaveReserva(
  pool: Pool | PoolClient,
  input: SolicitarChaveReservaInput,
): Promise<ResultadoSolicitarChaveReserva> {
  const chamado = await abrirChamado(pool, {
    pessoaId: input.pessoaId,
    imovelId: input.imovelId,
    natureza: 'manutencao',
    categoria: 'chave_reserva_copia',
    descricao: input.motivo ?? 'Solicitação de chave reserva/cópia',
  });

  const { rows } = await pool.query<{ valor: string }>(
    `select valor from contrato_tarifario_servicos where contrato_id = $1 and servico = $2`,
    [input.contratoId, SERVICO_CHAVE_RESERVA],
  );

  return {
    ordemServicoId: chamado.ordemServicoId,
    protocolo: chamado.protocolo,
    valorPrevisto: rows.length > 0 ? Number(rows[0].valor) : null,
  };
}
