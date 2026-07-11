import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import type { GrupoConta, Imovel, PlanoConta, Transacao } from "../types";

export type ClassificacaoPfNegocio = "PF" | "Negócio" | "Transferência" | "Pendente";

/** Deriva PF x Negócio a partir do grupo da conta do plano — não é um campo novo,
 * é a mesma distinção que já existe em plano_de_contas.grupo, só reapresentada como
 * o corte que a perícia pede: 'pessoal' é PF, 'receita'/'despesa' é a atividade de
 * locação (Negócio), 'transferencia' (entre contas próprias, caução) não é nem um
 * nem outro — é só movimentação, teria de contar dois lados para virar PF ou Negócio. */
export function classificarPfNegocio(grupo: GrupoConta | undefined): ClassificacaoPfNegocio {
  if (!grupo) return "Pendente";
  if (grupo === "pessoal") return "PF";
  if (grupo === "receita" || grupo === "despesa") return "Negócio";
  return "Transferência";
}

export interface LinhaConciliacao {
  data: string;
  descricao: string;
  valor: number;
  categoria: string;
  imovel: string;
  classificacao: ClassificacaoPfNegocio;
  origem: string;
}

export function gerarMapaConciliacao(db: Database): LinhaConciliacao[] {
  const transacoes = consultar<Transacao>(db, "SELECT * FROM transacoes ORDER BY data DESC");
  const planoContas = new Map(consultar<PlanoConta>(db, "SELECT * FROM plano_de_contas").map((p) => [p.codigo, p]));
  const imoveis = new Map(consultar<Imovel>(db, "SELECT * FROM imoveis").map((i) => [i.id, i]));

  return transacoes.map((t): LinhaConciliacao => {
    const conta = t.plano_conta_codigo ? planoContas.get(t.plano_conta_codigo) : undefined;
    return {
      data: t.data,
      descricao: t.descricao_original,
      valor: t.valor,
      categoria: conta ? `${conta.codigo} · ${conta.descricao}` : "— sem categoria —",
      imovel: t.imovel_id ? (imoveis.get(t.imovel_id)?.apelido ?? "") : "",
      classificacao: classificarPfNegocio(conta?.grupo),
      origem: t.categorizado_por ?? "pendente",
    };
  });
}

function escaparCampoCsv(valor: string): string {
  return `"${valor.replace(/"/g, '""')}"`;
}

export function gerarCsvConciliacao(linhas: LinhaConciliacao[]): string {
  const cabecalho = ["Data", "Descrição", "Valor", "Categoria", "Imóvel", "PF/Negócio", "Origem"];
  const corpo = linhas.map((l) =>
    [
      l.data,
      l.descricao,
      l.valor.toFixed(2).replace(".", ","),
      l.categoria,
      l.imovel,
      l.classificacao,
      l.origem,
    ]
      .map(escaparCampoCsv)
      .join(";"),
  );
  return [cabecalho.map(escaparCampoCsv).join(";"), ...corpo].join("\n");
}
