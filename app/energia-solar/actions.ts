'use server';

// Fecha a lacuna que docs/30-auditoria-geracao-solar.md apontava como
// "ainda falta": telas de back-office para lançar a fatura Celesc GD,
// confirmá-la e disparar o cálculo da auditoria mensal sem depender do
// cron (`app/api/cron/calcular-auditoria-energia-solar`).

import { revalidatePath } from 'next/cache';
import { obterPool } from '@/server/integracao/db';
import { registrarFaturaCelescGD, confirmarFaturaCelescGD } from '@/server/integracao/registrarFaturaCelescGD';
import { calcularAuditoriaEnergiaSolarDoResidencial } from '@/server/integracao/calcularAuditoriaEnergiaSolar';

export interface EstadoFormularioFaturaCelesc {
  erro?: string;
}

export async function criarFaturaCelesc(
  _estadoAnterior: EstadoFormularioFaturaCelesc,
  formData: FormData,
): Promise<EstadoFormularioFaturaCelesc> {
  const competenciaParam = String(formData.get('competencia') ?? '');
  const match = /^(\d{4})-(\d{2})$/.exec(competenciaParam);
  if (!match) {
    return { erro: 'Competência inválida (formato esperado: mês/ano).' };
  }

  const resultado = await registrarFaturaCelescGD(obterPool(), {
    residencialId: String(formData.get('residencial_id') ?? ''),
    competencia: `${match[1]}-${match[2]}-01`,
    valorTotal: Number(formData.get('valor_total')),
    energiaInjetadaKwh: Number(formData.get('energia_injetada_kwh')),
    energiaConsumidaRedeKwh: Number(formData.get('energia_consumida_rede_kwh')),
  });

  if (!resultado.sucesso) {
    return { erro: resultado.erro };
  }

  revalidatePath('/energia-solar');
  return {};
}

// Confirmação por botão simples (sem useActionState) — mesmo padrão de
// app/conciliacao-bancaria/actions.ts: os únicos dados vêm de uma linha
// real já exibida na tela, não há validação de formulário a reportar de
// volta. `confirmadoPorPessoaId` fica null: nenhuma tela do sistema tem
// sessão de usuário autenticado ainda (docs/09).
export async function confirmarFatura(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!id) throw new Error('id da fatura ausente');

  await confirmarFaturaCelescGD(obterPool(), id, null);
  revalidatePath('/energia-solar');
}

export interface EstadoCalculoAuditoria {
  mensagem?: string;
  erro?: string;
}

export async function calcularAuditoria(
  _estadoAnterior: EstadoCalculoAuditoria,
  formData: FormData,
): Promise<EstadoCalculoAuditoria> {
  const residencialId = String(formData.get('residencial_id') ?? '');
  const competenciaParam = String(formData.get('competencia') ?? '');
  const match = /^(\d{4})-(\d{2})$/.exec(competenciaParam);
  if (!residencialId || !match) {
    return { erro: 'Selecione o residencial e a competência.' };
  }

  const competencia = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  const resultado = await calcularAuditoriaEnergiaSolarDoResidencial(obterPool(), residencialId, competencia);

  revalidatePath('/energia-solar');

  if (!resultado.calculada) {
    const MOTIVOS: Record<string, string> = {
      sem_geracao_confirmada: 'Ainda não há geração solar confirmada para essa competência.',
      sem_fatura_celesc_confirmada: 'Ainda não há fatura Celesc GD confirmada para essa competência.',
      sem_leitura_de_inquilino_no_periodo: 'Ainda não há leitura de energia de inquilino confirmada para essa competência.',
    };
    return { erro: MOTIVOS[resultado.motivo] ?? resultado.motivo };
  }

  return {
    mensagem: `Calculado: ${resultado.areaComumKwh.toFixed(2)} kWh de área comum${resultado.inconsistente ? ' (inconsistente — verifique as leituras)' : ''}.`,
  };
}
