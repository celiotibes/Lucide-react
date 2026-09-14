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

// ===== SKILL 1: ALUGUEL RECEBIDO =====
export interface AluguelRecebido {
  data_evento: string;
  valor: number;
  imovel_id: number;
  inquilino_id: number;
  referencia_documento: string;
  descricao?: string;
}

export function procesarAluguelRecebido(
  db: any,
  entidade_id: number,
  periodo_id: number,
  aluguel: AluguelRecebido
): { sucesso: boolean; ledger_entry_id?: number; errors?: string[] } {
  const validacao = validarAluguelRecebido(aluguel);
  if (!validacao.valida) {
    return { sucesso: false, errors: validacao.erros };
  }

  try {
    // Débito em 1.1.01 (Aluguéis)
    const contaResult = db.exec(
      `SELECT id FROM contas_plano_contas WHERE codigo = '1.1.01'`
    );

    if (!contaResult[0]?.values?.length) {
      return { sucesso: false, errors: ['Conta 1.1.01 não encontrada'] };
    }

    const conta_id = contaResult[0].values[0][0];

    db.run(
      `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito, descricao, origem_modulo, origem_id, referencia_documento, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entidade_id,
        periodo_id,
        conta_id,
        aluguel.data_evento,
        aluguel.valor,
        0,
        aluguel.descricao || `Aluguel - Imóvel ${aluguel.imovel_id}`,
        'skillos_aluguel',
        aluguel.imovel_id,
        aluguel.referencia_documento,
        new Date().toISOString(),
      ]
    );

    return { sucesso: true, ledger_entry_id: conta_id };
  } catch (erro) {
    return { sucesso: false, errors: [`Erro ao processar aluguel: ${String(erro)}`] };
  }
}

function validarAluguelRecebido(aluguel: AluguelRecebido): { valida: boolean; erros: string[] } {
  const erros: string[] = [];
  if (!aluguel.data_evento) erros.push('data_evento obrigatória');
  if (aluguel.valor <= 0) erros.push('valor deve ser positivo');
  if (!aluguel.imovel_id) erros.push('imovel_id obrigatório');
  if (!aluguel.inquilino_id) erros.push('inquilino_id obrigatório');
  if (!aluguel.referencia_documento) erros.push('referencia_documento obrigatória');
  return { valida: erros.length === 0, erros };
}

// ===== SKILL 2: CAUÇÃO DEPOSITADA =====
export interface CaucaoDepositada {
  data_evento: string;
  valor: number;
  imovel_id: number;
  inquilino_id: number;
  referencia_documento: string;
  descricao?: string;
}

export function procesarCaucaoDepositada(
  db: any,
  entidade_id: number,
  periodo_id: number,
  caucao: CaucaoDepositada
): { sucesso: boolean; ledger_entry_id?: number; errors?: string[] } {
  const validacao = validarCaucaoDepositada(caucao);
  if (!validacao.valida) {
    return { sucesso: false, errors: validacao.erros };
  }

  try {
    // Débito em 1.1.02 (Reembolso/Depósito)
    const contaResult = db.exec(
      `SELECT id FROM contas_plano_contas WHERE codigo = '1.1.02'`
    );

    if (!contaResult[0]?.values?.length) {
      return { sucesso: false, errors: ['Conta 1.1.02 não encontrada'] };
    }

    const conta_id = contaResult[0].values[0][0];

    db.run(
      `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito, descricao, origem_modulo, origem_id, referencia_documento, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entidade_id,
        periodo_id,
        conta_id,
        caucao.data_evento,
        caucao.valor,
        0,
        caucao.descricao || `Caução depositada - Imóvel ${caucao.imovel_id}`,
        'skillos_caucao',
        caucao.imovel_id,
        caucao.referencia_documento,
        new Date().toISOString(),
      ]
    );

    return { sucesso: true, ledger_entry_id: conta_id };
  } catch (erro) {
    return { sucesso: false, errors: [`Erro ao processar caução: ${String(erro)}`] };
  }
}

function validarCaucaoDepositada(caucao: CaucaoDepositada): { valida: boolean; erros: string[] } {
  const erros: string[] = [];
  if (!caucao.data_evento) erros.push('data_evento obrigatória');
  if (caucao.valor <= 0) erros.push('valor deve ser positivo');
  if (!caucao.imovel_id) erros.push('imovel_id obrigatório');
  if (!caucao.inquilino_id) erros.push('inquilino_id obrigatório');
  if (!caucao.referencia_documento) erros.push('referencia_documento obrigatória');
  return { valida: erros.length === 0, erros };
}

// ===== SKILL 3: TAXA CONDOMÍNIO =====
export interface TaxaCondominio {
  data_evento: string;
  valor: number;
  imovel_id: number;
  referencia_documento: string;
  descricao?: string;
}

export function procesarTaxaCondominio(
  db: any,
  entidade_id: number,
  periodo_id: number,
  taxa: TaxaCondominio
): { sucesso: boolean; ledger_entry_id?: number; errors?: string[] } {
  const validacao = validarTaxaCondominio(taxa);
  if (!validacao.valida) {
    return { sucesso: false, errors: validacao.erros };
  }

  try {
    // Débito em 2.1.01 (Condomínio e IPTU)
    const contaResult = db.exec(
      `SELECT id FROM contas_plano_contas WHERE codigo = '2.1.01'`
    );

    if (!contaResult[0]?.values?.length) {
      return { sucesso: false, errors: ['Conta 2.1.01 não encontrada'] };
    }

    const conta_id = contaResult[0].values[0][0];

    db.run(
      `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito, descricao, origem_modulo, origem_id, referencia_documento, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entidade_id,
        periodo_id,
        conta_id,
        taxa.data_evento,
        taxa.valor,
        0,
        taxa.descricao || `Taxa de condomínio - Imóvel ${taxa.imovel_id}`,
        'skillos_condominio',
        taxa.imovel_id,
        taxa.referencia_documento,
        new Date().toISOString(),
      ]
    );

    return { sucesso: true, ledger_entry_id: conta_id };
  } catch (erro) {
    return { sucesso: false, errors: [`Erro ao processar taxa de condomínio: ${String(erro)}`] };
  }
}

function validarTaxaCondominio(taxa: TaxaCondominio): { valida: boolean; erros: string[] } {
  const erros: string[] = [];
  if (!taxa.data_evento) erros.push('data_evento obrigatória');
  if (taxa.valor <= 0) erros.push('valor deve ser positivo');
  if (!taxa.imovel_id) erros.push('imovel_id obrigatório');
  if (!taxa.referencia_documento) erros.push('referencia_documento obrigatória');
  return { valida: erros.length === 0, erros };
}

// ===== SKILL 4: ÁGUA, ENERGIA, INTERNET =====
export interface UtilitiesExpense {
  data_evento: string;
  valor: number;
  imovel_id: number;
  tipo_utilidade: 'agua' | 'energia' | 'internet';
  referencia_documento: string;
  descricao?: string;
}

export function procesarUtilitiesExpense(
  db: any,
  entidade_id: number,
  periodo_id: number,
  utilidade: UtilitiesExpense
): { sucesso: boolean; ledger_entry_id?: number; errors?: string[] } {
  const validacao = validarUtilitiesExpense(utilidade);
  if (!validacao.valida) {
    return { sucesso: false, errors: validacao.erros };
  }

  try {
    // Débito em 2.1.02 (Manutenção corrente, abrangendo utilidades)
    const contaResult = db.exec(
      `SELECT id FROM contas_plano_contas WHERE codigo = '2.1.02'`
    );

    if (!contaResult[0]?.values?.length) {
      return { sucesso: false, errors: ['Conta 2.1.02 não encontrada'] };
    }

    const conta_id = contaResult[0].values[0][0];

    const tipoDescricao = {
      agua: 'Água e Esgoto',
      energia: 'Eletricidade',
      internet: 'Internet'
    }[utilidade.tipo_utilidade];

    db.run(
      `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, data_lancamento, valor_debito, valor_credito, descricao, origem_modulo, origem_id, referencia_documento, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entidade_id,
        periodo_id,
        conta_id,
        utilidade.data_evento,
        utilidade.valor,
        0,
        utilidade.descricao || `${tipoDescricao} - Imóvel ${utilidade.imovel_id}`,
        'skillos_utilidades',
        utilidade.imovel_id,
        utilidade.referencia_documento,
        new Date().toISOString(),
      ]
    );

    return { sucesso: true, ledger_entry_id: conta_id };
  } catch (erro) {
    return { sucesso: false, errors: [`Erro ao processar despesa de utilidades: ${String(erro)}`] };
  }
}

function validarUtilitiesExpense(utilidade: UtilitiesExpense): { valida: boolean; erros: string[] } {
  const erros: string[] = [];
  if (!utilidade.data_evento) erros.push('data_evento obrigatória');
  if (utilidade.valor <= 0) erros.push('valor deve ser positivo');
  if (!utilidade.imovel_id) erros.push('imovel_id obrigatório');
  if (!['agua', 'energia', 'internet'].includes(utilidade.tipo_utilidade)) {
    erros.push('tipo_utilidade inválido: deve ser agua, energia ou internet');
  }
  if (!utilidade.referencia_documento) erros.push('referencia_documento obrigatória');
  return { valida: erros.length === 0, erros };
}

// ===== SKILL 5: CONTRATO ANÁLISE =====
export interface ContratoAnalise {
  data_evento: string;
  numero_contrato: string;
  imovel_id: number;
  data_inicio: string;
  valor_aluguel: number;
  descricao?: string;
  referencia_documento?: string;
}

export function procesarContratoAnalise(
  db: any,
  entidade_id: number,
  numero_contrato: string,
  contrato: ContratoAnalise
): { sucesso: boolean; contrato_id?: number; errors?: string[] } {
  const validacao = validarContratoAnalise(contrato);
  if (!validacao.valida) {
    return { sucesso: false, errors: validacao.erros };
  }

  try {
    // Criar ou atualizar contrato
    const existente = db.exec(
      `SELECT id FROM contratos_locacao WHERE entidade_id = ? AND imovel_id = ? AND data_inicio = ?`,
      [entidade_id, contrato.imovel_id, contrato.data_inicio]
    );

    if (existente[0]?.values?.length > 0) {
      const contrato_id = existente[0].values[0][0];
      db.run(
        `UPDATE contratos_locacao SET valor_aluguel = ?, valor_referencia = ?, status = ? WHERE id = ?`,
        [contrato.valor_aluguel, contrato.valor_aluguel, 'ativo', contrato_id]
      );
      return { sucesso: true, contrato_id };
    } else {
      db.run(
        `INSERT INTO contratos_locacao (entidade_id, imovel_id, valor_aluguel, valor_referencia, data_inicio, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [entidade_id, contrato.imovel_id, contrato.valor_aluguel, contrato.valor_aluguel, contrato.data_inicio, 'ativo']
      );

      const result = db.exec(
        `SELECT id FROM contratos_locacao WHERE entidade_id = ? AND imovel_id = ? AND data_inicio = ? ORDER BY id DESC LIMIT 1`,
        [entidade_id, contrato.imovel_id, contrato.data_inicio]
      );

      if (result[0]?.values?.length > 0) {
        return { sucesso: true, contrato_id: result[0].values[0][0] };
      }
    }

    return { sucesso: true };
  } catch (erro) {
    return { sucesso: false, errors: [`Erro ao processar contrato: ${String(erro)}`] };
  }
}

function validarContratoAnalise(contrato: ContratoAnalise): { valida: boolean; erros: string[] } {
  const erros: string[] = [];
  if (!contrato.data_evento) erros.push('data_evento obrigatória');
  if (!contrato.data_inicio) erros.push('data_inicio obrigatória');
  if (!contrato.imovel_id) erros.push('imovel_id obrigatório');
  if (contrato.valor_aluguel <= 0) erros.push('valor_aluguel deve ser positivo');
  return { valida: erros.length === 0, erros };
}
