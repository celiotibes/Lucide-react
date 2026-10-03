/**
 * Repositório abstrato para Usuário
 * Gerencia persistência de dados de usuários
 */

import type { IRepository } from './IRepository.js';

export interface Usuario {
  id: number;
  email: string;
  nome: string;
  cpf?: string;
  telefone?: string;
  ativo: boolean;
  papel: 'admin' | 'gerente' | 'usuario';
  criadoEm: string;
  atualizadoEm: string;
}

export interface IUsuarioRepository extends IRepository<Usuario> {
  /**
   * Busca usuário por email
   */
  findByEmail(email: string): Promise<Usuario | null>;

  /**
   * Busca usuário por CPF
   */
  findByCpf(cpf: string): Promise<Usuario | null>;

  /**
   * Busca usuários ativos
   */
  findAtivos(): Promise<Usuario[]>;

  /**
   * Busca usuários por papel
   */
  findByPapel(papel: Usuario['papel']): Promise<Usuario[]>;

  /**
   * Verifica se email existe
   */
  emailExists(email: string): Promise<boolean>;

  /**
   * Atualiza status ativo do usuário
   */
  updateAtivo(id: number, ativo: boolean): Promise<boolean>;
}
