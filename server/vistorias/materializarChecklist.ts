// Materializa um `templates_checklist.estrutura` (JSONB) em linhas prontas
// para inserir em `ambientes_vistoria` + `itens_checklist` ao abrir uma
// vistoria de entrada (docs/plano-desenvolvimento-vistorias.md §2.3/§3).
// Função pura — a inserção real (com os ids gerados pelo Postgres) é
// responsabilidade de quem chama (app/actions/vistorias).

export interface TemplateItemChecklist {
  nome: string;
}

export interface TemplateAmbiente {
  ambiente: string;
  itens: TemplateItemChecklist[];
}

export interface AmbienteParaInserir {
  nome: string;
  ordem: number;
  itens: { nome: string; ordem: number }[];
}

export function materializarChecklist(estrutura: TemplateAmbiente[]): AmbienteParaInserir[] {
  if (!Array.isArray(estrutura) || estrutura.length === 0) {
    throw new Error('template sem estrutura de ambientes — cadastre ao menos um ambiente');
  }

  return estrutura.map((ambiente, ordemAmbiente) => {
    if (!ambiente.ambiente?.trim()) {
      throw new Error(`ambiente na posição ${ordemAmbiente} sem nome`);
    }
    if (!Array.isArray(ambiente.itens) || ambiente.itens.length === 0) {
      throw new Error(`ambiente "${ambiente.ambiente}" sem itens de checklist`);
    }

    return {
      nome: ambiente.ambiente,
      ordem: ordemAmbiente,
      itens: ambiente.itens.map((item, ordemItem) => {
        if (!item.nome?.trim()) {
          throw new Error(`item na posição ${ordemItem} do ambiente "${ambiente.ambiente}" sem nome`);
        }
        return { nome: item.nome, ordem: ordemItem };
      }),
    };
  });
}
