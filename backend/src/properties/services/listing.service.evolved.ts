import { Pool } from 'pg';
import { Listing, ListingCreateInput } from '../types';
import { Logger } from '../../shared/logger';
import { ValidationError, NotFoundError, ConflictError } from '../middleware/error.middleware';

/**
 * Serviço evoluído para gerenciar anúncios com:
 * - Sincronização em lote
 * - Estratégia de retry inteligente
 * - Análise de performance
 * - Gestão de sync status detalhada
 */
export class ListingServiceEvolved {
  private syncRetries: Map<string, number> = new Map();
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAYS = [1000, 5000, 15000]; // ms

  constructor(private pool: Pool) {}

  // ==================== CRUD BÁSICO ====================

  async obterAnuncioPorId(id: string): Promise<Listing | null> {
    const resultado = await this.pool.query(
      `SELECT * FROM listings WHERE id = $1`,
      [id]
    );

    if (resultado.rows.length === 0) {
      return null;
    }

    return this.mapearAnuncio(resultado.rows[0]);
  }

  async criarAnuncio(dados: ListingCreateInput): Promise<Listing> {
    // Validar propriedade existe
    const propResult = await this.pool.query(
      'SELECT id, status FROM properties WHERE id = $1',
      [dados.property_id]
    );

    if (propResult.rows.length === 0) {
      throw new NotFoundError(`Propriedade ${dados.property_id} não encontrada`);
    }

    if (propResult.rows[0].status !== 'active') {
      throw new ValidationError('Propriedade não está ativa', {
        status: 'Apenas propriedades ativas podem ter anúncios',
      });
    }

    // Verificar duplicação
    const duplicado = await this.pool.query(
      'SELECT id FROM listings WHERE property_id = $1 AND platform = $2',
      [dados.property_id, dados.platform]
    );

    if (duplicado.rows.length > 0) {
      throw new ConflictError(
        `Anúncio para ${dados.platform} já existe nesta propriedade`
      );
    }

    const resultado = await this.pool.query(
      `INSERT INTO listings (
        property_id, platform, title, description, highlights,
        base_price, price_strategy, sync_status, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', true)
      RETURNING *`,
      [
        dados.property_id,
        dados.platform,
        dados.title,
        dados.description,
        JSON.stringify(dados.highlights),
        dados.base_price,
        dados.price_strategy || 'static',
      ]
    );

    Logger.info('listing-service', 'Anúncio criado', {
      id: resultado.rows[0].id,
      plataforma: dados.platform,
      propriedade: dados.property_id,
    });

    return this.mapearAnuncio(resultado.rows[0]);
  }

  async atualizarAnuncio(id: string, dados: Partial<Listing>): Promise<Listing> {
    const anuncio = await this.obterAnuncioPorId(id);
    if (!anuncio) {
      throw new NotFoundError(`Anúncio ${id} não encontrado`);
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
        chave !== 'property_id'
      ) {
        updates.push(`${chave} = $${contador}`);
        valores.push(valor);
        contador++;
      }
    });

    if (updates.length === 0) {
      return anuncio;
    }

    updates.push(`updated_at = NOW()`);
    valores.push(id);

    const resultado = await this.pool.query(
      `UPDATE listings SET ${updates.join(', ')} WHERE id = $${contador} RETURNING *`,
      valores
    );

    Logger.info('listing-service', 'Anúncio atualizado', { id });

    return this.mapearAnuncio(resultado.rows[0]);
  }

  // ==================== SINCRONIZAÇÃO ====================

  async obterAnunciosPendentesSync(limite: number = 50): Promise<Listing[]> {
    const resultado = await this.pool.query(
      `SELECT * FROM listings
       WHERE sync_status IN ('pending', 'error')
       AND is_active = true
       ORDER BY CASE
         WHEN sync_status = 'error' THEN 0
         ELSE 1
       END, updated_at ASC
       LIMIT $1`,
      [limite]
    );

    return resultado.rows.map((row) => this.mapearAnuncio(row));
  }

  async atualizarStatusSync(
    id: string,
    status: 'synced' | 'pending' | 'error',
    mensagemErro?: string
  ): Promise<Listing> {
    const resultado = await this.pool.query(
      `UPDATE listings SET
        sync_status = $1,
        sync_error_message = $2,
        synced_at = CASE WHEN $1 = 'synced' THEN NOW() ELSE synced_at END,
        updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, mensagemErro || null, id]
    );

    if (resultado.rows.length === 0) {
      throw new NotFoundError(`Anúncio ${id} não encontrado`);
    }

    // Limpar retry count se synced com sucesso
    if (status === 'synced') {
      this.syncRetries.delete(id);
      Logger.info('listing-service', 'Anúncio sincronizado', { id });
    }

    if (status === 'error') {
      Logger.warn('listing-service', 'Erro ao sincronizar', {
        id,
        erro: mensagemErro,
      });
    }

    return this.mapearAnuncio(resultado.rows[0]);
  }

  async obterProximoRetry(id: string): Promise<number | null> {
    const tentativas = this.syncRetries.get(id) || 0;

    if (tentativas >= this.MAX_RETRIES) {
      return null; // Não tentar mais
    }

    return this.RETRY_DELAYS[tentativas] || 60000;
  }

  async registrarTentativaSync(id: string): void {
    const tentativas = (this.syncRetries.get(id) || 0) + 1;
    this.syncRetries.set(id, tentativas);

    Logger.info('listing-service', 'Tentativa de sync registrada', {
      id,
      tentativa: tentativas,
      maxTentativas: this.MAX_RETRIES,
    });
  }

  // ==================== CONTEÚDO ====================

  async atualizarConteudo(
    id: string,
    titulo: string,
    descricao: string,
    destaques: string[],
    textoAmenidades: string
  ): Promise<Listing> {
    if (titulo.length < 10) {
      throw new ValidationError('Título muito curto', {
        titulo: 'Mínimo 10 caracteres',
      });
    }

    if (descricao.length < 20) {
      throw new ValidationError('Descrição muito curta', {
        descricao: 'Mínimo 20 caracteres',
      });
    }

    const resultado = await this.pool.query(
      `UPDATE listings SET
        title = $1,
        description = $2,
        highlights = $3,
        amenities_text = $4,
        sync_status = 'pending',
        updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        titulo,
        descricao,
        JSON.stringify(destaques),
        textoAmenidades,
        id,
      ]
    );

    if (resultado.rows.length === 0) {
      throw new NotFoundError(`Anúncio ${id} não encontrado`);
    }

    Logger.info('listing-service', 'Conteúdo atualizado', { id });

    return this.mapearAnuncio(resultado.rows[0]);
  }

  // ==================== PREÇOS ====================

  async atualizarPreco(
    id: string,
    precoBase: number,
    estrategia: 'static' | 'dynamic' | 'seasonal'
  ): Promise<Listing> {
    if (precoBase <= 0 || precoBase > 100000) {
      throw new ValidationError('Preço inválido', {
        precoBase: 'Deve estar entre 1 e 100.000',
      });
    }

    const resultado = await this.pool.query(
      `UPDATE listings SET
        base_price = $1,
        price_strategy = $2,
        sync_status = 'pending',
        updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [precoBase, estrategia, id]
    );

    if (resultado.rows.length === 0) {
      throw new NotFoundError(`Anúncio ${id} não encontrado`);
    }

    Logger.info('listing-service', 'Preço atualizado', {
      id,
      novoPreco: precoBase,
      estrategia,
    });

    return this.mapearAnuncio(resultado.rows[0]);
  }

  // ==================== PUBLICAÇÃO ====================

  async publicarAnuncio(id: string): Promise<Listing> {
    const anuncio = await this.obterAnuncioPorId(id);
    if (!anuncio) {
      throw new NotFoundError(`Anúncio ${id} não encontrado`);
    }

    if (!anuncio.title || !anuncio.description || !anuncio.base_price) {
      throw new ValidationError('Anúncio incompleto', {
        campos: 'Título, descrição e preço são obrigatórios',
      });
    }

    const resultado = await this.pool.query(
      `UPDATE listings SET
        is_active = true,
        published_at = NOW(),
        sync_status = 'pending',
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    Logger.info('listing-service', 'Anúncio publicado', { id });

    return this.mapearAnuncio(resultado.rows[0]);
  }

  async despublicarAnuncio(id: string): Promise<Listing> {
    const resultado = await this.pool.query(
      `UPDATE listings SET
        is_active = false,
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (resultado.rows.length === 0) {
      throw new NotFoundError(`Anúncio ${id} não encontrado`);
    }

    Logger.info('listing-service', 'Anúncio despublicado', { id });

    return this.mapearAnuncio(resultado.rows[0]);
  }

  // ==================== PERFORMANCE ====================

  async registrarVisao(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE listings SET
        views_count = views_count + 1,
        updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  async registrarClique(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE listings SET
        clicks_count = clicks_count + 1,
        updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  async registrarReserva(id: string): Promise<void> {
    const resultado = await this.pool.query(
      `UPDATE listings SET
        bookings_count = bookings_count + 1,
        conversion_rate = ROUND(
          (bookings_count::numeric + 1) / NULLIF(views_count, 0),
          4
        ),
        updated_at = NOW()
       WHERE id = $1
       RETURNING bookings_count, views_count`,
      [id]
    );

    if (resultado.rows.length > 0) {
      Logger.info('listing-service', 'Reserva registrada', {
        id,
        totalReservas: resultado.rows[0].bookings_count,
        totalVisualizacoes: resultado.rows[0].views_count,
      });
    }
  }

  async obterPerformance(id: string): Promise<any> {
    const resultado = await this.pool.query(
      `SELECT
        views_count,
        clicks_count,
        bookings_count,
        conversion_rate,
        sync_status,
        created_at,
        updated_at
       FROM listings
       WHERE id = $1`,
      [id]
    );

    if (resultado.rows.length === 0) {
      throw new NotFoundError(`Anúncio ${id} não encontrado`);
    }

    const anuncio = resultado.rows[0];

    return {
      id,
      metricas: {
        visualizacoes: anuncio.views_count,
        cliques: anuncio.clicks_count,
        reservas: anuncio.bookings_count,
        taxaConversao: (anuncio.conversion_rate || 0) * 100,
        ctr: anuncio.views_count > 0 ? (anuncio.clicks_count / anuncio.views_count) * 100 : 0,
        taxaReserva:
          anuncio.views_count > 0 ? (anuncio.bookings_count / anuncio.views_count) * 100 : 0,
      },
      sincronizacao: {
        status: anuncio.sync_status,
        criado: anuncio.created_at,
        atualizado: anuncio.updated_at,
      },
      benchmarks: this.calcularBenchmarks(anuncio),
    };
  }

  // ==================== BULK OPERATIONS ====================

  async atualizarPrecoMultiplos(
    ids: string[],
    precoBase: number,
    estrategia: 'static' | 'dynamic' | 'seasonal'
  ): Promise<number> {
    if (ids.length === 0) return 0;

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');

    const resultado = await this.pool.query(
      `UPDATE listings SET
        base_price = $${ids.length + 1},
        price_strategy = $${ids.length + 2},
        sync_status = 'pending',
        updated_at = NOW()
       WHERE id IN (${placeholders})`,
      [...ids, precoBase, estrategia]
    );

    Logger.info('listing-service', 'Preços atualizados em lote', {
      total: resultado.rowCount,
      novoPreco: precoBase,
    });

    return resultado.rowCount || 0;
  }

  async publicarMultiplos(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');

    const resultado = await this.pool.query(
      `UPDATE listings SET
        is_active = true,
        published_at = NOW(),
        sync_status = 'pending',
        updated_at = NOW()
       WHERE id IN (${placeholders})
       AND title IS NOT NULL
       AND description IS NOT NULL
       AND base_price > 0`,
      ids
    );

    Logger.info('listing-service', 'Anúncios publicados em lote', {
      total: resultado.rowCount,
    });

    return resultado.rowCount || 0;
  }

  async sincronizarPorPlataforma(plataforma: string): Promise<Listing[]> {
    const resultado = await this.pool.query(
      `SELECT * FROM listings
       WHERE platform = $1
       AND sync_status IN ('pending', 'error')
       AND is_active = true
       ORDER BY updated_at ASC`,
      [plataforma]
    );

    Logger.info('listing-service', 'Anúncios para sincronizar por plataforma', {
      plataforma,
      total: resultado.rows.length,
    });

    return resultado.rows.map((row) => this.mapearAnuncio(row));
  }

  // ==================== UTILITÁRIOS PRIVADOS ====================

  private mapearAnuncio(row: any): Listing {
    return {
      ...row,
      highlights: typeof row.highlights === 'string' ? JSON.parse(row.highlights) : row.highlights,
    };
  }

  private calcularBenchmarks(anuncio: any): any {
    const performanceEsperada = {
      ctrMedio: 3.5,
      taxaConversaoMedia: 2.5,
      taxaReservaMedia: 2.0,
    };

    const ctrAtual = anuncio.views_count > 0 ? (anuncio.clicks_count / anuncio.views_count) * 100 : 0;
    const taxaConversaoAtual = (anuncio.conversion_rate || 0) * 100;

    return {
      ctrAcimaDaMedia: ctrAtual > performanceEsperada.ctrMedio,
      convercaoAcimaDaMedia: taxaConversaoAtual > performanceEsperada.taxaConversaoMedia,
      recomendacao: this.gerarRecomendacao(anuncio, performanceEsperada),
    };
  }

  private gerarRecomendacao(anuncio: any, esperado: any): string[] {
    const recomendacoes: string[] = [];

    if (anuncio.views_count === 0) {
      recomendacoes.push('Anúncio sem visualizações, verifique a visibilidade');
    }

    if (anuncio.views_count > 0 && anuncio.clicks_count === 0) {
      recomendacoes.push('Nenhum clique recebido, considere melhorar o título/descrição');
    }

    if (anuncio.views_count > 10 && anuncio.bookings_count === 0) {
      recomendacoes.push('Muitas visualizações mas sem reservas, revise o preço ou descrição');
    }

    if (recomendacoes.length === 0) {
      recomendacoes.push('Anúncio performando bem');
    }

    return recomendacoes;
  }
}
