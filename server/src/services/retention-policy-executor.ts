/**
 * Executor de Política de Retenção LGPD
 *
 * Serviço responsável por:
 * - Verificar políticas de retenção de dados
 * - Executar limpeza de dados expirados (com suporte a dry-run)
 * - Respeitar bloqueios de litígio (litigation holds)
 * - Auditar todas as exclusões com trilha completa
 * - Impedir exclusão se backup não foi validado
 */

import Database from 'better-sqlite3';
import { logger } from './logger-service';

export interface PoliticaRetencao {
  id: number;
  tabela_nome: string;
  retencao_dias: number;
  base_legal: string;
  coluna_data: string;
  descricao: string;
  ativa: number;
  data_criacao: string;
  data_atualizacao: string;
}

export interface ResultadoRetencao {
  tabela_nome: string;
  registros_testados: number;
  registros_deletados: number;
  registros_bloqueados_litigio: number;
  registros_marcados_esquecimento: number;
  erros: string[];
  tempo_ms: number;
}

export interface OpcoesExecucaoRetencao {
  dryRun: boolean;
  apenasTestados?: boolean;
  executadoPor?: string;
  backupValidado?: boolean;
  verbose?: boolean;
}

export class RetentionPolicyExecutor {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Executa limpeza de dados de acordo com políticas de retenção
   */
  async executarRetencao(opcoes: OpcoesExecucaoRetencao): Promise<ResultadoRetencao[]> {
    const inicio = Date.now();
    const resultados: ResultadoRetencao[] = [];

    logger.info(`[RETENCAO] Iniciando execução de retenção. Modo: ${opcoes.dryRun ? 'DRY-RUN' : 'REAL'}`, {
      dryRun: opcoes.dryRun,
      executadoPor: opcoes.executadoPor,
      backupValidado: opcoes.backupValidado,
    });

    // Se não for dry-run, verificar se backup foi validado
    if (!opcoes.dryRun && !opcoes.backupValidado) {
      logger.warn('[RETENCAO] Tentativa de deletar dados sem validar backup. Abortando.');
      throw new Error('Não é possível deletar dados sem validar backup primeiro. Execute com --dry-run ou valide backup.');
    }

    try {
      // Obter todas as políticas ativas
      const politicas = this.obterPoliticasAtivas();

      for (const politica of politicas) {
        try {
          const resultado = this.executarRetencaoTabela(politica, opcoes);
          resultados.push(resultado);
        } catch {
          logger.error(`[RETENCAO] Erro ao processar tabela ${politica.tabela_nome}:`, {
            erro: String(error),
            tabela: politica.tabela_nome,
          });
          resultados.push({
            tabela_nome: politica.tabela_nome,
            registros_testados: 0,
            registros_deletados: 0,
            registros_bloqueados_litigio: 0,
            registros_marcados_esquecimento: 0,
            erros: [String(error)],
            tempo_ms: 0,
          });
        }
      }

      // Registrar execução
      if (!opcoes.dryRun) {
        this.registrarExecucaoRetencao(resultados, opcoes);
      }
    } catch {
      logger.error('[RETENCAO] Erro crítico ao executar retenção:', {
        erro: String(error),
      });
      throw error;
    }

    const tempoTotal = Date.now() - inicio;
    logger.info(`[RETENCAO] Execução concluída em ${tempoTotal}ms`, {
      totalResultados: resultados.length,
      tempoMs: tempoTotal,
    });

    return resultados;
  }

  /**
   * Executa retenção para uma tabela específica
   */
  private executarRetencaoTabela(
    politica: PoliticaRetencao,
    opcoes: OpcoesExecucaoRetencao
  ): ResultadoRetencao {
    const inicio = Date.now();
    const resultado: ResultadoRetencao = {
      tabela_nome: politica.tabela_nome,
      registros_testados: 0,
      registros_deletados: 0,
      registros_bloqueados_litigio: 0,
      registros_marcados_esquecimento: 0,
      erros: [],
      tempo_ms: 0,
    };

    try {
      // Verificar se tabela existe
      if (!this.tabelaExiste(politica.tabela_nome)) {
        resultado.erros.push(`Tabela ${politica.tabela_nome} não existe`);
        return resultado;
      }

      // Buscar registros expirados
      const dataLimite = this.calcularDataLimite(politica.retencao_dias);
      const registrosExpirados = this.buscarRegistrosExpirados(
        politica.tabela_nome,
        politica.coluna_data,
        dataLimite
      );

      resultado.registros_testados = registrosExpirados.length;

      if (registrosExpirados.length === 0) {
        if (opcoes.verbose) {
          logger.info(
            `[RETENCAO] Nenhum registro expirado para ${politica.tabela_nome}`
          );
        }
        resultado.tempo_ms = Date.now() - inicio;
        return resultado;
      }

      logger.info(
        `[RETENCAO] ${registrosExpirados.length} registros expirados em ${politica.tabela_nome}`,
        {
          tabela: politica.tabela_nome,
          quantidade: registrosExpirados.length,
          baseData: dataLimite.toISOString(),
        }
      );

      // Verificar litígio para cada registro
      const registrosPorStatus = this.categorizarRegistrosComLitigio(
        politica.tabela_nome,
        registrosExpirados
      );

      resultado.registros_bloqueados_litigio = registrosPorStatus.bloqueados.length;
      resultado.registros_marcados_esquecimento = registrosPorStatus.marcados.length;

      // Deletar registros que não estão bloqueados
      if (!opcoes.apenasTestados) {
        const paraDelete = registrosPorStatus.disponiveis;

        if (!opcoes.dryRun) {
          this.deletarRegistros(politica.tabela_nome, paraDelete);
          resultado.registros_deletados = paraDelete.length;
          logger.warn(
            `[RETENCAO] ${paraDelete.length} registros DELETADOS de ${politica.tabela_nome}`,
            {
              tabela: politica.tabela_nome,
              quantidade: paraDelete.length,
              baseLegal: politica.base_legal,
            }
          );
        } else {
          resultado.registros_deletados = paraDelete.length; // Simular deleção
          logger.info(
            `[RETENCAO-DRY-RUN] Seriam DELETADOS ${paraDelete.length} registros de ${politica.tabela_nome}`,
            {
              tabela: politica.tabela_nome,
              quantidade: paraDelete.length,
              baseLegal: politica.base_legal,
              retencaoDias: politica.retencao_dias,
            }
          );
        }
      }

      // Log de bloqueios
      if (resultado.registros_bloqueados_litigio > 0) {
        logger.warn(
          `[RETENCAO] ${resultado.registros_bloqueados_litigio} registros BLOQUEADOS por litígio em ${politica.tabela_nome}`,
          {
            tabela: politica.tabela_nome,
            bloqueados: resultado.registros_bloqueados_litigio,
          }
        );
      }

      if (resultado.registros_marcados_esquecimento > 0) {
        logger.info(
          `[RETENCAO] ${resultado.registros_marcados_esquecimento} registros já marcados para esquecimento em ${politica.tabela_nome}`,
          {
            tabela: politica.tabela_nome,
            esquecimento: resultado.registros_marcados_esquecimento,
          }
        );
      }
    } catch {
      resultado.erros.push(String(error));
    }

    resultado.tempo_ms = Date.now() - inicio;
    return resultado;
  }

  /**
   * Busca registros expirados por política de retenção
   */
  private buscarRegistrosExpirados(
    tabelaNome: string,
    colunaNome: string,
    dataLimite: Date
  ): number[] {
    try {
      const query = `
        SELECT id FROM ${tabelaNome}
        WHERE ${colunaNome} < ?
        LIMIT 100000
      `;
      const stmt = this.db.prepare(query);
      const rows = stmt.all(dataLimite.toISOString()) as Array<{ id: number }>;
      return rows.map((r) => r.id);
    } catch {
      logger.error(
        `[RETENCAO] Erro ao buscar registros expirados de ${tabelaNome}:`,
        {
          erro: String(error),
          tabela: tabelaNome,
        }
      );
      return [];
    }
  }

  /**
   * Categoriza registros por status de litígio
   */
  private categorizarRegistrosComLitigio(
    tabelaNome: string,
    registroIds: number[]
  ): {
    disponiveis: number[];
    bloqueados: number[];
    marcados: number[];
  } {
    const disponiveis: number[] = [];
    const bloqueados: number[] = [];
    const marcados: number[] = [];

    if (registroIds.length === 0) {
      return { disponiveis, bloqueados, marcados };
    }

    const stmtLitigio = this.db.prepare(`
      SELECT COUNT(*) as count FROM litigio_bloqueio
      WHERE tabela_nome = ? AND registro_id = ? AND ativo = 1
    `);

    const stmtEsquecimento = this.db.prepare(`
      SELECT COUNT(*) as count FROM marcacao_esquecimento
      WHERE tabela_nome = ? AND registro_id = ?
    `);

    for (const id of registroIds) {
      const litigio = stmtLitigio.get(tabelaNome, id) as { count: number };
      const esquecimento = stmtEsquecimento.get(tabelaNome, id) as {
        count: number;
      };

      if (litigio.count > 0) {
        bloqueados.push(id);
      } else if (esquecimento.count > 0) {
        marcados.push(id);
      } else {
        disponiveis.push(id);
      }
    }

    return { disponiveis, bloqueados, marcados };
  }

  /**
   * Deleta registros de uma tabela
   */
  private deletarRegistros(tabelaNome: string, registroIds: number[]): void {
    if (registroIds.length === 0) {
      return;
    }

    const placeholders = registroIds.map(() => '?').join(',');
    const query = `DELETE FROM ${tabelaNome} WHERE id IN (${placeholders})`;

    try {
      const stmt = this.db.prepare(query);
      const resultado = stmt.run(...registroIds);
      logger.info(`[RETENCAO] Deletados ${resultado.changes} registros de ${tabelaNome}`, {
        tabela: tabelaNome,
        deletados: resultado.changes,
      });
    } catch {
      logger.error(`[RETENCAO] Erro ao deletar registros de ${tabelaNome}:`, {
        erro: String(error),
        tabela: tabelaNome,
        quantidade: registroIds.length,
      });
      throw error;
    }
  }

  /**
   * Marca registro para exclusão sob direito ao esquecimento (Art. 18 LGPD)
   */
  marcarParaEsquecimento(
    tabelaNome: string,
    registroId: number,
    motivo: string,
    solicitadoPor: string
  ): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO marcacao_esquecimento (
        tabela_nome, registro_id, motivo, solicitado_por
      ) VALUES (?, ?, ?, ?)
    `);

    try {
      stmt.run(tabelaNome, registroId, motivo, solicitadoPor);
      logger.info(
        `[RETENCAO] Registro ${tabelaNome}:${registroId} marcado para esquecimento`,
        {
          tabela: tabelaNome,
          registroId,
          motivo,
          solicitadoPor,
        }
      );
    } catch {
      logger.error(
        `[RETENCAO] Erro ao marcar registro para esquecimento:`,
        {
          erro: String(error),
          tabela: tabelaNome,
          registroId,
        }
      );
      throw error;
    }
  }

  /**
   * Aplica bloqueio de litígio (litigation hold)
   */
  bloquearPorLitigio(
    tabelaNome: string,
    registroId: number,
    motivoLitigio: string,
    numeroProcesso: string,
    bloqueadoPor: string
  ): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO litigio_bloqueio (
        tabela_nome, registro_id, motivo_litigio, numero_processo, bloqueado_por
      ) VALUES (?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(tabelaNome, registroId, motivoLitigio, numeroProcesso, bloqueadoPor);
      logger.warn(
        `[RETENCAO] Registro ${tabelaNome}:${registroId} BLOQUEADO por litígio`,
        {
          tabela: tabelaNome,
          registroId,
          motivoLitigio,
          numeroProcesso,
          bloqueadoPor,
        }
      );
    } catch {
      logger.error(`[RETENCAO] Erro ao bloquear registro por litígio:`, {
        erro: String(error),
        tabela: tabelaNome,
        registroId,
      });
      throw error;
    }
  }

  /**
   * Remove bloqueio de litígio (requer auditoria)
   */
  desbloquearLitigio(
    tabelaNome: string,
    registroId: number,
    desbloqueadoPor: string,
    observacoes?: string
  ): void {
    const stmt = this.db.prepare(`
      UPDATE litigio_bloqueio
      SET ativo = 0, data_desbloqueio = CURRENT_TIMESTAMP, desbloqueado_por = ?, observacoes = ?
      WHERE tabela_nome = ? AND registro_id = ? AND ativo = 1
    `);

    try {
      const resultado = stmt.run(
        desbloqueadoPor,
        observacoes || null,
        tabelaNome,
        registroId
      );
      if (resultado.changes > 0) {
        logger.warn(
          `[RETENCAO] Bloqueio de litígio removido para ${tabelaNome}:${registroId}`,
          {
            tabela: tabelaNome,
            registroId,
            desbloqueadoPor,
          }
        );
      }
    } catch {
      logger.error(`[RETENCAO] Erro ao desbloquear registro:`, {
        erro: String(error),
        tabela: tabelaNome,
        registroId,
      });
      throw error;
    }
  }

  /**
   * Lista registros bloqueados por litígio
   */
  listarRegistrosBloqueados(tabelaNome?: string): Array<{
    id: number;
    tabela_nome: string;
    registro_id: number;
    motivo_litigio: string;
    numero_processo: string;
    data_bloqueio: string;
    ativo: number;
  }> {
    let query = `
      SELECT id, tabela_nome, registro_id, motivo_litigio, numero_processo, data_bloqueio, ativo
      FROM litigio_bloqueio
      WHERE ativo = 1
    `;
    const params: unknown[] = [];

    if (tabelaNome) {
      query += ' AND tabela_nome = ?';
      params.push(tabelaNome);
    }

    query += ' ORDER BY data_bloqueio DESC';

    try {
      const stmt = this.db.prepare(query);
      return stmt.all(...params) as Array<{
        id: number;
        tabela_nome: string;
        registro_id: number;
        motivo_litigio: string;
        numero_processo: string;
        data_bloqueio: string;
        ativo: number;
      }>;
    } catch {
      logger.error(`[RETENCAO] Erro ao listar bloqueios:`, {
        erro: String(error),
      });
      return [];
    }
  }

  /**
   * Obtém políticas de retenção ativas
   */
  private obterPoliticasAtivas(): PoliticaRetencao[] {
    const stmt = this.db.prepare(`
      SELECT * FROM politica_retencao WHERE ativa = 1 ORDER BY tabela_nome
    `);
    return stmt.all() as PoliticaRetencao[];
  }

  /**
   * Calcula data limite para retenção
   */
  private calcularDataLimite(retencaoDias: number): Date {
    const agora = new Date();
    agora.setDate(agora.getDate() - retencaoDias);
    return agora;
  }

  /**
   * Verifica se tabela existe
   */
  private tabelaExiste(tabelaNome: string): boolean {
    try {
      const stmt = this.db.prepare(`
        SELECT 1 FROM sqlite_master WHERE type='table' AND name=?
      `);
      return (stmt.get(tabelaNome) as { '1': number } | undefined) !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Registra execução de retenção na auditoria
   */
  private registrarExecucaoRetencao(
    resultados: ResultadoRetencao[],
    opcoes: OpcoesExecucaoRetencao
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO registro_retencao_executada (
        tabela_nome, registros_deletados, registros_testados,
        motivo_exclusao, modo_execucao, executado_por
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const resultado of resultados) {
      if (resultado.registros_deletados > 0) {
        try {
          stmt.run(
            resultado.tabela_nome,
            resultado.registros_deletados,
            resultado.registros_testados,
            'politica_retencao',
            'real',
            opcoes.executadoPor || 'sistema'
          );
        } catch {
          logger.error(`[RETENCAO] Erro ao registrar execução:`, {
            erro: String(error),
            tabela: resultado.tabela_nome,
          });
        }
      }
    }
  }

  /**
   * Gera relatório de retenção
   */
  gerarRelatoriRetencao(): {
    politicas_ativas: number;
    registros_expirados_total: number;
    registros_bloqueados_total: number;
    ultima_execucao: string | null;
  } {
    try {
      const policias = this.db.prepare(
        'SELECT COUNT(*) as count FROM politica_retencao WHERE ativa = 1'
      );
      const bloqueios = this.db.prepare(
        'SELECT COUNT(*) as count FROM litigio_bloqueio WHERE ativo = 1'
      );
      const ultimaExecucao = this.db.prepare(
        'SELECT MAX(data_execucao) as data FROM registro_retencao_executada'
      );

      const pCount = (policias.get() as { count: number }).count;
      const bCount = (bloqueios.get() as { count: number }).count;
      const ueData = (ultimaExecucao.get() as { data: string | null }).data;

      return {
        politicas_ativas: pCount,
        registros_expirados_total: 0, // Seria calculado de todas as políticas
        registros_bloqueados_total: bCount,
        ultima_execucao: ueData,
      };
    } catch {
      logger.error(`[RETENCAO] Erro ao gerar relatório:`, {
        erro: String(error),
      });
      return {
        politicas_ativas: 0,
        registros_expirados_total: 0,
        registros_bloqueados_total: 0,
        ultima_execucao: null,
      };
    }
  }
}
