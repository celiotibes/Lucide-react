/**
 * Testes para AIProviderSelector
 */

import { aiSelector } from './aiProviderSelector'

// Mock dados para teste
const testCases = [
  {
    name: 'Legal Analysis (Premium)',
    caseOfUse: 'legalAnalysis' as const,
    prompt: 'Analise esta petição para falhas estratégicas',
    expectedProvider: 'claude',
    expectedQuality: 95,
    maxCost: 0.05, // Estimado para teste
  },
  {
    name: 'Email Extraction (Económico)',
    caseOfUse: 'emailExtraction' as const,
    prompt: 'Extraia referências jurídicas desta mensagem',
    expectedProvider: 'gemini',
    expectedQuality: 85,
    maxCost: 0.001,
  },
  {
    name: 'Search Query (Rápido)',
    caseOfUse: 'searchQuery' as const,
    prompt: 'Parse esta busca jurídica',
    expectedProvider: 'gemini',
    expectedQuality: 80,
    maxCost: 0.001,
  },
  {
    name: 'Contra Arguments (Estratégico)',
    caseOfUse: 'contraArguments' as const,
    prompt: 'Gere contra-argumentos para este caso',
    expectedProvider: 'grok',
    expectedQuality: 88,
    maxCost: 0.01,
  },
  {
    name: 'RAG Analysis (Local)',
    caseOfUse: 'ragAnalysis' as const,
    prompt: 'Busque jurisprudência similar',
    expectedProvider: 'ollama',
    expectedQuality: 92,
    maxCost: 0,
  },
]

async function runTests() {
  console.log('🧪 Iniciando testes de AIProviderSelector\n')

  let passed = 0
  let failed = 0

  for (const testCase of testCases) {
    try {
      console.log(`Test: ${testCase.name}`)

      const provider = aiSelector.selectProvider(testCase.caseOfUse)

      // Validação 1: Provider correto
      if (provider.name !== testCase.expectedProvider) {
        throw new Error(
          `Provider mismatch: expected ${testCase.expectedProvider}, got ${provider.name}`
        )
      }

      // Validação 2: Qualidade
      if (provider.quality < testCase.expectedQuality - 5) {
        throw new Error(
          `Quality too low: expected ${testCase.expectedQuality}, got ${provider.quality}`
        )
      }

      // Validação 3: Custo razoável
      if (provider.cost > testCase.maxCost && testCase.maxCost > 0) {
        console.warn(
          `⚠️ Cost higher than expected: $${provider.cost}/M tokens (max: $${testCase.maxCost})`
        )
      }

      console.log(
        `✅ PASS - Provider: ${provider.name}, Quality: ${provider.quality}, Cost: $${provider.cost}/M\n`
      )
      passed++
    } catch (error) {
      console.error(`❌ FAIL - ${error}\n`)
      failed++
    }
  }

  // Relatório final
  console.log('='.repeat(50))
  console.log(`\n📊 TESTE SUMMARY`)
  console.log(`✅ Passed: ${passed}/${testCases.length}`)
  console.log(`❌ Failed: ${failed}/${testCases.length}`)
  console.log(`Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`)

  // Análise de custos
  const stats = aiSelector.getStats()
  console.log('\n💰 CUSTO ANALYSIS')
  console.log(`Total Calls: ${stats.totalCalls}`)
  console.log(`Total Cost: $${stats.totalCostUSD.toFixed(4)}`)
  console.log(`Avg Latency: ${Math.round(stats.avgLatencyMs)}ms`)

  return failed === 0
}

// Executar testes
const testsPassed = runTests()
  .then(result => {
    console.log(result ? '\n✨ Todos os testes passaram!' : '\n⚠️ Alguns testes falharam')
    process.exit(result ? 0 : 1)
  })
  .catch(error => {
    console.error('Erro ao executar testes:', error)
    process.exit(1)
  })
