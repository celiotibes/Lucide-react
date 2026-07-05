import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { verifyToken } from '@middlewares/authMiddleware';
import { templateManager } from '@services/TemplateManager';
import { TemplateCustomizationRequest, TemplateFilter } from '@types/template';

const router = Router();

/**
 * GET /templates
 * List all available templates with optional filters
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const filter: TemplateFilter = {
      type: req.query.type as any,
      category: req.query.category as string,
      jurisdiction: req.query.jurisdiction as string,
      search: req.query.search as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };

    const templates = await templateManager.listTemplates(filter);

    res.json({
      status: 'success',
      count: templates.length,
      templates,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error listing templates');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Error listing templates',
    });
  }
});

/**
 * GET /templates/:id
 * Get specific template
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const template = await templateManager.loadTemplate(req.params.id);

    res.json({
      status: 'success',
      template,
    });
  } catch (error) {
    logger.error({ err: error }, `Error loading template ${req.params.id}`);
    res.status(404).json({
      error: error instanceof Error ? error.message : 'Template not found',
    });
  }
});

/**
 * POST /templates/:id/substitute
 * Substitute variables in template
 * Requires authentication
 */
router.post('/:id/substitute', verifyToken, async (req: Request, res: Response) => {
  try {
    const { variables } = req.body;

    if (!variables) {
      return res.status(400).json({ error: 'Variables object required' });
    }

    const content = await templateManager.substituteVariables(req.params.id, variables);

    res.json({
      status: 'success',
      templateId: req.params.id,
      content,
      variables,
    });
  } catch (error) {
    logger.error({ err: error }, `Error substituting variables`);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Substitution failed',
    });
  }
});

/**
 * POST /templates/:id/customize
 * AI-powered template customization
 * Requires authentication
 */
router.post('/:id/customize', verifyToken, async (req: Request, res: Response) => {
  try {
    const request: TemplateCustomizationRequest = {
      templateId: req.params.id,
      variables: req.body.variables || {},
      context: req.body.context,
      customizationLevel: req.body.customizationLevel || 'moderate',
      tribunal: req.body.tribunal,
    };

    const customizedContent = await templateManager.customizeTemplate(request);

    res.json({
      status: 'success',
      templateId: req.params.id,
      customizationLevel: request.customizationLevel,
      content: customizedContent,
    });
  } catch (error) {
    logger.error({ err: error }, `Error customizing template`);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Customization failed',
    });
  }
});

/**
 * POST /templates/:id/validate
 * Validate template structure
 */
router.post('/:id/validate', async (req: Request, res: Response) => {
  try {
    const template = await templateManager.loadTemplate(req.params.id);
    const validation = await templateManager.validateTemplate(
      template.content,
      template.variables,
    );

    res.json({
      status: 'success',
      templateId: req.params.id,
      ...validation,
    });
  } catch (error) {
    logger.error({ err: error }, `Error validating template`);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Validation failed',
    });
  }
});

/**
 * GET /templates/suggestions
 * Get suggested templates for a case
 * Requires authentication
 */
router.get('/suggestions/recommended', verifyToken, async (req: Request, res: Response) => {
  try {
    const context = req.body.context || {};
    const userId = (req as any).user?.userId;

    const suggestions = await templateManager.suggestTemplates(context, userId);

    res.json({
      status: 'success',
      count: suggestions.length,
      suggestions,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error getting template suggestions');
    res.status(500).json({
      error: 'Failed to get suggestions',
    });
  }
});

/**
 * POST /templates/:id/feedback
 * Submit feedback/rating for a template usage
 * Requires authentication
 */
router.post('/:id/feedback', verifyToken, async (req: Request, res: Response) => {
  try {
    const { petitionId, success, rating, feedback } = req.body;
    const userId = (req as any).user?.userId;

    if (!petitionId) {
      return res.status(400).json({ error: 'Petition ID required' });
    }

    await templateManager.recordUsage(req.params.id, petitionId, userId, success, rating);

    res.json({
      status: 'success',
      message: 'Feedback recorded successfully',
    });
  } catch (error) {
    logger.error({ err: error }, 'Error recording template feedback');
    res.status(500).json({
      error: 'Failed to record feedback',
    });
  }
});

export const templateController = router;
