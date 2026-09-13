// Geração automática de NFS-e (Nota Fiscal de Serviço Eletrônica)
// Integração com sistemas municipais de tributos (padrão ABRASF)

import type { Pool } from 'pg';

export interface DadosNFSe {
  numeroNFSe: string;
  serieNFSe: string;
  dataEmissao: string;
  dataCompetencia: string;
  descricaoServico: string;
  valorServico: number;
  valorDeducoes: number;
  valorLiquidoNFSe: number;
  percentualAliquota: number;
  valorISS: number;
  prestador: {
    cnpj: string;
    razaoSocial: string;
    endereco: string;
  };
  tomador: {
    cpfCnpj: string;
    razaoSocial: string;
    endereco: string;
  };
  rps: {
    numero: string;
    serie: string;
    tipo: 'RPS' | 'RECIBO'; // 1=RPS, 2=RECIBO
    dataEmissaoRPS: string;
  };
  statusNFSe: 'rps_criado' | 'validado' | 'emitido' | 'cancelado';
  xmlNFSe?: string;
  codigoVerificacao?: string;
}

export interface ResultadoEmissaoNFSe {
  sucesso: boolean;
  numeroNFSe?: string;
  codigoVerificacao?: string;
  xmlNFSe?: string;
  erro?: string;
  dataEmissao: string;
}

/**
 * Criar RPS (Recibo Provisório de Serviço)
 * Validações iniciais antes de emitir NFS-e
 */
export async function criarRPS(
  pool: Pool,
  dados: {
    faturasIds: string[];
    municipio: string; // código IBGE
    cnpjPrestador: string;
    certificadoPath: string; // caminho para certificado digital
  }
): Promise<{ rpsNumero: string; rpsData: DadosNFSe }> {
  // Validar se faturas existem e são do tipo 'taxa_adm' ou 'multa' (serviços)
  const { rows: faturas } = await pool.query<{
    id: string;
    contrato_id: string;
    valor_bruto: string;
    descricao: string;
    vencimento: string;
    tipo: string;
  }>(
    `
    select
      f.id,
      f.contrato_id,
      f.valor_bruto,
      f.descricao,
      f.vencimento,
      f.tipo
    from faturas f
    where f.id = any($1::uuid[])
      and f.tipo in ('taxa_adm', 'multa', 'juros')
      and f.status != 'cancelada'
  `,
    [dados.faturasIds]
  );

  if (faturas.length === 0) {
    throw new Error('Nenhuma fatura de serviço válida encontrada');
  }

  // Validar CNPJ prestador (deve estar registrado)
  const { rows: prestador } = await pool.query<{
    cnpj: string;
    razao_social: string;
    endereco: string;
  }>(
    `
    select
      empresa_cnpj as cnpj,
      nome_empresa as razao_social,
      endereco_empresa as endereco
    from configuracoes
    where empresa_cnpj = $1
    limit 1
  `,
    [dados.cnpjPrestador]
  );

  if (prestador.length === 0) {
    throw new Error('CNPJ prestador não configurado no sistema');
  }

  // Gerar número RPS único
  const { rows: ultimoRPS } = await pool.query<{ max_num: number }>(
    `
    select max(cast(rps_numero as integer)) as max_num
    from auditoria_nfse
    where rps_numero ~ '^[0-9]+$'
  `
  );

  const rpsNumero = String((ultimoRPS[0]?.max_num || 0) + 1).padStart(6, '0');
  const dataEmissaoRPS = new Date().toISOString().split('T')[0];

  // Calcular totais de serviços
  const totalServicos = faturas.reduce((sum, f) => sum + parseFloat(f.valor_bruto), 0);
  const aliquotaISS = 0.05; // 5% ISS padrão (variar por município)
  const valorISS = totalServicos * aliquotaISS;
  const valorLiquido = totalServicos - valorISS;

  // Obter dados do tomador (se for contrato)
  const { rows: tomadores } = await pool.query<{
    cpf_cnpj: string;
    nome: string;
    endereco: string;
  }>(
    `
    select distinct
      p.cpf_cnpj,
      p.nome,
      p.endereco
    from contratos c
    join contrato_partes cp on cp.contrato_id = c.id
    join pessoas p on p.id = cp.pessoa_id
    where c.id = any(
      select distinct contrato_id from faturas
      where id = any($1::uuid[])
    )
    limit 1
  `,
    [dados.faturasIds]
  );

  const tomador = tomadores[0] || {
    cpf_cnpj: '00000000000000',
    nome: 'Pessoa Física ou Jurídica',
    endereco: 'Endereço não informado',
  };

  const rpsData: DadosNFSe = {
    numeroNFSe: '', // será preenchido após emissão
    serieNFSe: '1',
    dataEmissao: new Date().toISOString(),
    dataCompetencia: new Date().toISOString().split('T')[0],
    descricaoServico: faturas.map((f) => f.descricao).join('; '),
    valorServico: totalServicos,
    valorDeducoes: 0,
    valorLiquidoNFSe: valorLiquido,
    percentualAliquota: aliquotaISS * 100,
    valorISS,
    prestador: {
      cnpj: prestador[0].cnpj,
      razaoSocial: prestador[0].razao_social,
      endereco: prestador[0].endereco,
    },
    tomador: {
      cpfCnpj: tomador.cpf_cnpj,
      razaoSocial: tomador.nome,
      endereco: tomador.endereco,
    },
    rps: {
      numero: rpsNumero,
      serie: '1',
      tipo: 'RPS',
      dataEmissaoRPS,
    },
    statusNFSe: 'rps_criado',
  };

  // Armazenar RPS criado
  await pool.query(
    `
    insert into auditoria_nfse
      (rps_numero, rps_serie, data_emissao, descricao_servico, valor_servico, valor_iss,
       prestador_cnpj, tomador_cpf_cnpj, status, municipio_codigo, fatura_ids)
    values
      ($1, $2, now(), $3, $4, $5, $6, $7, $8, $9, $10)
    on conflict do nothing
  `,
    [
      rpsNumero,
      '1',
      rpsData.descricaoServico,
      totalServicos,
      valorISS,
      prestador[0].cnpj,
      tomador.cpf_cnpj,
      'rps_criado',
      dados.municipio,
      JSON.stringify(dados.faturasIds),
    ]
  );

  return { rpsNumero, rpsData };
}

/**
 * Emitir NFS-e (conversão RPS → NFS-e)
 * Requer certificado digital A1 ou integração via webservice municipal
 */
export async function emitirNFSe(
  pool: Pool,
  rpsNumero: string,
  opcoes?: {
    certificadoPath?: string;
    senhasCertificado?: string;
    urlWebserviceMunicipal?: string; // padrão: São Paulo
  }
): Promise<ResultadoEmissaoNFSe> {
  // Recuperar RPS criado
  const { rows: rpsData } = await pool.query<{
    rps_numero: string;
    descricao_servico: string;
    valor_servico: string;
    valor_iss: string;
    prestador_cnpj: string;
    tomador_cpf_cnpj: string;
    municipio_codigo: string;
  }>(
    `
    select
      rps_numero,
      descricao_servico,
      valor_servico,
      valor_iss,
      prestador_cnpj,
      tomador_cpf_cnpj,
      municipio_codigo
    from auditoria_nfse
    where rps_numero = $1
    limit 1
  `,
    [rpsNumero]
  );

  if (rpsData.length === 0) {
    return {
      sucesso: false,
      erro: 'RPS não encontrado',
      dataEmissao: new Date().toISOString(),
    };
  }

  const rps = rpsData[0];

  // Validar integridade do RPS
  const valorServico = parseFloat(rps.valor_servico);
  const valorISS = parseFloat(rps.valor_iss);

  if (valorServico <= 0 || valorISS < 0) {
    return {
      sucesso: false,
      erro: 'Valores inválidos no RPS',
      dataEmissao: new Date().toISOString(),
    };
  }

  // Gerar número NFS-e único
  const { rows: ultimoNFSe } = await pool.query<{ max_num: number }>(
    `
    select max(cast(numero_nfse as integer)) as max_num
    from auditoria_nfse
    where numero_nfse is not null
      and numero_nfse ~ '^[0-9]+$'
  `
  );

  const numeroNFSe = String((ultimoNFSe[0]?.max_num || 0) + 1).padStart(8, '0');
  const dataEmissao = new Date();
  const codigoVerificacao = gerarCodigoVerificacao(numeroNFSe, rps.prestador_cnpj);

  // TODO: Integração real com webservice municipal
  // Por enquanto, simular emissão com estado 'emitido'
  // Em produção, seria necessário:
  // 1. Assinar XML com certificado digital
  // 2. Enviar para webservice municipal
  // 3. Armazenar resposta e número NFS-e oficial

  // Atualizar status no banco
  await pool.query(
    `
    update auditoria_nfse
    set
      numero_nfse = $1,
      status = $2,
      codigo_verificacao = $3,
      data_emissao = $4
    where rps_numero = $5
  `,
    [numeroNFSe, 'emitido', codigoVerificacao, dataEmissao.toISOString(), rpsNumero]
  );

  return {
    sucesso: true,
    numeroNFSe,
    codigoVerificacao,
    dataEmissao: dataEmissao.toISOString(),
  };
}

/**
 * Cancelar NFS-e já emitida
 * Requer justificativa e mantém auditoria
 */
export async function cancelarNFSe(
  pool: Pool,
  numeroNFSe: string,
  justificativa: string
): Promise<{ sucesso: boolean; erro?: string }> {
  const { rows } = await pool.query<{ numero_nfse: string }>(
    `
    select numero_nfse from auditoria_nfse
    where numero_nfse = $1
    limit 1
  `,
    [numeroNFSe]
  );

  if (rows.length === 0) {
    return { sucesso: false, erro: 'NFS-e não encontrada' };
  }

  // TODO: Integração com webservice municipal para cancelamento
  // Requer certificado digital e protocolo específico por município

  await pool.query(
    `
    update auditoria_nfse
    set
      status = $1,
      motivo_cancelamento = $2,
      data_cancelamento = now()
    where numero_nfse = $3
  `,
    ['cancelado', justificativa, numeroNFSe]
  );

  return { sucesso: true };
}

/**
 * Gerar código de verificação (verificador) para validação offline
 * Baseado em: número NFS-e + CNPJ prestador + timestamp
 */
function gerarCodigoVerificacao(numeroNFSe: string, cnpjPrestador: string): string {
  const timestamp = Date.now().toString();
  const dados = `${numeroNFSe}${cnpjPrestador}${timestamp}`;

  // Simples hash para demonstração
  // Em produção, usar SHA-256 conforme ABRASF
  let hash = 0;
  for (let i = 0; i < dados.length; i++) {
    const char = dados.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash).toString(16).padStart(8, '0').toUpperCase();
}

/**
 * Obter histórico de NFS-e emitidas
 */
export async function obterHistoricoNFSe(
  pool: Pool,
  filtros?: {
    dataInicio?: string;
    dataFim?: string;
    status?: string;
    cnpjPrestador?: string;
  }
): Promise<DadosNFSe[]> {
  let query = `
    select
      numero_nfse,
      '1' as serie_nfse,
      data_emissao,
      data_emissao::date as data_competencia,
      descricao_servico,
      valor_servico::numeric(14,2),
      0 as valor_deducoes,
      (valor_servico - valor_iss)::numeric(14,2) as valor_liquido,
      (valor_iss / valor_servico * 100)::numeric(5,2) as percentual_aliquota,
      valor_iss::numeric(14,2),
      prestador_cnpj,
      tomador_cpf_cnpj,
      rps_numero,
      '1' as rps_serie,
      data_emissao as data_emissao_rps,
      status,
      codigo_verificacao
    from auditoria_nfse
    where 1=1
  `;

  const params: any[] = [];
  let paramIndex = 1;

  if (filtros?.dataInicio) {
    query += ` and data_emissao >= $${paramIndex}::timestamp`;
    params.push(filtros.dataInicio);
    paramIndex++;
  }

  if (filtros?.dataFim) {
    query += ` and data_emissao <= $${paramIndex}::timestamp`;
    params.push(filtros.dataFim);
    paramIndex++;
  }

  if (filtros?.status) {
    query += ` and status = $${paramIndex}`;
    params.push(filtros.status);
    paramIndex++;
  }

  if (filtros?.cnpjPrestador) {
    query += ` and prestador_cnpj = $${paramIndex}`;
    params.push(filtros.cnpjPrestador);
    paramIndex++;
  }

  query += ` order by data_emissao desc`;

  const { rows } = await pool.query<any>(query, params);

  return rows.map((r) => ({
    numeroNFSe: r.numero_nfse || '',
    serieNFSe: r.serie_nfse,
    dataEmissao: r.data_emissao,
    dataCompetencia: r.data_competencia,
    descricaoServico: r.descricao_servico,
    valorServico: parseFloat(r.valor_servico),
    valorDeducoes: parseFloat(r.valor_deducoes),
    valorLiquidoNFSe: parseFloat(r.valor_liquido),
    percentualAliquota: parseFloat(r.percentual_aliquota),
    valorISS: parseFloat(r.valor_iss),
    prestador: {
      cnpj: r.prestador_cnpj,
      razaoSocial: '', // seria preenchido do registro
      endereco: '',
    },
    tomador: {
      cpfCnpj: r.tomador_cpf_cnpj,
      razaoSocial: '',
      endereco: '',
    },
    rps: {
      numero: r.rps_numero,
      serie: r.rps_serie,
      tipo: 'RPS',
      dataEmissaoRPS: r.data_emissao_rps,
    },
    statusNFSe: r.status,
    codigoVerificacao: r.codigo_verificacao,
  }));
}
