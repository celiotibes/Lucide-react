import express, { Router } from 'express';
import MobileDashboardService from '@services/MobileDashboardService';
import { authenticateJWT } from '@middlewares/authMiddleware';
import { logger } from '@utils/logger';

const router = Router();

/**
 * GET /dashboard/mobile
 * Obter dashboard completo para mobile
 */
router.get('/dashboard/mobile', authenticateJWT, async (req, res) => {
  try {
    const userId = (req as any).user.id;

    const dashboard = await MobileDashboardService.getDashboardData(userId);

    res.status(200).json({
      status: 'success',
      dashboard,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao carregar dashboard mobile');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao carregar dashboard',
    });
  }
});

/**
 * GET /dashboard/mobile/summary
 * Obter resumo do dashboard
 */
router.get('/dashboard/mobile/summary', authenticateJWT, async (req, res) => {
  try {
    const userId = (req as any).user.id;

    const summary = await MobileDashboardService.getDashboardSummary(userId);

    res.status(200).json({
      status: 'success',
      summary,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter resumo');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter resumo',
    });
  }
});

/**
 * GET /dashboard/mobile/cases
 * Obter lista de casos com paginação e filtros
 */
router.get('/dashboard/mobile/cases', authenticateJWT, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    const filters = req.query.filters
      ? JSON.parse(req.query.filters as string)
      : undefined;

    const result = await MobileDashboardService.getCaseList(
      userId,
      filters,
      page,
      pageSize,
    );

    res.status(200).json({
      status: 'success',
      ...result,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter lista de casos');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter lista de casos',
    });
  }
});

/**
 * GET /dashboard/mobile/cases/:caseId
 * Obter detalhes de um caso
 */
router.get(
  '/dashboard/mobile/cases/:caseId',
  authenticateJWT,
  async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { caseId } = req.params;

      const caseDetails = await MobileDashboardService.getCaseDetails(
        caseId,
        userId,
      );

      if (!caseDetails) {
        return res.status(404).json({
          status: 'error',
          message: 'Caso não encontrado',
        });
      }

      res.status(200).json({
        status: 'success',
        case: caseDetails,
      });
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter detalhes do caso');
      res.status(500).json({
        status: 'error',
        message: 'Erro ao obter detalhes do caso',
      });
    }
  },
);

/**
 * GET /dashboard/mobile/deadlines/urgent
 * Obter prazos urgentes
 */
router.get(
  '/dashboard/mobile/deadlines/urgent',
  authenticateJWT,
  async (req, res) => {
    try {
      const userId = (req as any).user.id;

      const deadlines = await MobileDashboardService.getUrgentDeadlines(
        userId,
      );

      res.status(200).json({
        status: 'success',
        deadlines,
        count: deadlines.length,
      });
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter prazos urgentes');
      res.status(500).json({
        status: 'error',
        message: 'Erro ao obter prazos urgentes',
      });
    }
  },
);

/**
 * GET /dashboard/mobile/updates/recent
 * Obter atualizações recentes
 */
router.get(
  '/dashboard/mobile/updates/recent',
  authenticateJWT,
  async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const limit = parseInt(req.query.limit as string) || 20;

      const updates = await MobileDashboardService.getRecentUpdates(
        userId,
        limit,
      );

      res.status(200).json({
        status: 'success',
        updates,
        count: updates.length,
      });
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter atualizações');
      res.status(500).json({
        status: 'error',
        message: 'Erro ao obter atualizações',
      });
    }
  },
);

/**
 * GET /dashboard/mobile/notifications
 * Obter resumo de notificações
 */
router.get('/dashboard/mobile/notifications', authenticateJWT, async (req, res) => {
  try {
    const userId = (req as any).user.id;

    const notifications = await MobileDashboardService.getNotificationSummary(
      userId,
    );

    res.status(200).json({
      status: 'success',
      notifications,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter notificações');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter notificações',
    });
  }
});

/**
 * GET /dashboard/mobile/financials
 * Obter resumo financeiro
 */
router.get('/dashboard/mobile/financials', authenticateJWT, async (req, res) => {
  try {
    const userId = (req as any).user.id;

    const financials = await MobileDashboardService.getFinancialSummary(
      userId,
    );

    res.status(200).json({
      status: 'success',
      financials,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter resumo financeiro');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter resumo financeiro',
    });
  }
});

/**
 * POST /dashboard/mobile/notifications/:notificationId/read
 * Marcar notificação como lida
 */
router.post(
  '/dashboard/mobile/notifications/:notificationId/read',
  authenticateJWT,
  async (req, res) => {
    try {
      const { notificationId } = req.params;

      await MobileDashboardService.markNotificationAsRead(notificationId);

      res.status(200).json({
        status: 'success',
        message: 'Notificação marcada como lida',
      });
    } catch (error) {
      logger.error({ err: error }, 'Erro ao marcar notificação como lida');
      res.status(500).json({
        status: 'error',
        message: 'Erro ao processar notificação',
      });
    }
  },
);

/**
 * GET /dashboard/mobile/profile
 * Obter perfil do usuário
 */
router.get('/dashboard/mobile/profile', authenticateJWT, async (req, res) => {
  try {
    const userId = (req as any).user.id;

    const profile = await MobileDashboardService.getUserProfile(userId);

    res.status(200).json({
      status: 'success',
      profile,
    });
  } catch (error) {
    logger.error({ err: error }, 'Erro ao obter perfil');
    res.status(500).json({
      status: 'error',
      message: 'Erro ao obter perfil',
    });
  }
});

export default router;
