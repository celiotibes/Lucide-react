/**
 * Serviço com banco para o inbox de códigos de vínculo de Telegram de CONTATOS EXTERNOS
 * (locatário, cliente da advocacia, prestador de serviço) — tabela
 * `vinculos_externos_telegram_pendentes` (ver migrations-phase4-vinculos-externos.sql).
 *
 * Mais simples que `EventosExternosServiceDB` (eventos-externos-db.ts) de propósito: aqui
 * não há `usuario_id` nenhum para carimbar — o servidor não sabe, e não deve saber, a quem
 * um código de vínculo de contato externo pertence (essa referência só existe no banco
 * local do CLIENTE, em `vinculos_telegram_externos` — ver schema.sql e
 * `src/domain/notificacoes/vinculosExternos.ts`). O servidor só guarda {codigo, chatId} e
 * deixa o cliente casar isso com a própria tabela quando abrir o app.
 */
import type Database from "better-sqlite3";
import { randomUUID } from "crypto";

export interface VinculoExternoTelegramPendente {
  id: string;
  codigoVinculo: string;
  chatId: string;
  recebidoEm: string;
  consumido: boolean;
  consumidoEm: string | null;
}

interface LinhaVinculoExternoPendente {
  id: string;
  codigo_vinculo: string;
  chat_id: string;
  recebido_em: string;
  consumido: number;
  consumido_em: string | null;
}

function paraVinculo(linha: LinhaVinculoExternoPendente): VinculoExternoTelegramPendente {
  return {
    id: linha.id,
    codigoVinculo: linha.codigo_vinculo,
    chatId: linha.chat_id,
    recebidoEm: linha.recebido_em,
    consumido: !!linha.consumido,
    consumidoEm: linha.consumido_em,
  };
}

export class VinculosExternosTelegramServiceDB {
  private db: Database.Database;

  constructor(database: Database.Database) {
    this.db = database;
  }

  /** Usado pelo webhook do bot (telegram-routes.ts) quando "/vincular CODIGO" chega de um
   * chat que não resolve contra `telegram_vinculos` (usuário do sistema) — enfileira sem
   * tentar validar o código, porque só o cliente sabe se ele é válido. */
  registrarPendente(codigo: string, chatId: string): VinculoExternoTelegramPendente {
    const id = randomUUID();
    this.db
      .prepare(`INSERT INTO vinculos_externos_telegram_pendentes (id, codigo_vinculo, chat_id) VALUES (?, ?, ?)`)
      .run(id, codigo, chatId);
    return this.buscarPorId(id)!;
  }

  buscarPorId(id: string): VinculoExternoTelegramPendente | null {
    const linha = this.db
      .prepare(`SELECT * FROM vinculos_externos_telegram_pendentes WHERE id = ?`)
      .get(id) as LinhaVinculoExternoPendente | undefined;
    return linha ? paraVinculo(linha) : null;
  }

  /** Todos os pendentes (não consumidos) — sem filtro por usuário: só o titular/quem está
   * logado no app consome este inbox, e a correspondência código -> referência de
   * negócio só existe no banco local do cliente de qualquer forma. */
  listarPendentes(): VinculoExternoTelegramPendente[] {
    const linhas = this.db
      .prepare(`SELECT * FROM vinculos_externos_telegram_pendentes WHERE consumido = 0 ORDER BY recebido_em ASC`)
      .all() as LinhaVinculoExternoPendente[];
    return linhas.map(paraVinculo);
  }

  /** Marca consumido. Chamado pelo cliente depois de tentar casar o código — com sucesso ou
   * não, sempre marca consumido, para não acumular lixo neste inbox. */
  marcarConsumido(id: string): boolean {
    const vinculo = this.buscarPorId(id);
    if (!vinculo || vinculo.consumido) return false;
    this.db
      .prepare(`UPDATE vinculos_externos_telegram_pendentes SET consumido = 1, consumido_em = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(id);
    return true;
  }
}
