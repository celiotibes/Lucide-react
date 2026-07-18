// Consolida modelo regional + dados do contrato + partes + garantia +
// inventário de mobília + cláusulas adicionais num único HTML pronto para
// visualizar ou converter em PDF (docs/27-motor-de-contratos.md). Só lê e
// funde — não grava nada em `documentos_gerados` ainda, porque persistir
// o PDF final depende de um storage (Supabase Storage, ainda bloqueado
// por credencial — docs/09) que este ambiente não tem para testar de
// ponta a ponta.

import type { Pool, PoolClient } from 'pg';
import { mesclarTemplate, paragrafosParaHtml, type DadosTemplate, type LinhaTemplate } from '../legaldesign/mesclarTemplate';

const RUBRICA_PAPEL: Record<string, string> = {
  locatario_principal: 'Locatário',
  locatario_adicional: 'Locatário',
  fiador: 'Fiador',
  responsavel_solidario: 'Responsável Financeiro Solidário',
};

const RUBRICA_ESTADO_CIVIL: Record<string, string> = {
  solteiro: 'solteiro(a)',
  casado: 'casado(a)',
  divorciado: 'divorciado(a)',
  viuvo: 'viúvo(a)',
  uniao_estavel: 'em união estável',
};

const RUBRICA_COMPONENTE: Record<string, string> = {
  comodato_moveis: 'Comodato de bens móveis',
  vaga_garagem: 'Vaga de garagem',
  iptu_repassado: 'IPTU',
  condominio_repassado: 'Condomínio',
  taxa_lixo_repassada: 'Taxa de coleta de resíduos',
  taxa_bombeiros_repassada: 'Taxa de bombeiros',
  outro: 'Outro',
};

const RUBRICA_TIPO_GARANTIA: Record<string, string> = {
  caucao: 'Caução',
  fiador: 'Fiador',
  seguro_fianca: 'Seguro-fiança',
  titulo_capitalizacao: 'Título de capitalização',
  seguro_incendio: 'Seguro-incêndio',
};

const RUBRICA_FINALIDADE_GARANTIA: Record<string, string> = {
  locacao: 'Locação',
  comodato: 'Comodato de bens móveis',
  geral: 'Geral',
};

const RUBRICA_FORMA_PAGAMENTO: Record<string, string> = {
  pix: 'PIX',
  boleto: 'boleto',
  dinheiro: 'dinheiro',
  parcelado: 'parcelado',
};

// Categoria do imóvel para resolução do modelo (schema seção 28) — só
// distingue comercial de residencial, o único corte que os 3 contratos
// reais de Curitiba evidenciam até aqui (docs/11, "Sétimo achado").
function categoriaDoImovel(tipoImovel: string): 'residencial' | 'comercial' {
  return tipoImovel === 'sala_comercial' ? 'comercial' : 'residencial';
}

export class ContratoSemModeloError extends Error {}

export interface ResultadoGerarContratoHtml {
  html: string;
  modeloVersao: number;
  modalidade: 'kitnet_integral' | 'coliving_quarto';
}

export async function gerarContratoHtml(pool: Pool | PoolClient, contratoId: string): Promise<ResultadoGerarContratoHtml> {
  const { rows: contratoRows } = await pool.query(
    `select c.*, i.identificacao as imovel_identificacao, i.tipo as imovel_tipo, i.endereco as imovel_endereco,
            i.cidade_id, cid.nome as cidade_nome, cid.uf as cidade_uf,
            r.nome as residencial_nome,
            co.identificacao as comodo_identificacao, co.area_m2 as comodo_area_m2
     from contratos c
     join imoveis i on i.id = c.imovel_id
     join cidades cid on cid.id = i.cidade_id
     left join residenciais r on r.id = i.residencial_id
     left join comodos co on co.id = c.comodo_id
     where c.id = $1`,
    [contratoId],
  );
  if (contratoRows.length === 0) {
    throw new ContratoSemModeloError(`Contrato ${contratoId} não encontrado`);
  }
  const contrato = contratoRows[0];

  const categoria = categoriaDoImovel(contrato.imovel_tipo);
  const { rows: modeloRows } = await pool.query<{ corpo_html: string; versao: number }>(
    `select corpo_html, versao from modelos_contrato
     where cidade_id = $1 and ativo and categoria in ($2, 'geral')
     order by (categoria = $2) desc
     limit 1`,
    [contrato.cidade_id, categoria],
  );
  if (modeloRows.length === 0) {
    throw new ContratoSemModeloError(
      `Nenhum modelo de contrato ativo cadastrado para ${contrato.cidade_nome}/${contrato.cidade_uf} (categoria "${categoria}" ou "geral")`,
    );
  }

  const { rows: partesRows } = await pool.query<LinhaTemplate>(
    `select p.nome, p.cpf_cnpj as cpf, p.rg, p.profissao, p.estado_civil, p.email, p.telefone, cp.papel
     from contrato_partes cp
     join pessoas p on p.id = cp.pessoa_id
     where cp.contrato_id = $1
     order by (cp.papel = 'locatario_principal') desc, p.nome`,
    [contratoId],
  );
  const locatarios = partesRows
    .filter((p) => p.papel === 'locatario_principal' || p.papel === 'locatario_adicional')
    .map((p) => formatarParte(p));
  const solidarios = partesRows
    .filter((p) => p.papel === 'fiador' || p.papel === 'responsavel_solidario')
    .map((p) => formatarParte(p));

  // Um contrato pode ter mais de uma garantia — evidência real (docs/32):
  // Life Space Estação 509-B e Apto 503/Central Station somam uma garantia
  // para a locação e outra para o aditivo de comodato de bens móveis, com
  // valores e formas de pagamento diferentes entre si. `garantias` expõe
  // TODAS ao template (`{{#each garantias}}`); os campos singulares
  // (`garantia_tipo` etc.) continuam existindo, apontando para a primeira
  // por ordem de criação, só para não quebrar o modelo de Florianópolis
  // (evidência real: contrato único, uma garantia só).
  const { rows: garantiaRows } = await pool.query<{
    tipo: string;
    valor: string;
    forma_pagamento: string | null;
    parcelas: number | null;
    finalidade: string | null;
  }>(
    `select tipo, valor, forma_pagamento, parcelas, finalidade from garantias where contrato_id = $1 order by criado_em`,
    [contratoId],
  );
  const garantia = garantiaRows[0] ?? null;
  const garantias: LinhaTemplate[] = garantiaRows.map((g) => ({
    tipo_label: RUBRICA_TIPO_GARANTIA[g.tipo] ?? g.tipo,
    valor: formatarMoeda(g.valor),
    finalidade_label: g.finalidade ? RUBRICA_FINALIDADE_GARANTIA[g.finalidade] ?? g.finalidade : 'Geral',
    forma_pagamento: g.forma_pagamento ? RUBRICA_FORMA_PAGAMENTO[g.forma_pagamento] ?? g.forma_pagamento : 'não definida',
    parcelas: g.parcelas ?? '',
  }));

  const mobilia = await buscarMobiliaDoContrato(pool, contrato.imovel_id, contrato.comodo_id);
  const componentesMensais = await buscarComponentesMensais(pool, contratoId);

  const modalidade: 'kitnet_integral' | 'coliving_quarto' = contrato.comodo_id ? 'coliving_quarto' : 'kitnet_integral';
  const objetoLocacao = contrato.comodo_id
    ? `o cômodo "${contrato.comodo_identificacao}" (uso privativo, com direito de uso das áreas comuns) da unidade ${contrato.imovel_identificacao}${contrato.residencial_nome ? `, ${contrato.residencial_nome}` : ''}`
    : `a unidade ${contrato.imovel_identificacao}${contrato.residencial_nome ? `, ${contrato.residencial_nome}` : ''} (integral)`;

  const dados: DadosTemplate = {
    imovel_identificacao: contrato.imovel_identificacao,
    imovel_endereco: contrato.imovel_endereco ?? '',
    cidade_nome: contrato.cidade_nome,
    cidade_uf: contrato.cidade_uf,
    objeto_locacao: objetoLocacao,
    modalidade_label: modalidade === 'coliving_quarto' ? 'Co-living (locação por quarto)' : 'Kitnet Integral',
    valor_aluguel: formatarMoeda(contrato.valor_aluguel),
    dia_vencimento: contrato.dia_vencimento,
    data_inicio: formatarData(contrato.data_inicio),
    data_fim: contrato.data_fim ? formatarData(contrato.data_fim) : '',
    indice_reajuste: contrato.indice_reajuste ?? 'não definido',
    garantia_tipo: garantia ? (RUBRICA_TIPO_GARANTIA[garantia.tipo] ?? garantia.tipo) : '',
    garantia_valor: garantia?.valor ? formatarMoeda(garantia.valor) : '',
    garantia_forma_pagamento: garantia?.forma_pagamento
      ? (RUBRICA_FORMA_PAGAMENTO[garantia.forma_pagamento] ?? garantia.forma_pagamento)
      : '',
    garantia_parcelas: garantia?.parcelas ?? '',
    garantias,
    locatarios,
    solidarios,
    mobilia,
    componentes_mensais: componentesMensais,
    clausulas_adicionais_html: paragrafosParaHtml(contrato.clausulas_adicionais),
  };

  const html = mesclarTemplate(modeloRows[0].corpo_html, dados);

  return { html, modeloVersao: modeloRows[0].versao, modalidade };
}

async function buscarMobiliaDoContrato(
  pool: Pool | PoolClient,
  imovelId: string,
  comodoId: string | null,
): Promise<LinhaTemplate[]> {
  if (comodoId) {
    // Opção B (co-living por quarto): mobília privativa daquele cômodo + mobília das áreas comuns.
    const { rows } = await pool.query<LinhaTemplate>(
      `select descricao, categoria, valor_aquisicao
       from ativos_comodato
       where imovel_id = $1 and status = 'ativo' and (comodo_id = $2 or area_comum)
       order by area_comum, descricao`,
      [imovelId, comodoId],
    );
    return rows;
  }
  // Opção A (kitnet integral) ou imóvel sem co-living: inventário inteiro da unidade.
  const { rows } = await pool.query<LinhaTemplate>(
    `select descricao, categoria, valor_aquisicao from ativos_comodato where imovel_id = $1 and status = 'ativo' order by descricao`,
    [imovelId],
  );
  return rows;
}

// Descrição do componente para o TEXTO do contrato (não para a fatura
// mensal — `server/financeiro/valorMensalContrato.ts` continua sendo a
// função certa para isso). Um contrato assinado uma vez não precisa do
// valor exato de um `repassado_variavel` (IPTU/condomínio do mês
// corrente) — precisa descrever a REGRA ("repassado ao valor de face"),
// exatamente como o texto real dos 3 contratos de Curitiba faz
// (docs/11). Só `valor_fixo` e `percentual_do_aluguel` têm número fixo
// para mostrar aqui.
async function buscarComponentesMensais(pool: Pool | PoolClient, contratoId: string): Promise<LinhaTemplate[]> {
  const { rows } = await pool.query<{
    tipo: string;
    descricao: string | null;
    natureza: string;
    valor_fixo: string | null;
    percentual: string | null;
  }>(
    `select tipo, descricao, natureza, valor_fixo, percentual
     from contrato_componentes_mensais where contrato_id = $1 order by criado_em`,
    [contratoId],
  );

  return rows.map((c) => ({
    tipo_label: c.descricao ?? RUBRICA_COMPONENTE[c.tipo] ?? c.tipo,
    valor_exibicao:
      c.natureza === 'valor_fixo'
        ? formatarMoeda(c.valor_fixo!)
        : c.natureza === 'percentual_do_aluguel'
          ? `${(Number(c.percentual) * 100).toFixed(0)}% do aluguel (já incluído)`
          : 'repassado ao valor de face, conforme fatura da concessionária/condomínio',
  }));
}

function formatarParte(parte: LinhaTemplate): LinhaTemplate {
  return {
    ...parte,
    papel_label: RUBRICA_PAPEL[String(parte.papel)] ?? String(parte.papel),
    estado_civil: parte.estado_civil ? RUBRICA_ESTADO_CIVIL[String(parte.estado_civil)] ?? String(parte.estado_civil) : '',
  };
}

function formatarMoeda(valor: string | number): string {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(data: string | Date): string {
  const d = typeof data === 'string' ? new Date(data) : data;
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}
