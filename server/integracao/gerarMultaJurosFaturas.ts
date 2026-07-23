// Gera faturas tipo='multa_juros' para encargos de atraso calculados pela
// régua de cobrança. Roda APÓS reguaCobranca atualizou valor_liquido das
// faturas vencidas — lê o delta entre valor_bruto e valor_liquido de cada
// fatura atrasada, e cria uma fatura separada com esse delta para cobrança
// adicional via Asaas.
//
// Racionalidade: emitirCobrancasPendentes só emite faturas 'aberta' sem
// cobranca_asaas (idempotência). Se apenas atualizássemos valor_liquido da
// fatura original após reguaCobranca adicionar juros/multa, a segunda emissão
// nunca pegaria a fatura (já tem cobranca_asaas). Criando uma fatura separada
// tipo='multa_juros', a cobrança dos encargos fica como uma nova linha na
// régua — inquilino vê itemizado: aluguel + multa/juros.

import type { Pool } from 'pg';

export interface ResultadoGeracaoMultaJuros {
  geradas: Array<{ faturaAlugelId: string; faturaMultaJurosId: string; valor: number }>;
  puladas: Array<{ faturaId: string; motivo: string }>;
}

interface LinhaFaturaAtrasada {
  id: string;
  contrato_id: string;
  imovel_id: string;
  valor_bruto: string;
  valor_liquido: string;
  vencimento: string;
}

export async function gerarMultaJurosFaturas(pool: Pool): Promise<ResultadoGeracaoMultaJuros> {
  const { rows: faturasAtrasadas } = await pool.query<LinhaFaturaAtrasada>(
    `select f.id, f.contrato_id, f.imovel_id, f.valor_bruto, f.valor_liquido, f.vencimento
     from faturas f
     where f.tipo = 'aluguel' and f.status = 'atrasada'
       and f.valor_liquido > f.valor_bruto
       and not exists (
         select 1 from faturas fm
         where fm.contrato_id = f.contrato_id
           and fm.tipo = 'multa_juros'
           and fm.referencia_fatura_id = f.id
       )
     order by f.vencimento`,
  );

  const geradas: ResultadoGeracaoMultaJuros['geradas'] = [];
  const puladas: ResultadoGeracaoMultaJuros['puladas'] = [];

  for (const fatura of faturasAtrasadas) {
    const valorEncargos = Number(fatura.valor_liquido) - Number(fatura.valor_bruto);

    if (valorEncargos <= 0) {
      puladas.push({
        faturaId: fatura.id,
        motivo: 'valor_encargos_zerado_ou_negativo',
      });
      continue;
    }

    try {
      const { rows: inserted } = await pool.query<{ id: string }>(
        `insert into faturas
           (contrato_id, imovel_id, competencia, tipo, valor_bruto, valor_liquido, vencimento, status)
         values ($1, $2, (select competencia from faturas where id = $3), 'multa_juros', $4, $4, $5, 'aberta')
         returning id`,
        [fatura.contrato_id, fatura.imovel_id, fatura.id, valorEncargos, fatura.vencimento],
      );

      const faturaMultaJurosId = inserted[0].id;
      geradas.push({
        faturaAlugelId: fatura.id,
        faturaMultaJurosId,
        valor: valorEncargos,
      });
    } catch (erro) {
      console.error(`Erro ao gerar fatura multa_juros para ${fatura.id}:`, erro);
      puladas.push({
        faturaId: fatura.id,
        motivo: 'erro_insercao',
      });
    }
  }

  return { geradas, puladas };
}
