import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 20 },
    { duration: '3m', target: 20 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{type:calculate}': ['p(95)<200'],
    'http_req_duration{type:forecast}': ['p(95)<300'],
    'http_req_failed': ['rate<0.01'],
  },
};

const API_URL = __ENV.API_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';
const PROPERTY_ID = __ENV.PROPERTY_ID || '1';

export default function () {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${AUTH_TOKEN}`,
  };

  // 70% - Price calculations
  if (Math.random() < 0.7) {
    const calcRes = http.post(
      `${API_URL}/api/properties/${PROPERTY_ID}/pricing/calculate`,
      JSON.stringify({
        checkInDate: '2026-07-15',
        checkOutDate: '2026-07-18',
        currentDate: new Date().toISOString().split('T')[0],
      }),
      { headers, tags: { type: 'calculate' } }
    );

    check(calcRes, {
      'pricing calculate status': (r) => r.status === 200 || r.status === 400 || r.status === 401,
    });
  }
  // 30% - Demand forecasting
  else {
    const forecastRes = http.get(
      `${API_URL}/api/properties/${PROPERTY_ID}/pricing/forecast?startDate=2026-07-01&endDate=2026-08-31`,
      { headers, tags: { type: 'forecast' } }
    );

    check(forecastRes, {
      'pricing forecast status': (r) => r.status === 200 || r.status === 400 || r.status === 401,
    });
  }

  sleep(1);
}
