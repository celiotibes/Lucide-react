import { describe, expect, it } from 'vitest';
import { checklistVazio, totalDanosChecklist, type ChecklistVistoria } from './checklist';

describe('checklistVazio', () => {
  it('cria um item por categoria, todos como ok', () => {
    const checklist = checklistVazio();
    expect(checklist.itens.every((i) => i.situacao === 'ok')).toBe(true);
    expect(checklist.chavesDevolvidas).toBeNull();
  });
});

describe('totalDanosChecklist', () => {
  it('soma só os itens marcados como dano', () => {
    const checklist: ChecklistVistoria = {
      chavesDevolvidas: true,
      itens: [
        { item: 'pintura', situacao: 'dano', custoReparo: 300, observacao: null },
        { item: 'eletrica', situacao: 'ok', custoReparo: null, observacao: null },
        { item: 'hidraulica', situacao: 'dano', custoReparo: 150, observacao: 'vazamento' },
        { item: 'limpeza', situacao: 'nao_aplica', custoReparo: null, observacao: null },
      ],
    };
    expect(totalDanosChecklist(checklist)).toBe(450);
  });

  it('devolve zero quando nenhum item tem dano', () => {
    expect(totalDanosChecklist(checklistVazio())).toBe(0);
  });

  it('trata custoReparo ausente num item de dano como zero', () => {
    const checklist: ChecklistVistoria = {
      chavesDevolvidas: null,
      itens: [{ item: 'outros', situacao: 'dano', custoReparo: null, observacao: 'a orçar' }],
    };
    expect(totalDanosChecklist(checklist)).toBe(0);
  });
});
