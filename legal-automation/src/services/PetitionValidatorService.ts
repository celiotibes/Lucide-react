import { logger } from '@utils/logger';
import { Petition } from 'index';

export interface ValidationRule {
  name: string;
  check: (petition: Petition, tribunal: string) => boolean | Promise<boolean>;
  errorMessage: string;
  severity: 'error' | 'warning';
  field?: string;
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  tribunal?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  field?: string;
}

export interface ValidationDetail {
  check: string;
  status: 'passed' | 'failed' | 'warning';
  details?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  details: ValidationDetail[];
  score: number;
}

const TRIBUNAL_RULES: Record<string, Record<string, boolean>> = {
  tjsc: { requiresOab: true, requiresCauseValue: true },
  tjpr: { requiresOab: true, requiresCauseValue: true, requiresPriority: true },
  tjal: { requiresOab: false, requiresCauseValue: false },
  tjsp: { requiresOab: true, requiresCauseValue: true },
  tjrs: { requiresOab: true, requiresCauseValue: true },
  tjmg: { requiresOab: true, requiresCauseValue: true },
  trf4: { requiresOab: true, requiresCauseValue: true },
  jfpr: { requiresOab: true, requiresCauseValue: true },
  just: { requiresOab: false, requiresCauseValue: false },
  tjmt: { requiresOab: true, requiresCauseValue: true },
  tjro: { requiresOab: true, requiresCauseValue: true },
  jfsc: { requiresOab: true, requiresCauseValue: true },
};

export class PetitionValidatorService {
  private rules: ValidationRule[] = [];

  constructor() {
    this.initializeRules();
  }

  private initializeRules(): void {
    // Structural rules
    this.rules.push({
      name: 'title_required',
      check: (p) => !!p.title && p.title.trim().length > 0,
      errorMessage: 'Título da petição é obrigatório',
      severity: 'error',
      field: 'title',
    });

    this.rules.push({
      name: 'content_required',
      check: (p) => !!p.content && p.content.trim().length > 0,
      errorMessage: 'Conteúdo da petição é obrigatório',
      severity: 'error',
      field: 'content',
    });

    this.rules.push({
      name: 'content_minimum_length',
      check: (p) => p.content && p.content.length >= 100,
      errorMessage: 'Conteúdo mínimo de 100 caracteres exigido',
      severity: 'error',
      field: 'content',
    });

    this.rules.push({
      name: 'content_maximum_length',
      check: (p) => p.content && p.content.length <= 1000000,
      errorMessage: 'Conteúdo não pode exceder 1MB',
      severity: 'error',
      field: 'content',
    });

    // Process number validation
    this.rules.push({
      name: 'process_number_format',
      check: (p) => !p.processNumber || /^\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4}$/.test(p.processNumber),
      errorMessage: 'Formato de número de processo inválido (NNNNNNN-DD.AAAA.J.TT.OOOO)',
      severity: 'error',
      field: 'processNumber',
    });

    // Format rules
    this.rules.push({
      name: 'valid_characters',
      check: (p) => /^[\w\s\.,\-\(\)áéíóúàãõçÁÉÍÓÚÀÃÕÇ!?";:\/]*$/.test(p.content || ''),
      errorMessage: 'Conteúdo contém caracteres inválidos',
      severity: 'warning',
      field: 'content',
    });

    // Tribunal-specific rules
    this.rules.push({
      name: 'oab_number_required',
      check: (p, t) => {
        const rules = TRIBUNAL_RULES[t];
        if (!rules?.requiresOab) return true;
        return !!p.oabNumber && p.oabNumber.trim().length > 0;
      },
      errorMessage: 'OAB é obrigatória para este tribunal',
      severity: 'error',
      field: 'oabNumber',
    });

    this.rules.push({
      name: 'oab_format_valid',
      check: (p) => !p.oabNumber || /^\d{6,7}\/[A-Z]{2}$/.test(p.oabNumber),
      errorMessage: 'Formato de OAB inválido (NNNNNN/UF ou NNNNNNN/UF)',
      severity: 'error',
      field: 'oabNumber',
    });

    // Cause value validation
    this.rules.push({
      name: 'cause_value_required',
      check: (p, t) => {
        const rules = TRIBUNAL_RULES[t];
        if (!rules?.requiresCauseValue) return true;
        return p.causeValue === undefined || p.causeValue > 0;
      },
      errorMessage: 'Valor da causa é obrigatório para este tribunal',
      severity: 'error',
      field: 'causeValue',
    });

    this.rules.push({
      name: 'cause_value_positive',
      check: (p) => !p.causeValue || p.causeValue > 0,
      errorMessage: 'Valor da causa deve ser positivo',
      severity: 'error',
      field: 'causeValue',
    });

    // Deadline rules
    this.rules.push({
      name: 'deadline_not_expired',
      check: (p) => !p.deadline || p.deadline > new Date(),
      errorMessage: 'Prazo expirado para envio desta petição',
      severity: 'error',
      field: 'deadline',
    });

    this.rules.push({
      name: 'deadline_minimum_days',
      check: (p) => {
        if (!p.deadline) return true;
        const daysUntilDeadline = Math.ceil(
          (p.deadline.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
        );
        return daysUntilDeadline >= 1;
      },
      errorMessage: 'Prazo deve estar pelo menos 1 dia no futuro',
      severity: 'warning',
      field: 'deadline',
    });

    // Parties validation
    this.rules.push({
      name: 'parties_required',
      check: (p) => {
        if (p.plaintiff && p.defendant) return true;
        if (p.parts && p.parts.length >= 2) return true;
        return false;
      },
      errorMessage: 'Partes (autor e réu) são obrigatórias',
      severity: 'error',
      field: 'parties',
    });

    this.rules.push({
      name: 'plaintiff_name_required',
      check: (p) => !p.plaintiff || p.plaintiff.trim().length > 0,
      errorMessage: 'Nome do autor é obrigatório',
      severity: 'error',
      field: 'plaintiff',
    });

    this.rules.push({
      name: 'defendant_name_required',
      check: (p) => !p.defendant || p.defendant.trim().length > 0,
      errorMessage: 'Nome do réu é obrigatório',
      severity: 'error',
      field: 'defendant',
    });

    // Document/Attachment rules
    this.rules.push({
      name: 'attachments_valid_format',
      check: (p) => !p.attachments || p.attachments.every((a) => this.isValidFileFormat(a)),
      errorMessage: 'Alguns anexos têm formato inválido (permitidos: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG)',
      severity: 'error',
      field: 'attachments',
    });

    this.rules.push({
      name: 'attachments_size_individual',
      check: (p) => !p.attachments || p.attachments.every((a) => (a.size || 0) <= 50 * 1024 * 1024),
      errorMessage: 'Alguns anexos excedem o limite individual de 50MB',
      severity: 'error',
      field: 'attachments',
    });

    this.rules.push({
      name: 'attachments_size_total',
      check: (p) => {
        if (!p.attachments) return true;
        const totalSize = p.attachments.reduce((sum, a) => sum + (a.size || 0), 0);
        return totalSize <= 500 * 1024 * 1024; // 500MB total
      },
      errorMessage: 'Tamanho total dos anexos não pode exceder 500MB',
      severity: 'error',
      field: 'attachments',
    });

    // Subject validation
    this.rules.push({
      name: 'subject_required',
      check: (p) => !!p.subject && p.subject.trim().length > 0,
      errorMessage: 'Assunto da petição é obrigatório',
      severity: 'error',
      field: 'subject',
    });

    // Lawyer name validation
    this.rules.push({
      name: 'lawyer_name_required',
      check: (p) => !!p.lawyerName && p.lawyerName.trim().length > 0,
      errorMessage: 'Nome do advogado é obrigatório',
      severity: 'error',
      field: 'lawyerName',
    });
  }

  async validatePetition(petition: Petition, tribunal: string): Promise<ValidationResult> {
    logger.debug(`Validando petição para ${tribunal}`);

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const details: ValidationDetail[] = [];
    let passedCount = 0;

    for (const rule of this.rules) {
      try {
        const passed = await Promise.resolve(rule.check(petition, tribunal));

        details.push({
          check: rule.name,
          status: passed ? 'passed' : 'failed',
        });

        if (passed) {
          passedCount++;
        } else {
          if (rule.severity === 'error') {
            errors.push({
              code: rule.name,
              message: rule.errorMessage,
              field: rule.field,
              tribunal,
            });
          } else {
            warnings.push({
              code: rule.name,
              message: rule.errorMessage,
              field: rule.field,
            });
          }
        }
      } catch (error) {
        logger.warn(`Erro ao validar regra ${rule.name}: ${error}`);
        details.push({
          check: rule.name,
          status: 'failed',
          details: `Erro na validação: ${error instanceof Error ? error.message : 'Desconhecido'}`,
        });
      }
    }

    const score = Math.round((passedCount / this.rules.length) * 100);

    const result: ValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings,
      details,
      score,
    };

    logger.info(
      `Validação concluída - Válida: ${result.valid}, Erros: ${errors.length}, Score: ${score}%`,
    );

    return result;
  }

  private isValidFileFormat(attachment: any): boolean {
    const validFormats = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'gif'];
    const filename = attachment.filename || attachment.originalname || '';
    const ext = filename.split('.').pop()?.toLowerCase();
    return validFormats.includes(ext || '');
  }
}

export const petitionValidator = new PetitionValidatorService();
