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

  const { rows: modeloRows } = await pool.query<{ corpo_html: string; versao: number }>(
    `select corpo_html, versao from modelos_contrato where cidade_id = $1 and ativo limit 1`,
    [contrato.cidade_id],
  );
  if (modeloRows.length === 0) {
    throw new ContratoSemModeloError(
      `Nenhum modelo de contrato ativo cadastrado para ${contrato.cidade_nome}/${contrato.cidade_uf}`,
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

  const { rows: garantiaRows } = await pool.query(
    `select tipo, valor, forma_pagamento, parcelas from garantias where contrato_id = $1 order by criado_em desc limit 1`,
    [contratoId],
  );
  const garantia = garantiaRows[0] ?? null;

  const mobilia = await buscarMobiliaDoContrato(pool, contrato.imovel_id, contrato.comodo_id);

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
    garantia_tipo: garantia?.tipo ?? '',
    garantia_valor: garantia?.valor ? formatarMoeda(garantia.valor) : '',
    garantia_forma_pagamento: garantia?.forma_pagamento ?? '',
    garantia_parcelas: garantia?.parcelas ?? '',
    locatarios,
    solidarios,
    mobilia,
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
