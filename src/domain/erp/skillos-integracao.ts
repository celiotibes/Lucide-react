/**
 * INTEGRAÇÃO SKILLOS ↔ LUCIDE-REACT ERP
 *
 * Mapeamento conforme análise de compatibilidade:
 * - Cada skill Skillos → origem_modulo específica
 * - Normalização de dados heterogêneos (OFX, PDF, CSV)
 * - Rastreamento de provenance (SHA-256, page, locator)
 * - Validação muitos-para-muitos de allocations
 *
 * Referência: Matriz de integração gerada por agente (a7997a82f33c96ea5)
 */

export interface SkillsLogEntry {
  id: number;
  skillos_ref_id: string;
  lucide_tabela: string;
  lucide_id: number;
  tipo_evento: string;
  dados_json: string;
  status: 'sincronizado' | 'pendente' | 'erro' | 'manual';
  tentativas: number;
  criado_em: string;
  sincronizado_em?: string;
}

export interface MapeamentoSkillsOrigem {
  skill_skillos: string;
  tipo_evento: string;
  origem_modulo: string;
  prioridade: 'critica' | 'alta' | 'media';
  tabela_destino: string;
  campos_obrigatorios: string[];
}

// MAPEAMENTO DEFINITIVO SKILLOS → ORIGEN_MODULO ERP
const MAPEAMENTO_SKILLS: MapeamentoSkillsOrigem[] = [
  {
    skill_skillos: 'accounting-reconstruction',
    tipo_evento: 'aluguel_recebido',
    origem_modulo: 'contratos',
    prioridade: 'critica',
    tabela_destino: 'ledger_entries',
    campos_obrigatorios: ['data_evento', 'valor', 'imovel_id', 'inquilino_id', 'referencia_documento'],
  },
  {
    skill_skillos: 'accounting-reconstruction',
    tipo_evento: 'taxa_condominio',
    origem_modulo: 'taxa_condominio',
    prioridade: 'alta',
    tabela_destino: 'ledger_entries',
    campos_obrigatorios: ['data_evento', 'valor', 'imovel_id'],
  },
  {
    skill_skillos: 'accounting-reconstruction',
    tipo_evento: 'caucao_depositada',
    origem_modulo: 'caucao',
    prioridade: 'critica',
    tabela_destino: 'ledger_entries',
    campos_obrigatorios: ['data_evento', 'valor', 'imovel_id', 'inquilino_id'],
  },
  {
    skill_skillos: 'accounting-reconstruction',
    tipo_evento: 'agua_energia_internet',
    origem_modulo: 'transacoes',
    prioridade: 'alta',
    tabela_destino: 'ledger_entries',
    campos_obrigatorios: ['data_evento', 'valor', 'imovel_id'],
  },
  {
    skill_skillos: 'accounting-reconstruction',
    tipo_evento: 'reparo_manutencao',
    origem_modulo: 'transacoes',
    prioridade: 'alta',
    tabela_destino: 'manutencoes',
    campos_obrigatorios: ['data_evento', 'valor', 'descricao', 'imovel_id'],
  },
  {
    skill_skillos: 'accounting-reconstruction',
    tipo_evento: 'vistoria_danos',
    origem_modulo: 'vistorias',
    prioridade: 'alta',
    tabela_destino: 'vistorias',
    campos_obrigatorios: ['data_evento', 'imovel_id', 'descricao'],
  },
  {
    skill_skillos: 'accounting-reconstruction',
    tipo_evento: 'inadimplencia_juros',
    origem_modulo: 'contratos',
    prioridade: 'alta',
    tabela_destino: 'ledger_entries',
    campos_obrigatorios: ['data_evento', 'valor', 'imovel_id', 'inquilino_id'],
  },
  {
    skill_skillos: 'contract-review',
    tipo_evento: 'contrato_analise',
    origem_modulo: 'contratos',
    prioridade: 'alta',
    tabela_destino: 'contratos_locacao',
    campos_obrigatorios: ['data_evento', 'descricao'],
  },
  {
    skill_skillos: 'legal-research',
    tipo_evento: 'pesquisa_legal',
    origem_modulo: 'documentos',
    prioridade: 'media',
    tabela_destino: 'transacoes_auditoria',
    campos_obrigatorios: ['data_evento', 'descricao'],
  },
];

export interface ReconstrucaoContabil {
  origem_skillos: string;
  tipo_evento: string;
  data_evento: string;
  valor: number;
  descricao: string;
  referencia_documento: string;
  imovel_id?: number;
  inquilino_id?: number;
  sha256_fonte?: string;
  pagina_fonte?: number;
  locator_fonte?: string;
  status: 'extracao' | 'normalizacao' | 'classificacao' | 'liquidacao' | 'rateio' | 'lancamento' | 'hold_review';
}

export function obterMapeamentoSkill(skill_skillos: string, tipo_evento: string): MapeamentoSkillsOrigem | undefined {
  return MAPEAMENTO_SKILLS.find(
    (m) => m.skill_skillos === skill_skillos && m.tipo_evento === tipo_evento
  );
}

export function validarRecontrucaoContabil(
  db: any,
  reconstrucao: ReconstrucaoContabil
): { valida: boolean; erros: string[] } {
  const erros: string[] = [];

  if (!reconstrucao.data_evento) erros.push('data_evento obrigatória');
  if (reconstrucao.valor <= 0) erros.push('valor deve ser positivo');
  if (!reconstrucao.descricao) erros.push('descricao obrigatória');
  if (!reconstrucao.referencia_documento) erros.push('referencia_documento obrigatória');

  const mapeamento = obterMapeamentoSkill(reconstrucao.origem_skillos, reconstrucao.tipo_evento);
  if (!mapeamento) {
    erros.push(`Skill/evento não mapeado: ${reconstrucao.origem_skillos}/${reconstrucao.tipo_evento}`);
  } else {
    for (const campo of mapeamento.campos_obrigatorios) {
      const valor = (reconstrucao as any)[campo];
      if (valor === undefined || valor === null || valor === '') {
        erros.push(`Campo obrigatório faltando: ${campo}`);
      }
    }
  }

  return {
    valida: erros.length === 0,
    erros,
  };
}

export function registrarRecontrucaoContabil(
  db: any,
  entidade_id: number,
  periodo_id: number,
  reconstrucao: ReconstrucaoContabil
): { sucesso: boolean; ledger_entry_id?: number; errors?: string[] } {
  const validacao = validarRecontrucaoContabil(db, reconstrucao);
  if (!validacao.valida) {
    return { sucesso: false, errors: validacao.erros };
  }

  const mapeamento = obterMapeamentoSkill(reconstrucao.origem_skillos, reconstrucao.tipo_evento);
  if (!mapeamento) {
    return { sucesso: false, errors: ['Mapeamento não encontrado'] };
  }

  try {
    // Determinar conta baseado em tipo_evento
    let conta_codigo = '';
    let valor_debito = 0;
    let valor_credito = 0;

    switch (reconstrucao.tipo_evento) {
      case 'aluguel_recebido':
        conta_codigo = '1.1.02'; // Conta Bancária (débito)
        valor_debito = reconstrucao.valor;
        break;
      case 'taxa_condominio':
        conta_codigo = '1.1.02';
        valor_debito = reconstrucao.valor;
        break;
      case 'agua_energia_internet':
        conta_codigo = '6.1.02'; // Água e Esgoto (débito)
        valor_debito = reconstrucao.valor;
        break;
      case 'reparo_manutencao':
        conta_codigo = '6.1.05'; // Manutenção (débito)
        valor_debito = reconstrucao.valor;
        break;
      default:
        conta_codigo = '5.1.01'; // Aluguel default (crédito)
        valor_credito = reconstrucao.valor;
    }

    // Obter ID da conta
    const contaResult = db.exec(
      `SELECT id FROM contas_plano_contas WHERE codigo = ?`,
      [conta_codigo]
    );

    if (!contaResult[0]?.values?.length) {
      return { sucesso: false, errors: [`Conta ${conta_codigo} não encontrada`] };
    }

    const conta_id = contaResult[0].values[0][0];

    // Registrar lançamento contábil
    db.run(
      `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito, descricao, origem_modulo, origem_id, referencia_documento, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entidade_id,
        periodo_id,
        conta_id,
        reconstrucao.data_evento,
        valor_debito || 0,
        valor_credito || 0,
        reconstrucao.descricao,
        mapeamento.origem_modulo,
        reconstrucao.imovel_id || 0,
        reconstrucao.referencia_documento,
        new Date().toISOString(),
      ]
    );

    // Registrar log de sincronização
    const logJson = JSON.stringify({
      tipo_evento: reconstrucao.tipo_evento,
      valor: reconstrucao.valor,
      data_evento: reconstrucao.data_evento,
      imovel_id: reconstrucao.imovel_id,
      inquilino_id: reconstrucao.inquilino_id,
      sha256_fonte: reconstrucao.sha256_fonte,
    });

    db.run(
      `INSERT INTO skillos_log (skillos_ref_id, lucide_tabela, tipo_evento, dados_json, status, tentativas, criado_em, sincronizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `skillos_${reconstrucao.origem_skillos}_${Date.now()}`,
        'ledger_entries',
        reconstrucao.tipo_evento,
        logJson,
        'sincronizado',
        1,
        new Date().toISOString(),
        new Date().toISOString(),
      ]
    );

    return { sucesso: true, ledger_entry_id: conta_id };
  } catch (erro) {
    return { sucesso: false, errors: [`Erro ao registrar: ${String(erro)}`] };
  }
}

export function obterStatusSincronizacao(db: any): {
  total_registros: number;
  sincronizados: number;
  pendentes: number;
  erros: number;
  percentual_sucesso: number;
} {
  const total = db.exec(`SELECT COUNT(*) as count FROM skillos_log`);
  const totalCount = (total[0]?.values[0]?.[0] || 0) as number;

  const sync = db.exec(
    `SELECT COUNT(*) as count FROM skillos_log WHERE status = 'sincronizado'`
  );
  const syncCount = (sync[0]?.values[0]?.[0] || 0) as number;

  const pend = db.exec(
    `SELECT COUNT(*) as count FROM skillos_log WHERE status = 'pendente'`
  );
  const pendCount = (pend[0]?.values[0]?.[0] || 0) as number;

  const err = db.exec(
    `SELECT COUNT(*) as count FROM skillos_log WHERE status = 'erro'`
  );
  const errCount = (err[0]?.values[0]?.[0] || 0) as number;

  const percentualSucesso = totalCount > 0 ? (syncCount / totalCount) * 100 : 0;

  return {
    total_registros: totalCount,
    sincronizados: syncCount,
    pendentes: pendCount,
    erros: errCount,
    percentual_sucesso: Math.round(percentualSucesso * 100) / 100,
  };
}
