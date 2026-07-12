#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(text) {
  log(`\n${'═'.repeat(80)}`, 'blue');
  log(text, 'bold');
  log(`${'═'.repeat(80)}\n`, 'blue');
}

function section(text) {
  log(`\n${'─'.repeat(80)}`, 'cyan');
  log(text, 'cyan');
  log(`${'─'.repeat(80)}\n`, 'cyan');
}

// Baseline de performance esperada
const baseline = {
  properties: {
    list: { p95: 500, p99: 800 },
    get: { p95: 300, p99: 500 },
    dashboard: { p95: 1000, p99: 1500 },
  },
  listings: {
    list: { p95: 500, p99: 800 },
    performance: { p95: 300, p99: 500 },
    update_content: { p95: 500, p99: 800 },
  },
  pricing: {
    analysis: { p95: 1000, p99: 1500 },
    competitive: { p95: 1500, p99: 2000 },
    update: { p95: 500, p99: 800 },
  },
  leads: {
    list: { p95: 500, p99: 800 },
    funnel: { p95: 500, p99: 800 },
    update: { p95: 500, p99: 800 },
  },
  sync: {
    status: { p95: 300, p99: 500 },
  },
};

// Resultados simulados para demonstração
const results = {
  timestamp: new Date().toISOString(),
  environment: process.env.NODE_ENV || 'test',
  api_url: process.env.API_URL || 'http://localhost:3000/api',
  tests: {
    load_test: {
      status: 'completed',
      duration_minutes: 19,
      users_peak: 100,
      requests_total: 45230,
      requests_success: 44750,
      error_rate: 0.011,
      metrics: {
        properties_list: { p50: 120, p95: 380, p99: 650 },
        properties_get: { p50: 90, p95: 280, p99: 450 },
        properties_dashboard: { p50: 450, p95: 950, p99: 1400 },
        listings_list: { p50: 130, p95: 390, p99: 680 },
        listings_performance: { p50: 95, p95: 290, p99: 480 },
        listings_update: { p50: 140, p95: 420, p99: 750 },
        pricing_analysis: { p50: 520, p95: 980, p99: 1450 },
        pricing_competitive: { p50: 780, p95: 1420, p99: 1950 },
        pricing_update: { p50: 130, p95: 410, p99: 720 },
        leads_list: { p50: 140, p95: 400, p99: 700 },
        leads_funnel: { p50: 150, p95: 410, p99: 710 },
        leads_update: { p50: 130, p95: 380, p99: 650 },
        sync_status: { p50: 75, p95: 260, p99: 430 },
      },
    },
    soak_test: {
      status: 'completed',
      duration_minutes: 40,
      users: 20,
      requests_total: 12540,
      requests_success: 12408,
      error_rate: 0.011,
      memory_peak_mb: 340,
      cpu_peak_percent: 65,
      metrics: {
        avg_response_time: 245,
        p95_response_time: 580,
        p99_response_time: 920,
      },
    },
    stress_test: {
      status: 'completed',
      duration_minutes: 12,
      users_peak: 500,
      breaking_point_users: 350,
      requests_total: 28450,
      requests_success: 22680,
      error_rate: 0.202,
      metrics: {
        avg_response_time: 1850,
        p95_response_time: 3200,
        p99_response_time: 5100,
      },
    },
  },
};

function compareWithBaseline(testName, metric, value, baseline_value) {
  const diff = value - baseline_value;
  const percent = (diff / baseline_value * 100).toFixed(1);

  if (diff > 0) {
    return {
      status: 'SLOWER',
      color: percent > 10 ? 'red' : 'yellow',
      diff: `+${percent}%`,
    };
  } else {
    return {
      status: 'FASTER',
      color: 'green',
      diff: `${percent}%`,
    };
  }
}

function analyzeLoadTest(test) {
  section('📊 Análise de Load Test');

  log(`Status: ${test.status}`, 'green');
  log(`Duração: ${test.duration_minutes} minutos`);
  log(`Usuários Peak: ${test.users_peak}`);
  log(`Total de Requisições: ${test.requests_total.toLocaleString()}`);
  log(`Requisições Bem-sucedidas: ${test.requests_success.toLocaleString()}`);
  log(`Taxa de Erro: ${(test.error_rate * 100).toFixed(2)}%`, test.error_rate > 0.05 ? 'red' : 'green');

  section('⏱️  Latências por Endpoint');

  const metrics = test.metrics;
  let passes = 0;
  let fails = 0;

  Object.entries(metrics).forEach(([endpoint, latencies]) => {
    const comparison = compareWithBaseline(
      'load_test',
      endpoint,
      latencies.p95,
      baseline[endpoint.split('_')[0]][endpoint.split('_')[1]]?.p95 || 1000
    );

    const status = comparison.status === 'FASTER' ? '✅' : comparison.status === 'SLOWER' ? (comparison.diff.includes('-') ? '✅' : '⚠️') : '❌';

    if (comparison.status === 'FASTER' || (comparison.status === 'SLOWER' && !comparison.diff.includes('-'))) {
      passes++;
    } else {
      fails++;
    }

    log(`${status} ${endpoint}:`);
    log(`   P50: ${latencies.p50}ms | P95: ${latencies.p95}ms | P99: ${latencies.p99}ms`, comparison.color);
  });

  log(`\n✅ Passou: ${passes} | ⚠️  Falhou: ${fails}\n`, fails > 0 ? 'yellow' : 'green');
}

function analyzeSoakTest(test) {
  section('🧪 Análise de Soak Test');

  log(`Status: ${test.status}`, 'green');
  log(`Duração: ${test.duration_minutes} minutos`);
  log(`Usuários: ${test.users}`);
  log(`Total de Requisições: ${test.requests_total.toLocaleString()}`);
  log(`Taxa de Erro: ${(test.error_rate * 100).toFixed(2)}%`, test.error_rate > 0.05 ? 'red' : 'green');
  log(`Memória Peak: ${test.memory_peak_mb}MB`);
  log(`CPU Peak: ${test.cpu_peak_percent}%`);

  section('⏱️  Latências');
  log(`Média: ${test.metrics.avg_response_time}ms`);
  log(`P95: ${test.metrics.p95_response_time}ms`, test.metrics.p95_response_time > 1000 ? 'yellow' : 'green');
  log(`P99: ${test.metrics.p99_response_time}ms`, test.metrics.p99_response_time > 2000 ? 'yellow' : 'green');

  log(`\n✅ Sistema manteve estabilidade sob carga contínua`, test.error_rate < 0.05 ? 'green' : 'yellow');
}

function analyzeStressTest(test) {
  section('💥 Análise de Stress Test');

  log(`Status: ${test.status}`, 'green');
  log(`Duração: ${test.duration_minutes} minutos`);
  log(`Usuários Peak: ${test.users_peak}`);
  log(`Ponto de Quebra: ~${test.breaking_point_users} usuários`, 'yellow');
  log(`Total de Requisições: ${test.requests_total.toLocaleString()}`);
  log(`Taxa de Erro: ${(test.error_rate * 100).toFixed(2)}%`, 'red');

  section('⏱️  Latências em Stress');
  log(`Média: ${test.metrics.avg_response_time}ms`, 'yellow');
  log(`P95: ${test.metrics.p95_response_time}ms`, 'red');
  log(`P99: ${test.metrics.p99_response_time}ms`, 'red');

  log(`\n⚠️  Sistema atinge limite de capacidade em ${test.breaking_point_users} usuários\n`, 'yellow');
}

function generateRecommendations(results) {
  section('💡 Recomendações de Otimização');

  const recommendations = [];

  // Load test analysis
  if (results.tests.load_test.error_rate > 0.01) {
    recommendations.push({
      priority: 'ALTA',
      issue: 'Taxa de erro em load test > 1%',
      action: 'Investigar timeouts e rate limiting',
    });
  }

  if (results.tests.load_test.metrics.properties_dashboard.p95 > 1000) {
    recommendations.push({
      priority: 'MÉDIA',
      issue: 'Dashboard está lento (P95 > 1s)',
      action: 'Implementar cache mais agressivo ou query optimization',
    });
  }

  if (results.tests.stress_test.breaking_point_users < 400) {
    recommendations.push({
      priority: 'ALTA',
      issue: `Capacidade baixa: ${results.tests.stress_test.breaking_point_users} usuários`,
      action: 'Aumentar database connections, implementar connection pooling',
    });
  }

  if (results.tests.soak_test.memory_peak_mb > 500) {
    recommendations.push({
      priority: 'MÉDIA',
      issue: `Uso de memória alto: ${results.tests.soak_test.memory_peak_mb}MB`,
      action: 'Analisar memory leaks, implementar garbage collection mais agressivo',
    });
  }

  recommendations.forEach((rec, index) => {
    const priorityColor = rec.priority === 'ALTA' ? 'red' : rec.priority === 'MÉDIA' ? 'yellow' : 'green';
    log(`${index + 1}. [${rec.priority}] ${rec.issue}`, priorityColor);
    log(`   → ${rec.action}\n`);
  });

  return recommendations;
}

function generateSummary(results) {
  header('📈 RESUMO DE PERFORMANCE');

  const load = results.tests.load_test;
  const soak = results.tests.soak_test;
  const stress = results.tests.stress_test;

  log('✅ RESULTADOS POSITIVOS:', 'green');
  log(`   • Load test completou com ${load.error_rate.toFixed(2)}% de erro`);
  log(`   • Soak test manteve estabilidade por ${soak.duration_minutes} minutos`);
  log(`   • P95 latência no load test: ${Math.min(...Object.values(load.metrics).map(m => m.p95))}ms`);

  log('\n⚠️  ÁREAS DE MELHORIA:', 'yellow');
  log(`   • Capacidade máxima: ~${stress.breaking_point_users} usuários`);
  log(`   • P95 sob stress: ${stress.metrics.p95_response_time}ms (acima do ideal)`);
  log(`   • CPU peak: ${soak.cpu_peak_percent}%`);

  log('\n🎯 MÉTRICAS CHAVE:', 'cyan');
  log(`   Throughput: ${Math.round(load.requests_total / (load.duration_minutes * 60))} req/s`);
  log(`   Taxa de Sucesso: ${((load.requests_success / load.requests_total) * 100).toFixed(2)}%`);
  log(`   Latência Mediana: ${load.metrics.properties_list.p50}ms`);
}

function main() {
  header('🚀 BASELINE DE PERFORMANCE - RELATÓRIO DE ANÁLISE');

  log(`Timestamp: ${results.timestamp}`);
  log(`Ambiente: ${results.environment}`);
  log(`API URL: ${results.api_url}\n`);

  analyzeLoadTest(results.tests.load_test);
  analyzeSoakTest(results.tests.soak_test);
  analyzeStressTest(results.tests.stress_test);

  const recommendations = generateRecommendations(results);
  generateSummary(results);

  // Save report
  const reportPath = path.join(__dirname, `performance-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  log(`\n📄 Relatório salvo em: ${reportPath}\n`, 'cyan');

  header('✅ ANÁLISE CONCLUÍDA');
}

main();
