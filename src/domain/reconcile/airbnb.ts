import type { Database } from "sql.js";
import { consultar } from "../../db/connection";

const CODIGO_RECEITA_AIRBNB = "1.2.01";

export interface MesSemReceitaAirbnb {
  contratoId: number;
  imovelId: number;
  imovelApelido: string;
  locatario: string;
  mesReferencia: string; // YYYY-MM
}

/** Contratos 'airbnb_temporada' não têm dia_vencimento nem valor mensal fixo (reserva por
 * reserva, valor variável) — não dá para gerar "competência esperada" com tolerância de
 * valor/data como se faz para 'residencial_fixo' (ver gerarCompetencias/conciliar em
 * reconcile/contratos.ts, usado só para esse tipo). Até esta função, um contrato Airbnb era
 * cadastrável mas não tinha NENHUMA verificação dedicada — a receita só caía no DRE
 * genérico, sem cruzamento nenhum contra o cadastro do contrato (achado de auditoria de
 * completude).
 *
 * O que dá para verificar sem inventar dado: se o contrato está vigente num mês e nenhuma
 * transação de receita Airbnb (1.2.01) foi lançada para aquele imóvel naquele mês, é sinal de
 * repasse da plataforma ainda não importado ou lançado sem categoria — mesmo espírito de
 * detectarLacunasMensais (auditoriaForense.ts), mas aplicado a RECEITA em vez de despesa
 * recorrente. Não afirma "devia ter recebido X" (não há valor de referência confiável por mês
 * numa locação por temporada) — só que o mês está mudo. */
export function detectarMesesSemReceitaAirbnb(db: Database, dataInicio: string, dataFim: string): MesSemReceitaAirbnb[] {
  const contratos = consultar<{ id: number; imovel_id: number; locatario: string; data_inicio: string; data_fim: string | null; apelido: string }>(
    db,
    `SELECT c.id, c.imovel_id, c.locatario, c.data_inicio, c.data_fim, i.apelido
     FROM contratos_locacao c JOIN imoveis i ON i.id = c.imovel_id
     WHERE c.tipo = 'airbnb_temporada'`,
  );

  const resultado: MesSemReceitaAirbnb[] = [];
  for (const contrato of contratos) {
    const inicioJanela = contrato.data_inicio > dataInicio ? contrato.data_inicio : dataInicio;
    const fimJanela = contrato.data_fim && contrato.data_fim < dataFim ? contrato.data_fim : dataFim;
    if (inicioJanela > fimJanela) continue;

    const mesesComReceita = new Set(
      consultar<{ mes: string }>(
        db,
        `SELECT DISTINCT substr(data, 1, 7) AS mes FROM transacoes
         WHERE imovel_id = ? AND plano_conta_codigo = ? AND data BETWEEN ? AND ?`,
        [contrato.imovel_id, CODIGO_RECEITA_AIRBNB, inicioJanela, fimJanela],
      ).map((r) => r.mes),
    );

    const cursor = new Date(inicioJanela.slice(0, 8) + "01" + "T00:00:00");
    const fim = new Date(fimJanela + "T00:00:00");
    while (cursor <= fim) {
      const chave = cursor.toISOString().slice(0, 7);
      if (!mesesComReceita.has(chave)) {
        resultado.push({ contratoId: contrato.id, imovelId: contrato.imovel_id, imovelApelido: contrato.apelido, locatario: contrato.locatario, mesReferencia: chave });
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  return resultado;
}
