/**
 * Repositório abstrato para Anomalia
 * Gerencia detecção e persistência de anomalias
 */

import type { IRepository } from './IRepository.js';

export interface Anomalia {
  id: number;
  usuarioId: number;
  tipo: 'financeira' | 'operacional' | 'compliance' | 'seguranca';
  severidade: 'baixa' | 'media' | 'alta' | 'critica';
  descricao: string;
  status: 'detectada' | 'investigando' | 'resolvida' | 'ignorada';
  dataDeteccao: string;
  dataResolucao?: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface IAnomaliaRepository extends IRepository<Anomalia> {
  /**
   * Busca anomalias por usuário
   */
  findByUsuarioId(usuarioId: number): Promise<Anomalia[]>;

  /**
   * Busca anomalias por tipo
   */
  findByTipo(tipo: Anomalia['tipo']): Promise<Anomalia[]>;

  /**
   * Busca anomalias por severidade
   */
  findBySeveridade(severidade: Anomalia['severidade']): Promise<Anomalia[]>;

  /**
   * Busca anomalias por status
   */
  findByStatus(status: Anomalia['status']): Promise<Anomalia[]>;

  /**
   * Busca anomalias críticas não resolvidas
   */
  findCriticasAbertas(): Promise<Anomalia[]>;

  /**
   * Atualiza status de anomalia
   */
  updateStatus(id: number, status: Anomalia['status'], dataResolucao?: string): Promise<boolean>;

  /**
   * Remove anomalias antigas
   */
  deleteOlderThan(data: string): Promise<number>;

  /**
   * Busca anomalias em intervalo de datas
   */
  findByDateRange(dataInicio: string, dataFim: string): Promise<Anomalia[]>;
}
