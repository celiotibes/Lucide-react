import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// Custom metrics for detailed analysis
const errorRate = new Rate('errors');
const listingsLatency = new Trend('listings_latency');
const propertiesLatency = new Trend('properties_latency');
const pricingLatency = new Trend('pricing_latency');
const leadsLatency = new Trend('leads_latency');
const syncLatency = new Trend('sync_latency');
const requestCounter = new Counter('total_requests');
const successCounter = new Counter('successful_requests');

// Options for load test
export const options = {
  stages: [
    { duration: '2m', target: 10 },   // Ramp up to 10 users
    { duration: '5m', target: 50 },   // Ramp up to 50 users
    { duration: '5m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 50 },   // Ramp down to 50 users
    { duration: '2m', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    errors: ['rate<0.1'],              // Error rate should be below 10%
    listings_latency: ['p(95)<500'],   // 95th percentile latency < 500ms
    properties_latency: ['p(95)<500'],
    pricing_latency: ['p(95)<1000'],   // Pricing can be slower (1s)
    leads_latency: ['p(95)<600'],
    sync_latency: ['p(95)<2000'],      // Sync can be slower (2s)
    'http_req_duration': ['p(95)<1000'], // Overall p95 < 1s
  },
};

// Base URL for API
const BASE_URL = __ENV.API_URL || 'http://localhost:3000/api';

// Test data
const testData = {
  propertyIds: [],
  listingIds: [],
  leadIds: [],
};

export function setup() {
  console.log('🔧 Iniciando setup de testes de performance...');

  // Create test property
  const propertyRes = http.post(`${BASE_URL}/properties`, JSON.stringify({
    address: 'Rua Teste Performance 100',
    city: 'Florianópolis',
    state: 'SC',
    type: 'kitnet',
    area_m2: 25.0,
    bedrooms: 1,
    bathrooms: 1,
    base_monthly_rent: 2000,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (propertyRes.status === 201 || propertyRes.status === 200) {
    const property = propertyRes.json();
    testData.propertyIds.push(property.id);
    console.log(`✅ Property criada: ${property.id}`);

    // Create test listings
    for (let i = 0; i < 3; i++) {
      const listingRes = http.post(`${BASE_URL}/listings`, JSON.stringify({
        property_id: property.id,
        platform: ['airbnb', 'booking', 'vrbo'][i],
        title: `Kitnet Test ${i + 1}`,
        description: `Descrição de teste para performance ${i + 1}`,
        highlights: ['WiFi', 'Ar condicionado', 'Cozinha'],
        base_price: 50 + (i * 10),
        price_strategy: 'static',
      }), {
        headers: { 'Content-Type': 'application/json' },
      });

      if (listingRes.status === 201 || listingRes.status === 200) {
        const listing = listingRes.json();
        testData.listingIds.push(listing.id);
        console.log(`✅ Listing criada: ${listing.id} (${['airbnb', 'booking', 'vrbo'][i]})`);
      }
    }

    // Create test leads
    for (let i = 0; i < 5; i++) {
      const leadRes = http.post(`${BASE_URL}/leads`, JSON.stringify({
        property_id: testData.propertyIds[0],
        name: `Lead Teste ${i + 1}`,
        email: `lead${i}@test.com`,
        phone: `(48) 9999-000${i}`,
        source_channel: ['whatsapp', 'facebook', 'website', 'booking', 'airbnb'][i % 5],
        source_campaign: 'performance-test',
      }), {
        headers: { 'Content-Type': 'application/json' },
      });

      if (leadRes.status === 201 || leadRes.status === 200) {
        const lead = leadRes.json();
        testData.leadIds.push(lead.id);
        console.log(`✅ Lead criada: ${lead.id}`);
      }
    }
  }

  console.log(`\n📊 Setup completo com ${testData.propertyIds.length} propriedades, ${testData.listingIds.length} anúncios e ${testData.leadIds.length} leads`);
  return testData;
}

export default function (data) {
  const propertyId = data.propertyIds[0];
  const listingId = data.listingIds[0];
  const leadId = data.leadIds[0];

  // Test 1: List Properties
  group('Properties - List', () => {
    const res = http.get(`${BASE_URL}/properties?limit=50&offset=0`);
    requestCounter.add(1);

    const success = check(res, {
      'status 200': (r) => r.status === 200,
      'has properties': (r) => r.json().properties && r.json().properties.length > 0,
      'response time < 500ms': (r) => r.timings.duration < 500,
    });

    if (success) successCounter.add(1);
    else errorRate.add(1);

    propertiesLatency.add(res.timings.duration);
    sleep(0.5);
  });

  // Test 2: Get Single Property
  group('Properties - Get Detail', () => {
    const res = http.get(`${BASE_URL}/properties/${propertyId}`);
    requestCounter.add(1);

    const success = check(res, {
      'status 200': (r) => r.status === 200,
      'has id': (r) => r.json().id === propertyId,
      'response time < 300ms': (r) => r.timings.duration < 300,
    });

    if (success) successCounter.add(1);
    else errorRate.add(1);

    propertiesLatency.add(res.timings.duration);
    sleep(0.5);
  });

  // Test 3: Get Property Dashboard
  group('Properties - Dashboard', () => {
    const res = http.get(`${BASE_URL}/properties/${propertyId}/dashboard`);
    requestCounter.add(1);

    const success = check(res, {
      'status 200': (r) => r.status === 200,
      'has stats': (r) => r.json().stats !== undefined,
      'response time < 1000ms': (r) => r.timings.duration < 1000,
    });

    if (success) successCounter.add(1);
    else errorRate.add(1);

    propertiesLatency.add(res.timings.duration);
    sleep(0.5);
  });

  // Test 4: List Listings
  group('Listings - List', () => {
    const res = http.get(`${BASE_URL}/properties/${propertyId}/listings`);
    requestCounter.add(1);

    const success = check(res, {
      'status 200': (r) => r.status === 200,
      'has listings': (r) => r.json().listings && r.json().listings.length > 0,
      'response time < 500ms': (r) => r.timings.duration < 500,
    });

    if (success) successCounter.add(1);
    else errorRate.add(1);

    listingsLatency.add(res.timings.duration);
    sleep(0.5);
  });

  // Test 5: Get Listing Performance
  group('Listings - Performance Metrics', () => {
    const res = http.get(`${BASE_URL}/listings/${listingId}/performance`);
    requestCounter.add(1);

    const success = check(res, {
      'status 200': (r) => r.status === 200,
      'has metrics': (r) => r.json().views_count !== undefined,
      'response time < 300ms': (r) => r.timings.duration < 300,
    });

    if (success) successCounter.add(1);
    else errorRate.add(1);

    listingsLatency.add(res.timings.duration);
    sleep(0.5);
  });

  // Test 6: Update Listing Content
  group('Listings - Update Content', () => {
    const res = http.put(`${BASE_URL}/listings/${listingId}/content`, JSON.stringify({
      title: 'Kitnet Atualizada Performance Test',
      description: 'Descrição atualizada via performance test',
      highlights: ['WiFi', 'Ar condicionado', 'Cozinha', 'Banheiro'],
      amenities_text: 'Plenamente equipada',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
    requestCounter.add(1);

    const success = check(res, {
      'status 200': (r) => r.status === 200,
      'updated': (r) => r.json().id === listingId,
      'response time < 500ms': (r) => r.timings.duration < 500,
    });

    if (success) successCounter.add(1);
    else errorRate.add(1);

    listingsLatency.add(res.timings.duration);
    sleep(0.5);
  });

  // Test 7: Get Pricing Analysis
  group('Pricing - Analysis', () => {
    const res = http.get(`${BASE_URL}/pricing/${propertyId}/analysis`);
    requestCounter.add(1);

    const success = check(res, {
      'status 200': (r) => r.status === 200,
      'has recommendations': (r) => r.json().recommendations !== undefined,
      'response time < 1000ms': (r) => r.timings.duration < 1000,
    });

    if (success) successCounter.add(1);
    else errorRate.add(1);

    pricingLatency.add(res.timings.duration);
    sleep(0.5);
  });

  // Test 8: Get Competitive Analysis
  group('Pricing - Competitive Analysis', () => {
    const res = http.get(`${BASE_URL}/pricing/${propertyId}/competitive?city=Florianópolis`);
    requestCounter.add(1);

    const success = check(res, {
      'status 200': (r) => r.status === 200,
      'has competitor data': (r) => r.json().competitorAvg !== undefined,
      'response time < 1500ms': (r) => r.timings.duration < 1500,
    });

    if (success) successCounter.add(1);
    else errorRate.add(1);

    pricingLatency.add(res.timings.duration);
    sleep(0.5);
  });

  // Test 9: Update Listing Price
  group('Pricing - Update', () => {
    const res = http.put(`${BASE_URL}/listings/${listingId}/price`, JSON.stringify({
      base_price: 65,
      strategy: 'dynamic',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
    requestCounter.add(1);

    const success = check(res, {
      'status 200': (r) => r.status === 200,
      'price updated': (r) => r.json().base_price === 65,
      'response time < 500ms': (r) => r.timings.duration < 500,
    });

    if (success) successCounter.add(1);
    else errorRate.add(1);

    pricingLatency.add(res.timings.duration);
    sleep(0.5);
  });

  // Test 10: List Leads
  group('Leads - List', () => {
    const res = http.get(`${BASE_URL}/properties/${propertyId}/leads?limit=50&offset=0`);
    requestCounter.add(1);

    const success = check(res, {
      'status 200': (r) => r.status === 200,
      'has leads': (r) => r.json().leads && r.json().leads.length > 0,
      'response time < 500ms': (r) => r.timings.duration < 500,
    });

    if (success) successCounter.add(1);
    else errorRate.add(1);

    leadsLatency.add(res.timings.duration);
    sleep(0.5);
  });

  // Test 11: Get Lead Funnel Stats
  group('Leads - Funnel Stats', () => {
    const res = http.get(`${BASE_URL}/leads/funnel?property_id=${propertyId}`);
    requestCounter.add(1);

    const success = check(res, {
      'status 200': (r) => r.status === 200,
      'has stats': (r) => r.json().total_leads !== undefined,
      'response time < 500ms': (r) => r.timings.duration < 500,
    });

    if (success) successCounter.add(1);
    else errorRate.add(1);

    leadsLatency.add(res.timings.duration);
    sleep(0.5);
  });

  // Test 12: Update Lead Stage
  group('Leads - Update Stage', () => {
    const res = http.patch(`${BASE_URL}/leads/${leadId}`, JSON.stringify({
      stage: 'contacted',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
    requestCounter.add(1);

    const success = check(res, {
      'status 200': (r) => r.status === 200,
      'stage updated': (r) => r.json().stage === 'contacted',
      'response time < 500ms': (r) => r.timings.duration < 500,
    });

    if (success) successCounter.add(1);
    else errorRate.add(1);

    leadsLatency.add(res.timings.duration);
    sleep(0.5);
  });

  // Test 13: Get Sync Status
  group('Sync - Status', () => {
    const res = http.get(`${BASE_URL}/listings/${listingId}/sync-status`);
    requestCounter.add(1);

    const success = check(res, {
      'status 200': (r) => r.status === 200,
      'has status': (r) => r.json().sync_status !== undefined,
      'response time < 300ms': (r) => r.timings.duration < 300,
    });

    if (success) successCounter.add(1);
    else errorRate.add(1);

    syncLatency.add(res.timings.duration);
    sleep(0.5);
  });
}

export function teardown(data) {
  console.log('\n🧹 Limpando dados de teste...');

  // Delete test leads
  for (const leadId of data.leadIds) {
    http.del(`${BASE_URL}/leads/${leadId}`);
  }

  // Delete test listings
  for (const listingId of data.listingIds) {
    http.del(`${BASE_URL}/listings/${listingId}`);
  }

  // Delete test properties
  for (const propertyId of data.propertyIds) {
    http.del(`${BASE_URL}/properties/${propertyId}`);
  }

  console.log('✅ Dados de teste removidos');
}
