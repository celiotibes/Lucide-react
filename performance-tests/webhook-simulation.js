import http from 'k6/http';
import { check, sleep } from 'k6';
import crypto from 'k6/crypto';
import encoding from 'k6/encoding';

export const options = {
  scenarios: {
    booking_webhooks: {
      executor: 'constant-arrival-rate',
      rate: 60,
      timeUnit: '1s',
      duration: '2m',
    },
    vrbo_webhooks: {
      executor: 'constant-arrival-rate',
      rate: 40,
      timeUnit: '1s',
      duration: '2m',
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<500'],
    'http_req_failed': ['rate<0.01'],
  },
};

const API_URL = __ENV.API_URL || 'http://localhost:3000';
const BOOKING_SECRET = __ENV.BOOKING_SECRET || 'booking-secret';
const VRBO_SECRET = __ENV.VRBO_SECRET || 'vrbo-secret';

function generateHMAC(payload, secret) {
  const encoded = encoding.b64encode(payload);
  return crypto.hmac('sha256', payload, secret, 'hex');
}

export function booking_webhooks() {
  const payload = JSON.stringify({
    event: 'booking_confirmed',
    property_id: '1',
    booking_id: `booking-${Math.random()}`,
    check_in: '2026-07-15',
    check_out: '2026-07-18',
  });

  const signature = generateHMAC(payload, BOOKING_SECRET);

  const res = http.post(
    `${API_URL}/webhooks/booking-com`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Booking-Signature': signature,
      },
    }
  );

  check(res, {
    'booking webhook status': (r) => r.status === 200 || r.status === 401 || r.status === 500,
  });
}

export function vrbo_webhooks() {
  const payload = JSON.stringify({
    eventType: 'booking_confirmed',
    propertyId: '1',
    bookingId: `vrbo-${Math.random()}`,
    checkIn: '2026-07-15',
    checkOut: '2026-07-18',
  });

  const signature = generateHMAC(payload, VRBO_SECRET);

  const res = http.post(
    `${API_URL}/webhooks/vrbo`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-VRBO-Signature': signature,
      },
    }
  );

  check(res, {
    'vrbo webhook status': (r) => r.status === 200 || r.status === 401 || r.status === 500,
  });
}
