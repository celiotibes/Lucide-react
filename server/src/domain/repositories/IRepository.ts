/**
 * Interface base para todos os repositórios
 * Define contrato comum para operações CRUD
 */

export interface IRepository<T, ID = number> {
  /**
   * Encontra entidade por ID
   */
  findById(id: ID): Promise<T | null>;

  /**
   * Encontra todas as entidades
   */
  findAll(): Promise<T[]>;

  /**
   * Salva ou atualiza uma entidade
   */
  save(entity: T): Promise<T>;

  /**
   * Delete uma entidade por ID
   */
  delete(id: ID): Promise<boolean>;

  /**
   * Verifica se entidade existe
   */
  exists(id: ID): Promise<boolean>;

  /**
   * Conta total de entidades
   */
  count(): Promise<number>;
}
