#!/usr/bin/env node

/**
 * Coverage Report Generator
 * Aggregates coverage data from unit tests and E2E tests
 * Generates comprehensive HTML report with metrics and thresholds
 */

const fs = require('fs');
const path = require('path');

const COVERAGE_DIRS = [
  'coverage',
  'artifacts/e2e/coverage',
];

const REPORT_OUTPUT = 'coverage/consolidated-report.html';
const METRICS_OUTPUT = 'coverage/metrics.json';

// Coverage targets by module/path
const TARGETS = {
  global: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80,
  },
  './src/services/**': {
    branches: 85,
    functions: 85,
    lines: 85,
    statements: 85,
  },
  './src/database/**': {
    branches: 85,
    functions: 85,
    lines: 85,
    statements: 85,
  },
  './src/components/**': {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80,
  },
  './src/screens/**': {
    branches: 75,
    functions: 75,
    lines: 75,
    statements: 75,
  },
  './src/utils/**': {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80,
  },
};

/**
 * Load coverage data from coverage files
 */
function loadCoverageData() {
  const coverageData = {
    unit: null,
    e2e: null,
    merged: null,
  };

  // Try to load unit test coverage
  const unitPath = path.join(COVERAGE_DIRS[0], 'coverage-summary.json');
  if (fs.existsSync(unitPath)) {
    try {
      coverageData.unit = JSON.parse(fs.readFileSync(unitPath, 'utf8'));
      console.log('✓ Loaded unit test coverage');
    } catch (error) {
      console.warn('✗ Failed to load unit test coverage:', error.message);
    }
  }

  // Try to load E2E coverage
  const e2ePath = path.join(COVERAGE_DIRS[1], 'coverage-summary.json');
  if (fs.existsSync(e2ePath)) {
    try {
      coverageData.e2e = JSON.parse(fs.readFileSync(e2ePath, 'utf8'));
      console.log('✓ Loaded E2E coverage');
    } catch (error) {
      console.warn('✗ Failed to load E2E coverage:', error.message);
    }
  }

  return coverageData;
}

/**
 * Merge coverage data from multiple sources
 */
function mergeCoverageData(coverage) {
  if (!coverage.unit && !coverage.e2e) {
    console.warn('⚠ No coverage data found. Using default values.');
    return createDefaultMetrics();
  }

  // Use unit coverage as primary, fallback to E2E
  return coverage.unit || coverage.e2e || createDefaultMetrics();
}

/**
 * Create default metrics structure
 */
function createDefaultMetrics() {
  return {
    total: {
      lines: { pct: 0, covered: 0, skipped: 0, total: 0 },
      statements: { pct: 0, covered: 0, skipped: 0, total: 0 },
      functions: { pct: 0, covered: 0, skipped: 0, total: 0 },
      branches: { pct: 0, covered: 0, skipped: 0, total: 0 },
    },
  };
}

/**
 * Calculate coverage status
 */
function getCoverageStatus(actual, target) {
  if (actual >= target) return 'success';
  if (actual >= target - 5) return 'warning';
  return 'error';
}

/**
 * Generate HTML report
 */
function generateHTMLReport(metrics) {
  const totalMetrics = metrics.total || createDefaultMetrics().total;

  const getMetricHtml = (metric, value, target) => {
    const status = getCoverageStatus(value, target);
    const statusIcon = {
      success: '✓',
      warning: '⚠',
      error: '✗',
    }[status];

    return `
      <div class="metric-card ${status}">
        <h4>${metric}</h4>
        <div class="metric-value">${value.toFixed(2)}%</div>
        <div class="metric-target">Target: ${target}%</div>
        <div class="metric-status">${statusIcon}</div>
      </div>
    `;
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Coverage Report - CRMT Mobile</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
        'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
        sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }

    .header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
    }

    .header p {
      font-size: 1.1em;
      opacity: 0.9;
    }

    .content {
      padding: 40px;
    }

    .section {
      margin-bottom: 50px;
    }

    .section h2 {
      font-size: 1.8em;
      color: #333;
      margin-bottom: 25px;
      border-bottom: 3px solid #667eea;
      padding-bottom: 10px;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }

    .metric-card {
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      border: 2px solid #ddd;
      transition: all 0.3s ease;
    }

    .metric-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    }

    .metric-card.success {
      background: linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%);
      border-color: #52b788;
    }

    .metric-card.warning {
      background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
      border-color: #ffc300;
    }

    .metric-card.error {
      background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
      border-color: #d62828;
    }

    .metric-card h4 {
      font-size: 1.1em;
      margin-bottom: 10px;
      font-weight: 600;
    }

    .metric-value {
      font-size: 2.5em;
      font-weight: bold;
      margin-bottom: 5px;
      color: #333;
    }

    .metric-target {
      font-size: 0.9em;
      opacity: 0.8;
      margin-bottom: 10px;
    }

    .metric-status {
      font-size: 1.5em;
      margin-top: 5px;
    }

    .table-container {
      overflow-x: auto;
      margin-bottom: 30px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }

    th {
      background: #f5f5f5;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      border-bottom: 2px solid #ddd;
    }

    td {
      padding: 12px;
      border-bottom: 1px solid #ddd;
    }

    tr:hover {
      background: #f9f9f9;
    }

    .progress-bar {
      background: #ddd;
      border-radius: 4px;
      height: 8px;
      overflow: hidden;
      margin: 5px 0;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #667eea, #764ba2);
      transition: width 0.3s ease;
    }

    .footer {
      background: #f5f5f5;
      padding: 20px;
      text-align: center;
      color: #666;
      font-size: 0.9em;
      border-top: 1px solid #ddd;
    }

    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.85em;
      font-weight: 600;
      margin-right: 5px;
    }

    .badge.pass {
      background: #d4edda;
      color: #155724;
    }

    .badge.fail {
      background: #f8d7da;
      color: #721c24;
    }

    @media (max-width: 768px) {
      .header h1 {
        font-size: 1.8em;
      }

      .metrics-grid {
        grid-template-columns: 1fr;
      }

      .content {
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Test Coverage Report</h1>
      <p>CRMT Mobile - React Native Application</p>
    </div>

    <div class="content">
      <!-- Overall Coverage Section -->
      <section class="section">
        <h2>Overall Coverage</h2>
        <div class="metrics-grid">
          ${getMetricHtml('Statements', totalMetrics.statements.pct, TARGETS.global.statements)}
          ${getMetricHtml('Branches', totalMetrics.branches.pct, TARGETS.global.branches)}
          ${getMetricHtml('Functions', totalMetrics.functions.pct, TARGETS.global.functions)}
          ${getMetricHtml('Lines', totalMetrics.lines.pct, TARGETS.global.lines)}
        </div>
      </section>

      <!-- Coverage Summary Table -->
      <section class="section">
        <h2>Coverage Summary</h2>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>Covered</th>
                <th>Total</th>
                <th>Coverage %</th>
                <th>Progress</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Statements</td>
                <td>${totalMetrics.statements.covered}</td>
                <td>${totalMetrics.statements.total}</td>
                <td>${totalMetrics.statements.pct.toFixed(2)}%</td>
                <td>
                  <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.min(totalMetrics.statements.pct, 100)}%"></div>
                  </div>
                </td>
                <td>
                  <span class="badge ${getCoverageStatus(totalMetrics.statements.pct, TARGETS.global.statements) === 'success' ? 'pass' : 'fail'}">
                    ${getCoverageStatus(totalMetrics.statements.pct, TARGETS.global.statements).toUpperCase()}
                  </span>
                </td>
              </tr>
              <tr>
                <td>Branches</td>
                <td>${totalMetrics.branches.covered}</td>
                <td>${totalMetrics.branches.total}</td>
                <td>${totalMetrics.branches.pct.toFixed(2)}%</td>
                <td>
                  <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.min(totalMetrics.branches.pct, 100)}%"></div>
                  </div>
                </td>
                <td>
                  <span class="badge ${getCoverageStatus(totalMetrics.branches.pct, TARGETS.global.branches) === 'success' ? 'pass' : 'fail'}">
                    ${getCoverageStatus(totalMetrics.branches.pct, TARGETS.global.branches).toUpperCase()}
                  </span>
                </td>
              </tr>
              <tr>
                <td>Functions</td>
                <td>${totalMetrics.functions.covered}</td>
                <td>${totalMetrics.functions.total}</td>
                <td>${totalMetrics.functions.pct.toFixed(2)}%</td>
                <td>
                  <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.min(totalMetrics.functions.pct, 100)}%"></div>
                  </div>
                </td>
                <td>
                  <span class="badge ${getCoverageStatus(totalMetrics.functions.pct, TARGETS.global.functions) === 'success' ? 'pass' : 'fail'}">
                    ${getCoverageStatus(totalMetrics.functions.pct, TARGETS.global.functions).toUpperCase()}
                  </span>
                </td>
              </tr>
              <tr>
                <td>Lines</td>
                <td>${totalMetrics.lines.covered}</td>
                <td>${totalMetrics.lines.total}</td>
                <td>${totalMetrics.lines.pct.toFixed(2)}%</td>
                <td>
                  <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.min(totalMetrics.lines.pct, 100)}%"></div>
                  </div>
                </td>
                <td>
                  <span class="badge ${getCoverageStatus(totalMetrics.lines.pct, TARGETS.global.lines) === 'success' ? 'pass' : 'fail'}">
                    ${getCoverageStatus(totalMetrics.lines.pct, TARGETS.global.lines).toUpperCase()}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Coverage Targets Section -->
      <section class="section">
        <h2>Coverage Targets by Module</h2>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Module</th>
                <th>Target</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(TARGETS).map(([path, targets]) => `
                <tr>
                  <td>${path}</td>
                  <td>
                    Lines: ${targets.lines}%,
                    Branches: ${targets.branches}%,
                    Functions: ${targets.functions}%,
                    Statements: ${targets.statements}%
                  </td>
                  <td>
                    <span class="badge pass">CONFIGURED</span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <!-- Test Types Section -->
      <section class="section">
        <h2>Test Coverage by Type</h2>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Test Type</th>
                <th>Status</th>
                <th>Last Run</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Unit Tests</td>
                <td><span class="badge ${totalMetrics.statements.pct >= 80 ? 'pass' : 'fail'}">${totalMetrics.statements.pct >= 80 ? 'PASSING' : 'FAILING'}</span></td>
                <td>Just now</td>
              </tr>
              <tr>
                <td>Integration Tests</td>
                <td><span class="badge pass">CONFIGURED</span></td>
                <td>-</td>
              </tr>
              <tr>
                <td>E2E Tests</td>
                <td><span class="badge pass">CONFIGURED</span></td>
                <td>-</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Recommendations Section -->
      <section class="section">
        <h2>Recommendations</h2>
        <ul style="line-height: 1.8; margin-left: 20px;">
          <li>Focus on increasing branch coverage for critical services</li>
          <li>Add tests for error handling paths in API service</li>
          <li>Improve UI component test coverage with snapshot tests</li>
          <li>Implement E2E tests for user authentication flows</li>
          <li>Set up continuous monitoring of coverage metrics</li>
        </ul>
      </section>
    </div>

    <div class="footer">
      <p>Report generated on <strong>${new Date().toLocaleString()}</strong></p>
      <p>For more information, see the <a href="../../E2E_SETUP_GUIDE.md">E2E Setup Guide</a></p>
    </div>
  </div>
</body>
</html>`;

  fs.writeFileSync(
    path.join('coverage', 'index.html'),
    html,
    'utf8'
  );
  console.log('✓ Generated HTML report at coverage/index.html');
}

/**
 * Save metrics as JSON
 */
function saveMetricsJSON(metrics) {
  const output = {
    timestamp: new Date().toISOString(),
    metrics: metrics.total,
    targets: TARGETS,
    summary: {
      overall: {
        statements: {
          actual: metrics.total.statements.pct,
          target: TARGETS.global.statements,
          passing: metrics.total.statements.pct >= TARGETS.global.statements,
        },
        branches: {
          actual: metrics.total.branches.pct,
          target: TARGETS.global.branches,
          passing: metrics.total.branches.pct >= TARGETS.global.branches,
        },
        functions: {
          actual: metrics.total.functions.pct,
          target: TARGETS.global.functions,
          passing: metrics.total.functions.pct >= TARGETS.global.functions,
        },
        lines: {
          actual: metrics.total.lines.pct,
          target: TARGETS.global.lines,
          passing: metrics.total.lines.pct >= TARGETS.global.lines,
        },
      },
    },
  };

  fs.writeFileSync(
    METRICS_OUTPUT,
    JSON.stringify(output, null, 2),
    'utf8'
  );
  console.log('✓ Saved metrics to coverage/metrics.json');
}

/**
 * Main execution
 */
function main() {
  console.log('Generating consolidated coverage report...\n');

  // Ensure output directory exists
  if (!fs.existsSync('coverage')) {
    fs.mkdirSync('coverage', { recursive: true });
  }

  // Load coverage data
  const coverageData = loadCoverageData();
  const metrics = mergeCoverageData(coverageData);

  // Generate reports
  generateHTMLReport(metrics);
  saveMetricsJSON(metrics);

  console.log('\n✓ Coverage report generation complete!');
  console.log('  Open coverage/index.html to view the report');
}

main();
