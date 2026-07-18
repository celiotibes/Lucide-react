// Elo entre os contratos ativos (`contratos`, `contrato_componentes_mensais`)
// e o cálculo puro do valor mensal (`server/financeiro/valorMensalContrato.ts`):
// para cada contrato `locacao_padrao` ativo e cada mês de competência, gera a
// fatura tipo 'aluguel' que ainda não existe.
//
// Duas situações distintas, a mesma origem de dado:
//   - Mês de início do contrato: usa `server/financeiro/prorata.ts` sobre o
//     valor mensal TOTAL (aluguel + componentes) — nenhum contrato real
//     analisado até aqui distingue pró-rata de aluguel vs. pró-rata de
//     comodato/vaga, então o total inteiro é prorateado (mesma base de 30
//     dias, confirmada por 4 contratos independentes — docs/10, docs/11).
//     Ainda não confirmado por contrato real se `repassado_variavel`
//     (IPTU/condomínio) também deveria ser prorateado ou cobrado cheio no
//     primeiro mês — assumido prorateado junto por consistência, documentado
//     como decisão a revisar se um contrato real mostrar o contrário.
//   - Meses seguintes: valor mensal total cheio, sem pró-rata.
//
// Vencimento sempre no dia `contratos.dia_vencimento` do mês SEGUINTE ao de
// competência — mesma regra já usada em `prorata.ts` (evidência do contrato
// real da Kitnet 16) e em `faturarEnergia.ts`, aplicada aqui de forma
// consistente às faturas de aluguel também.
//
// Contratos com componente `repassado_variavel` sem valor lançado para o mês
// (`contrato_componente_valores_mensais`) são PULADOS, não faturados sem o
// dado — mesmo princípio de `faturarEnergia.ts`. Contratos `temporada` não
// são tratados aqui (modelo de cobrança por diária/reserva, fora do escopo
// deste gerador de fatura mensal recorrente).

import type { Pool } from 'pg';
import { calcularProrata } from '../financeiro/prorata';
import { calcularValorMensalContrato, type ComponenteMensal } from '../financeiro/valorMensalContrato';

export interface ResultadoFaturaMensal {
  contratoId: string;
  faturaId: string;
  valorTotal: number;
  eraPrimeiraFatura: boolean;
}

export interface ContratoPulado {
  contratoId: string;
  motivo: 'componente_repassado_sem_valor_do_mes';
  componentesFaltantes: string[];
}

export interface ResultadoGeracaoFaturaMensal {
  geradas: ResultadoFaturaMensal[];
  puladas: ContratoPulado[];
}

interface LinhaContrato {
  id: string;
  imovel_id: string;
  data_inicio: string;
  dia_vencimento: number;
  valor_aluguel: string;
}

interface LinhaComponente {
  id: string;
  contrato_id: string;
  tipo: string;
  descricao: string | null;
  natureza: 'valor_fixo' | 'percentual_do_aluguel' | 'repassado_variavel';
  valor_fixo: string | null;
  percentual: string | null;
  valor_repassado_mes: string | null;
}

export async function gerarFaturaMensal(pool: Pool, competencia: Date): Promise<ResultadoGeracaoFaturaMensal> {
  const competenciaISO = formatarPrimeiroDiaDoMes(competencia);

  const { rows: contratos } = await pool.query<LinhaContrato>(
    `select c.id, c.imovel_id, c.data_inicio, c.dia_vencimento, c.valor_aluguel
     from contratos c
     where c.tipo = 'locacao_padrao'
       and c.status = 'ativo'
       and c.data_inicio <= (($1::date + interval '1 month') - interval '1 day')
       and (c.data_fim is null or c.data_fim >= $1::date)
       and not exists (
         select 1 from faturas f
         where f.contrato_id = c.id and f.tipo = 'aluguel' and f.competencia = $1::date
       )
     order by c.id`,
    [competenciaISO],
  );

  const geradas: ResultadoFaturaMensal[] = [];
  const puladas: ContratoPulado[] = [];

  for (const contrato of contratos) {
    const { rows: componenteRows } = await pool.query<LinhaComponente>(
      `select cm.id, cm.contrato_id, cm.tipo, cm.descricao, cm.natureza, cm.valor_fixo, cm.percentual,
              cv.valor as valor_repassado_mes
       from contrato_componentes_mensais cm
       left join contrato_componente_valores_mensais cv
         on cv.componente_id = cm.id and cv.competencia = $2::date
       where cm.contrato_id = $1
       order by cm.criado_em`,
      [contrato.id, competenciaISO],
    );

    const componentes: ComponenteMensal[] = componenteRows.map((c) => ({
      tipo: c.tipo,
      descricao: c.descricao,
      natureza: c.natureza,
      valorFixo: c.valor_fixo == null ? null : Number(c.valor_fixo),
      percentual: c.percentual == null ? null : Number(c.percentual),
      valorRepassadoMes: c.valor_repassado_mes == null ? null : Number(c.valor_repassado_mes),
    }));

    const calculo = calcularValorMensalContrato(Number(contrato.valor_aluguel), componentes);

    if (calculo.faltantes.length > 0) {
      puladas.push({
        contratoId: contrato.id,
        motivo: 'componente_repassado_sem_valor_do_mes',
        componentesFaltantes: calculo.faltantes.map((f) => f.tipo),
      });
      continue;
    }

    const dataInicio = new Date(contrato.data_inicio);
    const ehPrimeiraFatura =
      dataInicio.getUTCFullYear() === competencia.getUTCFullYear() && dataInicio.getUTCMonth() === competencia.getUTCMonth();

    let valorFatura = calculo.valorTotal;
    let vencimento: Date;
    let itensParaGravar = calculo.itens;

    if (ehPrimeiraFatura) {
      const prorata = calcularProrata({
        dataInicio,
        valorAluguelMensal: calculo.valorTotal,
        diaVencimento: contrato.dia_vencimento,
      });
      valorFatura = prorata.valorProrata;
      vencimento = prorata.dataVencimentoPrimeiraFatura;
      // Mês pró-rata: um único item, não o detalhamento do mês cheio — os
      // itens de `calculo.itens` (aluguel + componentes no valor integral)
      // não somariam `valorFatura` (parcial), e escalar cada item
      // proporcionalmente inventaria uma regra de rateio interno (aluguel
      // vs. comodato vs. repassado) que nenhum contrato real confirmou.
      itensParaGravar = [{ descricao: `Aluguel (pró-rata, ${prorata.diasCobertos} dias)`, valor: valorFatura }];
    } else {
      vencimento = calcularVencimentoMesSeguinte(competenciaISO, contrato.dia_vencimento);
    }

    // ON CONFLICT (não só o `not exists` do filtro acima) porque a
    // seleção de contratos elegíveis e este insert não estão na mesma
    // transação: duas execuções concorrentes deste job (ou um retry
    // sobreposto) poderiam passar as duas pelo `not exists` antes de
    // qualquer uma commitar. O índice único parcial
    // `uq_faturas_aluguel_por_contrato_competencia` é quem de fato
    // impede a fatura duplicada; isto só evita que a segunda execução
    // trate a corrida como erro.
    const { rows: faturaRows } = await pool.query<{ id: string }>(
      `insert into faturas (contrato_id, imovel_id, competencia, tipo, valor_bruto, valor_liquido, vencimento)
       values ($1, $2, $3, 'aluguel', $4, $4, $5)
       on conflict (contrato_id, competencia) where tipo = 'aluguel' do nothing
       returning id`,
      [contrato.id, contrato.imovel_id, competenciaISO, valorFatura, formatarDataISO(vencimento)],
    );
    if (faturaRows.length === 0) {
      continue; // outra execução concorrente já gerou esta fatura primeiro
    }
    const faturaId = faturaRows[0].id;

    for (const item of itensParaGravar) {
      await pool.query(`insert into fatura_itens (fatura_id, descricao, valor) values ($1, $2, $3)`, [
        faturaId,
        item.descricao,
        item.valor,
      ]);
    }

    geradas.push({ contratoId: contrato.id, faturaId, valorTotal: valorFatura, eraPrimeiraFatura: ehPrimeiraFatura });
  }

  return { geradas, puladas };
}

function formatarPrimeiroDiaDoMes(data: Date): string {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function formatarDataISO(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function calcularVencimentoMesSeguinte(competenciaISO: string, diaVencimento: number): Date {
  const [ano, mes] = competenciaISO.split('-').map(Number);
  return new Date(Date.UTC(ano, mes, diaVencimento)); // mes já 1-indexado aqui -> mês seguinte em UTC 0-indexado
}
