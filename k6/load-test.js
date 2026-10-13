import http from 'k6/http';

export const options = {
  vus: 500,
  duration: '1m',
};

export default function () {
  http.get('http://localhost:30080/health');
}