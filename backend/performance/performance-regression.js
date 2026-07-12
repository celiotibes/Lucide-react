#!/usr/bin/env node

/**
 * Performance Regression Detector
 * Compara métricas de performance entre releases
 * Detecta degradação de performance e dispara alertas
 *
 * Uso: npm run test:perf:regression -- baseline-v1.2.3.json current.json
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ============================================================================
// CONFIGURAÇÕES
// ============================================================================

const CONFIG = {
  // Thresholds de regression
  thresholds: {
    latency_p95_increase: 0.15, // 15% aumento é aceitável
    latency_p99_increase: 0.15,
    error_rate_increase: 0.5,   // 50% aumento é aceitável
    throughput_decrease: 0.10,  // 10% redução é crítica
  },

  // Severidade de alertas
  severities: {
    CRITICAL: '🔴 CRITICAL',
    WARNING: '🟡 WARNING',
    INFO: '🟢 INFO',
  },

  // Colores para output
  colors: {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
    bold: '\x1b[1m',
  },
};

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    printUsage();
    process.exit(1);
  }

  const baselineFile = args[0];
  const currentFile = args[1];

  // Validar arquivos
  if (!fs.existsSync(baselineFile)) {
    console.error(`❌ Baseline file not found: ${baselineFile}`);
    process.exit(1);
  }

  if (!fs.existsSync(currentFile)) {
    console.error(`❌ Current file not found: ${currentFile}`);
    process.exit(1);
  }

  try {
    // Carregar resultados
    const baseline = loadResultsFile(baselineFile);
    const current = loadResultsFile(currentFile);

    console.log(`\n${CONFIG.colors.bold}📊 Performance Regression Analysis${CONFIG.colors.reset}\n`);
    console.log(`Baseline: ${baselineFile}`);
    console.log(`Current:  ${currentFile}\n`);

    // Extrair métricas
    const baselineMetrics = extractMetrics(baseline);
    const currentMetrics = extractMetrics(current);

    if (!baselineMetrics || !currentMetrics) {
      console.error('❌ Failed to extract metrics from files');
      process.exit(1);
    }

    // Comparar
    const regressions = compareMetrics(baselineMetrics, currentMetrics);

    // Gerar relatório
    const report = generateReport(baselineMetrics, currentMetrics, regressions);

    // Imprimir relatório
    printReport(report);

    // Retornar código de saída apropriado
    const hasCritical = regressions.some(r => r.severity === 'CRITICAL');
    process.exit(hasCritical ? 1 : 0);
  } catch (error) {
    console.error('❌ Error during analysis:', error.message);
    process.exit(1);
  }
}

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

function loadResultsFile(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8');

  // Tentar JSON
  try {
    return JSON.parse(content);
  } catch (e) {
    // Tentar formato de linha (k6 output)
    return parseK6Output(content);
  }
}

function parseK6Output(content) {
  // Parse k6 JSON output lines
  const lines = content.trim().split('\n');
  const metrics = {};

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);

      if (obj.type === 'Metric') {
        const key = obj.data.name;
        if (!metrics[key]) {
          metrics[key] = [];
        }
        metrics[key].push(obj.data.value);
      }
    } catch (e) {
      // Ignorar linhas inválidas
    }
  }

  return { metrics };
}

function extractMetrics(results) {
  if (!results || !results.metrics) {
    return null;
  }

  const metrics = {};

  // Latência por endpoint
  metrics.latency = extractLatencyMetrics(results.metrics);

  // Taxa de erro
  metrics.errorRate = extractErrorRate(results.metrics);

  // Throughput
  metrics.throughput = extractThroughput(results.metrics);

  // Requisições bem-sucedidas
  metrics.successRate = extractSuccessRate(results.metrics);

  return metrics;
}

function extractLatencyMetrics(metricsObj) {
  const latency = {};

  // Procurar por métricas de latência (http_req_duration, etc)
  for (const [key, values] of Object.entries(metricsObj)) {
    if (typeof values === 'object' && values.length > 0) {
      if (key.includes('duration') || key.includes('latency')) {
        latency[key] = calculatePercentiles(values);
      }
    }
  }

  // Se não encontrou, usar métrica padrão
  if (Object.keys(latency).length === 0) {
    latency['http_req_duration'] = {
      p50: 0,
      p95: 0,
      p99: 0,
      avg: 0,
    };
  }

  return latency;
}

function extractErrorRate(metricsObj) {
  let errorCount = 0;
  let totalCount = 0;

  // Procurar por métricas de erro
  for (const [key, values] of Object.entries(metricsObj)) {
    if (typeof values === 'object' && Array.isArray(values)) {
      if (key.includes('error') || key.includes('failed')) {
        errorCount += values.filter(v => v > 0).length;
      }
      if (key.includes('count') || key.includes('total')) {
        totalCount += values.length;
      }
    }
  }

  return totalCount > 0 ? (errorCount / totalCount) * 100 : 0;
}

function extractThroughput(metricsObj) {
  // Requisições por segundo
  for (const [key, values] of Object.entries(metricsObj)) {
    if (typeof values === 'object' && Array.isArray(values)) {
      if (key.includes('http_reqs') && values.length > 0) {
        const total = values.reduce((a, b) => a + b, 0);
        // Assumir 1 minuto de teste
        return (total / 60);
      }
    }
  }

  return 0;
}

function extractSuccessRate(metricsObj) {
  let successCount = 0;
  let totalCount = 0;

  for (const [key, values] of Object.entries(metricsObj)) {
    if (typeof values === 'object' && Array.isArray(values)) {
      if (key.includes('checks') || key.includes('success')) {
        successCount += values.filter(v => v === 1).length;
      }
      totalCount += values.length;
    }
  }

  return totalCount > 0 ? (successCount / totalCount) * 100 : 0;
}

function calculatePercentiles(values) {
  if (!values || values.length === 0) {
    return { p50: 0, p95: 0, p99: 0, avg: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const len = sorted.length;

  return {
    p50: sorted[Math.floor(len * 0.50)],
    p95: sorted[Math.floor(len * 0.95)],
    p99: sorted[Math.floor(len * 0.99)],
    avg: sorted.reduce((a, b) => a + b, 0) / len,
  };
}

function compareMetrics(baseline, current) {
  const regressions = [];

  // Comparar latência P95
  const baselineP95 = baseline.latency['http_req_duration']?.p95 || 0;
  const currentP95 = current.latency['http_req_duration']?.p95 || 0;

  if (currentP95 > baselineP95) {
    const increase = ((currentP95 - baselineP95) / baselineP95) * 100;

    if (increase > CONFIG.thresholds.latency_p95_increase * 100) {
      regressions.push({
        metric: 'Latency P95',
        baseline: baselineP95,
        current: currentP95,
        increase: increase,
        unit: 'ms',
        threshold: CONFIG.thresholds.latency_p95_increase * 100,
        severity: increase > 50 ? 'CRITICAL' : 'WARNING',
      });
    }
  }

  // Comparar latência P99
  const baselineP99 = baseline.latency['http_req_duration']?.p99 || 0;
  const currentP99 = current.latency['http_req_duration']?.p99 || 0;

  if (currentP99 > baselineP99) {
    const increase = ((currentP99 - baselineP99) / baselineP99) * 100;

    if (increase > CONFIG.thresholds.latency_p99_increase * 100) {
      regressions.push({
        metric: 'Latency P99',
        baseline: baselineP99,
        current: currentP99,
        increase: increase,
        unit: 'ms',
        threshold: CONFIG.thresholds.latency_p99_increase * 100,
        severity: increase > 50 ? 'CRITICAL' : 'WARNING',
      });
    }
  }

  // Comparar taxa de erro
  const baselineError = baseline.errorRate;
  const currentError = current.errorRate;

  if (currentError > baselineError) {
    const increase = ((currentError - baselineError) / (baselineError || 1)) * 100;

    if (increase > CONFIG.thresholds.error_rate_increase * 100) {
      regressions.push({
        metric: 'Error Rate',
        baseline: baselineError.toFixed(2),
        current: currentError.toFixed(2),
        increase: increase,
        unit: '%',
        threshold: CONFIG.thresholds.error_rate_increase * 100,
        severity: 'CRITICAL',
      });
    }
  }

  // Comparar throughput
  const baselineThroughput = baseline.throughput;
  const currentThroughput = current.throughput;

  if (currentThroughput < baselineThroughput) {
    const decrease = ((baselineThroughput - currentThroughput) / baselineThroughput) * 100;

    if (decrease > CONFIG.thresholds.throughput_decrease * 100) {
      regressions.push({
        metric: 'Throughput',
        baseline: baselineThroughput.toFixed(2),
        current: currentThroughput.toFixed(2),
        decrease: decrease,
        unit: 'req/s',
        threshold: CONFIG.thresholds.throughput_decrease * 100,
        severity: decrease > 20 ? 'CRITICAL' : 'WARNING',
      });
    }
  }

  return regressions;
}

function generateReport(baseline, current, regressions) {
  return {
    timestamp: new Date().toISOString(),
    baseline: {
      latency: baseline.latency['http_req_duration'] || {},
      errorRate: baseline.errorRate,
      throughput: baseline.throughput,
      successRate: baseline.successRate,
    },
    current: {
      latency: current.latency['http_req_duration'] || {},
      errorRate: current.errorRate,
      throughput: current.throughput,
      successRate: current.successRate,
    },
    regressions: regressions,
    summary: {
      totalRegressions: regressions.length,
      criticalRegressions: regressions.filter(r => r.severity === 'CRITICAL').length,
      warnings: regressions.filter(r => r.severity === 'WARNING').length,
      passed: regressions.length === 0,
    },
  };
}

function printReport(report) {
  // Header
  console.log(`${CONFIG.colors.cyan}═══════════════════════════════════════════════════════════${CONFIG.colors.reset}`);
  console.log(`${CONFIG.colors.cyan}PERFORMANCE METRICS COMPARISON${CONFIG.colors.reset}`);
  console.log(`${CONFIG.colors.cyan}═══════════════════════════════════════════════════════════${CONFIG.colors.reset}\n`);

  // Baseline vs Current
  console.log(`${CONFIG.colors.bold}Latency (ms):${CONFIG.colors.reset}`);
  console.log(`  P50:  ${report.baseline.latency.p50 || 'N/A'} ms → ${report.current.latency.p50 || 'N/A'} ms`);
  console.log(`  P95:  ${report.baseline.latency.p95 || 'N/A'} ms → ${report.current.latency.p95 || 'N/A'} ms`);
  console.log(`  P99:  ${report.baseline.latency.p99 || 'N/A'} ms → ${report.current.latency.p99 || 'N/A'} ms\n`);

  console.log(`${CONFIG.colors.bold}Other Metrics:${CONFIG.colors.reset}`);
  console.log(`  Error Rate:  ${report.baseline.errorRate.toFixed(2)}% → ${report.current.errorRate.toFixed(2)}%`);
  console.log(`  Throughput:  ${report.baseline.throughput.toFixed(2)} req/s → ${report.current.throughput.toFixed(2)} req/s`);
  console.log(`  Success Rate: ${report.baseline.successRate.toFixed(2)}% → ${report.current.successRate.toFixed(2)}%\n`);

  // Regressions
  if (report.regressions.length === 0) {
    console.log(`${CONFIG.colors.green}✅ No performance regressions detected${CONFIG.colors.reset}\n`);
  } else {
    console.log(`${CONFIG.colors.bold}${CONFIG.colors.red}⚠️  Performance Regressions Detected:${CONFIG.colors.reset}\n`);

    for (const regression of report.regressions) {
      const severity = regression.severity === 'CRITICAL' ? CONFIG.colors.red : CONFIG.colors.yellow;
      const severityLabel = CONFIG.severities[regression.severity];

      console.log(`${severity}${severityLabel}${CONFIG.colors.reset} ${regression.metric}`);
      console.log(`  Baseline: ${regression.baseline} ${regression.unit}`);
      console.log(`  Current:  ${regression.current} ${regression.unit}`);
      console.log(`  Change:   ${regression.increase || regression.decrease}% (threshold: ${regression.threshold}%)\n`);
    }
  }

  // Summary
  console.log(`${CONFIG.colors.cyan}═══════════════════════════════════════════════════════════${CONFIG.colors.reset}`);
  console.log(`${CONFIG.colors.bold}Summary:${CONFIG.colors.reset}`);
  console.log(`  Total Regressions: ${report.summary.totalRegressions}`);
  console.log(`  Critical: ${report.summary.criticalRegressions} | Warnings: ${report.summary.warnings}`);
  console.log(`  Status: ${report.summary.passed ? `${CONFIG.colors.green}✅ PASSED${CONFIG.colors.reset}` : `${CONFIG.colors.red}❌ FAILED${CONFIG.colors.reset}`}`);
  console.log(`${CONFIG.colors.cyan}═══════════════════════════════════════════════════════════${CONFIG.colors.reset}\n`);

  // Save report
  const reportFile = `performance-regression-${Date.now()}.json`;
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`📄 Report saved to: ${reportFile}\n`);
}

function printUsage() {
  console.log(`
Usage: performance-regression.js <baseline-file> <current-file>

Compare two performance test results and detect regressions.

Examples:
  performance-regression.js baseline-v1.2.3.json current.json
  npm run test:perf:regression -- baseline.json latest.json

Thresholds:
  - Latency P95: ${CONFIG.thresholds.latency_p95_increase * 100}% increase
  - Latency P99: ${CONFIG.thresholds.latency_p99_increase * 100}% increase
  - Error Rate: ${CONFIG.thresholds.error_rate_increase * 100}% increase
  - Throughput: ${CONFIG.thresholds.throughput_decrease * 100}% decrease

Exit Codes:
  0 - No critical regressions
  1 - Critical regressions detected
  `);
}

// ============================================================================
// EXECUÇÃO
// ============================================================================

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
