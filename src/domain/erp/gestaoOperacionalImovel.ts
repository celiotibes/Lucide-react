/** Gestão operacional do imóvel: cadastro de inquilino, agenda de manutenção e resumo das
 * despesas operacionais agendadas — o gap descrito em docs/dominios-a-reconstruir.md (seção
 * 3, "Imóvel — gestão operacional"): o app já concilia o financeiro do imóvel
 * (`contratos_locacao`, `vistorias`), mas não tinha onde guardar quem mora lá nem quando a
 * próxima manutenção está marcada.
 *
 * Os três módulos originais (`imovel-gestao.ts`, `imovel-gestao-ledger-integration.ts`,
 * `relatorios-imovel.ts`) foram apagados por escreverem contra tabelas fictícias
 * (`despesas_operacionais_agendadas`, `imovel_documentos` com o schema errado). Este módulo
 * reconstrói só a parte real do gap — inquilino e manutenção — contra o schema de produção
 * (`contabilidade-reconstituicao/schema.sql`), com duas decisões deliberadas de NÃO
 * reconstrução:
 *
 * 1) `despesas_operacionais_agendadas` NÃO é recriada — já resolvida em
 *    `dashboard-portfolio.ts`: uma despesa operacional agendada do imóvel é uma linha de
 *    `contas_a_pagar` com `imovel_id` preenchido, exatamente como qualquer outro ERP de
 *    referência trata "despesa recorrente" (instâncias concretas com vencimento, não uma
 *    definição de recorrência à parte). `obterResumoDespesasAgendadasImovel` abaixo só lê
 *    `contas_a_pagar` filtrado por imóvel — nunca duplica esse modelo.
 *
 * 2) `imovel_documentos` NÃO é recriada — `documentos` (tipo, arquivo_nome, valor,
 *    data_documento, cnpj_cpf_contraparte, nome_contraparte, criado_em) + `documento_imoveis`
 *    (vínculo N:N com percentual) já cobrem "documento do imóvel" (escritura, IPTU, contrato
 *    de obra etc., sob `tipo = 'outro'` ou `'contrato'` quando cabível) — o mesmo cadastro de
 *    documento já usado para boleto/nota fiscal. A única capacidade que o módulo apagado tinha
 *    e que fica de fora aqui é vencimento/status por documento (`documentos` não tem
 *    `data_vencimento`) — fora do escopo pedido (só inquilinos e manutenções).
 */

import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { listarContasAPagar, type ContaAPagarComStatusCalculado } from "../contasAPagar/contasAPagar";
import type { Inquilino, Manutencao, StatusManutencao } from "../types";

export interface ResultadoOperacaoImovel {
  sucesso: boolean;
  mensagem: string;
  id?: number;
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function imovelExiste(db: Database, imovel_id: number): boolean {
  return consultar<{ id: number }>(db, "SELECT id FROM imoveis WHERE id = ?", [imovel_id]).length > 0;
}

// ============================================================================
// INQUILINOS
// ============================================================================

export interface NovoInquilino {
  imovel_id: number;
  nome: string;
  cpf_cnpj?: string;
  telefone?: string;
  email?: string;
  /** Contrato vigente deste inquilino, quando já identificado — precisa ser um contrato do
   * MESMO imóvel (ver validação abaixo), nunca de outro. */
  contrato_id?: number;
  observacoes?: string;
}

export interface EdicaoInquilino {
  nome?: string;
  cpf_cnpj?: string;
  telefone?: string;
  email?: string;
  /** `null` explícito desvincula o contrato; `undefined` mantém o que já estava. */
  contrato_id?: number | null;
  observacoes?: string;
}

/** Contrato existe e pertence ao mesmo imóvel — nunca aceita um contrato de outro imóvel
 * (achado de auditoria adversarial: sem esta checagem, um erro de digitação no id do
 * contrato ligaria o inquilino ao imóvel errado sem nada acusar). */
function validarContratoDoImovel(db: Database, contrato_id: number, imovel_id: number): string | null {
  const [contrato] = consultar<{ imovel_id: number }>(db, "SELECT imovel_id FROM contratos_locacao WHERE id = ?", [
    contrato_id,
  ]);
  if (!contrato) return `Contrato ${contrato_id} não encontrado.`;
  if (contrato.imovel_id !== imovel_id) {
    return `Contrato ${contrato_id} pertence a outro imóvel (id ${contrato.imovel_id}), não ao imóvel ${imovel_id}.`;
  }
  return null;
}

/** Cadastra um inquilino no imóvel. Não recusa cadastro duplicado de propósito — um mesmo
 * imóvel pode ter mais de um inquilino simultâneo (ex: contrato_locatarios coletivo) e o
 * histórico de inquilinos passados também vive nesta mesma tabela (ver comentário em
 * schema.sql: "quem mora lá hoje" é inferido pelo contrato vigente ligado, não por uma
 * coluna de status). */
export function cadastrarInquilino(db: Database, dados: NovoInquilino): ResultadoOperacaoImovel {
  if (!imovelExiste(db, dados.imovel_id)) {
    return { sucesso: false, mensagem: `Imóvel ${dados.imovel_id} não encontrado.` };
  }
  if (!dados.nome || !dados.nome.trim()) {
    return { sucesso: false, mensagem: "Informe o nome do inquilino." };
  }
  if (dados.contrato_id !== undefined) {
    const erro = validarContratoDoImovel(db, dados.contrato_id, dados.imovel_id);
    if (erro) return { sucesso: false, mensagem: erro };
  }

  executar(
    db,
    `INSERT INTO inquilinos (imovel_id, nome, cpf_cnpj, telefone, email, contrato_id, observacoes, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      dados.imovel_id,
      dados.nome.trim(),
      dados.cpf_cnpj?.trim() || null,
      dados.telefone?.trim() || null,
      dados.email?.trim() || null,
      dados.contrato_id ?? null,
      dados.observacoes?.trim() || null,
      hoje(),
    ],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");
  return { sucesso: true, mensagem: "Inquilino cadastrado.", id };
}

/** Lista os inquilinos de um imóvel, mais recente primeiro — inclui histórico (ex-inquilinos
 * cujo contrato já encerrou), não só o atual. */
export function listarInquilinosPorImovel(db: Database, imovel_id: number): Inquilino[] {
  return consultar<Inquilino>(
    db,
    "SELECT * FROM inquilinos WHERE imovel_id = ? ORDER BY criado_em DESC, id DESC",
    [imovel_id],
  );
}

function obterInquilinoBruto(db: Database, id: number): Inquilino | null {
  return consultar<Inquilino>(db, "SELECT * FROM inquilinos WHERE id = ?", [id])[0] ?? null;
}

/** Atualiza dados cadastrais do inquilino — nunca muda `imovel_id` (mudar de imóvel é um
 * inquilino novo, não uma edição). Cada campo omitido mantém o valor atual; `contrato_id:
 * null` explícito desvincula. */
export function editarInquilino(db: Database, id: number, dados: EdicaoInquilino): ResultadoOperacaoImovel {
  const inquilino = obterInquilinoBruto(db, id);
  if (!inquilino) {
    return { sucesso: false, mensagem: `Inquilino ${id} não encontrado.` };
  }
  const nome = dados.nome !== undefined ? dados.nome.trim() : inquilino.nome;
  if (!nome) {
    return { sucesso: false, mensagem: "Nome do inquilino não pode ficar vazio." };
  }
  let contrato_id: number | null;
  if (dados.contrato_id === undefined) {
    contrato_id = inquilino.contrato_id ?? null;
  } else if (dados.contrato_id === null) {
    contrato_id = null;
  } else {
    const erro = validarContratoDoImovel(db, dados.contrato_id, inquilino.imovel_id);
    if (erro) return { sucesso: false, mensagem: erro };
    contrato_id = dados.contrato_id;
  }

  executar(
    db,
    `UPDATE inquilinos SET nome = ?, cpf_cnpj = ?, telefone = ?, email = ?, contrato_id = ?, observacoes = ?
     WHERE id = ?`,
    [
      nome,
      (dados.cpf_cnpj !== undefined ? dados.cpf_cnpj.trim() : inquilino.cpf_cnpj) || null,
      (dados.telefone !== undefined ? dados.telefone.trim() : inquilino.telefone) || null,
      (dados.email !== undefined ? dados.email.trim() : inquilino.email) || null,
      contrato_id,
      (dados.observacoes !== undefined ? dados.observacoes.trim() : inquilino.observacoes) || null,
      id,
    ],
  );
  return { sucesso: true, mensagem: "Inquilino atualizado.", id };
}

/** Remove um cadastro de inquilino (ex: corrigir um lançamento errado) — não é "encerrar
 * locação": para isso, encerre o contrato em `contratos_locacao` (data_fim); o inquilino
 * continua no histórico do imóvel. */
export function removerInquilino(db: Database, id: number): ResultadoOperacaoImovel {
  const inquilino = obterInquilinoBruto(db, id);
  if (!inquilino) {
    return { sucesso: false, mensagem: `Inquilino ${id} não encontrado.` };
  }
  executar(db, "DELETE FROM inquilinos WHERE id = ?", [id]);
  return { sucesso: true, mensagem: "Inquilino removido.", id };
}

// ============================================================================
// MANUTENÇÕES
// ============================================================================

export interface NovaManutencao {
  imovel_id: number;
  tipo: string;
  descricao: string;
  data_agendada: string;
  custo?: number;
  prestador_id?: number;
  observacoes?: string;
}

export interface FiltrosManutencao {
  status?: StatusManutencao;
}

function obterManutencaoBruta(db: Database, id: number): Manutencao | null {
  return consultar<Manutencao>(db, "SELECT * FROM manutencoes WHERE id = ?", [id])[0] ?? null;
}

/** Agenda uma manutenção para o imóvel — sempre nasce com status 'agendada' (transições
 * seguintes via `iniciarManutencao`/`concluirManutencao`/`cancelarManutencao`, nunca
 * gravando um status terminal direto no cadastro). */
export function agendarManutencao(db: Database, dados: NovaManutencao): ResultadoOperacaoImovel {
  if (!imovelExiste(db, dados.imovel_id)) {
    return { sucesso: false, mensagem: `Imóvel ${dados.imovel_id} não encontrado.` };
  }
  if (!dados.tipo || !dados.tipo.trim()) {
    return { sucesso: false, mensagem: "Informe o tipo de manutenção (ex: elétrica, hidráulica, pintura)." };
  }
  if (!dados.descricao || !dados.descricao.trim()) {
    return { sucesso: false, mensagem: "Informe a descrição da manutenção." };
  }
  if (!dados.data_agendada) {
    return { sucesso: false, mensagem: "Informe a data agendada." };
  }
  if (dados.custo !== undefined && dados.custo !== null && dados.custo < 0) {
    return { sucesso: false, mensagem: "Custo não pode ser negativo." };
  }
  if (dados.prestador_id !== undefined) {
    const [prestador] = consultar<{ id: number }>(db, "SELECT id FROM prestadores WHERE id = ?", [dados.prestador_id]);
    if (!prestador) return { sucesso: false, mensagem: `Prestador ${dados.prestador_id} não encontrado.` };
  }

  executar(
    db,
    `INSERT INTO manutencoes (imovel_id, tipo, descricao, data_agendada, custo, status, prestador_id, observacoes, criado_em)
     VALUES (?, ?, ?, ?, ?, 'agendada', ?, ?, ?)`,
    [
      dados.imovel_id,
      dados.tipo.trim(),
      dados.descricao.trim(),
      dados.data_agendada,
      dados.custo ?? null,
      dados.prestador_id ?? null,
      dados.observacoes?.trim() || null,
      hoje(),
    ],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");
  return { sucesso: true, mensagem: "Manutenção agendada.", id };
}

/** Lista as manutenções de um imóvel, próxima data agendada primeiro — opcionalmente
 * filtradas por status. */
export function listarManutencoesPorImovel(
  db: Database,
  imovel_id: number,
  filtros: FiltrosManutencao = {},
): Manutencao[] {
  let sql = "SELECT * FROM manutencoes WHERE imovel_id = ?";
  const params: (string | number)[] = [imovel_id];
  if (filtros.status) {
    sql += " AND status = ?";
    params.push(filtros.status);
  }
  sql += " ORDER BY data_agendada ASC, id ASC";
  return consultar<Manutencao>(db, sql, params);
}

/** 'agendada' → 'em_andamento'. Só a partir de 'agendada' — uma manutenção já concluída ou
 * cancelada não "recomeça" (registre uma manutenção nova, se for o caso). */
export function iniciarManutencao(db: Database, id: number): ResultadoOperacaoImovel {
  const manutencao = obterManutencaoBruta(db, id);
  if (!manutencao) {
    return { sucesso: false, mensagem: `Manutenção ${id} não encontrada.` };
  }
  if (manutencao.status !== "agendada") {
    return { sucesso: false, mensagem: `Manutenção já está '${manutencao.status}' — só é possível iniciar a partir de 'agendada'.` };
  }
  executar(db, "UPDATE manutencoes SET status = 'em_andamento' WHERE id = ?", [id]);
  return { sucesso: true, mensagem: "Manutenção iniciada.", id };
}

/** Marca a manutenção como concluída — recusa concluir duas vezes (mesmo espírito de
 * `baixarContaAPagar`: uma conclusão já registrada não deve ser sobrescrita em silêncio) e
 * recusa concluir uma manutenção cancelada. Se `custo` não for informado, mantém o custo
 * estimado no agendamento (quando houver). */
export function concluirManutencao(
  db: Database,
  id: number,
  data_conclusao: string,
  custo?: number,
): ResultadoOperacaoImovel {
  const manutencao = obterManutencaoBruta(db, id);
  if (!manutencao) {
    return { sucesso: false, mensagem: `Manutenção ${id} não encontrada.` };
  }
  if (manutencao.status === "concluida") {
    return { sucesso: false, mensagem: "Manutenção já concluída — conclusão duplicada recusada." };
  }
  if (manutencao.status === "cancelada") {
    return { sucesso: false, mensagem: "Manutenção cancelada — não pode ser concluída." };
  }
  if (!data_conclusao) {
    return { sucesso: false, mensagem: "Informe a data de conclusão." };
  }
  if (custo !== undefined && custo !== null && custo < 0) {
    return { sucesso: false, mensagem: "Custo não pode ser negativo." };
  }
  const custoFinal = custo ?? manutencao.custo ?? null;
  executar(db, "UPDATE manutencoes SET status = 'concluida', data_conclusao = ?, custo = ? WHERE id = ?", [
    data_conclusao,
    custoFinal,
    id,
  ]);
  return { sucesso: true, mensagem: "Manutenção concluída.", id };
}

/** Cancela uma manutenção ainda não concluída — recusa cancelar uma já concluída (mesmo
 * espírito de `cancelarContaAPagar`); cancelar uma já cancelada é idempotente. */
export function cancelarManutencao(db: Database, id: number, motivo: string): ResultadoOperacaoImovel {
  const manutencao = obterManutencaoBruta(db, id);
  if (!manutencao) {
    return { sucesso: false, mensagem: `Manutenção ${id} não encontrada.` };
  }
  if (manutencao.status === "concluida") {
    return { sucesso: false, mensagem: "Manutenção já concluída — não pode ser cancelada." };
  }
  if (manutencao.status === "cancelada") {
    return { sucesso: true, mensagem: "Manutenção já estava cancelada.", id };
  }
  if (!motivo || !motivo.trim()) {
    return { sucesso: false, mensagem: "Informe o motivo do cancelamento." };
  }
  const observacoesAtuais = manutencao.observacoes ? `${manutencao.observacoes} ` : "";
  executar(db, "UPDATE manutencoes SET status = 'cancelada', observacoes = ? WHERE id = ?", [
    `${observacoesAtuais}[CANCELADA: ${motivo.trim()}]`,
    id,
  ]);
  return { sucesso: true, mensagem: "Manutenção cancelada.", id };
}

// ============================================================================
// RESUMO DE DESPESAS OPERACIONAIS AGENDADAS (lidas de contas_a_pagar — ver decisão no
// cabeçalho do arquivo)
// ============================================================================

export interface ResumoDespesasAgendadasImovel {
  imovel_id: number;
  data_referencia: string;
  total_pendente: number;
  total_atrasado: number;
  quantidade_pendente: number;
  quantidade_atrasada: number;
  /** Contas pendentes e atrasadas do imóvel, ordenadas por vencimento — nunca inclui pagas
   * ou canceladas (isto é um resumo do que ainda está por vir, não um extrato completo). */
  itens: ContaAPagarComStatusCalculado[];
}

/** Resumo das despesas operacionais agendadas do imóvel — lidas de `contas_a_pagar`
 * filtrado por `imovel_id`, nunca de uma tabela própria (ver decisão no cabeçalho do
 * arquivo). Inclui pendentes e atrasadas; pagas e canceladas ficam de fora (não são mais
 * "agendadas"). */
export function obterResumoDespesasAgendadasImovel(
  db: Database,
  entidade_id: number,
  imovel_id: number,
  data_referencia?: string,
): ResumoDespesasAgendadasImovel {
  const todas = listarContasAPagar(db, entidade_id, { imovel_id, data_referencia });
  const itens = todas.filter((c) => c.status_calculado === "pendente" || c.status_calculado === "atrasada");
  const pendentes = itens.filter((c) => c.status_calculado === "pendente");
  const atrasadas = itens.filter((c) => c.status_calculado === "atrasada");

  return {
    imovel_id,
    data_referencia: data_referencia ?? hoje(),
    total_pendente: pendentes.reduce((soma, c) => soma + c.valor, 0),
    total_atrasado: atrasadas.reduce((soma, c) => soma + c.valor, 0),
    quantidade_pendente: pendentes.length,
    quantidade_atrasada: atrasadas.length,
    itens,
  };
}
