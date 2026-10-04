/**
 * Rotas HTTP para sistema de análise de margens por propriedade
 * Versão refatorada com Dependency Injection
 *
 * GET /api/relatorios/margens?imovelId=INT&dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD
 *   Retorna histórico de margens para 1 imóvel em um período
 *
 * GET /api/relatorios/margens/ranking?periodoMes=YYYY-MM
 *   Retorna ranking geral (top 5 + bottom 5) para um período
 */

import express from 'express';
import type { Container } from '../infrastructure/container.js';
import type { LoggerService } from '../services/logger-service.js';
import type Database from 'better-sqlite3';
import type { AuthServiceDB } from '../domain/auth/auth-service-db.js';
import { criarMiddlewareAutenticacao } from './auth-routes.js';

  ,
  $1$2obterMargensHistorico,
  obterMargensRanking,
  obterMargensRankingPaginado,
  calcularEGravarMargensDoMes,
 from '../domain/relatorios/margensPorPropriedade.js';
   from '../domain/pagination/pagination.js';

export interface RelatoriosRoutesDIOptions {
  container: Container;
  authService: AuthServiceDB;
}

export function criarRotasRelatoriosDI({
  container,
  authService,
}: RelatoriosRoutesDIOptions): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);

  // Resolve dependências do container
  const db = container.resolve<Database.Database>('db');
  const logger = container.resolve<LoggerService>('logger');

  /**
   * GET /api/relatorios/margens
   * Retorna histórico de margens com tendência de 12 meses
   */
  router.get('/margens', exigirAutenticacao, async (req, res) => {
    try {
      const { imovelId, dataInicio, dataFim } = req.query;

      if (!imovelId) {
        res.status(400).json({ erro: 'imovelId é obrigatório' });
        return;
      }

      const id = parseInt(String(imovelId), 10);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ erro: 'imovelId deve ser um número inteiro positivo' });
        return;
      }

      // Default: últimos 12 meses
      const inicio = dataInicio
        ? String(dataInicio)
        : new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const fim = dataFim ? String(dataFim) : new Date().toISOString().split('T')[0];

      // Validar datas
      if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
        res.status(400).json({ erro: 'Datas devem estar no formato YYYY-MM-DD' });
        return;
      }

      const historico = obterMargensHistorico(db, id, inicio, fim);

      res.status(200).json({
        imovelId: historico.imovelId,
        nomePropriedade: historico.nomePropriedade,
        periodos: historico.periodos.map((p) => ({
          periodo: p.periodo,
          receita: p.receita,
          despesa: p.despesa,
          margem: p.margem,
          status: p.status,
        })),
      });
    } catch (erro) {
      if (erro instanceof Error && erro.message.includes('Imóvel não encontrado')) {
        res.status(404).json({ erro: erro.message });
        return;
      }
      logger.error('[RelatoriosRoutesDI] Erro ao obter margens:', erro);
      throw erro;
    }
  });

  /**
   * GET /api/relatorios/margens/ranking
   * Retorna top 5 + bottom 5 propriedades do período
   */
  router.get('/margens/ranking', exigirAutenticacao, async (req, res) => {
    try {
      const { periodoMes } = req.query;

      if (!periodoMes) {
        res.status(400).json({ erro: 'periodoMes é obrigatório (formato: YYYY-MM)' });
        return;
      }

      const periodo = String(periodoMes);
      const match = periodo.match(/^(\d{4})-(\d{2})$/);
      if (!match) {
        res.status(400).json({ erro: 'periodoMes deve estar no formato YYYY-MM' });
        return;
      }

      const [, anoStr, mesStr] = match;
      const ano = parseInt(anoStr, 10);
      const mes = parseInt(mesStr, 10);

      if (mes < 1 || mes > 12) {
        res.status(400).json({ erro: `mes deve estar entre 1 e 12: ${mes}` });
        return;
      }

      const { top5, bottom5 } = obterMargensRanking(db, ano, mes);

      res.status(200).json({
        periodo,
        top5: top5.map((item) => ({
          rank: item.rank,
          imovelId: item.imovelId,
          nomePropriedade: item.nomePropriedade,
          receita: item.receita,
          despesa: item.despesa,
          margem: item.margem,
          status: item.status,
        })),
        bottom5: bottom5.map((item) => ({
          rank: item.rank,
          imovelId: item.imovelId,
          nomePropriedade: item.nomePropriedade,
          receita: item.receita,
          despesa: item.despesa,
          margem: item.margem,
          status: item.status,
        })),
      });
    } catch (erro) {
      logger.error('[RelatoriosRoutesDI] Erro ao obter ranking de margens:', erro);
      res.status(500).json({
        erro: 'Erro ao obter ranking de margens',
        detalhes: erro instanceof Error ? erro.message : String(erro),
      });
    }
  });

  /**
   * GET /api/relatorios/margens/ranking/paginado
   * Retorna ranking paginado de margens por propriedade
   */
  router.get('/margens/ranking/paginado', exigirAutenticacao, async (req, res) => {
    try {
      const { periodoMes, limit, offset } = req.query;

      if (!periodoMes) {
        res.status(400).json({ erro: 'periodoMes é obrigatório (formato: YYYY-MM)' });
        return;
      }

      const periodo = String(periodoMes);
      const match = periodo.match(/^(\d{4})-(\d{2})$/);
      if (!match) {
        res.status(400).json({ erro: 'periodoMes deve estar no formato YYYY-MM' });
        return;
      }

      const [, anoStr, mesStr] = match;
      const ano = parseInt(anoStr, 10);
      const mes = parseInt(mesStr, 10);

      if (mes < 1 || mes > 12) {
        res.status(400).json({ erro: `mes deve estar entre 1 e 12: ${mes}` });
        return;
      }

      const { limit: parsedLimit, offset: parsedOffset } = parsePaginationParams(limit, offset);

      const resultado = obterMargensRankingPaginado(db, ano, mes, parsedLimit, parsedOffset);

      res.status(200).json({
        periodo,
        dados: resultado.items.map((item) => ({
          rank: item.rank,
          imovelId: item.imovelId,
          nomePropriedade: item.nomePropriedade,
          receita: item.receita,
          despesa: item.despesa,
          margem: item.margem,
          status: item.status,
        })),
        total: resultado.total,
        limit: resultado.limit,
        offset: resultado.offset,
        hasMore: resultado.hasMore,
      });
    } catch (erro) {
      logger.error('[RelatoriosRoutesDI] Erro ao obter ranking paginado de margens:', erro);
      res.status(500).json({
        erro: 'Erro ao obter ranking paginado de margens',
        detalhes: erro instanceof Error ? erro.message : String(erro),
      });
    }
  });

  /**
   * POST /api/relatorios/margens/calcular
   * Força recálculo e gravação de margens para um período
   */
  router.post('/margens/calcular', exigirAutenticacao, async (req, res) => {
    try {
      const { ano, mes } = req.body ?? {};

      if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
        res.status(400).json({ erro: 'ano deve ser um número inteiro entre 2000 e 2100' });
        return;
      }

      if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
        res.status(400).json({ erro: 'mes deve ser um número inteiro entre 1 e 12' });
        return;
      }

      const margens = calcularEGravarMargensDoMes(db, ano, mes);

      res.status(200).json({
        periodo: `${ano}-${String(mes).padStart(2, '0')}`,
        totalImoveisCalculados: margens.length,
        margens: margens.map((m) => ({
          imovelId: m.imovelId,
          nomePropriedade: m.nomeProriedade,
          receita: m.receita,
          despesa: m.despesa,
          margem: m.margem,
          status: m.status,
        })),
      });
    } catch (erro) {
      logger.error('[RelatoriosRoutesDI] Erro ao calcular margens:', erro);
      res.status(500).json({
        erro: 'Erro ao calcular margens',
        detalhes: erro instanceof Error ? erro.message : String(erro),
      });
    }
  });

  /**
   * GET /api/relatorios/margens/imovel/:imovelId/ultimo
   * Retorna a última margem calculada para um imóvel específico
   */
  router.get('/margens/imovel/:imovelId/ultimo', exigirAutenticacao, async (req, res) => {
    try {
      const { imovelId } = req.params;
      const id = parseInt(imovelId, 10);

      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ erro: 'imovelId deve ser um número inteiro positivo' });
        return;
      }

      // Buscar último período gravado
      const resultado = db
        .prepare(
          `
        SELECT m.*, i.nome as nomePropriedade
        FROM margens_propriedades_periodo m
        JOIN imoveis i ON i.id = m.imovel_id
        WHERE m.imovel_id = ?
        ORDER BY m.ano DESC, m.mes DESC
        LIMIT 1
      `
        )
        .get(id) as unknown;

      if (!resultado) {
        res.status(404).json({ erro: 'Nenhuma margem calculada para este imóvel' });
        return;
      }

      res.status(200).json({
        imovelId: resultado.imovel_id,
        nomePropriedade: resultado.nomePropriedade,
        periodo: resultado.periodo,
        receita: resultado.receita,
        despesa: resultado.despesa,
        margem: resultado.margem,
        status: resultado.status,
        calculadoEm: resultado.calculado_em,
      });
    } catch (erro) {
      logger.error('[RelatoriosRoutesDI] Erro ao obter última margem:', erro);
      throw erro;
    }
  });

  return router;
}
