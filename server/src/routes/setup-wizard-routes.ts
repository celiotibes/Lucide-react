/**
 * Setup Wizard Routes
 * API endpoints for setup wizard configuration
 */

import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { logger } from '../services/logger-service.js';
import { SetupWizardService } from '../domain/setup-wizard/setup-wizard-service.js';
import { SetupWizardValidation } from '../domain/setup-wizard/validation.js';
import { getStepById, getNextStep, getPreviousStep, getTotalSteps } from '../domain/setup-wizard/setup-steps.js';
import { getEncryptionService } from '../services/credential-encryption.js';

export interface SetupWizardRouteConfig {
  db: Database.Database;
}

export function criarRotasSetupWizard(config: SetupWizardRouteConfig): Router {
  const router = Router();
  const { db } = config;

  const getSetupService = (): SetupWizardService => {
    return new SetupWizardService(db);
  };

  const getValidationService = (): SetupWizardValidation => {
    const encryption = getEncryptionService();
    return new SetupWizardValidation(encryption);
  };

  /**
   * GET /setup-wizard/status
   * Check setup status for a platform
   */
  router.get('/status/:platform', (req: Request, res: Response) => {
    try {
      const { platform } = req.params;
      const service = getSetupService();

      const isComplete = service.isSetupComplete(platform);
      const config = service.getConfigurationByPlatform(platform);

      res.json({
        platform,
        setupComplete: isComplete,
        configId: config?.id || null,
        completedAt: config?.completedAt || null,
      });
    } catch (error) {
      logger.error('[SetupWizard] Status check failed:', error);
      res.status(500).json({ error: 'Failed to check setup status' });
    }
  });

  /**
   * POST /setup-wizard/initialize
   * Initialize setup for a new platform
   */
  router.post('/initialize', (req: Request, res: Response) => {
    try {
      const { platform } = req.body;

      if (!platform) {
        return res.status(400).json({ error: 'Platform is required' });
      }

      const service = getSetupService();

      // Check if setup already exists
      const existing = service.getConfigurationByPlatform(platform);
      if (existing) {
        return res.json({
          configId: existing.id,
          message: 'Setup already initialized',
        });
      }

      const config = service.createConfiguration(platform);

      res.json({
        configId: config.id,
        platform: config.platformSpecific.platform,
        totalSteps: getTotalSteps(),
        message: 'Setup initialized successfully',
      });
    } catch (error) {
      logger.error('[SetupWizard] Initialize failed:', error);
      res.status(500).json({ error: 'Failed to initialize setup' });
    }
  });

  /**
   * GET /setup-wizard/step/:stepId
   * Get setup step configuration
   */
  router.get('/step/:stepId', (req: Request, res: Response) => {
    try {
      const { stepId } = req.params;
      const step = getStepById(stepId);

      if (!step) {
        return res.status(404).json({ error: 'Step not found' });
      }

      const nextStep = getNextStep(stepId);
      const prevStep = getPreviousStep(stepId);

      res.json({
        step: {
          id: step.id,
          title: step.title,
          description: step.description,
          order: step.order,
          fields: step.fields,
        },
        navigation: {
          next: nextStep?.id || null,
          previous: prevStep?.id || null,
          totalSteps: getTotalSteps(),
        },
      });
    } catch (error) {
      logger.error('[SetupWizard] Get step failed:', error);
      res.status(500).json({ error: 'Failed to get step' });
    }
  });

  /**
   * POST /setup-wizard/:configId/step/:stepId
   * Submit setup step with validation
   */
  router.post('/:configId/step/:stepId', async (req: Request, res: Response) => {
    try {
      const { configId, stepId } = req.params;
      const data = req.body;

      const step = getStepById(stepId);
      if (!step) {
        return res.status(404).json({ error: 'Step not found' });
      }

      const validation = getValidationService();
      const errors = validation.validateStep(step.fields, data);

      if (errors.length > 0) {
        return res.status(400).json({
          valid: false,
          errors,
        });
      }

      // Perform additional validation for AI providers
      if (stepId === 'ai-provider' && data.ai_provider) {
        const provider = data.ai_provider;
        let apiKey: string | undefined;
        let model: string | undefined;

        if (provider === 'anthropic') {
          apiKey = data.anthropic_api_key;
          model = data.anthropic_model;
        } else if (provider === 'openai') {
          apiKey = data.openai_api_key;
          model = data.openai_model;
        } else if (provider === 'gemini') {
          apiKey = data.gemini_api_key;
          model = data.gemini_model;
        } else if (provider === 'local') {
          apiKey = data.local_llm_endpoint;
          model = data.local_llm_model;
        }

        if (apiKey && model) {
          const validationResult = await validation.validateAIProvider(provider, apiKey, model);
          if (!validationResult.isValid) {
            return res.status(400).json({
              valid: false,
              errors: [
                {
                  field: `${provider}_api_key`,
                  message: validationResult.error || 'Invalid credentials',
                },
              ],
            });
          }
        }
      }

      // Validate backup destinations if applicable
      if (stepId === 'backup-destinations' && data.backup_s3) {
        const s3Validation = await validation.validateS3Credentials({
          bucket: data.s3_bucket,
          region: data.s3_region,
          accessKeyId: data.s3_access_key,
          secretAccessKey: data.s3_secret_key,
        });

        if (!s3Validation.isValid) {
          return res.status(400).json({
            valid: false,
            errors: [
              {
                field: 's3_bucket',
                message: s3Validation.error || 'Invalid S3 credentials',
              },
            ],
          });
        }
      }

      const service = getSetupService();
      const updateResult = service.updateStep(configId, stepId, data);

      if (!updateResult.success) {
        return res.status(500).json({
          valid: false,
          error: updateResult.error,
        });
      }

      const nextStep = getNextStep(stepId);

      res.json({
        valid: true,
        message: 'Step completed successfully',
        nextStep: nextStep?.id || null,
        configId,
      });
    } catch (error) {
      logger.error('[SetupWizard] Step submission failed:', error);
      res.status(500).json({ error: 'Failed to submit step' });
    }
  });

  /**
   * POST /setup-wizard/:configId/complete
   * Complete the setup wizard
   */
  router.post('/:configId/complete', (req: Request, res: Response) => {
    try {
      const { configId } = req.params;

      const service = getSetupService();
      const result = service.completeSetup(configId);

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      res.json({
        message: 'Setup completed successfully',
        configId,
      });
    } catch (error) {
      logger.error('[SetupWizard] Complete setup failed:', error);
      res.status(500).json({ error: 'Failed to complete setup' });
    }
  });

  /**
   * GET /setup-wizard/:configId/config
   * Get complete configuration (for review step)
   */
  router.get('/:configId/config', (req: Request, res: Response) => {
    try {
      const { configId } = req.params;
      const service = getSetupService();

      const config = service.getConfiguration(configId);
      if (!config) {
        return res.status(404).json({ error: 'Configuration not found' });
      }

      // Don't return decrypted credentials in the response
      const safeConfig = {
        ...config,
        aiProvider: {
          ...config.aiProvider,
          anthropic: config.aiProvider.anthropic
            ? { ...config.aiProvider.anthropic, apiKey: '***' }
            : undefined,
          openai: config.aiProvider.openai
            ? { ...config.aiProvider.openai, apiKey: '***' }
            : undefined,
          gemini: config.aiProvider.gemini
            ? { ...config.aiProvider.gemini, apiKey: '***' }
            : undefined,
        },
        database: {
          ...config.database,
          password: '***',
        },
      };

      res.json(safeConfig);
    } catch (error) {
      logger.error('[SetupWizard] Get config failed:', error);
      res.status(500).json({ error: 'Failed to get configuration' });
    }
  });

  /**
   * GET /setup-wizard/:configId/audit
   * Get audit log for configuration
   */
  router.get('/:configId/audit', (req: Request, res: Response) => {
    try {
      const { configId } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);

      const service = getSetupService();
      const auditLog = service.getAuditLog(configId, limit);

      res.json({
        configId,
        auditLog,
        count: auditLog.length,
      });
    } catch (error) {
      logger.error('[SetupWizard] Get audit failed:', error);
      res.status(500).json({ error: 'Failed to get audit log' });
    }
  });

  return router;
}
