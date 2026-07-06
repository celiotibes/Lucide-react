import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 500 },
    { duration: '5m', target: 500 },
    { duration: '3m', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],
    'http_req_failed': ['rate<0.01'],
  },
};

const API_URL = __ENV.API_URL || 'http://localhost:3000';

export default function () {
  const userId = `user-${__VU}-${Math.random()}`;
  const authToken = __ENV.AUTH_TOKEN || 'test-token';

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
  };

  // Simulate user journey

  // 1. Fetch properties
  const propsRes = http.get(`${API_URL}/api/properties`, { headers });
  check(propsRes, {
    'properties fetch': (r) => r.status === 200 || r.status === 401,
  });

  sleep(1);

  // 2. View calendar
  const calRes = http.get(
    `${API_URL}/api/properties/1/calendar?startDate=2026-07-01&endDate=2026-08-31`,
    { headers }
  );

  check(calRes, {
    'calendar fetch': (r) => r.status === 200 || r.status === 401,
  });

  sleep(1);

  // 3. Check pricing
  const pricingRes = http.post(
    `${API_URL}/api/properties/1/pricing/calculate`,
    JSON.stringify({
      checkInDate: '2026-07-15',
      checkOutDate: '2026-07-18',
    }),
    { headers }
  );

  check(pricingRes, {
    'pricing calculate': (r) => r.status === 200 || r.status === 400 || r.status === 401,
  });

  sleep(1);

  // 4. Create booking (25% of users)
  if (Math.random() < 0.25) {
    const bookRes = http.post(
      `${API_URL}/api/properties/1/bookings`,
      JSON.stringify({
        guestName: `Guest ${__VU}`,
        guestEmail: `guest${__VU}@test.com`,
        checkInDate: '2026-07-15',
        checkOutDate: '2026-07-18',
        numberOfGuests: 2,
      }),
      { headers }
    );

    check(bookRes, {
      'booking create': (r) => r.status === 201 || r.status === 400 || r.status === 401,
    });
  }

  sleep(2);
}
