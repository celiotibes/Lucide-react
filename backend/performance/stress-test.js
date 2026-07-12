import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const errorRate = new Rate('stress_errors');
const responseTime = new Trend('stress_response_time');
const successCounter = new Counter('stress_success');
const cpuUsage = new Gauge('stress_cpu_usage');
const memoryUsage = new Gauge('stress_memory_usage');

export const options = {
  stages: [
    { duration: '2m', target: 50 },    // 50 usuarios
    { duration: '2m', target: 100 },   // 100 usuarios
    { duration: '2m', target: 200 },   // 200 usuarios - encontrar limite
    { duration: '2m', target: 300 },   // 300 usuarios - breaking point
    { duration: '2m', target: 500 },   // 500 usuarios - máximo stress
    { duration: '2m', target: 0 },     // Cool down
  ],
  thresholds: {
    stress_errors: ['rate<0.2'],       // Aceitar até 20% de erro em stress
    stress_response_time: ['p(95)<3000'], // P95 pode ser lento
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api';

export function setup() {
  console.log('💥 Iniciando Stress Test...');
  console.log('Escalando de 50 até 500 usuários para encontrar breaking point');

  const propertyRes = http.post(`${BASE_URL}/properties`, JSON.stringify({
    address: 'Stress Test Property',
    city: 'Florianópolis',
    state: 'SC',
    type: 'kitnet',
    area_m2: 25,
    bedrooms: 1,
    bathrooms: 1,
    base_monthly_rent: 2000,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  const propertyId = propertyRes.json().id;
  const listingId = propertyId + '-listing-1';

  return { propertyId, listingId };
}

export default function (data) {
  const propertyId = data.propertyId;

  // Distribuir carga de forma realista
  group('Stress - Mix of Operations', () => {
    // 70% reads
    if (Math.random() < 0.7) {
      const res = http.get(`${BASE_URL}/properties/${propertyId}`);
      check(res, {
        'status 200': (r) => r.status === 200,
      });
      if (res.status !== 200) errorRate.add(1);
      responseTime.add(res.timings.duration);
    } else {
      // 30% writes
      const res = http.put(`${BASE_URL}/properties/${propertyId}`, JSON.stringify({
        address: `Stress Test Updated ${Date.now()}`,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
      check(res, {
        'status 200': (r) => r.status === 200,
      });
      if (res.status !== 200) errorRate.add(1);
      responseTime.add(res.timings.duration);
    }
  });

  sleep(Math.random() * 2); // 0-2s random think time
}

export function teardown(data) {
  console.log('\n💀 Stress test finalizado');
  http.del(`${BASE_URL}/properties/${data.propertyId}`);
}
