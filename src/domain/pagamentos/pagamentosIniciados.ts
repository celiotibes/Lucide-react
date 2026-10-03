/** Pagamentos iniciados (PIX/TED/DOC): modelo de dados e controle de STATUS de um
 * pagamento eletrônico que o app pede para sair — não uma integração real com API bancária
 * de pagamento (isso exige credenciais reais de um provedor — Pluggy Pagamentos, Banco
 * Central via PIX, etc. — que não existem neste ambiente e são decisão de
 * infraestrutura/contrato comercial fora do escopo deste módulo).
 *
 * Hoje o app só IMPORTA extrato (OFX/Pluggy, ver src/domain/importacao/cofre.ts e
 * triagem.ts) — nunca envia PIX/TED/DOC de verdade. Este módulo cobre o que falta desenhar
 * ANTES de uma integração real existir: o ciclo de vida do pagamento como dado.
 *
 *   solicitado → confirmado → conciliado
 *              ↘ falhou
 *
 * `confirmarPagamento()` é o PONTO DE ENTRADA para quando um provedor real confirmar um
 * pagamento: hoje é chamado manualmente (ou por teste); quando a integração existir, será
 * chamado pelo webhook/callback do provedor. Ela só RECEBE a confirmação e atualiza o
 * status — nunca chama uma API externa de verdade (nenhuma função deste arquivo faz
 * requisição de rede).
 *
 * A conciliação com a transação bancária real segue o mesmo princípio de
 * `src/domain/documentos/matching.ts` (documento_transacoes): nunca automática. O extrato
 * importado entra em triagem (triagem.ts), vira uma transação quando aprovado, e só então
 * uma pessoa liga essa transação ao pagamento que a originou — `transacao_id` prova que o
 * pagamento realmente saiu, exatamente como `documento_transacoes.status` só vira
 * 'confirmado' com confirmação explícita do usuário.
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { obterContaAPagar } from "../contasAPagar/contasAPagar";

export type TipoPagamento = "pix" | "ted" | "doc";
export type StatusPagamento = "solicitado" | "confirmado" | "falhou" | "conciliado";

export interface PagamentoIniciado {
  id: number;
  entidade_id: number;
  conta_bancaria_id: number;
  tipo: TipoPagamento;
  valor: number;
  destinatario_nome: string;
  destinatario_documento: string;
  destinatario_chave_pix: string | null;
  status: StatusPagamento;
  contas_a_pagar_id: number | null;
  data_solicitacao: string;
  data_confirmacao: string | null;
  motivo_falha: string | null;
  transacao_id: number | null;
}

export interface NovoPagamentoIniciado {
  entidade_id: number;
  conta_bancaria_id: number;
  tipo: TipoPagamento;
  valor: number;
  destinatario_nome: string;
  destinatario_documento: string;
  /** Só é válida (e só é aceita) quando `tipo === 'pix'`. */
  destinatario_chave_pix?: string;
  /** Quando presente, este pagamento é a baixa de uma obrigação já registrada — a
   * obrigação precisa existir e ainda não estar paga/cancelada. */
  contas_a_pagar_id?: number;
  data_solicitacao: string;
}

export interface ResultadoPagamentoIniciado {
  sucesso: boolean;
  mensagem: string;
  id?: number;
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function obterPagamentoBruto(db: Database, id: number): PagamentoIniciado | null {
  return consultar<PagamentoIniciado>(db, "SELECT * FROM pagamentos_iniciados WHERE id = ?", [id])[0] ?? null;
}

/** Mesma leitura, para quem só precisa consultar um pagamento (ex.: tela de detalhe). */
export function obterPagamento(db: Database, id: number): PagamentoIniciado | null {
  return obterPagamentoBruto(db, id);
}

/** Cria o registro de um pagamento a ser iniciado, com status='solicitado'.
 *
 * Se vier de uma `contas_a_pagar_id`, valida que a obrigação existe e ainda está pendente
 * (não paga, não cancelada) — pagar uma obrigação já baixada ou cancelada duplicaria a
 * saída de caixa ou pagaria algo que deixou de ser devido. */
export function solicitarPagamento(db: Database, dados: NovoPagamentoIniciado): ResultadoPagamentoIniciado {
  if (!(dados.valor > 0)) {
    return { sucesso: false, mensagem: "Informe um valor positivo." };
  }
  if (!dados.destinatario_nome?.trim()) {
    return { sucesso: false, mensagem: "Informe o nome do destinatário." };
  }
  if (!dados.destinatario_documento?.trim()) {
    return { sucesso: false, mensagem: "Informe o CPF/CNPJ do destinatário." };
  }
  if (!dados.data_solicitacao) {
    return { sucesso: false, mensagem: "Informe a data de solicitação." };
  }
  if (dados.destinatario_chave_pix && dados.tipo !== "pix") {
    return { sucesso: false, mensagem: "Chave PIX só se aplica a pagamentos do tipo 'pix'." };
  }

  const [contaBancaria] = consultar<{ id: number }>(db, "SELECT id FROM contas_bancarias WHERE id = ?", [
    dados.conta_bancaria_id,
  ]);
  if (!contaBancaria) {
    return { sucesso: false, mensagem: `Conta bancária ${dados.conta_bancaria_id} não encontrada.` };
  }

  if (dados.contas_a_pagar_id !== undefined) {
    const obrigacao = obterContaAPagar(db, dados.contas_a_pagar_id, dados.data_solicitacao);
    if (!obrigacao) {
      return { sucesso: false, mensagem: `Conta a pagar ${dados.contas_a_pagar_id} não encontrada.` };
    }
    if (obrigacao.status_calculado === "paga") {
      return { sucesso: false, mensagem: "Conta a pagar já está paga — não é possível solicitar novo pagamento." };
    }
    if (obrigacao.status_calculado === "cancelada") {
      return { sucesso: false, mensagem: "Conta a pagar cancelada — não é possível solicitar pagamento." };
    }
  }

  executar(
    db,
    `INSERT INTO pagamentos_iniciados (
      entidade_id, conta_bancaria_id, tipo, valor, destinatario_nome, destinatario_documento,
      destinatario_chave_pix, status, contas_a_pagar_id, data_solicitacao
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'solicitado', ?, ?)`,
    [
      dados.entidade_id,
      dados.conta_bancaria_id,
      dados.tipo,
      dados.valor,
      dados.destinatario_nome.trim(),
      dados.destinatario_documento.trim(),
      dados.destinatario_chave_pix?.trim() || null,
      dados.contas_a_pagar_id ?? null,
      dados.data_solicitacao,
    ],
  );

  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");
  return { sucesso: true, mensagem: "Pagamento solicitado.", id };
}

/** PONTO DE ENTRADA para quando um provedor real confirmar o pagamento. Hoje é chamado
 * manualmente (ou por teste); quando a integração de pagamento existir de verdade, é aqui
 * que o webhook/callback do provedor deve cair — esta função só RECEBE a confirmação, ela
 * nunca chama nada externo. Só sai de 'solicitado'; confirmar de novo (ou confirmar algo já
 * falhou/conciliado) é recusado. */
export function confirmarPagamento(
  db: Database,
  pagamento_id: number,
  data_confirmacao?: string,
): ResultadoPagamentoIniciado {
  const pagamento = obterPagamentoBruto(db, pagamento_id);
  if (!pagamento) {
    return { sucesso: false, mensagem: `Pagamento ${pagamento_id} não encontrado.` };
  }
  if (pagamento.status !== "solicitado") {
    return {
      sucesso: false,
      mensagem: `Pagamento está '${pagamento.status}' — só é possível confirmar um pagamento 'solicitado'.`,
    };
  }

  const data = data_confirmacao ?? hoje();
  executar(db, "UPDATE pagamentos_iniciados SET status = 'confirmado', data_confirmacao = ? WHERE id = ?", [
    data,
    pagamento_id,
  ]);
  return { sucesso: true, mensagem: "Pagamento confirmado.", id: pagamento_id };
}

/** Registra que o pagamento falhou (recusado ou revertido pelo provedor). Exige motivo —
 * mesmo princípio de rejeitarLinhas()/cancelarContaAPagar(): "falhou sem motivo" não
 * explica por que o dinheiro não saiu. Não é possível falhar um pagamento já conciliado
 * (prova de que ele realmente saiu) nem um que já falhou. */
export function registrarFalhaPagamento(
  db: Database,
  pagamento_id: number,
  motivo: string,
): ResultadoPagamentoIniciado {
  if (!motivo?.trim()) {
    return { sucesso: false, mensagem: "Informe o motivo da falha." };
  }
  const pagamento = obterPagamentoBruto(db, pagamento_id);
  if (!pagamento) {
    return { sucesso: false, mensagem: `Pagamento ${pagamento_id} não encontrado.` };
  }
  if (pagamento.status === "conciliado") {
    return { sucesso: false, mensagem: "Pagamento já conciliado com uma transação real — não pode ser marcado como falho." };
  }
  if (pagamento.status === "falhou") {
    return { sucesso: false, mensagem: "Pagamento já está marcado como falho." };
  }

  executar(db, "UPDATE pagamentos_iniciados SET status = 'falhou', motivo_falha = ? WHERE id = ?", [
    motivo.trim(),
    pagamento_id,
  ]);
  return { sucesso: true, mensagem: "Falha de pagamento registrada.", id: pagamento_id };
}

/** Liga o pagamento à transação bancária real que apareceu no extrato importado e o marca
 * como 'conciliado'. Mesmo princípio de `documento_transacoes`/matching.ts: nunca automática
 * — só roda quando alguém confirma explicitamente que ESTA transação é a saída deste
 * pagamento. Exige que o pagamento já esteja 'confirmado' (não dá para conciliar algo que o
 * provedor nunca confirmou) e que a transação exista de fato (não aceita id inválido). */
export function conciliarPagamentoComTransacao(
  db: Database,
  pagamento_id: number,
  transacao_id: number,
): ResultadoPagamentoIniciado {
  const pagamento = obterPagamentoBruto(db, pagamento_id);
  if (!pagamento) {
    return { sucesso: false, mensagem: `Pagamento ${pagamento_id} não encontrado.` };
  }
  if (pagamento.status !== "confirmado") {
    return {
      sucesso: false,
      mensagem: `Pagamento está '${pagamento.status}' — só é possível conciliar um pagamento 'confirmado'.`,
    };
  }

  const [transacao] = consultar<{ id: number }>(db, "SELECT id FROM transacoes WHERE id = ?", [transacao_id]);
  if (!transacao) {
    return { sucesso: false, mensagem: `Transação ${transacao_id} não encontrada.` };
  }

  executar(db, "UPDATE pagamentos_iniciados SET status = 'conciliado', transacao_id = ? WHERE id = ?", [
    transacao_id,
    pagamento_id,
  ]);
  return { sucesso: true, mensagem: "Pagamento conciliado com a transação bancária.", id: pagamento_id };
}

/** Pagamentos solicitados ou confirmados ainda não conciliados — o que precisa de atenção
 * humana (falta a transação real aparecer no extrato, ou falta alguém ligar as duas
 * pontas). Pagamentos 'falhou' não aparecem aqui: já têm desfecho registrado, não pendência
 * de conciliação. */
export function relatorioPagamentosPendentes(db: Database, entidade_id: number): PagamentoIniciado[] {
  return consultar<PagamentoIniciado>(
    db,
    `SELECT * FROM pagamentos_iniciados
     WHERE entidade_id = ? AND status IN ('solicitado', 'confirmado')
     ORDER BY data_solicitacao ASC, id ASC`,
    [entidade_id],
  );
}
