/**
 * Serviço para gerenciar a Fila de Revisão IA
 *
 * Responsabilidades:
 * - Criar itens na fila quando policy é acionada
 * - Consultar itens pendentes
 * - Atualizar status de revisão
 * - Validar regras de acesso (quem pode revisar)
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import {
  DadosFilaRevisao,
  RegistroFilaRevisao,
  StatusRevisao,
  MotivoRevisao,
  TipoRevisao,
  papelPodeRevisar
} from './politicaRevisaoIA.js';

export interface FilaRevisaoServiceDeps {
  db: Database.Database;
}

export class FilaRevisaoService {
  private db: Database.Database;

  constructor(deps: FilaRevisaoServiceDeps) {
    this.db = deps.db;
  }

  /**
   * Cria um item na fila de revisão
   */
  criarItemRevisao(dados: DadosFilaRevisao): RegistroFilaRevisao {
    const id = randomUUID();
    const agora = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO fila_revisao_ia (
        id,
        documento_id,
        tipo,
        motivo,
        solicitante_id,
        revisor_id,
        status,
        descricao,
        dados_adicionais,
        data_criacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      dados.documentoId,
      dados.tipo,
      dados.motivo,
      dados.solicitanteId,
      dados.revisorId || null,
      dados.status,
      dados.descricao || null,
      dados.dadosAdicionais ? JSON.stringify(dados.dadosAdicionais) : null,
      agora
    );

    return {
      id,
      documentoId: dados.documentoId,
      tipo: dados.tipo,
      motivo: dados.motivo,
      solicitanteId: dados.solicitanteId,
      revisorId: dados.revisorId,
      status: dados.status,
      descricao: dados.descricao,
      dadosAdicionais: dados.dadosAdicionais,
      dataCriacao: agora,
      dataRevisao: undefined,
      motivoRejeicao: undefined
    };
  }

  /**
   * Obtém itens pendentes de revisão
   */
  obterPendentes(limit = 50, offset = 0): RegistroFilaRevisao[] {
    const stmt = this.db.prepare(`
      SELECT
        id,
        documento_id as documentoId,
        tipo,
        motivo,
        solicitante_id as solicitanteId,
        revisor_id as revisorId,
        status,
        descricao,
        dados_adicionais as dados_adicionaisJson,
        data_criacao as dataCriacao,
        data_revisao as dataRevisao,
        motivo_rejeicao as motivoRejeicao
      FROM fila_revisao_ia
      WHERE status = 'pendente'
      ORDER BY data_criacao DESC
      LIMIT ? OFFSET ?
    `);

    return stmt.all(limit, offset).map((row: any) => ({
      id: row.id,
      documentoId: row.documentoId,
      tipo: row.tipo,
      motivo: row.motivo,
      solicitanteId: row.solicitanteId,
      revisorId: row.revisorId,
      status: row.status,
      descricao: row.descricao,
      dadosAdicionais: row.dados_adicionaisJson ? JSON.parse(row.dados_adicionaisJson) : undefined,
      dataCriacao: row.dataCriacao,
      dataRevisao: row.dataRevisao,
      motivoRejeicao: row.motivoRejeicao
    }));
  }

  /**
   * Obtém um item específico
   */
  obterPorId(id: string): RegistroFilaRevisao | null {
    const stmt = this.db.prepare(`
      SELECT
        id,
        documento_id as documentoId,
        tipo,
        motivo,
        solicitante_id as solicitanteId,
        revisor_id as revisorId,
        status,
        descricao,
        dados_adicionais as dados_adicionaisJson,
        data_criacao as dataCriacao,
        data_revisao as dataRevisao,
        motivo_rejeicao as motivoRejeicao
      FROM fila_revisao_ia
      WHERE id = ?
    `);

    const row = stmt.get(id) as unknown as {
      id: string;
      documentoId: string;
      tipo: TipoRevisao;
      motivo: MotivoRevisao;
      solicitanteId: string;
      revisorId: string | null;
      status: StatusRevisao;
      descricao: string | null;
      dados_adicionaisJson: string | null;
      dataCriacao: string;
      dataRevisao: string | null;
      motivoRejeicao: string | null;
    } | undefined;
    if (!row) return null;

    return {
      id: row.id,
      documentoId: row.documentoId,
      tipo: row.tipo,
      motivo: row.motivo,
      solicitanteId: row.solicitanteId,
      revisorId: row.revisorId,
      status: row.status,
      descricao: row.descricao,
      dadosAdicionais: row.dados_adicionaisJson ? JSON.parse(row.dados_adicionaisJson) : undefined,
      dataCriacao: row.dataCriacao,
      dataRevisao: row.dataRevisao,
      motivoRejeicao: row.motivoRejeicao
    };
  }

  /**
   * Marca um item como revisado/autorizado
   */
  marcarRevisado(
    id: string,
    revisorId: string,
    novoStatus: 'revisado' | 'autorizado' = 'revisado'
  ): RegistroFilaRevisao {
    const agora = new Date().toISOString();

    const stmt = this.db.prepare(`
      UPDATE fila_revisao_ia
      SET
        revisor_id = ?,
        status = ?,
        data_revisao = ?
      WHERE id = ?
    `);

    stmt.run(revisorId, novoStatus, agora, id);

    const item = this.obterPorId(id);
    if (!item) throw new Error(`Item ${id} não encontrado`);

    return item;
  }

  /**
   * Rejeita um item de revisão
   */
  rejeitarRevisao(
    id: string,
    revisorId: string,
    motivo: string
  ): RegistroFilaRevisao {
    const agora = new Date().toISOString();

    const stmt = this.db.prepare(`
      UPDATE fila_revisao_ia
      SET
        revisor_id = ?,
        status = 'rejeitado',
        data_revisao = ?,
        motivo_rejeicao = ?
      WHERE id = ?
    `);

    stmt.run(revisorId, agora, motivo, id);

    const item = this.obterPorId(id);
    if (!item) throw new Error(`Item ${id} não encontrado`);

    return item;
  }

  /**
   * Obtém itens por documento (para verificar se há pendências)
   */
  obterPorDocumento(documentoId: string): RegistroFilaRevisao[] {
    const stmt = this.db.prepare(`
      SELECT
        id,
        documento_id as documentoId,
        tipo,
        motivo,
        solicitante_id as solicitanteId,
        revisor_id as revisorId,
        status,
        descricao,
        dados_adicionais as dados_adicionaisJson,
        data_criacao as dataCriacao,
        data_revisao as dataRevisao,
        motivo_rejeicao as motivoRejeicao
      FROM fila_revisao_ia
      WHERE documento_id = ?
      ORDER BY data_criacao DESC
    `);

    return stmt.all(documentoId).map((row: any) => ({
      id: row.id,
      documentoId: row.documentoId,
      tipo: row.tipo,
      motivo: row.motivo,
      solicitanteId: row.solicitanteId,
      revisorId: row.revisorId,
      status: row.status,
      descricao: row.descricao,
      dadosAdicionais: row.dados_adicionaisJson ? JSON.parse(row.dados_adicionaisJson) : undefined,
      dataCriacao: row.dataCriacao,
      dataRevisao: row.dataRevisao,
      motivoRejeicao: row.motivoRejeicao
    }));
  }

  /**
   * Verifica se há itens pendentes para um documento
   */
  temPendencias(documentoId: string): boolean {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM fila_revisao_ia
      WHERE documento_id = ? AND status = 'pendente'
    `);

    const result = stmt.get(documentoId) as unknown as { count: number };
    return result.count > 0;
  }

  /**
   * Obtém estatísticas da fila
   */
  obterEstatisticas(): {
    totalPendente: number;
    totalRevisado: number;
    totalRejeitado: number;
    porTipo: Record<TipoRevisao, number>;
    porMotivo: Record<MotivoRevisao, number>;
  } {
    const countStmt = this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM fila_revisao_ia WHERE status = 'pendente') as pendente,
        (SELECT COUNT(*) FROM fila_revisao_ia WHERE status = 'revisado') as revisado,
        (SELECT COUNT(*) FROM fila_revisao_ia WHERE status = 'rejeitado') as rejeitado
    `);

    const counts = countStmt.get() as unknown as { pendente: number; revisado: number; rejeitado: number };

    const tipoStmt = this.db.prepare(`
      SELECT tipo, COUNT(*) as count FROM fila_revisao_ia GROUP BY tipo
    `);

    const porTipo: Record<TipoRevisao, number> = {
      relatorio: 0,
      campo: 0,
      lancamento: 0
    };

    (tipoStmt.all() as unknown as Array<{ tipo: TipoRevisao; count: number }>).forEach((row) => {
      porTipo[row.tipo] = row.count;
    });

    const motivoStmt = this.db.prepare(`
      SELECT motivo, COUNT(*) as count FROM fila_revisao_ia GROUP BY motivo
    `);

    const porMotivo: Record<MotivoRevisao, number> = Object.fromEntries(
      Object.keys({ policy: 0, manual: 0, urgencia: 0 }).map(k => [k, 0])
    ) as Record<MotivoRevisao, number>;

    (motivoStmt.all() as unknown as Array<{ motivo: MotivoRevisao; count: number }>).forEach((row) => {
      porMotivo[row.motivo] = row.count;
    });

    return {
      totalPendente: counts.pendente,
      totalRevisado: counts.revisado,
      totalRejeitado: counts.rejeitado,
      porTipo,
      porMotivo
    };
  }

  /**
   * Valida se um usuário pode revisar itens (verificar papel/permissões)
   */
  usuarioPodeRevisar(paperUsuario: string): boolean {
    return papelPodeRevisar(paperUsuario);
  }

  /**
   * Remove itens antigos da fila (limpeza de dados históricos)
   */
  limparAntigos(diasAntigos = 30): number {
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - diasAntigos);

    const stmt = this.db.prepare(`
      DELETE FROM fila_revisao_ia
      WHERE data_criacao < ? AND status IN ('revisado', 'rejeitado')
    `);

    const result = stmt.run(dataLimite.toISOString());
    return result.changes;
  }
}

/**
 * Factory para criar instância do serviço
 */
export function criarFilaRevisaoService(db: Database.Database): FilaRevisaoService {
  return new FilaRevisaoService({ db });
}
