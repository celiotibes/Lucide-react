export interface Imovel {
  id: number;
  entidade_id: number;
  endereco: string;
  tipo_imovel: string;
  uso_pessoal: number;
  financiado: number;
  valor_aquisicao: number;
}

export interface Inquilino {
  id: number;
  entidade_id: number;
  imovel_id: number;
  nome_completo: string;
  cpf?: string;
  email?: string;
  telefone?: string;
  data_admissao: string;
  status: 'ativo' | 'inativo';
}

export interface Vistoria {
  id: number;
  imovel_id: number;
  data_vistoria: string;
  tipo_vistoria: 'entrada' | 'saida' | 'periodica' | 'manutencao';
  responsavel: string;
  descricao: string;
  status_imovel: 'excelente' | 'bom' | 'regular' | 'ruim' | 'critico';
  observacoes?: string;
}

export interface Manutencao {
  id: number;
  imovel_id: number;
  data_manutencao: string;
  tipo_manutencao: string;
  descricao: string;
  prestador_servico: string;
  valor_manutencao: number;
  status: 'pendente' | 'concluida' | 'cancelada';
  data_conclusao?: string;
}

export interface DespesaOperacional {
  id: number;
  imovel_id: number;
  tipo_despesa: 'condominio' | 'agua' | 'energia' | 'internet' | 'seguros' | 'outro';
  descricao: string;
  valor_mensal: number;
  dia_vencimento: number;
  status: 'ativa' | 'inativa';
}

export interface DocumentoImovel {
  id: number;
  imovel_id: number;
  tipo_documento: 'escritura' | 'iptu' | 'contrato_obra' | 'apo' | 'habite_se' | 'outro';
  numero_documento: string;
  data_documento: string;
  data_vencimento?: string;
  status: 'vigente' | 'expirado' | 'pendente';
}

export interface RelatorioImovel {
  imovel_id: number;
  endereco: string;
  status_geral: string;
  inquilino_atual?: Inquilino;
  valor_aquisicao: number;
  valor_aluguel_mensal?: number;
  despesas_mensais: DespesaOperacional[];
  despesas_total_mensal: number;
  margem_liquida_mensal: number;
  vistorias_realizadas: number;
  manutencoes_pendentes: number;
  documentos_vencidos: number;
  roi_anual_estimado: number;
}

export function obterRelatorioImovel(db: any, imovel_id: number): RelatorioImovel {
  const imovelData = db.exec(
    `SELECT id, endereco, valor_aquisicao FROM imoveis WHERE id = ?`,
    [imovel_id]
  );

  if (!imovelData[0]?.values) {
    throw new Error(`Imóvel ${imovel_id} não encontrado`);
  }

  const [id, endereco, valor_aquisicao] = imovelData[0].values[0];

  const inquilinoData = db.exec(
    `SELECT id, nome_completo, cpf, email, telefone, data_admissao, status
     FROM inquilinos WHERE imovel_id = ? AND status = 'ativo'`,
    [imovel_id]
  );

  let inquilino_atual: Inquilino | undefined;
  if (inquilinoData[0]?.values?.length > 0) {
    const [iq_id, nome, cpf, email, tel, data_adm, status] = inquilinoData[0].values[0];
    inquilino_atual = {
      id: iq_id,
      entidade_id: 1,
      imovel_id,
      nome_completo: nome,
      cpf,
      email,
      telefone: tel,
      data_admissao: data_adm,
      status,
    };
  }

  const contratoData = db.exec(
    `SELECT valor_aluguel FROM contratos_locacao WHERE imovel_id = ? AND status = 'ativo'`,
    [imovel_id]
  );

  const valor_aluguel = contratoData[0]?.values[0]?.[0] || 0;

  const despesas = db.exec(
    `SELECT tipo_despesa, descricao, valor_mensal, dia_vencimento, status
     FROM despesas_operacionais_agendadas WHERE imovel_id = ? AND status = 'ativa'`,
    [imovel_id]
  );

  const despesasLista: DespesaOperacional[] = [];
  let despesasTotal = 0;
  if (despesas[0]?.values) {
    for (const [tipo, desc, valor, dia, status] of despesas[0].values) {
      despesasLista.push({
        id: 0,
        imovel_id,
        tipo_despesa: tipo,
        descricao: desc,
        valor_mensal: valor,
        dia_vencimento: dia,
        status,
      });
      despesasTotal += valor;
    }
  }

  const vistorias = db.exec(`SELECT COUNT(*) as count FROM vistorias WHERE imovel_id = ?`, [
    imovel_id,
  ]);
  const vistorias_count = (vistorias[0]?.values[0]?.[0] || 0) as number;

  const manutencaoPendente = db.exec(
    `SELECT COUNT(*) as count FROM manutencoes WHERE imovel_id = ? AND status = 'pendente'`,
    [imovel_id]
  );
  const manutencoes_pendentes = (manutencaoPendente[0]?.values[0]?.[0] || 0) as number;

  const docsVencidos = db.exec(
    `SELECT COUNT(*) as count FROM imovel_documentos WHERE imovel_id = ? AND status = 'expirado'`,
    [imovel_id]
  );
  const docs_vencidos = (docsVencidos[0]?.values[0]?.[0] || 0) as number;

  const margem_liquida = valor_aluguel - despesasTotal;
  const roi_anual = valor_aquisicao > 0 ? (margem_liquida * 12) / valor_aquisicao : 0;

  return {
    imovel_id,
    endereco,
    status_geral:
      docs_vencidos > 0 || manutencoes_pendentes > 0
        ? 'atenção_requerida'
        : 'normalizado',
    inquilino_atual,
    valor_aquisicao,
    valor_aluguel_mensal: valor_aluguel,
    despesas_mensais: despesasLista,
    despesas_total_mensal: despesasTotal,
    margem_liquida_mensal: margem_liquida,
    vistorias_realizadas: vistorias_count,
    manutencoes_pendentes,
    documentos_vencidos: docs_vencidos,
    roi_anual_estimado: Math.round(roi_anual * 10000) / 100,
  };
}

export function registrarVistoria(db: any, vistoria: Omit<Vistoria, 'id'>): number {
  db.run(
    `INSERT INTO vistorias (imovel_id, data_vistoria, tipo_vistoria, responsavel, descricao, status_imovel, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      vistoria.imovel_id,
      vistoria.data_vistoria,
      vistoria.tipo_vistoria,
      vistoria.responsavel,
      vistoria.descricao,
      vistoria.status_imovel,
      new Date().toISOString(),
    ]
  );
  return 1;
}

export function registrarManutencao(db: any, manutencao: Omit<Manutencao, 'id'>): number {
  db.run(
    `INSERT INTO manutencoes (imovel_id, data_manutencao, tipo_manutencao, descricao, prestador_servico, valor_manutencao, status, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      manutencao.imovel_id,
      manutencao.data_manutencao,
      manutencao.tipo_manutencao,
      manutencao.descricao,
      manutencao.prestador_servico,
      manutencao.valor_manutencao,
      manutencao.status,
      new Date().toISOString(),
    ]
  );
  return 1;
}

export function registrarDocumentoImovel(
  db: any,
  documento: Omit<DocumentoImovel, 'id'>
): number {
  db.run(
    `INSERT INTO imovel_documentos (imovel_id, tipo_documento, numero_documento, data_documento, data_vencimento, status, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      documento.imovel_id,
      documento.tipo_documento,
      documento.numero_documento,
      documento.data_documento,
      documento.data_vencimento || null,
      documento.status,
      new Date().toISOString(),
    ]
  );
  return 1;
}

export function obterPortfolioImoveis(
  db: any,
  entidade_id: number
): { total_imoveis: number; valor_total_portfolio: number; receita_mensal_total: number; despesas_mensais_total: number; roi_medio_anual: number; imoveis: RelatorioImovel[] } {
  const imoveis = db.exec(`SELECT id FROM imoveis WHERE entidade_id = ?`, [entidade_id]);

  let totalImoveis = 0;
  let valorTotal = 0;
  let receitaMensal = 0;
  let despesasMensais = 0;
  let roiTotal = 0;

  const relatorios: RelatorioImovel[] = [];

  if (imoveis[0]?.values) {
    for (const [imovel_id] of imoveis[0].values) {
      const relatorio = obterRelatorioImovel(db, imovel_id);
      relatorios.push(relatorio);

      totalImoveis++;
      valorTotal += relatorio.valor_aquisicao;
      receitaMensal += relatorio.valor_aluguel_mensal || 0;
      despesasMensais += relatorio.despesas_total_mensal;
      roiTotal += relatorio.roi_anual_estimado;
    }
  }

  const roiMedio = totalImoveis > 0 ? roiTotal / totalImoveis : 0;

  return {
    total_imoveis: totalImoveis,
    valor_total_portfolio: valorTotal,
    receita_mensal_total: receitaMensal,
    despesas_mensais_total: despesasMensais,
    roi_medio_anual: Math.round(roiMedio * 100) / 100,
    imoveis: relatorios,
  };
}
