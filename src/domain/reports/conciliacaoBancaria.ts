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

function escaparHtml(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Exportação em Excel sem nenhuma dependência de terceiro: uma tabela HTML servida com MIME
 * type application/vnd.ms-excel e extensão .xls — Excel, LibreOffice Calc e Google Sheets
 * (importação) abrem esse formato nativamente, é o mesmo truque usado por incontáveis sistemas
 * corporativos para "exportar em Excel" sem precisar de uma biblioteca de geração de XLSX
 * binário real. Deliberadamente evitado o pacote `xlsx` (SheetJS) do npm — na auditoria de
 * completude, instalá-lo trouxe vulnerabilidades HIGH conhecidas (o pacote do npm não recebe
 * os mesmos patches de segurança da distribuição oficial da SheetJS); não valia o risco para
 * uma necessidade que este truque resolve sem dependência nenhuma. Cada valor numérico ganha
 * um atributo x:num para o Excel reconhecer como número (não texto), preservando ordenação e
 * soma de coluna ao abrir. */
export function gerarXlsxConciliacao(linhas: LinhaConciliacao[]): string {
  const cabecalho = ["Data", "Descrição", "Valor", "Categoria", "Imóvel", "PF/Negócio", "Origem"];
  const linhasHtml = linhas.map(
    (l) =>
      `<tr>` +
      `<td>${escaparHtml(l.data)}</td>` +
      `<td>${escaparHtml(l.descricao)}</td>` +
      `<td x:num="${l.valor}">${l.valor.toFixed(2).replace(".", ",")}</td>` +
      `<td>${escaparHtml(l.categoria)}</td>` +
      `<td>${escaparHtml(l.imovel)}</td>` +
      `<td>${escaparHtml(l.classificacao)}</td>` +
      `<td>${escaparHtml(l.origem)}</td>` +
      `</tr>`,
  );
  return (
    `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>` +
    `<table><thead><tr>${cabecalho.map((c) => `<th>${escaparHtml(c)}</th>`).join("")}</tr></thead>` +
    `<tbody>${linhasHtml.join("")}</tbody></table></body></html>`
  );
}
