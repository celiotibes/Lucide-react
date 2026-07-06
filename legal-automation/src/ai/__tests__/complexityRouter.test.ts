import { ComplexityRouter } from '../llmPool';

describe('ComplexityRouter', () => {
  let router: ComplexityRouter;

  beforeEach(() => {
    router = new ComplexityRouter();
  });

  describe('determineModel - CLASSIFY tasks', () => {
    it('should route classification tasks to appropriate provider', () => {
      const prompt = 'Classificar documento por tipo';
      const model = router.determineModel({ taskType: 'classify' }, prompt);

      expect(model).toBeDefined();
      expect(['ollama', 'claude', 'gemini']).toContain(model);
    });

    it('should route to claude for complex classification', () => {
      const prompt =
        'Classificar e analisar precedentes jurisprudenciais para jurisprudência com análise de nuances legais';
      const model = router.determineModel({ taskType: 'classify' }, prompt);

      expect(model).toBe('claude');
    });
  });

  describe('determineModel - ANALYZE tasks', () => {
    it('should route analysis tasks', () => {
      const prompt = 'Analisar movimentação';
      const model = router.determineModel({ taskType: 'analyze' }, prompt);

      expect(model).toBeDefined();
      expect(['claude', 'ollama', 'gemini']).toContain(model);
    });

    it('should always route ANALYZE to claude', () => {
      const prompt = 'Qualquer análise';
      const model = router.determineModel({ taskType: 'analyze' }, prompt);

      expect(model).toBe('claude');
    });
  });

  describe('determineModel - EXTRACT tasks', () => {
    it('should always route extract to claude', () => {
      const prompt = 'Extrair dados';
      const model = router.determineModel({ taskType: 'extract' }, prompt);

      expect(model).toBe('claude');
    });
  });

  describe('determineModel - GENERATE tasks', () => {
    it('should always route generate to claude', () => {
      const prompt = 'Gerar petição';
      const model = router.determineModel({ taskType: 'generate' }, prompt);

      expect(model).toBe('claude');
    });
  });

  describe('Default behavior', () => {
    it('should return a valid provider for any prompt', () => {
      const testPrompts = [
        'simple text',
        'análise jurídica profunda de jurisprudência e precedentes',
        'x'.repeat(1000),
        '',
      ];

      for (const prompt of testPrompts) {
        const model = router.determineModel({ taskType: 'analyze' }, prompt);
        expect(['claude', 'gemini', 'ollama']).toContain(model);
      }
    });
  });
});
