import { Pool } from 'pg';
import { logger } from '@utils/logger';
import { config } from '@utils/config';
import { llmPool } from '@ai/llmPool';
import {
  Template,
  TemplateVariable,
  TemplateCustomizationRequest,
  TemplateFilter,
  TemplateValidationError,
  ValidationResult,
  TemplateSuggestion,
  CaseContext,
} from '@/types/template';

export class TemplateManager {
  private pool: Pool;
  private cache: Map<string, { content: any; timestamp: number }> = new Map();
  private cacheMaxAge = 86400000; // 1 day

  constructor() {
    this.pool = new Pool({
      connectionString: config.database_url,
    });
  }

  /**
   * Load template by ID with variable information
   */
  async loadTemplate(templateId: string, jurisdiction?: string): Promise<Template> {
    const cacheKey = `template:${templateId}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      logger.debug(`Template cache hit: ${templateId}`);
      return cached;
    }

    try {
      const result = await this.pool.query(
        `SELECT id, name, type, category, content, variables, jurisdiction,
                status, version, created_at, updated_at, created_by,
                is_template, usage_count, success_rate, ai_generated, tags
         FROM templates WHERE id = $1 AND status = 'active'`,
        [templateId],
      );

      if (result.rows.length === 0) {
        throw new Error(`Template not found: ${templateId}`);
      }

      const template = this.rowToTemplate(result.rows[0]);

      // Cache it
      this.setInCache(cacheKey, template, this.cacheMaxAge);

      return template;
    } catch (error) {
      logger.error({ err: error }, `Error loading template ${templateId}`);
      throw error;
    }
  }

  /**
   * List templates with filtering
   */
  async listTemplates(filter: TemplateFilter): Promise<Template[]> {
    try {
      let query = `
        SELECT id, name, type, category, content, variables, jurisdiction,
               status, version, created_at, updated_at, created_by,
               is_template, usage_count, success_rate, ai_generated, tags
        FROM templates
        WHERE status = 'active'
      `;

      const params: any[] = [];
      let paramIndex = 1;

      if (filter.type) {
        query += ` AND type = $${paramIndex++}`;
        params.push(filter.type);
      }

      if (filter.category) {
        query += ` AND category = $${paramIndex++}`;
        params.push(filter.category);
      }

      if (filter.jurisdiction) {
        query += ` AND $${paramIndex++} = ANY(jurisdiction)`;
        params.push(filter.jurisdiction);
      }

      if (filter.search) {
        query += ` AND (name ILIKE $${paramIndex} OR tags @> ARRAY[$${paramIndex}])`;
        params.push(`%${filter.search}%`);
        paramIndex += 2;
      }

      query += ' ORDER BY usage_count DESC';

      if (filter.limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(filter.limit);
      }

      if (filter.offset) {
        query += ` OFFSET $${paramIndex++}`;
        params.push(filter.offset);
      }

      const result = await this.pool.query(query, params);
      return result.rows.map(row => this.rowToTemplate(row));
    } catch (error) {
      logger.error({ err: error }, 'Error listing templates');
      throw error;
    }
  }

  /**
   * Substitute variables in template content
   */
  async substituteVariables(
    templateId: string,
    variables: Record<string, any>,
  ): Promise<string> {
    try {
      const template = await this.loadTemplate(templateId);

      // Validate all required variables are provided
      const missing = template.variables
        .filter(v => v.required && !variables[v.name])
        .map(v => v.name);

      if (missing.length > 0) {
        throw new Error(`Missing required variables: ${missing.join(', ')}`);
      }

      let content = template.content;

      // Substitute each variable
      for (const variable of template.variables) {
        const value = variables[variable.name] || variable.default || '';
        const placeholder = `{{${variable.name}}}`;
        content = content.replace(new RegExp(placeholder, 'g'), String(value));
      }

      // Remove any unreplaced placeholders (optional variables)
      content = content.replace(/\{\{[^}]+\}\}/g, '');

      logger.debug(`Variables substituted for template: ${templateId}`);
      return content;
    } catch (error) {
      logger.error({ err: error }, 'Error substituting variables');
      throw error;
    }
  }

  /**
   * AI-powered template customization
   */
  async customizeTemplate(
    request: TemplateCustomizationRequest,
  ): Promise<string> {
    try {
      // First, substitute known variables
      let content = await this.substituteVariables(
        request.templateId,
        request.variables,
      );

      // If minimal customization, return as-is
      if (request.customizationLevel === 'minimal') {
        return content;
      }

      // For moderate/high customization, use AI
      const template = await this.loadTemplate(request.templateId);
      const contextStr = request.context ? JSON.stringify(request.context, null, 2) : '';

      const prompt =
        request.customizationLevel === 'high'
          ? this.buildHighCustomizationPrompt(template, content, contextStr, request.tribunal)
          : this.buildModerateCustomizationPrompt(template, content, contextStr, request.tribunal);

      const response = await llmPool.call(prompt, {
        temperature: 0.5,
        maxTokens: 3000,
        cacheKey: `customize:${request.templateId}:${request.customizationLevel}`,
      });

      logger.info(`Template customized with AI: ${request.templateId}`);
      return response.content;
    } catch (error) {
      logger.error({ err: error }, 'Error customizing template');
      throw error;
    }
  }

  /**
   * Validate template structure and logic
   */
  async validateTemplate(content: string, variables: TemplateVariable[]): Promise<ValidationResult> {
    const errors: TemplateValidationError[] = [];

    // Check for unmatched placeholders
    const placeholders = content.match(/\{\{[^}]+\}\}/g) || [];
    const definedVars = new Set(variables.map(v => v.name));

    for (const placeholder of placeholders) {
      const varName = placeholder.slice(2, -2);
      if (!definedVars.has(varName)) {
        errors.push({
          field: varName,
          message: `Placeholder {{${varName}}} not defined in variables`,
          severity: 'warning',
        });
      }
    }

    // Check for required variables without defaults
    for (const variable of variables) {
      if (variable.required && !variable.default) {
        const pattern = new RegExp(`\\{\\{${variable.name}\\}\\}`, 'g');
        if (!pattern.test(content)) {
          errors.push({
            field: variable.name,
            message: `Required variable {{${variable.name}}} not used in template`,
            severity: 'warning',
          });
        }
      }
    }

    // Check for RTF/legal document structure
    if (!content.includes('Excelentíssimo') && !content.includes('Senhor')) {
      errors.push({
        field: 'content',
        message: 'Missing standard legal petition greeting',
        severity: 'warning',
      });
    }

    return {
      isValid: errors.filter(e => e.severity === 'error').length === 0,
      errors,
    };
  }

  /**
   * Suggest templates based on case context
   */
  async suggestTemplates(context: CaseContext, userId?: string): Promise<TemplateSuggestion[]> {
    try {
      const suggestions: TemplateSuggestion[] = [];

      // Get user preferences
      let userPreferences = null;
      if (userId) {
        const prefResult = await this.pool.query(
          'SELECT preferred_style, tribunal_code FROM template_preferences WHERE user_id = $1',
          [userId],
        );
        userPreferences = prefResult.rows[0];
      }

      // Build context-based recommendation prompt
      const prompt = this.buildRecommendationPrompt(context, userPreferences);

      const response = await llmPool.call(prompt, {
        temperature: 0.3,
        maxTokens: 500,
        cacheKey: `suggest:${context.processNumber || 'general'}`,
      });

      // Parse AI suggestion
      const suggestedTypes = this.parseAISuggestion(response.content);

      // Query matching templates
      for (const type of suggestedTypes) {
        const result = await this.pool.query(
          `SELECT id, name, type, success_rate
           FROM templates
           WHERE type = $1 AND status = 'active'
           ORDER BY usage_count DESC, success_rate DESC
           LIMIT 3`,
          [type],
        );

        for (const row of result.rows) {
          suggestions.push({
            templateId: row.id,
            templateName: row.name,
            matchScore: Math.round((row.success_rate || 0.7) * 100),
            reason: `Recommended for ${type} petitions`,
            jurisdiction: userPreferences?.tribunal_code,
          });
        }
      }

      logger.info(`Generated ${suggestions.length} template suggestions`);
      return suggestions.slice(0, 5); // Top 5
    } catch (error) {
      logger.error({ err: error }, 'Error suggesting templates');
      return [];
    }
  }

  /**
   * Record template usage for analytics
   */
  async recordUsage(
    templateId: string,
    petitionId: string,
    userId: string,
    success: boolean,
    rating?: number,
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO template_usage
         (template_id, petition_id, user_id, success, rating)
         VALUES ($1, $2, $3, $4, $5)`,
        [templateId, petitionId, userId, success, rating],
      );

      // Update template usage stats
      await this.pool.query(
        `UPDATE templates
         SET usage_count = usage_count + 1,
             success_rate = (
               SELECT COUNT(*) FILTER (WHERE success = true)::decimal / COUNT(*)
               FROM template_usage WHERE template_id = $1
             )
         WHERE id = $1`,
        [templateId],
      );

      logger.debug(`Usage recorded for template: ${templateId}`);
    } catch (error) {
      logger.error({ err: error }, 'Error recording template usage');
    }
  }

  /**
   * Create new template
   */
  async createTemplate(template: Partial<Template>): Promise<Template> {
    try {
      const result = await this.pool.query(
        `INSERT INTO templates
         (name, type, category, content, variables, jurisdiction, status, created_by, ai_generated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, name, type, category, content, variables, jurisdiction,
                   status, version, created_at, updated_at, created_by,
                   is_template, usage_count, success_rate, ai_generated, tags`,
        [
          template.name,
          template.type,
          template.category,
          template.content,
          JSON.stringify(template.variables || []),
          template.jurisdiction || [],
          template.status || 'draft',
          template.createdBy,
          template.aiGenerated || false,
        ],
      );

      return this.rowToTemplate(result.rows[0]);
    } catch (error) {
      logger.error({ err: error }, 'Error creating template');
      throw error;
    }
  }

  /**
   * Cache management
   */
  private getFromCache(key: string): any {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return cached.content;
    }
    this.cache.delete(key);
    return null;
  }

  private setInCache(key: string, content: any, maxAge: number): void {
    this.cache.set(key, { content, timestamp: Date.now() });
  }

  /**
   * Private helpers
   */
  private rowToTemplate(row: any): Template {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      category: row.category,
      content: row.content,
      variables: row.variables || [],
      jurisdiction: row.jurisdiction || [],
      status: row.status,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      isTemplate: row.is_template,
      usageCount: row.usage_count,
      successRate: row.success_rate,
      aiGenerated: row.ai_generated,
      tags: row.tags,
    };
  }

  private buildHighCustomizationPrompt(
    template: Template,
    content: string,
    context: string,
    tribunal?: string,
  ): string {
    return `Você é um advogado especialista em procedimentos judiciais brasileiros.
Reescreva completamente a petição abaixo, adaptando argumentos jurídicos específicos
para o caso e tribunal mencionados. Mantenha a estrutura formal mas customize os argumentos.

Petição Original:
${content}

Contexto do Caso:
${context}

Tribunal: ${tribunal || 'Genérico'}

Gere apenas o conteúdo revisado, sem explicações ou markdown.`;
  }

  private buildModerateCustomizationPrompt(
    template: Template,
    content: string,
    context: string,
    tribunal?: string,
  ): string {
    return `Você é um advogado revisor de petições jurídicas.
Revise a petição abaixo, melhorando argumentação jurídica onde necessário,
mas mantendo a estrutura e estilo original.

Petição:
${content}

Contexto:
${context}

Tribunal: ${tribunal || 'Genérico'}

Retorne apenas a petição revisada, sem comentários.`;
  }

  private buildRecommendationPrompt(
    context: CaseContext,
    userPreferences?: any,
  ): string {
    return `Baseado no contexto do caso, recomende os 3 tipos de petições mais apropriadas
de entre: initial, intermediate, final, motion, appeal

Contexto:
- Assunto: ${context.subject || 'Geral'}
- Histórico: ${context.caseHistory || 'Não informado'}
- Pretensões: ${context.reliefs?.join(', ') || 'Não especificadas'}

Estilo preferido: ${userPreferences?.preferred_style || 'formal'}

Responda apenas com os tipos em ordem de prioridade, separados por vírgula. Exemplo: initial, intermediate, appeal`;
  }

  private parseAISuggestion(response: string): string[] {
    const validTypes = ['initial', 'intermediate', 'final', 'motion', 'appeal'];
    return response
      .toLowerCase()
      .split(',')
      .map(t => t.trim())
      .filter(t => validTypes.includes(t));
  }
}

export const templateManager = new TemplateManager();
