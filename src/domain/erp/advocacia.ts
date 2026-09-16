export interface ProcessoLegal {
  id: number;
  numero_processo: string;
  tipo: 'cobrança' | 'despejo' | 'ação trabalhista' | 'outro';
  descricao: string;
  data_ajuizamento: string;
  data_conclusao?: string;
  status: 'ativo' | 'em_recurso' | 'encerrado' | 'suspenso';
  foro: string;
  juiz?: string;
  nivel_hierarquia: number;
  valor_causa: number;
  estimativa_despesa: number;
  risco_potencial: 'baixo' | 'médio' | 'alto' | 'crítico';
}

export interface PartesProcesso {
  id: number;
  processo_id: number;
  tipo_parte: 'autor' | 'réu' | 'terceiro' | 'advogado';
  nome_parte: string;
  contato?: string;
  dados_bancarios?: string;
}

export interface DespesaLegal {
  id: number;
  processo_id: number;
  data_lancamento: string;
  tipo_despesa: 'honorarios_advocaticios' | 'custas_judiciais' | 'pericia' | 'outro';
  descricao: string;
  valor_despesa: number;
  beneficiario: string;
  referencia_documento: string;
  origem_modulo?: 'advocacia';
  ledger_entry_id?: number; // ID do lançamento contábil no ledger
  tentativas?: number; // Tentativas de sincronização com ledger
}

export interface RelatorioAdvocacia {
  total_processos_ativos: number;
  processos_por_status: Record<string, number>;
  valor_total_causas: number;
  estimativa_total_despesas: number;
  despesas_realizadas: number;
  processos_por_risco: Record<string, number>;
  processos_listados: ProcessoLegal[];
}

export function registrarProcessoLegal(db: any, entidade_id: number, processo: Omit<ProcessoLegal, 'id'>): number {
  const resultado = db.run(
    `INSERT INTO processos_legais (entidade_id, numero_processo, tipo, descricao, data_ajuizamento, status, foro, nivel_hierarquia, valor_causa, estimativa_despesa, risco_potencial, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entidade_id,
      processo.numero_processo,
      processo.tipo,
      processo.descricao,
      processo.data_ajuizamento,
      processo.status,
      processo.foro,
      processo.nivel_hierarquia,
      processo.valor_causa,
      processo.estimativa_despesa,
      processo.risco_potencial,
      new Date().toISOString(),
    ]
  );
  return resultado ? 1 : 0;
}

export function registrarDespesaLegal(
  db: any,
  entidade_id: number,
  periodo_id: number,
  despesa: Omit<DespesaLegal, 'id'>,
  sincronizarComLedger: boolean = true
): number {
  const resultado = db.run(
    `INSERT INTO despesas_legais (processo_id, entidade_id, periodo_id, data_lancamento, tipo_despesa, descricao, valor_despesa, beneficiario, referencia_documento, origem_modulo, tentativas, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'advocacia', 0, ?)`,
    [
      despesa.processo_id,
      entidade_id,
      periodo_id,
      despesa.data_lancamento,
      despesa.tipo_despesa,
      despesa.descricao,
      despesa.valor_despesa,
      despesa.beneficiario,
      despesa.referencia_documento,
      new Date().toISOString(),
    ]
  );

  if (sincronizarComLedger && resultado) {
    // Importação dinâmica para evitar circular dependency
    try {
      const { registrarDespesaLegalNoLedger } = require('./advocacia-ledger-integration');

      // Obter ID da despesa recém inserida
      const idResult = db.exec("SELECT last_insert_rowid() as id");
      const despesaId = idResult[0]?.values[0]?.[0] || 0;

      if (despesaId > 0) {
        registrarDespesaLegalNoLedger(db, despesaId, {
          processo_id: despesa.processo_id,
          entidade_id,
          periodo_id,
          data_lancamento: despesa.data_lancamento,
          tipo_despesa: despesa.tipo_despesa,
          valor_despesa: despesa.valor_despesa,
          descricao: despesa.descricao,
          beneficiario: despesa.beneficiario,
          referencia_documento: despesa.referencia_documento,
        });
      }
    } catch (erro) {
      console.warn('Erro ao sincronizar despesa com ledger:', erro);
      // Não falha a operação se a sincronização falhar
    }
  }

  return 1;
}

export function obterRelatorioAdvocacia(db: any): RelatorioAdvocacia {
  const processosAtivos = db.exec(
    `SELECT COUNT(*) as total FROM processos_legais WHERE status = 'ativo'`
  );
  const totalAtivos = processosAtivos[0]?.values[0]?.[0] || 0;

  const porStatus = db.exec(`SELECT status, COUNT(*) as count FROM processos_legais GROUP BY status`);
  const status_map: Record<string, number> = {};
  if (porStatus[0]?.values) {
    for (const [statusVal, count] of porStatus[0].values) {
      status_map[statusVal] = count;
    }
  }

  const causas = db.exec(`SELECT SUM(valor_causa) as total FROM processos_legais`);
  const totalCausas = causas[0]?.values[0]?.[0] || 0;

  const despEstimada = db.exec(`SELECT SUM(estimativa_despesa) as total FROM processos_legais`);
  const estimativaDespesa = despEstimada[0]?.values[0]?.[0] || 0;

  const despRealizada = db.exec(`SELECT SUM(valor_despesa) as total FROM despesas_legais`);
  const despesasRealizadas = despRealizada[0]?.values[0]?.[0] || 0;

  const porRisco = db.exec(`SELECT risco_potencial, COUNT(*) as count FROM processos_legais GROUP BY risco_potencial`);
  const risco_map: Record<string, number> = {};
  if (porRisco[0]?.values) {
    for (const [riscoVal, count] of porRisco[0].values) {
      risco_map[riscoVal] = count;
    }
  }

  const processos = db.exec(
    `SELECT id, numero_processo, tipo, descricao, data_ajuizamento, status, foro, valor_causa, estimativa_despesa, risco_potencial
     FROM processos_legais ORDER BY data_ajuizamento DESC LIMIT 20`
  );
  const processosListados: ProcessoLegal[] = [];
  if (processos[0]?.values) {
    for (const [id, num, tipo, desc, data_aju, status, foro, valor, estim, risco] of processos[0].values) {
      processosListados.push({
        id,
        numero_processo: num,
        tipo,
        descricao: desc,
        data_ajuizamento: data_aju,
        status,
        foro,
        nivel_hierarquia: 1,
        valor_causa: valor,
        estimativa_despesa: estim,
        risco_potencial: risco,
      });
    }
  }

  return {
    total_processos_ativos: totalAtivos,
    processos_por_status: status_map,
    valor_total_causas: totalCausas,
    estimativa_total_despesas: estimativaDespesa,
    despesas_realizadas: despesasRealizadas,
    processos_por_risco: risco_map,
    processos_listados: processosListados,
  };
}

export function registrarPartesProcesso(db: any, parte: Omit<PartesProcesso, 'id'>): number {
  db.run(
    `INSERT INTO partes_processo (processo_id, tipo_parte, nome_parte, contato, dados_bancarios)
     VALUES (?, ?, ?, ?, ?)`,
    [parte.processo_id, parte.tipo_parte, parte.nome_parte, parte.contato || null, parte.dados_bancarios || null]
  );
  return 1;
}
