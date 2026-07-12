import { Pool, PoolClient } from 'pg';
import { Property, PropertyWithListings, PropertyDashboard } from '../types';
import { Logger } from '../../shared/logger';
import { PropertyValidators } from '../utils/validators';
import { ValidationError, NotFoundError, ConflictError } from '../middleware/error.middleware';

/**
 * Serviço evoluído para gerenciar propriedades com:
 * - Caching inteligente
 * - Transações ACID
 * - Validação robusta
 * - Bulk operations
 * - Filtros avançados
 */
export class PropertyServiceEvolved {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  constructor(private pool: Pool) {}

  // ==================== CRUD BÁSICO ====================

  async obterPropriedadePorId(id: string): Promise<Property | null> {
    if (!this.validarUUID(id)) {
      throw new ValidationError('ID inválido', { id: 'Formato UUID esperado' });
    }

    // Tentar cache primeiro
    const cached = this.obterDoCache(`propriedade:${id}`);
    if (cached) {
      Logger.info('property-service', 'Cache hit', { id });
      return cached;
    }

    const resultado = await this.pool.query(
      `SELECT * FROM properties WHERE id = $1`,
      [id]
    );

    if (resultado.rows.length === 0) {
      return null;
    }

    const propriedade = resultado.rows[0];
    this.armazenaremCache(`propriedade:${id}`, propriedade);

    Logger.info('property-service', 'Propriedade obtida', {
      id,
      endereco: propriedade.address,
      cidade: propriedade.city,
    });

    return propriedade;
  }

  async criarPropriedade(dados: Partial<Property>): Promise<Property> {
    // Validações rigorosas
    PropertyValidators.validatePropertyData(dados);

    // Verificar duplicação por código interno
    if (dados.internal_code) {
      const existente = await this.pool.query(
        'SELECT id FROM properties WHERE internal_code = $1',
        [dados.internal_code]
      );

      if (existente.rows.length > 0) {
        throw new ConflictError(`Código interno ${dados.internal_code} já existe`);
      }
    }

    // Verificar owner existe
    const ownerExiste = await this.pool.query(
      'SELECT id FROM property_owners WHERE id = $1 AND is_active = true',
      [dados.owner_id]
    );

    if (ownerExiste.rows.length === 0) {
      throw new NotFoundError(`Proprietário ${dados.owner_id} não encontrado ou inativo`);
    }

    const {
      owner_id,
      internal_code,
      address,
      city,
      state,
      type,
      area_m2,
      bedrooms,
      bathrooms,
      base_monthly_rent,
      security_deposit,
      is_furnished = true,
      minimum_stay_days = 30,
    } = dados;

    // Usar transação para garantir consistência
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const resultado = await client.query(
        `INSERT INTO properties (
          owner_id, internal_code, address, city, state, type, area_m2,
          bedrooms, bathrooms, base_monthly_rent, security_deposit, is_furnished,
          minimum_stay_days, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active')
        RETURNING *`,
        [
          owner_id,
          internal_code,
          address,
          city,
          state,
          type,
          area_m2,
          bedrooms,
          bathrooms,
          base_monthly_rent,
          security_deposit,
          is_furnished,
          minimum_stay_days,
        ]
      );

      await client.query('COMMIT');

      const propriedade = resultado.rows[0];

      // Limpar cache relacionado
      this.limparCacheProprietario(owner_id);
      this.limparCacheCidade(city);

      Logger.info('property-service', 'Propriedade criada com sucesso', {
        id: propriedade.id,
        codigo: internal_code,
        endereco: address,
        cidade: city,
      });

      return propriedade;
    } catch (erro) {
      await client.query('ROLLBACK');
      throw erro;
    } finally {
      client.release();
    }
  }

  async atualizarPropriedade(id: string, dados: Partial<Property>): Promise<Property> {
    const propriedadeExistente = await this.obterPropriedadePorId(id);
    if (!propriedadeExistente) {
      throw new NotFoundError(`Propriedade ${id} não encontrada`);
    }

    // Validar dados fornecidos
    if (dados.area_m2 && !PropertyValidators.validateArea(dados.area_m2)) {
      throw new ValidationError('Área inválida', {
        area_m2: 'Deve estar entre 1 e 999 m²',
      });
    }

    if (dados.base_monthly_rent && !PropertyValidators.validatePrice(dados.base_monthly_rent)) {
      throw new ValidationError('Preço inválido', {
        base_monthly_rent: 'Deve estar entre 1 e 999.999',
      });
    }

    const updates: string[] = [];
    const valores: unknown[] = [];
    let contador = 1;

    Object.entries(dados).forEach(([chave, valor]) => {
      if (
        valor !== undefined &&
        valor !== null &&
        chave !== 'id' &&
        chave !== 'created_at' &&
        chave !== 'owner_id' // Evitar mudança de proprietário
      ) {
        updates.push(`${chave} = $${contador}`);
        valores.push(valor);
        contador++;
      }
    });

    if (updates.length === 0) {
      return propriedadeExistente;
    }

    updates.push(`updated_at = NOW()`);
    valores.push(id);

    const query = `
      UPDATE properties
      SET ${updates.join(', ')}
      WHERE id = $${contador}
      RETURNING *
    `;

    const resultado = await this.pool.query(query, valores);

    // Limpar cache
    this.invalidarCache(`propriedade:${id}`);
    this.limparCacheProprietario(propriedadeExistente.owner_id);

    Logger.info('property-service', 'Propriedade atualizada', {
      id,
      camposAtualizados: Object.keys(dados).length,
    });

    return resultado.rows[0];
  }

  async deletarPropriedade(id: string): Promise<void> {
    const propriedade = await this.obterPropriedadePorId(id);
    if (!propriedade) {
      throw new NotFoundError(`Propriedade ${id} não encontrada`);
    }

    // Verificar se tem listagens ativas
    const listagens = await this.pool.query(
      'SELECT COUNT(*) as count FROM listings WHERE property_id = $1 AND is_active = true',
      [id]
    );

    if (parseInt(listagens.rows[0].count, 10) > 0) {
      throw new ValidationError('Não é possível deletar propriedade com listagens ativas', {
        listagens: 'Desative todas as listagens antes de deletar',
      });
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Deletar dados relacionados em cascata controlada
      await client.query('DELETE FROM occupancy_history WHERE property_id = $1', [id]);
      await client.query('DELETE FROM property_monthly_stats WHERE property_id = $1', [id]);
      await client.query('DELETE FROM listings WHERE property_id = $1', [id]);
      await client.query('DELETE FROM properties WHERE id = $1', [id]);

      await client.query('COMMIT');

      // Limpar cache
      this.invalidarCache(`propriedade:${id}`);
      this.limparCacheProprietario(propriedade.owner_id);

      Logger.info('property-service', 'Propriedade deletada com sucesso', { id });
    } catch (erro) {
      await client.query('ROLLBACK');
      throw erro;
    } finally {
      client.release();
    }
  }

  // ==================== BUSCA E FILTROS AVANÇADOS ====================

  async listarPropriedades(filtros: {
    proprietarioId?: string;
    cidade?: string;
    estado?: string;
    tipo?: string;
    status?: string;
    areaMin?: number;
    areaMax?: number;
    precoMin?: number;
    precoMax?: number;
    limite?: number;
    offset?: number;
  }): Promise<{ propriedades: Property[]; total: number }> {
    const {
      proprietarioId,
      cidade,
      estado,
      tipo,
      status = 'active',
      areaMin,
      areaMax,
      precoMin,
      precoMax,
      limite = 50,
      offset = 0,
    } = filtros;

    // Construir query dinamicamente
    const condicoes: string[] = ['status = $1'];
    const valores: unknown[] = [status];
    let contador = 2;

    if (proprietarioId) {
      condicoes.push(`owner_id = $${contador++}`);
      valores.push(proprietarioId);
    }

    if (cidade) {
      condicoes.push(`city ILIKE $${contador++}`);
      valores.push(`%${cidade}%`);
    }

    if (estado) {
      condicoes.push(`state = $${contador++}`);
      valores.push(estado);
    }

    if (tipo) {
      condicoes.push(`type = $${contador++}`);
      valores.push(tipo);
    }

    if (areaMin !== undefined) {
      condicoes.push(`area_m2 >= $${contador++}`);
      valores.push(areaMin);
    }

    if (areaMax !== undefined) {
      condicoes.push(`area_m2 <= $${contador++}`);
      valores.push(areaMax);
    }

    if (precoMin !== undefined) {
      condicoes.push(`base_monthly_rent >= $${contador++}`);
      valores.push(precoMin);
    }

    if (precoMax !== undefined) {
      condicoes.push(`base_monthly_rent <= $${contador++}`);
      valores.push(precoMax);
    }

    const clausulaWhere = condicoes.join(' AND ');

    // Contar total
    const totalResult = await this.pool.query(
      `SELECT COUNT(*) as total FROM properties WHERE ${clausulaWhere}`,
      valores
    );
    const total = parseInt(totalResult.rows[0].total, 10);

    // Buscar dados
    valores.push(limite, offset);
    const resultado = await this.pool.query(
      `SELECT * FROM properties
       WHERE ${clausulaWhere}
       ORDER BY created_at DESC
       LIMIT $${contador + 1} OFFSET $${contador + 2}`,
      valores
    );

    Logger.info('property-service', 'Propriedades listadas', {
      total,
      retornadas: resultado.rows.length,
      filtros: Object.keys(filtros),
    });

    return {
      propriedades: resultado.rows,
      total,
    };
  }

  async buscarPorLocalizacao(latitude: number, longitude: number, raioKm: number = 5): Promise<Property[]> {
    const resultado = await this.pool.query(
      `SELECT * FROM properties
       WHERE (
         6371 * acos(
           cos(radians($1)) * cos(radians(latitude)) *
           cos(radians(longitude) - radians($2)) +
           sin(radians($1)) * sin(radians(latitude))
         )
       ) <= $3
       ORDER BY created_at DESC`,
      [latitude, longitude, raioKm]
    );

    Logger.info('property-service', 'Propriedades encontradas por localização', {
      latitude,
      longitude,
      raioKm,
      total: resultado.rows.length,
    });

    return resultado.rows;
  }

  // ==================== BULK OPERATIONS ====================

  async criarMultiplasPropriedades(propriedades: Partial<Property>[]): Promise<Property[]> {
    if (propriedades.length === 0) {
      return [];
    }

    // Validar todas antes de inserir
    propriedades.forEach((prop) => PropertyValidators.validatePropertyData(prop));

    const client = await this.pool.connect();
    const criadadas: Property[] = [];

    try {
      await client.query('BEGIN');

      for (const prop of propriedades) {
        const resultado = await client.query(
          `INSERT INTO properties (
            owner_id, internal_code, address, city, state, type, area_m2,
            bedrooms, bathrooms, base_monthly_rent, security_deposit, is_furnished,
            minimum_stay_days, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active')
          RETURNING *`,
          [
            prop.owner_id,
            prop.internal_code,
            prop.address,
            prop.city,
            prop.state,
            prop.type,
            prop.area_m2,
            prop.bedrooms,
            prop.bathrooms,
            prop.base_monthly_rent,
            prop.security_deposit,
            prop.is_furnished ?? true,
            prop.minimum_stay_days ?? 30,
          ]
        );

        criadadas.push(resultado.rows[0]);
      }

      await client.query('COMMIT');

      // Limpar cache geral
      this.limparCacheCompleto();

      Logger.info('property-service', 'Múltiplas propriedades criadas', {
        total: criadadas.length,
      });

      return criadadas;
    } catch (erro) {
      await client.query('ROLLBACK');
      throw erro;
    } finally {
      client.release();
    }
  }

  async atualizarMultiplasPropriedades(
    ids: string[],
    dados: Partial<Property>
  ): Promise<number> {
    if (ids.length === 0) return 0;

    const updates: string[] = [];
    const valores: unknown[] = [];
    let contador = 1;

    Object.entries(dados).forEach(([chave, valor]) => {
      if (valor !== undefined && valor !== null && chave !== 'id') {
        updates.push(`${chave} = $${contador}`);
        valores.push(valor);
        contador++;
      }
    });

    if (updates.length === 0) return 0;

    updates.push(`updated_at = NOW()`);

    const placeholders = ids.map((_, i) => `$${contador + i + 1}`).join(',');
    valores.push(...ids);

    const resultado = await this.pool.query(
      `UPDATE properties
       SET ${updates.join(', ')}
       WHERE id IN (${placeholders})`,
      valores
    );

    // Limpar cache
    ids.forEach((id) => this.invalidarCache(`propriedade:${id}`));

    Logger.info('property-service', 'Múltiplas propriedades atualizadas', {
      total: resultado.rowCount,
    });

    return resultado.rowCount || 0;
  }

  // ==================== DASHBOARD E ANALYTICS ====================

  async obterDashboard(id: string): Promise<PropertyDashboard | null> {
    const propriedade = await this.obterPropriedadePorId(id);
    if (!propriedade) return null;

    // Buscar dados em paralelo
    const [listagens, statsResult, occupancyResult, avaliacoes] = await Promise.all([
      this.pool.query('SELECT COUNT(*) as count FROM listings WHERE property_id = $1', [id]),
      this.pool.query(
        `SELECT * FROM property_monthly_stats
         WHERE property_id = $1
         AND year_month = $2`,
        [id, new Date().toISOString().slice(0, 7)]
      ),
      this.pool.query(
        `SELECT
          COUNT(CASE WHEN status = 'occupied' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) as taxa
         FROM occupancy_history
         WHERE property_id = $1
         AND date >= NOW() - INTERVAL '30 days'`,
        [id]
      ),
      this.pool.query(
        `SELECT
          COALESCE(AVG(average_rating), 0) as media_avaliacoes,
          SUM(reviews_count) as total_avaliacoes
         FROM property_monthly_stats
         WHERE property_id = $1
         AND year_month >= $2`,
        [id, new Date().toISOString().slice(0, 4)]
      ),
    ]);

    const statsAtual = statsResult.rows[0] || {
      occupancy_rate: 0,
      total_revenue: 0,
      leads_generated: 0,
      conversion_rate: 0,
    };

    const dashboard: PropertyDashboard = {
      property: propriedade,
      occupancy_rate: occupancyResult.rows[0]?.taxa || 0,
      revenue_month: statsAtual.total_revenue || 0,
      revenue_potential: (propriedade.base_monthly_rent * 30 * 0.8) || 0,
      leads_month: statsAtual.leads_generated || 0,
      conversion_rate: statsAtual.conversion_rate || 0,
      average_rating: avaliacoes.rows[0]?.media_avaliacoes || 0,
      reviews_count: avaliacoes.rows[0]?.total_avaliacoes || 0,
      listings_sync_status: {},
    };

    return dashboard;
  }

  async obterEstatisticasAvancadas(id: string, meses: number = 12): Promise<any> {
    const resultado = await this.pool.query(
      `SELECT
        year_month,
        occupancy_rate,
        total_revenue,
        average_nightly_rate,
        leads_generated,
        tours_completed,
        bookings_closed,
        conversion_rate,
        average_rating,
        reviews_count
       FROM property_monthly_stats
       WHERE property_id = $1
       AND year_month >= (DATE_TRUNC('month', NOW()) - INTERVAL $2)::text
       ORDER BY year_month DESC`,
      [id, `${meses} months`]
    );

    const stats = resultado.rows;

    return {
      periodo: `${meses} meses`,
      total_stats: stats.length,
      resumo: {
        ocupacao_media: this.calcularMedia(stats.map((s) => s.occupancy_rate)),
        receita_total: stats.reduce((sum, s) => sum + (s.total_revenue || 0), 0),
        leads_total: stats.reduce((sum, s) => sum + (s.leads_generated || 0), 0),
        taxa_conversao_media: this.calcularMedia(stats.map((s) => s.conversion_rate)),
        avaliacao_media: this.calcularMedia(stats.map((s) => s.average_rating)),
      },
      detalhes_mensais: stats,
      tendencia: this.calcularTendencia(stats.map((s) => s.total_revenue)),
    };
  }

  // ==================== UTILITÁRIOS PRIVADOS ====================

  private obterDoCache(chave: string): any {
    const item = this.cache.get(chave);
    if (!item) return null;

    // Verificar expiração
    if (Date.now() - item.timestamp > this.CACHE_TTL) {
      this.cache.delete(chave);
      return null;
    }

    return item.data;
  }

  private armazenaremCache(chave: string, dados: any): void {
    this.cache.set(chave, {
      data: dados,
      timestamp: Date.now(),
    });
  }

  private invalidarCache(chave: string): void {
    this.cache.delete(chave);
  }

  private limparCacheProprietario(proprietarioId: string): void {
    const chave = `propriedades:proprietario:${proprietarioId}`;
    this.invalidarCache(chave);
  }

  private limparCacheCidade(cidade: string): void {
    const chave = `propriedades:cidade:${cidade}`;
    this.invalidarCache(chave);
  }

  private limparCacheCompleto(): void {
    this.cache.clear();
  }

  private validarUUID(valor: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(valor);
  }

  private calcularMedia(valores: number[]): number {
    if (valores.length === 0) return 0;
    return valores.reduce((sum, v) => sum + (v || 0), 0) / valores.length;
  }

  private calcularTendencia(valores: number[]): 'crescente' | 'estável' | 'decrescente' {
    if (valores.length < 2) return 'estável';

    const primeira = valores[valores.length - 1] || 0;
    const ultima = valores[0] || 0;
    const mudanca = ((ultima - primeira) / (primeira || 1)) * 100;

    if (mudanca > 5) return 'crescente';
    if (mudanca < -5) return 'decrescente';
    return 'estável';
  }
}
