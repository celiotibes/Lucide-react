'use server';

import { redirect } from 'next/navigation';
import { obterPool } from '@/server/integracao/db';
import { inserirContrato, type DadosGarantia } from './logicaCadastro';

export interface EstadoFormularioContrato {
  erro?: string;
}

export async function criarContrato(
  _estadoAnterior: EstadoFormularioContrato,
  formData: FormData,
): Promise<EstadoFormularioContrato> {
  const responsavelNome = String(formData.get('responsavel_nome') ?? '').trim();

  const resultado = await inserirContrato(obterPool(), {
    imovelId: String(formData.get('imovel_id') ?? ''),
    tipo: String(formData.get('tipo') ?? ''),
    nomeLocatario: String(formData.get('nome_locatario') ?? ''),
    cpfLocatario: String(formData.get('cpf_locatario') ?? '').trim() || null,
    rgLocatario: String(formData.get('rg_locatario') ?? '').trim() || null,
    profissaoLocatario: String(formData.get('profissao_locatario') ?? '').trim() || null,
    estadoCivilLocatario: String(formData.get('estado_civil_locatario') ?? '').trim() || null,
    dataInicio: String(formData.get('data_inicio') ?? ''),
    diaVencimento: Number(formData.get('dia_vencimento')),
    valorAluguel: Number(formData.get('valor_aluguel')),
    clausulasAdicionais: String(formData.get('clausulas_adicionais') ?? '').trim() || null,
    responsavelSolidario: responsavelNome
      ? {
          nome: responsavelNome,
          cpf: String(formData.get('responsavel_cpf') ?? '').trim() || null,
          rg: String(formData.get('responsavel_rg') ?? '').trim() || null,
          profissao: String(formData.get('responsavel_profissao') ?? '').trim() || null,
        }
      : null,
    garantias: extrairGarantias(formData),
  });

  if (!resultado.sucesso) {
    return { erro: resultado.erro };
  }

  redirect('/contratos');
}

// O formulário renderiza um número variável de linhas de garantia
// (0, 1 ou 2 — evidência real: o contrato de Sala Comercial tem só uma
// caução, os de Life Space e Apto 503/Central Station têm duas, uma para
// a locação e outra para o aditivo de comodato). Cada linha usa campos
// indexados garantia_N_*; `garantias_count` (hidden, mantido pelo
// componente client) informa quantas linhas existem.
function extrairGarantias(formData: FormData): DadosGarantia[] {
  const total = Number(formData.get('garantias_count') ?? 0);
  const garantias: DadosGarantia[] = [];
  for (let i = 0; i < total; i++) {
    const tipo = String(formData.get(`garantia_${i}_tipo`) ?? '').trim();
    const valorTexto = String(formData.get(`garantia_${i}_valor`) ?? '').trim();
    if (!tipo || !valorTexto) continue; // linha deixada em branco pelo usuário — ignora, não é erro
    garantias.push({
      tipo,
      valor: Number(valorTexto),
      formaPagamento: String(formData.get(`garantia_${i}_forma_pagamento`) ?? '').trim() || null,
      parcelas: Number(formData.get(`garantia_${i}_parcelas`) ?? '') || null,
      finalidade: String(formData.get(`garantia_${i}_finalidade`) ?? '').trim() || null,
    });
  }
  return garantias;
}
