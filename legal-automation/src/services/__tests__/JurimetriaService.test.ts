import { jurimetriaService } from '@services/JurimetriaService';
import { crmService } from '@services/CRMService';

describe('JurimetriaService', () => {
  beforeEach(() => {
    jurimetriaService.reset();
    crmService.reset();
  });

  describe('registerCaseMetrics', () => {
    test('should register case metrics for valid client', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente Teste',
        email: 'cliente@example.com',
      });

      const caseMetrics = await jurimetriaService.registerCaseMetrics(
        client.id,
        'trabalhista',
        'TJ-SP',
        'Juiz Silva',
        'Dr. João Advogado',
        'moderate',
        5000,
        15000,
      );

      expect(caseMetrics.caseType).toBe('trabalhista');
      expect(caseMetrics.court).toBe('TJ-SP');
      expect(caseMetrics.costs).toBe(5000);
      expect(caseMetrics.revenue).toBe(15000);
      expect(caseMetrics.profitability).toBe(10000);
      expect(caseMetrics.outcome).toBe('pending');
    });

    test('should throw error for non-existent client', async () => {
      await expect(
        jurimetriaService.registerCaseMetrics(
          'non-existent',
          'trabalhista',
          'TJ-SP',
          'Judge',
          'Lawyer',
          'simple',
          1000,
          5000,
        ),
      ).rejects.toThrow();
    });

    test('should handle multiple cases', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      for (let i = 0; i < 3; i++) {
        await jurimetriaService.registerCaseMetrics(
          client.id,
          'civil',
          `TJ-${i}`,
          `Judge-${i}`,
          'Lawyer',
          'simple',
          1000 * (i + 1),
          5000 * (i + 1),
        );
      }

      const stats = jurimetriaService.getStatistics();

      expect(stats.totalCases).toBe(3);
    });
  });

  describe('updateCaseOutcome', () => {
    test('should update case outcome', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const caseMetrics = await jurimetriaService.registerCaseMetrics(
        client.id,
        'civil',
        'TJ-SP',
        'Judge',
        'Lawyer',
        'simple',
        5000,
        15000,
      );

      const updated = await jurimetriaService.updateCaseOutcome(
        caseMetrics.caseId,
        'favorable',
        'Sentença favorável ao cliente',
      );

      expect(updated.outcome).toBe('favorable');
      expect(updated.result).toBe('Sentença favorável ao cliente');
      expect(updated.dateClosed).toBeDefined();
      expect(updated.duration).toBeGreaterThanOrEqual(0);
    });

    test('should handle all outcome types', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const outcomes = [
        'favorable',
        'unfavorable',
        'partial',
        'dismissed',
        'settled',
      ] as const;

      for (const outcome of outcomes) {
        const caseMetrics = await jurimetriaService.registerCaseMetrics(
          client.id,
          'civil',
          'TJ-SP',
          'Judge',
          'Lawyer',
          'simple',
          1000,
          5000,
        );

        const updated = await jurimetriaService.updateCaseOutcome(
          caseMetrics.caseId,
          outcome,
        );

        expect(updated.outcome).toBe(outcome);
      }
    });

    test('should calculate duration', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const caseMetrics = await jurimetriaService.registerCaseMetrics(
        client.id,
        'civil',
        'TJ-SP',
        'Judge',
        'Lawyer',
        'simple',
        1000,
        5000,
      );

      const updated = await jurimetriaService.updateCaseOutcome(
        caseMetrics.caseId,
        'favorable',
      );

      expect(updated.duration).toBeDefined();
      expect(updated.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getCaseTypeAnalysis', () => {
    test('should calculate case type analysis', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      // Create and close favorable cases
      for (let i = 0; i < 3; i++) {
        const caseMetrics = await jurimetriaService.registerCaseMetrics(
          client.id,
          'trabalhista',
          'TJ-SP',
          'Judge',
          'Lawyer',
          'moderate',
          5000,
          15000,
        );

        await jurimetriaService.updateCaseOutcome(
          caseMetrics.caseId,
          'favorable',
        );
      }

      // Create unfavorable case
      const unfavorableCase = await jurimetriaService.registerCaseMetrics(
        client.id,
        'trabalhista',
        'TJ-SP',
        'Judge',
        'Lawyer',
        'moderate',
        5000,
        15000,
      );

      await jurimetriaService.updateCaseOutcome(
        unfavorableCase.caseId,
        'unfavorable',
      );

      const analysis = await jurimetriaService.getCaseTypeAnalysis('trabalhista');

      expect(analysis).not.toBeNull();
      expect(analysis?.totalCases).toBe(4);
      expect(analysis?.successCount).toBe(3);
      expect(analysis?.unfavorableCount).toBe(1);
      expect(analysis?.successRate).toBeLessThanOrEqual(100);
      expect(analysis?.successRate).toBeGreaterThanOrEqual(0);
    });

    test('should return null for non-existent case type', async () => {
      const analysis = await jurimetriaService.getCaseTypeAnalysis('non-existent');

      expect(analysis).toBeNull();
    });
  });

  describe('getCourtAnalysis', () => {
    test('should calculate court analysis', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      // Create cases in same court
      for (let i = 0; i < 2; i++) {
        const caseMetrics = await jurimetriaService.registerCaseMetrics(
          client.id,
          'civil',
          'TJ-MG',
          'Judge Silva',
          'Lawyer',
          'simple',
          3000,
          10000,
        );

        await jurimetriaService.updateCaseOutcome(caseMetrics.caseId, 'favorable');
      }

      const analysis = await jurimetriaService.getCourtAnalysis('TJ-MG');

      expect(analysis).not.toBeNull();
      expect(analysis?.court).toBe('TJ-MG');
      expect(analysis?.totalCases).toBe(2);
      expect(analysis?.judgesInvolved).toContain('Judge Silva');
    });
  });

  describe('getLawyerPerformance', () => {
    test('should calculate lawyer performance', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      // Create cases for same lawyer
      const lawyerName = 'Dr. Carlos Advogado';
      for (let i = 0; i < 2; i++) {
        const caseMetrics = await jurimetriaService.registerCaseMetrics(
          client.id,
          'civil',
          'TJ-SP',
          'Judge',
          lawyerName,
          'simple',
          4000,
          12000,
        );

        await jurimetriaService.updateCaseOutcome(caseMetrics.caseId, 'favorable');
      }

      const performance = await jurimetriaService.getLawyerPerformance(lawyerName);

      expect(performance).not.toBeNull();
      expect(performance?.lawyerId).toBe(lawyerName);
      expect(performance?.totalCases).toBe(2);
      expect(performance?.successRate).toBeGreaterThan(0);
      expect(performance?.totalRevenue).toBe(24000);
      expect(performance?.totalCosts).toBe(8000);
    });
  });

  describe('predictCaseOutcome', () => {
    test('should predict case outcome', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      // Create training data
      for (let i = 0; i < 5; i++) {
        const caseMetrics = await jurimetriaService.registerCaseMetrics(
          client.id,
          'trabalhista',
          'TJ-SP',
          'Judge',
          'Lawyer',
          'moderate',
          5000,
          15000,
        );

        await jurimetriaService.updateCaseOutcome(
          caseMetrics.caseId,
          i < 3 ? 'favorable' : 'unfavorable',
        );
      }

      const prediction = await jurimetriaService.predictCaseOutcome(
        'trabalhista',
        'moderate',
        'TJ-SP',
      );

      expect(prediction.caseType).toBe('trabalhista');
      expect(prediction.complexity).toBe('moderate');
      expect(prediction.court).toBe('TJ-SP');
      expect(prediction.successProbability).toBeGreaterThanOrEqual(0);
      expect(prediction.successProbability).toBeLessThanOrEqual(1);
      expect(prediction.estimatedDuration).toBeGreaterThan(0);
      expect(prediction.estimatedCosts).toBeGreaterThan(0);
      expect(prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
    });

    test('should adjust predictions by complexity', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      // Create sample data
      const caseMetrics = await jurimetriaService.registerCaseMetrics(
        client.id,
        'civil',
        'TJ-SP',
        'Judge',
        'Lawyer',
        'simple',
        2000,
        8000,
      );

      await jurimetriaService.updateCaseOutcome(caseMetrics.caseId, 'favorable');

      const simplePrediction = await jurimetriaService.predictCaseOutcome(
        'civil',
        'simple',
        'TJ-SP',
      );

      const complexPrediction = await jurimetriaService.predictCaseOutcome(
        'civil',
        'complex',
        'TJ-SP',
      );

      // Complex cases should have lower success probability
      expect(simplePrediction.successProbability).toBeGreaterThanOrEqual(
        complexPrediction.successProbability,
      );
    });
  });

  describe('getTrendAnalysis', () => {
    test('should analyze trends', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      // Create cases
      for (let i = 0; i < 3; i++) {
        const caseMetrics = await jurimetriaService.registerCaseMetrics(
          client.id,
          'civil',
          'TJ-SP',
          'Judge',
          'Lawyer',
          'simple',
          2000,
          8000,
        );

        await jurimetriaService.updateCaseOutcome(
          caseMetrics.caseId,
          i === 0 ? 'unfavorable' : 'favorable',
        );
      }

      const trends = await jurimetriaService.getTrendAnalysis('success_rate');

      expect(Array.isArray(trends)).toBe(true);
      expect(trends.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getStatistics', () => {
    test('should calculate statistics', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      // Create cases
      const case1 = await jurimetriaService.registerCaseMetrics(
        client.id,
        'civil',
        'TJ-SP',
        'Judge',
        'Lawyer',
        'simple',
        5000,
        15000,
      );

      const case2 = await jurimetriaService.registerCaseMetrics(
        client.id,
        'civil',
        'TJ-SP',
        'Judge',
        'Lawyer',
        'moderate',
        3000,
        12000,
      );

      // Close one case favorably
      await jurimetriaService.updateCaseOutcome(case1.caseId, 'favorable');

      const stats = jurimetriaService.getStatistics();

      expect(stats.totalCases).toBe(2);
      expect(stats.successfulCases).toBe(1);
      expect(stats.successRate).toBeLessThanOrEqual(100);
      expect(stats.totalRevenue).toBe(27000);
      expect(stats.totalCosts).toBe(8000);
      expect(stats.netProfitability).toBe(19000);
      expect(stats.activeCases).toBe(1);
    });
  });

  describe('getAllCaseTypeAnalysis', () => {
    test('should return analysis for all case types', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const caseTypes = ['civil', 'trabalhista', 'familia'];

      for (const caseType of caseTypes) {
        const caseMetrics = await jurimetriaService.registerCaseMetrics(
          client.id,
          caseType,
          'TJ-SP',
          'Judge',
          'Lawyer',
          'simple',
          3000,
          10000,
        );

        await jurimetriaService.updateCaseOutcome(caseMetrics.caseId, 'favorable');
      }

      const analyses = await jurimetriaService.getAllCaseTypeAnalysis();

      expect(analyses.length).toBe(3);
      expect(analyses.map((a) => a.caseType)).toContain('civil');
      expect(analyses.map((a) => a.caseType)).toContain('trabalhista');
      expect(analyses.map((a) => a.caseType)).toContain('familia');
    });
  });

  describe('reset', () => {
    test('should clear all data', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      await jurimetriaService.registerCaseMetrics(
        client.id,
        'civil',
        'TJ-SP',
        'Judge',
        'Lawyer',
        'simple',
        1000,
        5000,
      );

      jurimetriaService.reset();

      const stats = jurimetriaService.getStatistics();

      expect(stats.totalCases).toBe(0);
      expect(stats.totalRevenue).toBe(0);
    });
  });

  describe('integration scenarios', () => {
    test('should handle complete case lifecycle', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'João Silva',
        email: 'joao@example.com',
      });

      // Register case
      const caseMetrics = await jurimetriaService.registerCaseMetrics(
        client.id,
        'trabalhista',
        'TJ-SP',
        'Juiz Carlos',
        'Dr. Roberto Advogado',
        'moderate',
        8000,
        25000,
      );

      expect(caseMetrics.outcome).toBe('pending');

      // Get predictions
      const prediction = await jurimetriaService.predictCaseOutcome(
        'trabalhista',
        'moderate',
        'TJ-SP',
      );

      expect(prediction.successProbability).toBeGreaterThanOrEqual(0);

      // Close case favorably
      const updated = await jurimetriaService.updateCaseOutcome(
        caseMetrics.caseId,
        'favorable',
        'Sentença a favor do autor',
      );

      expect(updated.outcome).toBe('favorable');
      expect(updated.duration).toBeGreaterThanOrEqual(0);

      // Get analysis
      const analysis = await jurimetriaService.getCaseTypeAnalysis('trabalhista');

      expect(analysis?.successCount).toBe(1);
      expect(analysis?.totalCases).toBe(1);
    });

    test('should track performance across multiple cases', async () => {
      const client = await crmService.createOrUpdateClient({
        name: 'Cliente',
        email: 'cliente@example.com',
      });

      const lawyer = 'Dr. Analytics Expert';

      // Register and close multiple cases
      for (let i = 0; i < 5; i++) {
        const caseMetrics = await jurimetriaService.registerCaseMetrics(
          client.id,
          i < 3 ? 'civil' : 'trabalhista',
          'TJ-SP',
          'Judge',
          lawyer,
          'simple',
          3000,
          10000,
        );

        await jurimetriaService.updateCaseOutcome(
          caseMetrics.caseId,
          i % 2 === 0 ? 'favorable' : 'unfavorable',
        );
      }

      // Get lawyer performance
      const performance = await jurimetriaService.getLawyerPerformance(lawyer);

      expect(performance?.totalCases).toBe(5);
      expect(performance?.successRate).toBeLessThanOrEqual(100);
      expect(performance?.profitabilityRate).toBeGreaterThanOrEqual(-100);
    });
  });
});
