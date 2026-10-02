/**
 * Serviço com banco para a agenda de lembretes de vencimento (`lembretes_agendados` — ver
 * `migrations-phase5-lembretes-agendados.sql`), que permite o disparo acontecer num horário
 * real do servidor mesmo com o app (cliente) fechado no dia exato do vencimento. Padrão de
 * classe + prepared statements seguindo `permissoes-db.ts`.
 *
 * FLUXO (ver cabeçalho da migração para o desenho completo):
 *   1. O CLIENTE calcula (`identificarLembretesFuturos`, em
 *      `src/domain/notificacoes/lembretesVencimento.ts`) todos os lembretes futuros dentro
 *      de um horizonte, já com destinatário/mensagem resolvidos, e chama `sincronizar` aqui
 *      (via `POST /api/lembretes-agendados/sincronizar`).
 *   2. O SERVIDOR só guarda — nunca recalcula nada a partir do `origem_id` (não tem acesso
 *      ao banco de negócio do cliente para isso).
 *   3. Periodicamente (`lembretes-dispatcher.ts`), o servidor varre `listarPendentesParaDisparo`
 *      e envia pelos 3 senders reais, marcando `enviado`/`falha` por linha.
 *
 * CONTRATO DE `sincronizar` — IMPORTANTE: o cliente manda, a cada chamada, a FOTO COMPLETA
 * e ATUAL de tudo que é válido (ainda pendente de pagamento/vencimento, com destinatário
 * disponível) para aquele `origemTipo` — nunca um delta. É assim que este serviço consegue
 * detectar o que deixou de ser válido (competência paga, honorário cancelado, destinatário
 * que passou a não ter mais contato algum cadastrado): se uma chave que já existia aqui
 * como `pendente` não aparece no novo payload, ela é cancelada (ver `sincronizar` abaixo).
 */
import type Database from "better-sqlite3";
import { randomUUID } from "crypto";

export type OrigemLembreteAgendado = "lembrete_aluguel" | "lembrete_honorario";
export type TipoLembreteAgendado = "2_dias_antes" | "no_dia";
export type CanalLembreteAgendado = "email" | "whatsapp" | "telegram";
export type StatusLembreteAgendado = "pendente" | "enviado" | "falha" | "cancelado";

export interface LembreteAgendado {
  id: string;
  origemTipo: OrigemLembreteAgendado;
  origemId: number;
  tipoLembrete: TipoLembreteAgendado;
  canal: CanalLembreteAgendado;
  destinatario: string;
  assunto: string | null;
  mensagem: string;
  dataDisparoPrevista: string;
  status: StatusLembreteAgendado;
  erroMensagem: string | null;
  enviadoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

/** Um item por (origem, tipo de lembrete, CANAL) — já achatado pelo cliente (ver
 * `identificarLembretesFuturos`). `origemTipo` não entra aqui: é o primeiro parâmetro de
 * `sincronizar`, único para todo o lote (o cliente sincroniza aluguel e honorário em
 * chamadas separadas — ver comentário em `sincronizar`). */
export interface LembreteParaSincronizar {
  origemId: number;
  tipoLembrete: TipoLembreteAgendado;
  canal: CanalLembreteAgendado;
  destinatario: string;
  assunto?: string | null;
  mensagem: string;
  /** 'YYYY-MM-DD' */
  dataDisparoPrevista: string;
}

interface LinhaLembreteAgendado {
  id: string;
  origem_tipo: OrigemLembreteAgendado;
  origem_id: number;
  tipo_lembrete: TipoLembreteAgendado;
  canal: CanalLembreteAgendado;
  destinatario: string;
  assunto: string | null;
  mensagem: string;
  data_disparo_prevista: string;
  status: StatusLembreteAgendado;
  erro_mensagem: string | null;
  enviado_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

function paraLembreteAgendado(linha: LinhaLembreteAgendado): LembreteAgendado {
  return {
    id: linha.id,
    origemTipo: linha.origem_tipo,
    origemId: linha.origem_id,
    tipoLembrete: linha.tipo_lembrete,
    canal: linha.canal,
    destinatario: linha.destinatario,
    assunto: linha.assunto,
    mensagem: linha.mensagem,
    dataDisparoPrevista: linha.data_disparo_prevista,
    status: linha.status,
    erroMensagem: linha.erro_mensagem,
    enviadoEm: linha.enviado_em,
    criadoEm: linha.criado_em,
    atualizadoEm: linha.atualizado_em,
  };
}

/** 'YYYY-MM-DD' do relógio real do servidor — só usado como default de
 * `listarPendentesParaDisparo`, nunca memorizado: cada chamada lê de novo, porque é
 * exatamente esse relógio real (e não o do cliente, que pode estar fechado) que faz esta
 * fase existir. */
function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Chave lógica de deduplicação/upsert — mesma tripla do `UNIQUE` da tabela (menos
 * `origem_tipo`, que já é fixo por chamada de `sincronizar`). */
function chaveLogica(origemId: number, tipoLembrete: TipoLembreteAgendado, canal: CanalLembreteAgendado): string {
  return `${origemId}::${tipoLembrete}::${canal}`;
}

export class LembretesAgendadosServiceDB {
  private db: Database.Database;

  constructor(database: Database.Database) {
    this.db = database;
  }

  /**
   * Sincroniza a agenda de um `origemTipo` com a FOTO COMPLETA atual enviada pelo cliente
   * (ver contrato no cabeçalho do arquivo). Roda tudo dentro de UMA transação:
   *
   *   (a) upsert de cada item do payload pela chave única (`origem_tipo, origem_id,
   *       tipo_lembrete, canal`) — `ON CONFLICT ... DO UPDATE ... WHERE status = 'pendente'`:
   *       o SQLite só aplica o UPDATE quando a linha existente ainda está `pendente`; se já
   *       estiver `enviado`/`falha`/`cancelado`, a cláusula WHERE do upsert falha e a linha
   *       existente fica EXATAMENTE como estava (nunca perde o resultado real de um disparo
   *       que já aconteceu, e nunca reabre um lembrete cancelado só porque o cliente mandou
   *       de novo a mesma chave — ver LIMITAÇÃO abaixo);
   *   (b) cancela qualquer linha `pendente` deste `origemTipo` cuja chave NÃO está no novo
   *       payload — significa que a competência/honorário foi pago/cancelado, ou que o
   *       destinatário daquele canal deixou de existir (ex: e-mail removido do cadastro).
   *
   * LIMITAÇÃO conhecida e aceita (consequência direta de (a) + (b) juntos): se uma
   * competência for cancelada (linha vira `cancelado` aqui) e DEPOIS reaberta/reativada no
   * cliente, sincronizar de novo a MESMA chave não revive a linha para `pendente` — a
   * cláusula `WHERE status = 'pendente'` do upsert não bate em `status = 'cancelado'`, e a
   * chave única impede inserir uma linha nova para a mesma tripla. Corrigir isso exigiria
   * decidir explicitamente se "reviver" é seguro (poderia escapar quem decidiu cancelar de
   * propósito) — fora do escopo desta rodada; o caso realista (competência paga permanece
   * paga) é o caminho comum.
   *
   * Por que `origemTipo` é um parâmetro separado (não um campo dentro de cada item): o
   * cancelamento em (b) precisa de um universo fechado por `origemTipo` para decidir "o que
   * não está mais no payload" — o cliente sincroniza aluguel e honorário em chamadas
   * separadas (duas fotos completas independentes), nunca uma mista, então cancelar por
   * `origemTipo` nunca cancela por engano linhas do OUTRO tipo que nem fazem parte desta
   * chamada.
   */
  sincronizar(origemTipo: OrigemLembreteAgendado, lembretes: LembreteParaSincronizar[]): void {
    const executarTransacao = this.db.transaction(() => {
      const upsert = this.db.prepare(
        `INSERT INTO lembretes_agendados
           (id, origem_tipo, origem_id, tipo_lembrete, canal, destinatario, assunto, mensagem, data_disparo_prevista)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (origem_tipo, origem_id, tipo_lembrete, canal) DO UPDATE SET
           destinatario = excluded.destinatario,
           assunto = excluded.assunto,
           mensagem = excluded.mensagem,
           data_disparo_prevista = excluded.data_disparo_prevista,
           atualizado_em = CURRENT_TIMESTAMP
         WHERE lembretes_agendados.status = 'pendente'`,
      );
      for (const item of lembretes) {
        upsert.run(
          randomUUID(),
          origemTipo,
          item.origemId,
          item.tipoLembrete,
          item.canal,
          item.destinatario,
          item.assunto ?? null,
          item.mensagem,
          item.dataDisparoPrevista,
        );
      }

      const chavesNoPayload = new Set(lembretes.map((l) => chaveLogica(l.origemId, l.tipoLembrete, l.canal)));

      const pendentesExistentes = this.db
        .prepare(
          `SELECT id, origem_id, tipo_lembrete, canal FROM lembretes_agendados
           WHERE origem_tipo = ? AND status = 'pendente'`,
        )
        .all(origemTipo) as Array<Pick<LinhaLembreteAgendado, "id" | "origem_id" | "tipo_lembrete" | "canal">>;

      const cancelar = this.db.prepare(
        `UPDATE lembretes_agendados SET status = 'cancelado', atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`,
      );
      for (const linha of pendentesExistentes) {
        const chave = chaveLogica(linha.origem_id, linha.tipo_lembrete, linha.canal);
        if (!chavesNoPayload.has(chave)) {
          cancelar.run(linha.id);
        }
      }
    });

    executarTransacao();
  }

  /** `WHERE status = 'pendente' AND data_disparo_prevista <= ?` — `dataReferencia` default
   * = hoje (relógio real do servidor). Usado pelo loop de disparo (`lembretes-dispatcher.ts`)
   * e pela rota de diagnóstico. Uma `data_disparo_prevista` no PASSADO (ex: o servidor ficou
   * fora do ar por um dia) também é incluída de propósito — o disparo "atrasado" ainda é
   * melhor que nunca disparar. */
  listarPendentesParaDisparo(dataReferencia?: string): LembreteAgendado[] {
    const dataRef = dataReferencia || hoje();
    const linhas = this.db
      .prepare(
        `SELECT * FROM lembretes_agendados
         WHERE status = 'pendente' AND data_disparo_prevista <= ?
         ORDER BY data_disparo_prevista ASC, id ASC`,
      )
      .all(dataRef) as LinhaLembreteAgendado[];
    return linhas.map(paraLembreteAgendado);
  }

  /** Lista tudo (qualquer status), opcionalmente filtrado por `status` — usada por uma
   * eventual tela de diagnóstico (ver `criarRotasLembretesAgendados`, `GET /`). */
  listarTodos(status?: StatusLembreteAgendado): LembreteAgendado[] {
    const linhas = status
      ? (this.db
          .prepare(`SELECT * FROM lembretes_agendados WHERE status = ? ORDER BY data_disparo_prevista ASC, id ASC`)
          .all(status) as LinhaLembreteAgendado[])
      : (this.db.prepare(`SELECT * FROM lembretes_agendados ORDER BY data_disparo_prevista ASC, id ASC`).all() as LinhaLembreteAgendado[]);
    return linhas.map(paraLembreteAgendado);
  }

  /** Marca uma linha como enviada. Só tem efeito se a linha ainda estiver `pendente` —
   * idempotente de propósito (chamar duas vezes para o mesmo id, ex: por uma corrida entre
   * duas rodadas do loop de disparo, nunca lança nem sobrescreve um resultado já gravado). */
  marcarEnviado(id: string): void {
    this.db
      .prepare(
        `UPDATE lembretes_agendados
         SET status = 'enviado', enviado_em = CURRENT_TIMESTAMP, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pendente'`,
      )
      .run(id);
  }

  /** Marca uma linha como falha, com a mensagem de erro do sender. Mesma idempotência de
   * `marcarEnviado`. */
  marcarFalha(id: string, erroMensagem: string): void {
    this.db
      .prepare(
        `UPDATE lembretes_agendados
         SET status = 'falha', erro_mensagem = ?, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pendente'`,
      )
      .run(erroMensagem, id);
  }
}
