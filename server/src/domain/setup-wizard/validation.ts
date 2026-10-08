/**
 * Setup Wizard Validation
 * Validates setup configuration steps and credential integrity
 */

import { ValidationError, AIProvider, SetupField } from './types.js';
import { CredentialEncryptionService } from '../../services/credential-encryption.js';

export class SetupWizardValidation {
  constructor(private encryptionService: CredentialEncryptionService) {}

  /**
   * Validates AI provider credentials by testing API connectivity
   */
  async validateAIProvider(
    provider: AIProvider,
    apiKey: string,
    model: string
  ): Promise<{ isValid: boolean; error?: string; responseTimeMs?: number }> {
    const startTime = Date.now();

    try {
      switch (provider) {
        case 'anthropic':
          return await this.validateAnthropicCredentials(apiKey, model, startTime);
        case 'openai':
          return await this.validateOpenAICredentials(apiKey, model, startTime);
        case 'gemini':
          return await this.validateGeminiCredentials(apiKey, model, startTime);
        case 'local':
          return await this.validateLocalLLM(apiKey, model, startTime);
        default:
          return { isValid: false, error: 'Unknown AI provider' };
      }
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTimeMs: Date.now() - startTime,
      };
    }
  }

  private async validateAnthropicCredentials(
    apiKey: string,
    model: string,
    startTime: number
  ): Promise<{ isValid: boolean; error?: string; responseTimeMs?: number }> {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 10,
          messages: [
            {
              role: 'user',
              content: 'test',
            },
          ],
        }),
      });

      const responseTimeMs = Date.now() - startTime;

      if (response.status === 401) {
        return { isValid: false, error: 'Invalid API key', responseTimeMs };
      }

      if (response.status === 400) {
        const data = (await response.json()) as any;
        return {
          isValid: false,
          error: `Invalid model: ${data.error?.message || 'unknown'}`,
          responseTimeMs,
        };
      }

      if (response.ok) {
        return { isValid: true, responseTimeMs };
      }

      return { isValid: false, error: `API error: ${response.status}`, responseTimeMs };
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Connection failed',
        responseTimeMs,
      };
    }
  }

  private async validateOpenAICredentials(
    apiKey: string,
    model: string,
    startTime: number
  ): Promise<{ isValid: boolean; error?: string; responseTimeMs?: number }> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 10,
        }),
      });

      const responseTimeMs = Date.now() - startTime;

      if (response.status === 401) {
        return { isValid: false, error: 'Invalid API key', responseTimeMs };
      }

      if (response.status === 400) {
        const data = (await response.json()) as any;
        return {
          isValid: false,
          error: `Invalid model: ${data.error?.message || 'unknown'}`,
          responseTimeMs,
        };
      }

      if (response.ok) {
        return { isValid: true, responseTimeMs };
      }

      return { isValid: false, error: `API error: ${response.status}`, responseTimeMs };
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Connection failed',
        responseTimeMs,
      };
    }
  }

  private async validateGeminiCredentials(
    apiKey: string,
    model: string,
    startTime: number
  ): Promise<{ isValid: boolean; error?: string; responseTimeMs?: number }> {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: 'test' }],
              },
            ],
          }),
        }
      );

      const responseTimeMs = Date.now() - startTime;

      if (response.status === 400) {
        const data = (await response.json()) as any;
        if (data.error?.code === 'INVALID_ARGUMENT' && data.error?.message?.includes('API key')) {
          return { isValid: false, error: 'Invalid API key', responseTimeMs };
        }
        return {
          isValid: false,
          error: `Invalid model: ${data.error?.message || 'unknown'}`,
          responseTimeMs,
        };
      }

      if (response.status === 403) {
        return { isValid: false, error: 'API key has no access to this model', responseTimeMs };
      }

      if (response.ok) {
        return { isValid: true, responseTimeMs };
      }

      return { isValid: false, error: `API error: ${response.status}`, responseTimeMs };
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Connection failed',
        responseTimeMs,
      };
    }
  }

  private async validateLocalLLM(
    endpoint: string,
    model: string,
    startTime: number
  ): Promise<{ isValid: boolean; error?: string; responseTimeMs?: number }> {
    try {
      const response = await fetch(`${endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 10,
        }),
      });

      const responseTimeMs = Date.now() - startTime;

      if (response.ok) {
        return { isValid: true, responseTimeMs };
      }

      return { isValid: false, error: `API error: ${response.status}`, responseTimeMs };
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Connection failed',
        responseTimeMs,
      };
    }
  }

  /**
   * Validates database connection settings
   */
  async validateDatabaseConnection(config: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    sslEnabled: boolean;
  }): Promise<{ isValid: boolean; error?: string }> {
    try {
      // For now, return success - actual validation depends on whether we're using
      // PostgreSQL or SQLite. This can be extended later.
      if (!config.host || !config.name) {
        return { isValid: false, error: 'Host and database name are required' };
      }
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Validation failed',
      };
    }
  }

  /**
   * Validates S3 credentials
   */
  async validateS3Credentials(config: {
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  }): Promise<{ isValid: boolean; error?: string }> {
    try {
      if (!config.bucket || !config.accessKeyId || !config.secretAccessKey) {
        return { isValid: false, error: 'All S3 credentials are required' };
      }

      // Basic format validation
      if (!config.bucket.match(/^[a-z0-9.-]+$/)) {
        return { isValid: false, error: 'Invalid bucket name format' };
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Validation failed',
      };
    }
  }

  /**
   * Validates form field values
   */
  validateField(field: SetupField, value: any): string | null {
    if (field.required && (value === null || value === undefined || value === '')) {
      return `${field.label} is required`;
    }

    switch (field.type) {
      case 'email':
        if (value && !value.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
          return `${field.label} must be a valid email`;
        }
        break;

      case 'password':
        if (value && value.length < 8) {
          return `${field.label} must be at least 8 characters`;
        }
        break;

      case 'number':
        if (value && isNaN(Number(value))) {
          return `${field.label} must be a number`;
        }
        break;

      case 'text':
        if (value && typeof value !== 'string') {
          return `${field.label} must be text`;
        }
        break;
    }

    if (field.validation) {
      return field.validation(value);
    }

    return null;
  }

  /**
   * Validates all fields in a step
   */
  validateStep(fields: SetupField[], values: Record<string, any>): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const field of fields) {
      const error = this.validateField(field, values[field.name]);
      if (error) {
        errors.push({
          field: field.name,
          message: error,
        });
      }
    }

    return errors;
  }
}
