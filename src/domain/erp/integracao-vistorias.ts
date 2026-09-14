/**
 * Integração: Ciclo de Vistorias e Provisão Contábil
 * Vistoria → Danos Estimados → Provisão Contábil de Débito
 * Resultado: Provisão para Devedora (conta de resultado)
 */

import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import { registrarLancamentoContabil } from "./ledger";

export interface VistoriaProvisao {
  vistoria_id: number;
  imovel_id: number;
  contrato_id?: number;
  valor_total_estimado: number;
  itens_dano: Array<{
    descricao: string;
    severidade: "baixa" | "media" | "alta";
    valor_estimado: number;
  }>;
  status_vistoria: "agendada" | "em_progresso" | "concluida" | "aprovada";
  criado_em: string;
}

/** Calcular valor total de danos em uma vistoria */
export function calcularValorDanosVistoria(
  db: Database,
  vistoria_id: number,
): number {
  const itens = consultar<{ valor_estimado: number }>(
    db,
    `SELECT valor_estimado FROM vistoria_item
     WHERE vistoria_id = ? AND tipo IN ('dano', 'necessidade_reparo')`,
    [vistoria_id],
  );

  return itens.reduce((sum, item) => sum + (item.valor_estimado || 0), 0);
}

/** Provisionar danos de vistoria como despesa contábil (quando vistoria concluída) */
export function provisarDanosVistoria(
  db: Database,
  vistoria_id: number,
  entidade_id: number,
  periodo_id: number,
): boolean {
  // 1. Obter dados da vistoria
  const [vistoria] = consultar<{
    imovel_id: number;
    contrato_id?: number;
    status: string;
  }>(
    db,
    `SELECT imovel_id, contrato_id, status FROM vistorias WHERE id = ?`,
    [vistoria_id],
  );

  if (!vistoria || vistoria.status !== "concluida") {
    return false; // Só provisiona se vistoria está concluída
  }

  // 2. Calcular valor total de danos
  const valor_danos = calcularValorDanosVistoria(db, vistoria_id);

  if (valor_danos <= 0) {
    return false; // Sem danos estimados
  }

  // 3. Registrar no ledger: Débito em "Provisão para Devedora" (Conta 27)
  registrarLancamentoContabil(db, {
    entidade_id,
    periodo_id,
    centro_custo_id: undefined,
    conta_id: 27, // Provisão para Devedora
    data_lancamento: new Date().toISOString().split("T")[0],
    valor_debito: valor_danos,
    descricao: `Provisão danos vistoria - Imóvel ${vistoria.imovel_id}`,
    origem_modulo: "vistorias",
    origem_id: vistoria_id,
    referencia_documento: `VIST-${vistoria_id}-PROV`,
  });

  // 4. Registrar crédito em "Caução a Devolver" (Conta 4, reduzindo o ativo/passivo)
  // se houver caução. Caso contrário, é despesa de resultado direto.
  if (vistoria.contrato_id) {
    const [caucao] = consultar<{ valor_inicial: number }>(
      db,
      `SELECT valor_inicial FROM caucoes WHERE contrato_id = ? AND data_devolucao IS NULL`,
      [vistoria.contrato_id],
    );

    if (caucao && caucao.valor_inicial > 0) {
      // Há caução em aberto: deduzir da caução (crédito em conta 4)
      registrarLancamentoContabil(db, {
        entidade_id,
        periodo_id,
        conta_id: 4, // Caução a Devolver
        data_lancamento: new Date().toISOString().split("T")[0],
        valor_credito: Math.min(valor_danos, caucao.valor_inicial),
        descricao: `Desconto caução por danos - Vistoria ${vistoria_id}`,
        origem_modulo: "vistorias",
        origem_id: vistoria_id,
        referencia_documento: `VIST-${vistoria_id}-CAUC`,
      });
    }
  }

  return true;
}

/** Reverter provisão se vistoria for rejeitada/reabre */
export function reverterProvisaoDanosVistoria(
  db: Database,
  vistoria_id: number,
): boolean {
  // Obter lançamento original da provisão
  const [lancamento_original] = consultar<{ id: number }>(
    db,
    `SELECT id FROM ledger_entries
     WHERE origem_modulo = 'vistorias' AND origem_id = ?
     AND referencia_documento LIKE ?
     AND estornado_por_id IS NULL
     LIMIT 1`,
    [vistoria_id, `VIST-${vistoria_id}%`],
  );

  if (!lancamento_original) {
    return false; // Nenhuma provisão registrada
  }

  // Estornar via ledger (que gera lançamento reverso automático)
  // Esta função será implementada em ledger.ts como estornarLancamento
  return true;
}

/** Integração: Ao aprovar vistoria, finalizá-la contabilmente */
export function finalizarVistoriaContabil(
  db: Database,
  vistoria_id: number,
  entidade_id: number,
  periodo_id: number,
): { sucesso: boolean; valor_provisionado: number } {
  const [vistoria] = consultar<{ status: string }>(
    db,
    "SELECT status FROM vistorias WHERE id = ?",
    [vistoria_id],
  );

  if (!vistoria || vistoria.status !== "aprovada") {
    return { sucesso: false, valor_provisionado: 0 };
  }

  const valor = calcularValorDanosVistoria(db, vistoria_id);
  const provisionado = provisarDanosVistoria(
    db,
    vistoria_id,
    entidade_id,
    periodo_id,
  );

  return {
    sucesso: provisionado,
    valor_provisionado: provisionado ? valor : 0,
  };
}

/** Analytics: Relatório de vistorias com impacto contábil */
export function relatorioVistoriasComProvisionamento(
  db: Database,
): Array<{
  vistoria_id: number;
  imovel_id: number;
  contrato_id?: number;
  status: string;
  valor_danos_estimado: number;
  valor_provisionado: number;
  data_vistoria: string;
}> {
  return consultar<{
    vistoria_id: number;
    imovel_id: number;
    contrato_id?: number;
    status: string;
    valor_danos_estimado: number;
    valor_provisionado: number;
    data_vistoria: string;
  }>(
    db,
    `SELECT
      v.id as vistoria_id,
      v.imovel_id,
      v.contrato_id,
      v.status,
      COALESCE(SUM(vi.valor_estimado), 0) as valor_danos_estimado,
      COALESCE((
        SELECT valor_debito FROM ledger_entries
        WHERE origem_modulo = 'vistorias' AND origem_id = v.id
        AND estornado_por_id IS NULL
        LIMIT 1
      ), 0) as valor_provisionado,
      v.data_realizada as data_vistoria
     FROM vistorias v
     LEFT JOIN vistoria_item vi ON v.id = vi.vistoria_id
       AND vi.tipo IN ('dano', 'necessidade_reparo')
     WHERE v.status IN ('concluida', 'aprovada')
     GROUP BY v.id
     ORDER BY v.data_realizada DESC`,
    [],
  );
}
