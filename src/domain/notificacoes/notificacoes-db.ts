/**
 * Trilha de envio de notificações (e-mail/WhatsApp/Telegram) — sobre a tabela
 * `notificacoes_enviadas` (ver `contabilidade-reconstituicao/schema.sql`).
 *
 * POR QUE ISTO VIVE NO CLIENTE (`src/domain/...`) e não em `server/src/domain/...`,
 * apesar do padrão pedido ser o de `server/src/domain/auth/permissoes-db.ts`: a tabela
 * `notificacoes_enviadas` está definida em `contabilidade-reconstituicao/schema.sql` — o
 * banco sql.js/IndexedDB do CLIENTE, não no banco better-sqlite3 do servidor. O servidor
 * nunca tem acesso a esse banco (ver nota em `migrations-phase3-integracoes.sql` e em
 * `server/src/routes/asaas-routes.ts`). Ver o relatório da tarefa para o detalhe completo
 * desta decisão de arquitetura e `src/domain/notificacoes/despachoCliente.ts` para quem
 * de fato chama estas funções.
 *
 * Por isso, também, a forma: funções soltas sobre `db: Database` (sql.js) + os helpers
 * `consultar`/`executar` de `src/db/connection.ts` — o padrão de TODO o domínio cliente
 * (ver `src/domain/dividas/historicoJuros.ts`, `src/domain/erp/aluguel-competencias.ts`,
 * `src/domain/integracoes/asaasCobranca.ts`), não o padrão de classe
 * `constructor(db: Database.Database)` do lado servidor (que é sobre better-sqlite3, uma
 * API diferente de sql.js). A ideia de "serviço com prepared statements" de
 * `permissoes-db.ts` é preservada no espírito (funções dedicadas, uma responsabilidade
 * cada, sem SQL duplicado pelas telas) — só não como classe, para não introduzir um
 * padrão novo isolado no meio de um domínio inteiro que não usa classes.
 */
import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";

export type OrigemNotificacao = "cobranca_asaas" | "comunicado_generico" | "lembrete_aluguel" | "lembrete_honorario";
export type CanalNotificacao = "email" | "whatsapp" | "telegram";
export type StatusNotificacao = "pendente" | "enviado" | "falha";

export interface NotificacaoEnviada {
  id: number;
  origemTipo: OrigemNotificacao;
  origemId: number | null;
  canal: CanalNotificacao;
  destinatario: string;
  assunto: string | null;
  mensagem: string;
  status: StatusNotificacao;
  erroMensagem: string | null;
  enviadoEm: string | null;
  criadoEm: string;
}

export interface DadosRegistrarTentativa {
  origemTipo: OrigemNotificacao;
  origemId?: number | null;
  canal: CanalNotificacao;
  destinatario: string;
  assunto?: string | null;
  mensagem: string;
}

interface LinhaNotificacao {
  id: number;
  origem_tipo: OrigemNotificacao;
  origem_id: number | null;
  canal: CanalNotificacao;
  destinatario: string;
  assunto: string | null;
  mensagem: string;
  status: StatusNotificacao;
  erro_mensagem: string | null;
  enviado_em: string | null;
  criado_em: string;
}

function paraNotificacao(linha: LinhaNotificacao): NotificacaoEnviada {
  return {
    id: linha.id,
    origemTipo: linha.origem_tipo,
    origemId: linha.origem_id,
    canal: linha.canal,
    destinatario: linha.destinatario,
    assunto: linha.assunto,
    mensagem: linha.mensagem,
    status: linha.status,
    erroMensagem: linha.erro_mensagem,
    enviadoEm: linha.enviado_em,
    criadoEm: linha.criado_em,
  };
}

/** Registra uma TENTATIVA de envio (status inicial 'pendente') — uma linha por canal, por
 * disparo. Chamada ANTES de de fato chamar o sender (via a rota do servidor), para nunca
 * perder o registro de que a tentativa aconteceu mesmo que o processo seja interrompido
 * entre a chamada de rede e a atualização do status. */
export function registrarTentativa(db: Database, dados: DadosRegistrarTentativa): NotificacaoEnviada {
  executar(
    db,
    `INSERT INTO notificacoes_enviadas (origem_tipo, origem_id, canal, destinatario, assunto, mensagem, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pendente')`,
    [dados.origemTipo, dados.origemId ?? null, dados.canal, dados.destinatario, dados.assunto ?? null, dados.mensagem],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");
  return obterPorId(db, id);
}

function obterPorId(db: Database, id: number): NotificacaoEnviada {
  const [linha] = consultar<LinhaNotificacao>(db, "SELECT * FROM notificacoes_enviadas WHERE id = ?", [id]);
  if (!linha) throw new Error(`Notificação ${id} não encontrada logo após ser registrada — estado inconsistente.`);
  return paraNotificacao(linha);
}

/** Marca uma tentativa como enviada com sucesso (`enviado_em = agora`). Lança se o id não
 * existir — chamar isto para um id inválido é erro de programação, não um caso esperado. */
export function marcarEnviado(db: Database, id: number): NotificacaoEnviada {
  const atual = obterPorId(db, id);
  if (atual.status !== "pendente") {
    throw new Error(`Notificação ${id} já está '${atual.status}' — só é possível marcar como enviada uma tentativa pendente.`);
  }
  executar(db, `UPDATE notificacoes_enviadas SET status = 'enviado', enviado_em = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
  return obterPorId(db, id);
}

/** Marca uma tentativa como falha, com a mensagem de erro do sender/transporte. */
export function marcarFalha(db: Database, id: number, erroMensagem: string): NotificacaoEnviada {
  const atual = obterPorId(db, id);
  if (atual.status !== "pendente") {
    throw new Error(`Notificação ${id} já está '${atual.status}' — só é possível marcar falha numa tentativa pendente.`);
  }
  executar(db, `UPDATE notificacoes_enviadas SET status = 'falha', erro_mensagem = ? WHERE id = ?`, [erroMensagem, id]);
  return obterPorId(db, id);
}

/** Lista todas as notificações (todos os canais, qualquer status) de uma origem — mais
 * recentes primeiro. `origemId` nulo lista comunicados genéricos soltos (sem origem). */
export function listarPorOrigem(db: Database, origemTipo: OrigemNotificacao, origemId: number | null): NotificacaoEnviada[] {
  const linhas =
    origemId === null
      ? consultar<LinhaNotificacao>(
          db,
          "SELECT * FROM notificacoes_enviadas WHERE origem_tipo = ? AND origem_id IS NULL ORDER BY criado_em DESC, id DESC",
          [origemTipo],
        )
      : consultar<LinhaNotificacao>(
          db,
          "SELECT * FROM notificacoes_enviadas WHERE origem_tipo = ? AND origem_id = ? ORDER BY criado_em DESC, id DESC",
          [origemTipo, origemId],
        );
  return linhas.map(paraNotificacao);
}

/** Lista as notificações mais recentes, de qualquer origem — usada pela visão geral de
 * `NotificacoesView.tsx` quando nenhuma origem específica está selecionada. */
export function listarRecentes(db: Database, limite = 100): NotificacaoEnviada[] {
  return consultar<LinhaNotificacao>(db, "SELECT * FROM notificacoes_enviadas ORDER BY criado_em DESC, id DESC LIMIT ?", [limite]).map(
    paraNotificacao,
  );
}
