import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const responseTimes = new Trend('response_times');
const requestCount = new Counter('requests');
const activeVUsers = new Gauge('active_vusers');

export const options = {
  stages: [
    // Ramp-up: 30 seconds to reach 10 VUs
    { duration: '30s', target: 10 },
    // Stay at 10 VUs for 2 minutes
    { duration: '2m', target: 10 },
    // Ramp-down: 30 seconds back to 0
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    // Response time SLA: 95% of requests must complete below 500ms
    'response_times{staticAsset:yes}': ['p(95)<500'],
    'response_times{staticAsset:no}': ['p(95)<500'],
    // Error rate: max 1%
    'errors': ['rate<0.01'],
    // HTTP requests: 99% success
    'http_req_failed': ['rate<0.01'],
  },
  ext: {
    loadimpact: {
      projectID: 3478313,
      name: 'Lucide React Load Test',
    },
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5173';

// Track VU count
export function setup() {
  console.log(`Starting load test against ${BASE_URL}`);
  return { startTime: new Date() };
}

export default function (data) {
  activeVUsers.add(1);

  // Test 1: GET /api/relatorios (Reports endpoint)
  group('Reports API', () => {
    const reportParams = {
      headers: {
        'Content-Type': 'application/json',
      },
      tags: { name: 'GetReports', staticAsset: 'no' },
    };

    const reportResponse = http.get(`${BASE_URL}/api/relatorios`, reportParams);
    const reportSuccess = check(reportResponse, {
      'status is 200': (r) => r.status === 200,
      'response time < 500ms': (r) => r.timings.duration < 500,
      'response has data': (r) => r.body.length > 0,
    });

    if (!reportSuccess) {
      errorRate.add(1);
      console.error(`Reports API error: ${reportResponse.status}`);
    } else {
      errorRate.add(0);
    }

    responseTimes.add(reportResponse.timings.duration, { endpoint: 'relatorios' });
    requestCount.add(1);
  });

  sleep(1);

  // Test 2: POST /api/cobrancas (Create charge endpoint)
  group('Create Charge API', () => {
    const chargeData = JSON.stringify({
      customer: `customer-${Date.now()}`,
      amount: Math.floor(Math.random() * 10000) + 100,
      description: 'Load test charge',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });

    const chargeParams = {
      headers: {
        'Content-Type': 'application/json',
      },
      tags: { name: 'CreateCharge', staticAsset: 'no' },
    };

    const chargeResponse = http.post(`${BASE_URL}/api/cobrancas`, chargeData, chargeParams);
    const chargeSuccess = check(chargeResponse, {
      'status is 200 or 201': (r) => r.status === 200 || r.status === 201,
      'response time < 500ms': (r) => r.timings.duration < 500,
      'response has ID': (r) => r.body.includes('id') || r.body.includes('_id'),
    });

    if (!chargeSuccess) {
      errorRate.add(1);
      console.error(`Create Charge API error: ${chargeResponse.status}`);
    } else {
      errorRate.add(0);
    }

    responseTimes.add(chargeResponse.timings.duration, { endpoint: 'cobrancas' });
    requestCount.add(1);
  });

  sleep(1);

  // Test 3: GET /api/anomalias (Anomalies/Alerts endpoint)
  group('Anomalies API', () => {
    const anomaliesParams = {
      headers: {
        'Content-Type': 'application/json',
      },
      tags: { name: 'GetAnomalies', staticAsset: 'no' },
    };

    const anomaliesResponse = http.get(`${BASE_URL}/api/anomalias`, anomaliesParams);
    const anomaliesSuccess = check(anomaliesResponse, {
      'status is 200': (r) => r.status === 200,
      'response time < 500ms': (r) => r.timings.duration < 500,
      'response is valid': (r) => r.body.length > 0 || r.status === 200,
    });

    if (!anomaliesSuccess) {
      errorRate.add(1);
      console.error(`Anomalies API error: ${anomaliesResponse.status}`);
    } else {
      errorRate.add(0);
    }

    responseTimes.add(anomaliesResponse.timings.duration, { endpoint: 'anomalias' });
    requestCount.add(1);
  });

  sleep(2);

  activeVUsers.add(-1);
}

export function teardown(data) {
  const endTime = new Date();
  console.log(`Load test completed`);
}
