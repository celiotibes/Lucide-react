// Valida que todo contrato locação_padrao ativo tem seguro-incêndio vigente
// (Art. 22, VII, Lei 8.245/91 — obrigatório para aluguéis).
//
// Roda como validação pré-ativação de contrato e como monitoramento diário
// para alertar quando apólice está próxima do vencimento.

import type { Pool } from 'pg';

export interface ContratosComGapDeSeguro {
  contratoId: string;
  imovelIdentificacao: string;
  motivo: 'sem_seguro' | 'seguro_expirado' | 'seguro_expira_30_dias';
}

export interface ResultadoValidacaoSeguro {
  gaps: ContratosComGapDeSeguro[];
}

interface LinhaContrato {
  id: string;
  imovel_identificacao: string;
  tipo: string;
  status: string;
  data_inicio: string;
  data_fim: string | null;
}

interface LinhaGarantia {
  id: string;
  tipo: string;
  data_vencimento_apolice: string | null;
}

export async function validarSeguroIncendioContratos(
  pool: Pool,
  dataReferencia: Date = new Date()
): Promise<ResultadoValidacaoSeguro> {
  const { rows: contratos } = await pool.query<LinhaContrato>(
    `select c.id, i.identificacao as imovel_identificacao, c.tipo, c.status, c.data_inicio, c.data_fim
     from contratos c
     join imoveis i on i.id = c.imovel_id
     where c.tipo = 'locacao_padrao'
       and c.status in ('ativo', 'aviso_previo')
       and c.data_inicio <= $1::date
       and (c.data_fim is null or c.data_fim >= $1::date)`,
    [formatarDataISO(dataReferencia)]
  );

  const gaps: ContratosComGapDeSeguro[] = [];

  for (const contrato of contratos) {
    const { rows: seguros } = await pool.query<LinhaGarantia>(
      `select id, tipo, data_vencimento_apolice
       from garantias
       where contrato_id = $1 and tipo = 'seguro_incendio'`,
      [contrato.id]
    );

    if (seguros.length === 0) {
      gaps.push({
        contratoId: contrato.id,
        imovelIdentificacao: contrato.imovel_identificacao,
        motivo: 'sem_seguro',
      });
      continue;
    }

    const seguroVigente = seguros.find((s) => {
      if (!s.data_vencimento_apolice) return false;
      const vencimento = new Date(s.data_vencimento_apolice);
      return vencimento >= dataReferencia;
    });

    if (!seguroVigente) {
      const todoExpirado = seguros.every((s) => {
        if (!s.data_vencimento_apolice) return false;
        const vencimento = new Date(s.data_vencimento_apolice);
        return vencimento < dataReferencia;
      });

      if (todoExpirado) {
        gaps.push({
          contratoId: contrato.id,
          imovelIdentificacao: contrato.imovel_identificacao,
          motivo: 'seguro_expirado',
        });
      }
      continue;
    }

    // Verificar se vence nos próximos 30 dias
    const dataLimite = new Date(dataReferencia);
    dataLimite.setDate(dataLimite.getDate() + 30);

    const vencimentoSeguro = new Date(seguroVigente.data_vencimento_apolice!);
    if (vencimentoSeguro <= dataLimite && vencimentoSeguro > dataReferencia) {
      gaps.push({
        contratoId: contrato.id,
        imovelIdentificacao: contrato.imovel_identificacao,
        motivo: 'seguro_expira_30_dias',
      });
    }
  }

  return { gaps };
}

export async function adicionarSeguroIncendio(
  pool: Pool,
  input: {
    contratoId: string;
    apoliceNumero: string;
    dataInicio: Date;
    dataVencimento: Date;
    valorCobertura: number;
  }
): Promise<{ id: string }> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into garantias (contrato_id, tipo, valor, data_inicio, data_vencimento_apolice, apolice_numero)
     values ($1, 'seguro_incendio', $2, $3, $4, $5)
     returning id`,
    [
      input.contratoId,
      input.valorCobertura,
      formatarDataISO(input.dataInicio),
      formatarDataISO(input.dataVencimento),
      input.apoliceNumero,
    ]
  );

  if (rows.length === 0) {
    throw new Error('Falha ao inserir seguro-incêndio');
  }

  return { id: rows[0].id };
}

function formatarDataISO(data: Date): string {
  return data.toISOString().slice(0, 10);
}
