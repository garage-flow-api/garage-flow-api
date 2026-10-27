import http from 'k6/http';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 500 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

export default function loadTest() {
  http.get(`${BASE_URL}/health`);
}
