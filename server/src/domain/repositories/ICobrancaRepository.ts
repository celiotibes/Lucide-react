/**
 * Repositório abstrato para Cobrança
 * Desacopla lógica de negócio da implementação de persistência
 */

import type { IRepository } from './IRepository.js';

export interface Cobranca {
  id: number;
  usuarioId: number;
  imovelId: number;
  dataCobranca: string;
  dataVencimento: string;
  valor: number;
  status: 'pendente' | 'pago' | 'atrasado' | 'cancelado';
  descricao?: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ICobrancaRepository extends IRepository<Cobranca> {
  /**
   * Busca cobranças por usuário
   */
  findByUsuarioId(usuarioId: number): Promise<Cobranca[]>;

  /**
   * Busca cobranças por imóvel
   */
  findByImovelId(imovelId: number): Promise<Cobranca[]>;

  /**
   * Busca cobranças por status
   */
  findByStatus(status: Cobranca['status']): Promise<Cobranca[]>;

  /**
   * Busca cobranças vencidas
   */
  findVencidas(): Promise<Cobranca[]>;

  /**
   * Atualiza status de uma cobrança
   */
  updateStatus(id: number, status: Cobranca['status']): Promise<boolean>;

  /**
   * Remove cobranças antigas (para limpeza de dados)
   */
  deleteOlderThan(data: string): Promise<number>;
}
