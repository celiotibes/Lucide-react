import request from 'supertest';
import app from '@/index';
import { setupTestDatabase, cleanupTestDatabase, resetTestDatabase } from '../setup/testDatabase';
import { createTestUser, createAuthHeader } from '../setup/testHelpers';

describe('AI Services E2E Tests', () => {
  let testUser: any;

  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    testUser = await createTestUser();
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  describe('POST /api/v1/ai/generate-petition', () => {
    it('should generate petition content with AI', async () => {
      const response = await request(app)
        .post('/api/v1/ai/generate-petition')
        .set(createAuthHeader(testUser.token))
        .send({
          type: 'initial_petition',
          context: 'Ação de indenização por dano moral',
          parties: 'João Silva vs Empresa XYZ',
          facts: 'Descrição dos fatos do caso',
          arguments: ['Dano moral comprovado', 'Conduta ilícita'],
        })
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.content).toBeDefined();
      expect(typeof response.body.content).toBe('string');
      expect(response.body.content.length).toBeGreaterThan(100);
    });

    it('should include provider information', async () => {
      const response = await request(app)
        .post('/api/v1/ai/generate-petition')
        .set(createAuthHeader(testUser.token))
        .send({
          type: 'initial_petition',
          context: 'Teste',
          parties: 'Partes',
          facts: 'Fatos',
        })
        .expect(200);

      expect(response.body.provider).toBeDefined();
      expect(['gemini', 'grok', 'ollama', 'offline']).toContain(response.body.provider);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/ai/generate-petition')
        .set(createAuthHeader(testUser.token))
        .send({
          type: 'initial_petition',
          context: 'Test',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 401 without token', async () => {
      await request(app)
        .post('/api/v1/ai/generate-petition')
        .send({
          type: 'initial_petition',
          context: 'Test',
          parties: 'Test',
          facts: 'Test',
        })
        .expect(401);
    });
  });

  describe('POST /api/v1/ai/validate-petition', () => {
    it('should validate petition content', async () => {
      const response = await request(app)
        .post('/api/v1/ai/validate-petition')
        .set(createAuthHeader(testUser.token))
        .send({
          content: 'Excelentíssimo Senhor Juiz de Direito da Vara Cível. João Silva, pessoa física, devidamente qualificada, vem por este medio interpor AÇÃO DE INDENIZAÇÃO em face de Empresa XYZ LTDA., razão pela qual expõe os seguintes fatos...',
        })
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.validation).toBeDefined();
      expect(response.body.validation.score).toBeDefined();
      expect(response.body.validation.score).toBeGreaterThanOrEqual(0);
      expect(response.body.validation.score).toBeLessThanOrEqual(100);
    });

    it('should return issues found', async () => {
      const response = await request(app)
        .post('/api/v1/ai/validate-petition')
        .set(createAuthHeader(testUser.token))
        .send({
          content: 'Conteúdo muito curto',
        })
        .expect(200);

      expect(Array.isArray(response.body.validation.issues)).toBe(true);
    });

    it('should return warnings if any', async () => {
      const response = await request(app)
        .post('/api/v1/ai/validate-petition')
        .set(createAuthHeader(testUser.token))
        .send({
          content: 'Teste de validação',
        })
        .expect(200);

      expect(response.body.validation.warnings).toBeDefined();
      expect(Array.isArray(response.body.validation.warnings)).toBe(true);
    });

    it('should return 400 without content', async () => {
      const response = await request(app)
        .post('/api/v1/ai/validate-petition')
        .set(createAuthHeader(testUser.token))
        .send({})
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/v1/ai/analyze-movements', () => {
    it('should analyze process movements', async () => {
      const response = await request(app)
        .post('/api/v1/ai/analyze-movements')
        .set(createAuthHeader(testUser.token))
        .send({
          movements: [
            'Distribuição da ação',
            'Citação do réu',
            'Apresentação de resposta',
            'Audiência de conciliação',
          ],
        })
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.analysis).toBeDefined();
      expect(response.body.analysis.risk).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(response.body.analysis.risk);
    });

    it('should provide recommendations', async () => {
      const response = await request(app)
        .post('/api/v1/ai/analyze-movements')
        .set(createAuthHeader(testUser.token))
        .send({
          movements: ['Teste 1', 'Teste 2'],
        })
        .expect(200);

      expect(Array.isArray(response.body.analysis.recommendations)).toBe(true);
    });

    it('should include summary', async () => {
      const response = await request(app)
        .post('/api/v1/ai/analyze-movements')
        .set(createAuthHeader(testUser.token))
        .send({
          movements: ['Movimento 1', 'Movimento 2'],
        })
        .expect(200);

      expect(response.body.analysis.summary).toBeDefined();
      expect(typeof response.body.analysis.summary).toBe('string');
    });

    it('should return 400 without movements', async () => {
      const response = await request(app)
        .post('/api/v1/ai/analyze-movements')
        .set(createAuthHeader(testUser.token))
        .send({})
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/v1/ai/extract-document', () => {
    it('should extract data from document', async () => {
      const response = await request(app)
        .post('/api/v1/ai/extract-document')
        .set(createAuthHeader(testUser.token))
        .send({
          content: `
            Processo nº: 0000001-12.2023.8.26.0100
            Autor: João Silva
            Réu: Empresa XYZ LTDA
            Juiz: Desembargador ABC
            Data: 2024-01-15
          `,
        })
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.extracted).toBeDefined();
    });

    it('should extract key entities', async () => {
      const response = await request(app)
        .post('/api/v1/ai/extract-document')
        .set(createAuthHeader(testUser.token))
        .send({
          content: 'Processo nº: 0000001-12.2023.8.26.0100, Autor: João Silva',
        })
        .expect(200);

      expect(response.body.extracted.processNumber).toBeDefined();
      expect(response.body.extracted.author).toBeDefined();
    });

    it('should return 400 without content', async () => {
      const response = await request(app)
        .post('/api/v1/ai/extract-document')
        .set(createAuthHeader(testUser.token))
        .send({})
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/v1/ai/suggest-arguments', () => {
    it('should suggest arguments for case type', async () => {
      const response = await request(app)
        .post('/api/v1/ai/suggest-arguments')
        .set(createAuthHeader(testUser.token))
        .send({
          caseType: 'dano_moral',
          context: 'Recusa de atendimento ao cliente',
        })
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(Array.isArray(response.body.arguments)).toBe(true);
      expect(response.body.arguments.length).toBeGreaterThan(0);
    });

    it('should provide argument descriptions', async () => {
      const response = await request(app)
        .post('/api/v1/ai/suggest-arguments')
        .set(createAuthHeader(testUser.token))
        .send({
          caseType: 'contrato',
          context: 'Descumprimento de contrato',
        })
        .expect(200);

      if (response.body.arguments.length > 0) {
        expect(response.body.arguments[0].title).toBeDefined();
        expect(response.body.arguments[0].description).toBeDefined();
      }
    });

    it('should return 400 without case type', async () => {
      const response = await request(app)
        .post('/api/v1/ai/suggest-arguments')
        .set(createAuthHeader(testUser.token))
        .send({})
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/v1/ai/status', () => {
    it('should return AI service status', async () => {
      const response = await request(app)
        .get('/api/v1/ai/status')
        .set(createAuthHeader(testUser.token))
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.aiStatus).toBeDefined();
    });

    it('should show available providers', async () => {
      const response = await request(app)
        .get('/api/v1/ai/status')
        .set(createAuthHeader(testUser.token))
        .expect(200);

      expect(response.body.aiStatus.providers).toBeDefined();
      expect(Array.isArray(response.body.aiStatus.providers)).toBe(true);
    });

    it('should show primary and fallback providers', async () => {
      const response = await request(app)
        .get('/api/v1/ai/status')
        .set(createAuthHeader(testUser.token))
        .expect(200);

      expect(response.body.aiStatus.primaryProvider).toBeDefined();
      expect(response.body.aiStatus.fallbackProviders).toBeDefined();
    });

    it('should return 401 without token', async () => {
      await request(app)
        .get('/api/v1/ai/status')
        .expect(401);
    });
  });
});
