import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Métricas customizadas
const errorRate = new Rate('soak_errors');
const responseTime = new Trend('soak_response_time');
const requestCounter = new Counter('soak_requests');
const successCounter = new Counter('soak_success');

export const options = {
  stages: [
    { duration: '5m', target: 10 },    // Aquecimento
    { duration: '30m', target: 20 },   // Soak test por 30 minutos
    { duration: '5m', target: 0 },     // Cool down
  ],
  thresholds: {
    soak_errors: ['rate<0.05'],        // < 5% de erro
    soak_response_time: ['p(95)<1000', 'p(99)<2000'], // P95 < 1s, P99 < 2s
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api';

export function setup() {
  console.log('🧪 Iniciando Soak Test (teste de resistência)...');
  console.log('Duração: 30 minutos com 20 usuários simultâneos');

  // Create a single property for all requests
  const propertyRes = http.post(`${BASE_URL}/properties`, JSON.stringify({
    address: 'Rua Soak Test',
    city: 'Florianópolis',
    state: 'SC',
    type: 'kitnet',
    area_m2: 22.5,
    bedrooms: 1,
    bathrooms: 1,
    base_monthly_rent: 2000,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  const propertyId = propertyRes.json().id;
  console.log(`✅ Property de teste criada: ${propertyId}`);

  // Create a listing
  const listingRes = http.post(`${BASE_URL}/listings`, JSON.stringify({
    property_id: propertyId,
    platform: 'airbnb',
    title: 'Kitnet Soak Test',
    description: 'Teste de resistência',
    highlights: ['WiFi', 'Ar condicionado'],
    base_price: 50,
    price_strategy: 'static',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  const listingId = listingRes.json().id;
  console.log(`✅ Listing de teste criada: ${listingId}`);

  return { propertyId, listingId };
}

export default function (data) {
  const propertyId = data.propertyId;
  const listingId = data.listingId;

  // Simular padrão realista de uso
  const scenario = Math.random();

  if (scenario < 0.4) {
    // 40% - Browsing de propriedades
    group('Soak - Browse Properties', () => {
      const res = http.get(`${BASE_URL}/properties?limit=20&offset=0`);
      requestCounter.add(1);
      check(res, {
        'status 200': (r) => r.status === 200,
        'response time < 1s': (r) => r.timings.duration < 1000,
      });
      if (res.status === 200) successCounter.add(1);
      else errorRate.add(1);
      responseTime.add(res.timings.duration);
    });
  } else if (scenario < 0.6) {
    // 20% - Visualizar detalhes de propriedade
    group('Soak - Property Details', () => {
      const res = http.get(`${BASE_URL}/properties/${propertyId}`);
      requestCounter.add(1);
      check(res, {
        'status 200': (r) => r.status === 200,
      });
      if (res.status === 200) successCounter.add(1);
      else errorRate.add(1);
      responseTime.add(res.timings.duration);
    });
  } else if (scenario < 0.8) {
    // 20% - Verificar anúncios
    group('Soak - Check Listings', () => {
      const res = http.get(`${BASE_URL}/properties/${propertyId}/listings`);
      requestCounter.add(1);
      check(res, {
        'status 200': (r) => r.status === 200,
      });
      if (res.status === 200) successCounter.add(1);
      else errorRate.add(1);
      responseTime.add(res.timings.duration);
    });
  } else {
    // 20% - Verificar performance de anúncio
    group('Soak - Listing Performance', () => {
      const res = http.get(`${BASE_URL}/listings/${listingId}/performance`);
      requestCounter.add(1);
      check(res, {
        'status 200': (r) => r.status === 200,
      });
      if (res.status === 200) successCounter.add(1);
      else errorRate.add(1);
      responseTime.add(res.timings.duration);
    });
  }

  sleep(Math.random() * 3 + 1); // Sleep between 1-4 seconds
}

export function teardown(data) {
  console.log('\n✅ Soak test completo, limpando dados...');
  http.del(`${BASE_URL}/listings/${data.listingId}`);
  http.del(`${BASE_URL}/properties/${data.propertyId}`);
}
