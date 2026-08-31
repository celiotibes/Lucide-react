'use server';

// Formulário público de triagem de interesse em coliving — substitui o
// formulário externo hospedado fora do sistema (docs/39). A lógica de
// registro/matching vive em server/integracao/registrarInteresseColiving.ts
// (testável); esta action só valida o formulário e delega.

import { revalidatePath } from 'next/cache';
import { obterPool } from '@/server/integracao/db';
import { registrarInteresseColiving, type DadosPerfilConvivencia } from '@/server/integracao/registrarInteresseColiving';
import type { NivelVetor, QuadroAlergico } from '@/server/coliving/calcularCompatibilidade';

export interface EstadoFormularioInteresse {
  erro?: string;
  sucesso?: boolean;
}

function nivel(formData: FormData, campo: string): NivelVetor {
  const valor = Number(formData.get(campo));
  if (valor !== 1 && valor !== 2 && valor !== 3) {
    throw new Error(`Campo ${campo} inválido`);
  }
  return valor;
}

export async function registrarInteresseAction(
  _estadoAnterior: EstadoFormularioInteresse,
  formData: FormData,
): Promise<EstadoFormularioInteresse> {
  const nome = String(formData.get('nome') ?? '').trim();
  const imovelInteresseId = String(formData.get('imovel_interesse_id') ?? '');
  const comodoInteresseId = String(formData.get('comodo_interesse_id') ?? '');
  const aceiteLgpd = formData.get('aceite_lgpd') === 'on';

  if (!nome || !imovelInteresseId || !comodoInteresseId) {
    return { erro: 'Nome, imóvel e quarto pretendido são obrigatórios.' };
  }
  if (!aceiteLgpd) {
    return { erro: 'É necessário concordar com o tratamento de dados para prosseguir.' };
  }

  let perfil: DadosPerfilConvivencia;
  try {
    perfil = {
      v1Limpeza: nivel(formData, 'v1_limpeza'),
      v2Ruido: nivel(formData, 'v2_ruido'),
      v3Rotina: nivel(formData, 'v3_rotina'),
      v4Fumo: nivel(formData, 'v4_fumo'),
      v5Pets: nivel(formData, 'v5_pets'),
      v6Dieta: nivel(formData, 'v6_dieta'),
      v7Conflito: nivel(formData, 'v7_conflito'),
      temPet: formData.get('tem_pet') === 'on',
      descricaoPet: String(formData.get('descricao_pet') ?? '').trim() || null,
      genero: String(formData.get('genero') ?? '').trim() || null,
      preferenciaGeneroConvivio:
        (formData.get('preferencia_genero_convivio') as 'mesmo_genero' | 'indiferente' | null) || null,
      neurodivergencia: String(formData.get('neurodivergencia') ?? '').trim() || null,
      pcd: String(formData.get('pcd') ?? '').trim() || null,
      condicaoSaude: String(formData.get('condicao_saude') ?? '').trim() || null,
      quadroAlergico: (String(formData.get('quadro_alergico') ?? 'nenhuma') as QuadroAlergico),
      quadroAlergicoDetalhe: String(formData.get('quadro_alergico_detalhe') ?? '').trim() || null,
    };
  } catch {
    return { erro: 'Responda todas as perguntas do perfil de convivência.' };
  }

  const contato = String(formData.get('contato') ?? '').trim() || null;
  const imovelInteresse2Id = String(formData.get('imovel_interesse_2_id') ?? '') || null;
  const comodoInteresse2Id = String(formData.get('comodo_interesse_2_id') ?? '') || null;

  const resultado = await registrarInteresseColiving(obterPool(), {
    nome,
    contato,
    imovelInteresseId,
    comodoInteresseId,
    imovelInteresse2Id,
    comodoInteresse2Id,
    perfil,
  });

  if (!resultado.sucesso) {
    return { erro: resultado.erro };
  }

  revalidatePath('/coliving');
  return { sucesso: true };
}
