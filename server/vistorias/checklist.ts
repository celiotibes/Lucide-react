// Estrutura do checklist de vistoria (vistorias.checklist_json). Categorias
// fixas cobrindo o que normalmente aparece em laudo de vistoria de entrada/
// saída de imóvel residencial — chaves, pintura, elétrica, hidráulica,
// pisos/revestimentos, esquadrias/vidros, mobília em comodato, limpeza,
// área externa. "outros" cobre o que não se encaixa nas categorias fixas.

export const ITENS_CHECKLIST_VISTORIA = [
  'pintura',
  'eletrica',
  'hidraulica',
  'pisos_revestimentos',
  'esquadrias_vidros',
  'mobilia_comodato',
  'limpeza',
  'area_externa',
  'outros',
] as const;

export type ItemChecklistTipo = (typeof ITENS_CHECKLIST_VISTORIA)[number];

export const RUBRICA_ITEM_CHECKLIST: Record<ItemChecklistTipo, string> = {
  pintura: 'Pintura',
  eletrica: 'Instalação elétrica',
  hidraulica: 'Instalação hidráulica',
  pisos_revestimentos: 'Pisos e revestimentos',
  esquadrias_vidros: 'Esquadrias e vidros',
  mobilia_comodato: 'Mobília em comodato',
  limpeza: 'Limpeza',
  area_externa: 'Área externa / jardim',
  outros: 'Outros',
};

export type SituacaoItemChecklist = 'ok' | 'dano' | 'nao_aplica';

export interface ItemChecklistVistoria {
  item: ItemChecklistTipo;
  situacao: SituacaoItemChecklist;
  custoReparo: number | null;
  observacao: string | null;
}

export interface RetencaoCaucaoResumo {
  valorCaucao: number;
  totalDanos: number;
  valorRetido: number;
  valorDevolvido: number;
  saldoDevedor: number;
}

export interface ChecklistVistoria {
  chavesDevolvidas: boolean | null;
  itens: ItemChecklistVistoria[];
  retencaoCaucao?: RetencaoCaucaoResumo;
}

export function checklistVazio(): ChecklistVistoria {
  return {
    chavesDevolvidas: null,
    itens: ITENS_CHECKLIST_VISTORIA.map((item) => ({ item, situacao: 'ok', custoReparo: null, observacao: null })),
  };
}

export function totalDanosChecklist(checklist: ChecklistVistoria): number {
  return checklist.itens
    .filter((i) => i.situacao === 'dano')
    .reduce((soma, i) => soma + (i.custoReparo ?? 0), 0);
}
