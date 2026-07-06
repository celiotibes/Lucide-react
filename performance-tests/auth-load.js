import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 10 },
    { duration: '5m', target: 10 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<200', 'p(99)<500'],
    'http_req_failed': ['rate<0.001'],
  },
};

const API_URL = __ENV.API_URL || 'http://localhost:3000';
let authToken = '';

export default function () {
  // Signup
  const signupRes = http.post(`${API_URL}/auth/signup`, JSON.stringify({
    email: `user${Math.random()}@test.com`,
    password: 'TestPassword123!',
    fullName: 'Test User',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(signupRes, {
    'signup status 201': (r) => r.status === 201 || r.status === 409,
  });

  if (signupRes.status === 201) {
    authToken = signupRes.json('token');
  }

  // Login
  const loginRes = http.post(`${API_URL}/auth/login`, JSON.stringify({
    email: 'test@example.com',
    password: 'password123',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(loginRes, {
    'login status 200': (r) => r.status === 200,
    'has token': (r) => r.json('token') !== undefined,
  });

  if (loginRes.status === 200) {
    authToken = loginRes.json('token');
  }

  // Verify token
  if (authToken) {
    const meRes = http.get(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    check(meRes, {
      'me status 200': (r) => r.status === 200,
    });
  }

  sleep(1);
}
