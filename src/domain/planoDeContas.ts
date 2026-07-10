import type { Database } from "sql.js";
import { consultar, executar } from "../db/connection";

// Plano de contas padrão — compartilhado entre o gerador de dados de demonstração
// (dadosSimulados.ts) e a inicialização real do banco (db/connection.ts), para nunca
// divergir e para que um usuário que NUNCA clique em "Carregar dados de demonstração"
// ainda tenha categorias para classificar suas transações reais desde o primeiro uso.
export const PLANO_DE_CONTAS = [
  { codigo: "1.1.01", descricao: "Aluguéis — contratos residenciais", grupo: "receita", natureza: "credito" },
  { codigo: "1.2.01", descricao: "Airbnb / temporada", grupo: "receita", natureza: "credito" },
  { codigo: "1.3.01", descricao: "Multas e juros de atraso recebidos", grupo: "receita", natureza: "credito" },
  { codigo: "1.4.01", descricao: "Créditos jurídicos / reembolsos de advocacia", grupo: "receita", natureza: "credito" },
  { codigo: "1.9.01", descricao: "Salário — servidor federal", grupo: "pessoal", natureza: "credito" },
  { codigo: "2.1.01", descricao: "Condomínio e IPTU", grupo: "despesa", natureza: "debito" },
  { codigo: "2.1.02", descricao: "Manutenção corrente", grupo: "despesa", natureza: "debito" },
  { codigo: "2.1.03", descricao: "Obra / capex", grupo: "despesa", natureza: "debito" },
  { codigo: "2.1.04", descricao: "Prestadores de serviço", grupo: "despesa", natureza: "debito" },
  { codigo: "2.1.05", descricao: "Financiamento imobiliário — juros", grupo: "despesa", natureza: "debito" },
  { codigo: "2.1.06", descricao: "Financiamento imobiliário — amortização", grupo: "despesa", natureza: "debito" },
  { codigo: "2.1.07", descricao: "Taxas de plataforma (Airbnb/imobiliária)", grupo: "despesa", natureza: "debito" },
  { codigo: "2.1.08", descricao: "Inadimplência / perdas com locatário", grupo: "despesa", natureza: "debito" },
  { codigo: "2.1.09", descricao: "Tarifas bancárias de cobrança (boleto/PIX)", grupo: "despesa", natureza: "debito" },
  { codigo: "2.1.10", descricao: "Despesas administrativas gerais (não alocáveis a um imóvel específico)", grupo: "despesa", natureza: "debito" },
  { codigo: "2.1.11", descricao: "Advocacia — honorários e despesas jurídicas", grupo: "despesa", natureza: "debito" },
  { codigo: "2.2.01", descricao: "Despesas pessoais (pessoa física, fora da atividade)", grupo: "pessoal", natureza: "debito" },
  { codigo: "9.0.01", descricao: "Transferência entre contas próprias", grupo: "transferencia", natureza: "debito" },
  { codigo: "9.0.02", descricao: "Depósito caução recebido/devolvido", grupo: "transferencia", natureza: "credito" },
] as const;

/** Garante que o plano de contas padrão exista — idempotente, não duplica se já
 * houver linhas (seja de uma sessão anterior, seja de "Carregar dados de demonstração"). */
export function garantirPlanoDeContasPadrao(db: Database): void {
  const [{ total }] = consultar<{ total: number }>(db, "SELECT COUNT(*) AS total FROM plano_de_contas");
  if (total > 0) return;
  for (const conta of PLANO_DE_CONTAS) {
    executar(db, "INSERT INTO plano_de_contas (codigo, descricao, grupo, natureza) VALUES (?, ?, ?, ?)", [
      conta.codigo,
      conta.descricao,
      conta.grupo,
      conta.natureza,
    ]);
  }
}
