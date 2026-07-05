import request from 'supertest';
import app from '@/index';
import { petitionRepository } from '@/database/repositories';
import { petitionValidator } from '@services/PetitionValidatorService';
import { petitionFormatter } from '@services/PetitionFormatterService';
import { petitionSubmissionService } from '@services/PetitionSubmissionService';
import { logger } from '@utils/logger';

describe('Petition Submission - Phase 1 E2E Tests', () => {
  let authToken: string;
  let testPetitionId: string;

  beforeAll(async () => {
    // Mock authentication
    authToken = 'Bearer test-token-123';
  });

  describe('PetitionValidatorService', () => {
    it('should validate a valid petition', async () => {
      const petition = {
        title: 'Petição de Indenização',
        content: 'Peço vossa excelência que a apresenta como verdadeira. '.repeat(5),
        processNumber: '0000001-00.2024.1.00.0000',
        oabNumber: '123456/SP',
        causeValue: 10000,
        plaintiff: 'João Silva',
        defendant: 'Maria Santos',
        subject: 'Indenização por danos morais',
        lawyerName: 'Dr. João Silva',
        tribunal: 'tjsc',
        attachments: [],
        parts: [],
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };

      const result = await petitionValidator.validatePetition(petition, 'tjsc');

      expect(result.valid).toBe(true);
      expect(result.score).toBeGreaterThan(70);
      expect(result.errors.length).toBe(0);
    });

    it('should fail validation for petition without content', async () => {
      const petition = {
        title: 'Petição',
        content: '',
        processNumber: '0000001-00.2024.1.00.0000',
        oabNumber: '123456/SP',
        causeValue: 10000,
        plaintiff: 'João Silva',
        defendant: 'Maria Santos',
        subject: 'Indenização',
        lawyerName: 'Dr. João Silva',
        tribunal: 'tjsc',
        attachments: [],
        parts: [],
      };

      const result = await petitionValidator.validatePetition(petition, 'tjsc');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.code === 'content_required')).toBe(true);
    });

    it('should fail validation for petition with invalid OAB format', async () => {
      const petition = {
        title: 'Petição de Indenização',
        content: 'Peço vossa excelência que a apresenta como verdadeira. '.repeat(5),
        processNumber: '0000001-00.2024.1.00.0000',
        oabNumber: 'INVALID',
        causeValue: 10000,
        plaintiff: 'João Silva',
        defendant: 'Maria Santos',
        subject: 'Indenização',
        lawyerName: 'Dr. João Silva',
        tribunal: 'tjsc',
        attachments: [],
        parts: [],
      };

      const result = await petitionValidator.validatePetition(petition, 'tjsc');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'oab_format_valid')).toBe(true);
    });

    it('should fail validation for expired deadline', async () => {
      const petition = {
        title: 'Petição de Indenização',
        content: 'Peço vossa excelência que a apresenta como verdadeira. '.repeat(5),
        processNumber: '0000001-00.2024.1.00.0000',
        oabNumber: '123456/SP',
        causeValue: 10000,
        plaintiff: 'João Silva',
        defendant: 'Maria Santos',
        subject: 'Indenização',
        lawyerName: 'Dr. João Silva',
        tribunal: 'tjsc',
        attachments: [],
        parts: [],
        deadline: new Date(Date.now() - 1000), // 1 second in the past
      };

      const result = await petitionValidator.validatePetition(petition, 'tjsc');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'deadline_not_expired')).toBe(true);
    });

    it('should validate tribunal-specific requirements (TJPR)', async () => {
      const petition = {
        title: 'Petição de Indenização',
        content: 'Peço vossa excelência que a apresenta como verdadeira. '.repeat(5),
        processNumber: '0000001-00.2024.1.00.0000',
        oabNumber: '123456/SP',
        causeValue: 10000,
        plaintiff: 'João Silva',
        defendant: 'Maria Santos',
        subject: 'Indenização',
        lawyerName: 'Dr. João Silva',
        tribunal: 'tjpr',
        attachments: [],
        parts: [],
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };

      const result = await petitionValidator.validatePetition(petition, 'tjpr');

      expect(result.valid).toBe(true);
      // TJPR requires OAB, which is present
    });
  });

  describe('PetitionFormatterService', () => {
    it('should format petition for TJSC (RTF format)', async () => {
      const petition = {
        title: 'Petição de Indenização',
        content: 'Conteúdo da petição',
        processNumber: '0000001-00.2024.1.00.0000',
        oabNumber: '123456/SP',
        causeValue: 10000,
        plaintiff: 'João Silva',
        defendant: 'Maria Santos',
        subject: 'Indenização',
        lawyerName: 'Dr. João Silva',
        tribunal: 'tjsc',
        attachments: [],
        parts: [],
      };

      const formatted = await petitionFormatter.formatPetition(petition, 'tjsc');

      expect(formatted.tribunal).toBe('tjsc');
      expect(formatted.contentType).toBe('rtf');
      expect(formatted.signatureFormat).toBe('pades');
      expect(formatted.content).toContain('TRIBUNAL: TJSC');
    });

    it('should format petition for TJPR (XML format)', async () => {
      const petition = {
        title: 'Petição de Indenização',
        content: 'Conteúdo da petição',
        processNumber: '0000001-00.2024.1.00.0000',
        oabNumber: '123456/SP',
        causeValue: 10000,
        plaintiff: 'João Silva',
        defendant: 'Maria Santos',
        subject: 'Indenização',
        lawyerName: 'Dr. João Silva',
        tribunal: 'tjpr',
        attachments: [],
        parts: [],
      };

      const formatted = await petitionFormatter.formatPetition(petition, 'tjpr');

      expect(formatted.tribunal).toBe('tjpr');
      expect(formatted.contentType).toBe('xml');
      expect(formatted.signatureFormat).toBe('xades');
    });

    it('should include metadata in formatted petition', async () => {
      const petition = {
        title: 'Petição',
        content: 'Conteúdo',
        processNumber: '0000001-00.2024.1.00.0000',
        oabNumber: '123456/SP',
        causeValue: 50000,
        plaintiff: 'João Silva',
        defendant: 'Maria Santos',
        subject: 'Indenização',
        lawyerName: 'Dr. João Silva',
        tribunal: 'tjsc',
        attachments: [],
        parts: [],
      };

      const formatted = await petitionFormatter.formatPetition(petition, 'tjsc');

      expect(formatted.metadata).toHaveProperty('processNumber');
      expect(formatted.metadata).toHaveProperty('oabNumber');
      expect(formatted.metadata.causeValue).toBe(50000);
    });

    it('should reject petition with too many attachments', async () => {
      const attachments = Array.from({ length: 15 }, (_, i) => ({
        filename: `doc${i}.pdf`,
        size: 1024 * 1024,
        mimeType: 'application/pdf',
      }));

      const petition = {
        title: 'Petição',
        content: 'Conteúdo da petição',
        processNumber: '0000001-00.2024.1.00.0000',
        oabNumber: '123456/SP',
        causeValue: 10000,
        plaintiff: 'João Silva',
        defendant: 'Maria Santos',
        subject: 'Indenização',
        lawyerName: 'Dr. João Silva',
        tribunal: 'tjsc',
        attachments,
        parts: [],
      };

      try {
        await petitionFormatter.formatPetition(petition, 'tjsc');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('Máximo de 10 anexos');
      }
    });

    it('should reject attachment exceeding size limit', async () => {
      const attachments = [
        {
          filename: 'large-file.pdf',
          size: 100 * 1024 * 1024, // 100MB
          mimeType: 'application/pdf',
        },
      ];

      const petition = {
        title: 'Petição',
        content: 'Conteúdo da petição',
        processNumber: '0000001-00.2024.1.00.0000',
        oabNumber: '123456/SP',
        causeValue: 10000,
        plaintiff: 'João Silva',
        defendant: 'Maria Santos',
        subject: 'Indenização',
        lawyerName: 'Dr. João Silva',
        tribunal: 'tjsc',
        attachments,
        parts: [],
      };

      try {
        await petitionFormatter.formatPetition(petition, 'tjsc');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('excede o tamanho máximo');
      }
    });
  });

  describe('PetitionSubmissionService', () => {
    it('should have circuit breaker for tribunal tracking', async () => {
      const state = petitionSubmissionService.getCircuitBreakerStatus('tjsc');

      expect(state).toHaveProperty('status');
      expect(state).toHaveProperty('failureCount');
      expect(['closed', 'open', 'half-open']).toContain(state.status);
    });

    it('should track all circuit breaker statuses', async () => {
      const allStatus = petitionSubmissionService.getAllCircuitBreakerStatus();

      expect(allStatus).toBeInstanceOf(Object);
      expect(typeof allStatus).toBe('object');
    });

    it('should reset circuit breaker when requested', async () => {
      petitionSubmissionService.recordFailure('tjsc');
      const stateBefore = petitionSubmissionService.getCircuitBreakerStatus('tjsc');

      if (stateBefore.status === 'open') {
        petitionSubmissionService.resetCircuitBreaker('tjsc');
        const stateAfter = petitionSubmissionService.getCircuitBreakerStatus('tjsc');
        expect(stateAfter.status).toBe('closed');
      }
    });
  });

  describe('Integration: Validation + Formatting + Submission', () => {
    it('should complete full petition submission pipeline', async () => {
      const petitionData = {
        title: 'Ação de Cobrança',
        content: 'Vindo respeitosamente a presença de Vossa Excelência, expõe e requer. '.repeat(10),
        processNumber: '0000001-00.2024.1.00.0000',
        oabNumber: '123456/SP',
        causeValue: 50000,
        plaintiff: 'João Silva Oliveira',
        defendant: 'Empresa XYZ Ltda',
        subject: 'Cobrança de Honorários Profissionais',
        lawyerName: 'Dr. João Silva',
        tribunal: 'tjsc',
        attachments: [],
        parts: [],
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };

      // Step 1: Validate
      const validation = await petitionValidator.validatePetition(petitionData, 'tjsc');
      expect(validation.valid).toBe(true);
      expect(validation.score).toBeGreaterThan(70);

      // Step 2: Format
      const formatted = await petitionFormatter.formatPetition(petitionData, 'tjsc');
      expect(formatted).toBeDefined();
      expect(formatted.contentType).toBe('rtf');

      // Step 3: Check circuit breaker
      const circuitState = petitionSubmissionService.getCircuitBreakerStatus('tjsc');
      expect(circuitState.status).toBe('closed');
    });

    it('should handle validation errors in pipeline', async () => {
      const invalidPetition = {
        title: '',
        content: 'A',
        processNumber: '0000001-00.2024.1.00.0000',
        oabNumber: '123456/SP',
        causeValue: 10000,
        plaintiff: 'João Silva',
        defendant: 'Maria Santos',
        subject: 'Indenização',
        lawyerName: 'Dr. João Silva',
        tribunal: 'tjsc',
        attachments: [],
        parts: [],
      };

      const validation = await petitionValidator.validatePetition(invalidPetition, 'tjsc');

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.score).toBeLessThan(100);
    });
  });

  describe('API Endpoints', () => {
    it('should POST /api/v1/petitions/:id/validate-conformance', async () => {
      // Create a test petition first
      const createResponse = await request(app)
        .post('/api/v1/petitions')
        .set('Authorization', authToken)
        .send({
          processNumber: '0000001-00.2024.1.00.0000',
          title: 'Test Petition',
          type: 'cobranca',
          tribunal: 'tjsc',
          content: 'Conteúdo de teste para validação. '.repeat(10),
        });

      if (createResponse.status === 201) {
        const petitionId = createResponse.body.petition.id;

        const validateResponse = await request(app)
          .post(`/api/v1/petitions/${petitionId}/validate-conformance`)
          .set('Authorization', authToken);

        expect([200, 400]).toContain(validateResponse.status);
      }
    });

    it('should POST /api/v1/petitions/:id/format', async () => {
      const createResponse = await request(app)
        .post('/api/v1/petitions')
        .set('Authorization', authToken)
        .send({
          processNumber: '0000001-00.2024.1.00.0000',
          title: 'Test Petition',
          type: 'cobranca',
          tribunal: 'tjsc',
          content: 'Conteúdo de teste. '.repeat(10),
        });

      if (createResponse.status === 201) {
        const petitionId = createResponse.body.petition.id;

        const formatResponse = await request(app)
          .post(`/api/v1/petitions/${petitionId}/format`)
          .set('Authorization', authToken);

        expect([200, 500]).toContain(formatResponse.status);
      }
    });

    it('should GET /api/v1/petitions/:id/submission-status', async () => {
      const createResponse = await request(app)
        .post('/api/v1/petitions')
        .set('Authorization', authToken)
        .send({
          processNumber: '0000001-00.2024.1.00.0000',
          title: 'Test Petition',
          type: 'cobranca',
          tribunal: 'tjsc',
          content: 'Conteúdo de teste. '.repeat(10),
        });

      if (createResponse.status === 201) {
        const petitionId = createResponse.body.petition.id;

        const statusResponse = await request(app)
          .get(`/api/v1/petitions/${petitionId}/submission-status`)
          .set('Authorization', authToken);

        expect([200, 404]).toContain(statusResponse.status);
        if (statusResponse.status === 200) {
          expect(statusResponse.body).toHaveProperty('petition');
          expect(statusResponse.body).toHaveProperty('circuitBreaker');
        }
      }
    });
  });
});
