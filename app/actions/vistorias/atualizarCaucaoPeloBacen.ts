'use server';

import { obterPool } from '@/server/integracao/db';
import { calcularCaucaoAtualizada } from '@/server/vistorias/integracao-bacen';

interface ResultadoAtualizacaoCaucao {
  success: boolean;
  caucaoValorOriginal?: number;
  caucaoValorAtualizado?: number;
  percentualVariacao?: number;
  dataInicio?: string;
  dataFim?: string;
  mensagem?: string;
  erro?: string;
}

/**
 * Atualiza a caução de um contrato usando a série IPCA do Banco Central.
 * Busca o valor original da caução no banco de dados e calcula o rendimento
 * até a data da vistoria de saída.
 */
export async function atualizarCaucaoPeloBacen(
  vistoriaSaidaId: string
): Promise<ResultadoAtualizacaoCaucao> {
  try {
    const pool = obterPool();

    // 1. Buscar vistoria de saída e contrato
    const vistoriaResult = await pool.query(
      `select v.id, v.contrato_id, v.data, c.data_inicio
       from vistorias v
       join contratos c on c.id = v.contrato_id
       where v.id = $1 and v.modo = 'saida'`,
      [vistoriaSaidaId]
    );

    if (vistoriaResult.rows.length === 0) {
      return {
        success: false,
        erro: 'Vistoria de saída não encontrada',
      };
    }

    const vistoria = vistoriaResult.rows[0];
    const dataVistoria = vistoria.data.toISOString().split('T')[0];
    const dataContratoInicio = vistoria.data_inicio.toISOString().split('T')[0];

    // 2. Buscar caução original do contrato
    const caucaoResult = await pool.query(
      `select valor, data_deposito from garantias
       where contrato_id = $1 and tipo = 'caucao'
       order by data_deposito desc
       limit 1`,
      [vistoria.contrato_id]
    );

    if (caucaoResult.rows.length === 0) {
      return {
        success: false,
        erro: 'Nenhuma caução encontrada para este contrato',
      };
    }

    const caucao = caucaoResult.rows[0];
    const caucaoOriginal = caucao.valor;
    const dataDepositoCaucao = caucao.data_deposito.toISOString().split('T')[0];

    // 3. Calcular caução atualizada pelo IPCA
    const resultado = await calcularCaucaoAtualizada(
      caucaoOriginal,
      dataDepositoCaucao,
      dataVistoria
    );

    if (!resultado) {
      return {
        success: false,
        erro: 'Falha ao calcular caução atualizada (dados do BACEN indisponíveis)',
      };
    }

    // 4. Armazenar resultado em itens_fechamento
    // Nota: o fechamento completo é gerado via gerarFechamentoContrato,
    // mas aqui persistimos a caução para referência
    const metadados = JSON.stringify({
      indice: 'IPCA',
      dataInicio: resultado.periodo.dataInicio,
      dataFim: resultado.periodo.dataFim,
      valorInicio: resultado.periodo.valorInicio,
      valorFim: resultado.periodo.valorFim,
      percentualVariacao: resultado.periodo.percentualVariacao,
    });

    await pool.query(
      `insert into itens_fechamento (id, fechamento_id, descricao, tipo, origem, valor, metadados)
       select $2, fc.id, $3, $4, $5, $6, $7
       from fechamentos_contrato fc
       where fc.vistoria_saida_id = $1`,
      [
        vistoriaSaidaId,
        `caucao-${vistoriaSaidaId}-${Date.now()}`,
        `Caução atualizada pelo IPCA (${(resultado.periodo.percentualVariacao).toFixed(2)}%)`,
        'credito',
        'caucao',
        resultado.valor,
        metadados,
      ]
    );

    return {
      success: true,
      caucaoValorOriginal: caucaoOriginal,
      caucaoValorAtualizado: Math.round(resultado.valor * 100) / 100,
      percentualVariacao: resultado.periodo.percentualVariacao,
      dataInicio: resultado.periodo.dataInicio,
      dataFim: resultado.periodo.dataFim,
      mensagem: `Caução atualizada com sucesso. Valor original: R$ ${(caucaoOriginal).toFixed(2)}, Valor atualizado: R$ ${(resultado.valor).toFixed(2)}`,
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return {
      success: false,
      erro: mensagem,
    };
  }
}
