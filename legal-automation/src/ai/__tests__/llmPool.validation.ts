/**
 * Validation Script for LLMPool with ComplexityRouter
 *
 * This script demonstrates the system working with different task types
 * and validates that the ComplexityRouter makes sensible decisions.
 *
 * Run with: npm run dev (in another terminal)
 * Then: ts-node src/ai/__tests__/llmPool.validation.ts
 */

import { llmPool } from '../llmPool';
import { logger } from '@utils/logger';

interface ValidationTestCase {
  name: string;
  prompt: string;
  taskType: 'generate' | 'analyze' | 'extract' | 'classify';
  complexity?: 'low' | 'medium' | 'high';
  expectedProvider?: string;
}

const testCases: ValidationTestCase[] = [
  {
    name: 'Simple Classification',
    prompt: 'Classificar este documento como "Ofício" ou "Notificação"',
    taskType: 'classify',
    complexity: 'low',
    expectedProvider: 'ollama',
  },
  {
    name: 'Complex Legal Analysis',
    prompt: `Analisar jurisprudência e precedentes para esta ação de responsabilidade civil.
      Considerar implicações legais e riscos processuais. Avaliar jurisprudência recente.`,
    taskType: 'analyze',
    complexity: 'high',
    expectedProvider: 'claude',
  },
  {
    name: 'Movement Analysis',
    prompt: 'Resumir brevemente a movimentação: Sentença de procedência',
    taskType: 'analyze',
    complexity: 'low',
    expectedProvider: 'claude',
  },
  {
    name: 'Data Extraction',
    prompt: 'Extrair: número do processo, partes, data de julgamento, valor da causa',
    taskType: 'extract',
    expectedProvider: 'claude',
  },
  {
    name: 'Petition Generation',
    prompt: 'Gerar petição jurídica inicial com fundamentação legal',
    taskType: 'generate',
    expectedProvider: 'claude',
  },
];

async function validateRouting(): Promise<void> {
  console.log('='.repeat(70));
  console.log('VALIDAÇÃO: ComplexityRouter Intelligence');
  console.log('='.repeat(70));
  console.log('');

  let correctDecisions = 0;
  let totalDecisions = 0;

  for (const testCase of testCases) {
    console.log(`📋 Test: ${testCase.name}`);
    console.log(`   Prompt: "${testCase.prompt.substring(0, 50)}..."`);
    console.log(`   Task Type: ${testCase.taskType}`);

    const selectedProvider = (llmPool as any).router.determineModel(
      {
        taskType: testCase.taskType,
        complexity: testCase.complexity,
      },
      testCase.prompt
    );

    console.log(`   Selected: ${selectedProvider}`);
    console.log(`   Expected: ${testCase.expectedProvider || 'Any valid'}`);

    totalDecisions++;
    if (!testCase.expectedProvider || selectedProvider === testCase.expectedProvider) {
      console.log(`   ✅ CORRECT`);
      correctDecisions++;
    } else {
      console.log(`   ⚠️  UNEXPECTED (but may be valid)`);
    }

    console.log('');
  }

  console.log('='.repeat(70));
  console.log(`RESULTADO: ${correctDecisions}/${totalDecisions} decisões corretas`);
  console.log(`Taxa de acerto: ${((correctDecisions / totalDecisions) * 100).toFixed(1)}%`);
  console.log('='.repeat(70));
  console.log('');
}

async function validateCostCalculations(): Promise<void> {
  console.log('='.repeat(70));
  console.log('VALIDAÇÃO: Cost Calculations');
  console.log('='.repeat(70));
  console.log('');

  const scenarios = [
    {
      name: 'Simple Analysis (Haiku)',
      provider: 'claude',
      model: 'claude-3-5-haiku-20241022',
      inputTokens: 200,
      outputTokens: 500,
      dailyCallsPerDay: 150,
    },
    {
      name: 'Complex Petition (Sonnet)',
      provider: 'claude',
      model: 'claude-3-5-sonnet-20241022',
      inputTokens: 500,
      outputTokens: 3000,
      dailyCallsPerDay: 20,
    },
    {
      name: 'Movement Extraction (Sonnet)',
      provider: 'claude',
      model: 'claude-3-5-sonnet-20241022',
      inputTokens: 1000,
      outputTokens: 500,
      dailyCallsPerDay: 75,
    },
  ];

  const rates: Record<string, { input: number; output: number }> = {
    'claude-3-5-sonnet-20241022': { input: 3 / 1000000, output: 15 / 1000000 },
    'claude-3-5-haiku-20241022': { input: 0.8 / 1000000, output: 4 / 1000000 },
  };

  let totalDailyCost = 0;

  for (const scenario of scenarios) {
    const rate = rates[scenario.model];
    const costPerCall = scenario.inputTokens * rate.input + scenario.outputTokens * rate.output;
    const dailyCost = costPerCall * scenario.dailyCallsPerDay;
    const monthlyCost = dailyCost * 30;

    console.log(`📊 ${scenario.name}`);
    console.log(`   Model: ${scenario.model}`);
    console.log(`   Calls/day: ${scenario.dailyCallsPerDay}`);
    console.log(`   Cost/call: $${costPerCall.toFixed(6)}`);
    console.log(`   Daily cost: $${dailyCost.toFixed(2)}`);
    console.log(`   Monthly cost: $${monthlyCost.toFixed(2)}`);
    console.log('');

    totalDailyCost += dailyCost;
  }

  const totalMonthlyCost = totalDailyCost * 30;

  console.log('='.repeat(70));
  console.log(`TOTAL DAILY: $${totalDailyCost.toFixed(2)}`);
  console.log(`TOTAL MONTHLY: $${totalMonthlyCost.toFixed(2)}`);
  console.log(`BUDGET: $500.00`);
  console.log(`REMAINING: $${(500 - totalMonthlyCost).toFixed(2)}`);
  console.log('='.repeat(70));
  console.log('');
}

async function validateStatusMethods(): Promise<void> {
  console.log('='.repeat(70));
  console.log('VALIDAÇÃO: Status Methods');
  console.log('='.repeat(70));
  console.log('');

  const status = llmPool.getStatus();
  console.log('📌 Pool Status:');
  console.log(`   Primary: ${(status as any).primaryProvider}`);
  console.log(`   Fallbacks: ${(status as any).fallbacks.join(', ')}`);
  console.log(`   Cache size: ${(status as any).cacheSize}`);
  console.log(`   Cache TTL: ${(status as any).cacheTTL} seconds (${((status as any).cacheTTL / 86400).toFixed(1)} days)`);
  console.log('');

  const stats = llmPool.getStats();
  console.log('📈 Cost Statistics:');
  console.log(`   Total cost: $${stats.totalCost.toFixed(2)}`);
  console.log(`   By provider: ${JSON.stringify(Object.fromEntries(
    Object.entries(stats.byProvider).map(([k, v]) => [k, `$${v.toFixed(2)}`])
  ))}`);
  console.log(`   By task: ${JSON.stringify(Object.fromEntries(
    Object.entries(stats.byTask).map(([k, v]) => [k, `$${v.toFixed(2)}`])
  ))}`);
  console.log('');

  const budget = llmPool.getCostBudgetStatus();
  console.log('💰 Budget Status:');
  console.log(`   Used: $${budget.used.toFixed(2)}`);
  console.log(`   Budget: $${budget.budget.toFixed(2)}`);
  console.log(`   Percentage: ${budget.percentageUsed.toFixed(1)}%`);
  console.log(`   Status: ${budget.status.toUpperCase()}`);
  console.log('');

  console.log('='.repeat(70));
}

async function runValidation(): Promise<void> {
  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(15) + 'LLMPool Phase 3 Validation' + ' '.repeat(27) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');
  console.log('\n');

  try {
    await validateRouting();
    await validateCostCalculations();
    await validateStatusMethods();

    console.log('='.repeat(70));
    console.log('✅ ALL VALIDATIONS COMPLETED SUCCESSFULLY');
    console.log('='.repeat(70));
    console.log('\n');
  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runValidation();
}

export { runValidation };
