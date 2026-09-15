// k6 run infra/k6/load.js  (PLAN §11: 300 concurrent users, live board with 200 passes/hour)
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:4000/api/v1';
const PASSWORD = __ENV.SEED_PASSWORD || 'MediSchool2026!';

export const options = {
  scenarios: {
    readers: { executor: 'constant-vus', vus: 280, duration: '3m', exec: 'browse' },
    teachers: { executor: 'constant-arrival-rate', rate: 200, timeUnit: '1h', duration: '3m', preAllocatedVUs: 20, exec: 'issuePass' },
  },
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<800'] },
};

export function setup() {
  const login = (email) => http.post(`${BASE}/auth/login`, JSON.stringify({ email, password: PASSWORD }), { headers: { 'Content-Type': 'application/json' } }).json('accessToken');
  const nurse = login('enfermera1@colegio-demo.test');
  const teacher = login('docente@colegio-demo.test');
  const director = login('directivo@colegio-demo.test');
  const cls = http.get(`${BASE}/teacher/class`, { headers: { Authorization: `Bearer ${teacher}` } }).json();
  const students = cls.flatMap((g) => g.students.map((s) => s.id));
  return { nurse, teacher, director, students };
}

export function browse(data) {
  const h = { headers: { Authorization: `Bearer ${data.nurse}` } };
  check(http.get(`${BASE}/passes/board`, h), { board: (r) => r.status === 200 });
  check(http.get(`${BASE}/students?q=ma&limit=10`, h), { search: (r) => r.status === 200 });
  if (Math.random() < 0.1) check(http.get(`${BASE}/stats/dashboard`, { headers: { Authorization: `Bearer ${data.director}` } }), { stats: (r) => r.status === 200 });
  sleep(1 + Math.random() * 2);
}

export function issuePass(data) {
  const studentId = data.students[Math.floor(Math.random() * data.students.length)];
  const r = http.post(`${BASE}/passes`, JSON.stringify({ studentId, reason: 'Prueba de carga', urgency: 'LOW' }), {
    headers: { Authorization: `Bearer ${data.teacher}`, 'Content-Type': 'application/json', 'Idempotency-Key': `k6-${__VU}-${__ITER}-${Date.now()}` },
  });
  check(r, { pass: (res) => res.status === 201 || res.status === 409 });
}
