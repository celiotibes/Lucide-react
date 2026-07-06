import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 50 },
    { duration: '5m', target: 50 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{type:read}': ['p(95)<100'],
    'http_req_duration{type:create}': ['p(95)<200'],
    'http_req_failed': ['rate<0.001'],
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

  // 30% - Calendar read queries
  if (Math.random() < 0.3) {
    const calRes = http.get(
      `${API_URL}/api/properties/${PROPERTY_ID}/calendar?startDate=2026-07-01&endDate=2026-12-31`,
      { headers, tags: { type: 'read' } }
    );

    check(calRes, {
      'calendar fetch status': (r) => r.status === 200 || r.status === 401,
    });
  }
  // 20% - Calendar filter queries
  else if (Math.random() < 0.5) {
    const filterRes = http.get(
      `${API_URL}/api/properties/${PROPERTY_ID}/calendar?startDate=2026-07-15&endDate=2026-07-30`,
      { headers, tags: { type: 'read' } }
    );

    check(filterRes, {
      'calendar filter status': (r) => r.status === 200 || r.status === 401,
    });
  }
  // 50% - Booking creation
  else {
    const checkIn = '2026-07-15';
    const checkOut = '2026-07-18';
    const bookRes = http.post(
      `${API_URL}/api/properties/${PROPERTY_ID}/bookings`,
      JSON.stringify({
        guestName: `Guest ${Math.random()}`,
        guestEmail: `guest${Math.random()}@test.com`,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        numberOfGuests: 2,
      }),
      { headers, tags: { type: 'create' } }
    );

    check(bookRes, {
      'booking create status': (r) => r.status === 201 || r.status === 400 || r.status === 401,
    });
  }

  sleep(1);
}
