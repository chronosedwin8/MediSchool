// Node load test (no k6 required): N concurrent virtual users hitting the live board,
// student search and statistics for a fixed duration. Usage:
//   node scripts/load-test.mjs [users=300] [seconds=60] [baseUrl=http://localhost:4000/api/v1]
const USERS = Number(process.argv[2] ?? 300);
const SECONDS = Number(process.argv[3] ?? 60);
const BASE = process.argv[4] ?? 'http://localhost:4000/api/v1';
const PASSWORD = process.env.SEED_PASSWORD ?? 'MediSchool2026!';

async function login(email) {
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return (await r.json()).accessToken;
}

const nurse = await login('enfermera1@colegio-demo.test');
const director = await login('directivo@colegio-demo.test');
const teacher = await login('docente@colegio-demo.test');
const cls = await (await fetch(`${BASE}/teacher/class`, { headers: { Authorization: `Bearer ${teacher}` } })).json();
const students = cls.flatMap((g) => g.students.map((s) => s.id));

const lat = [];
const statuses = {};
let ok = 0;
let fail = 0;
let limited = 0;
let passes = 0;
const deadline = Date.now() + SECONDS * 1000;
const queries = ['ma', 'lu', 'jo', 'an', 'sa'];

async function timed(url, init) {
  const t = performance.now();
  try {
    const r = await fetch(url, init);
    await r.arrayBuffer();
    statuses[r.status] = (statuses[r.status] ?? 0) + 1;
    if (r.status === 429) {
      limited++;
      return;
    }
    lat.push(performance.now() - t);
    if (r.ok || r.status === 409) ok++;
    else fail++;
  } catch {
    fail++;
  }
}

async function vu(i) {
  while (Date.now() < deadline) {
    const roll = Math.random();
    if (roll < 0.5) await timed(`${BASE}/passes/board`, { headers: { Authorization: `Bearer ${nurse}` } });
    else if (roll < 0.85) await timed(`${BASE}/students?q=${queries[i % queries.length]}&limit=10`, { headers: { Authorization: `Bearer ${nurse}` } });
    else if (roll < 0.97) await timed(`${BASE}/stats/dashboard`, { headers: { Authorization: `Bearer ${director}` } });
    else {
      passes++;
      await timed(`${BASE}/passes`, { method: 'POST', headers: { Authorization: `Bearer ${teacher}`, 'Content-Type': 'application/json', 'Idempotency-Key': `load-${i}-${Date.now()}-${Math.random().toString(36).slice(2)}` }, body: JSON.stringify({ studentId: students[Math.floor(Math.random() * students.length)], reason: 'Prueba de carga', urgency: 'LOW' }) });
    }
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 1500));
  }
}

console.log(`Carga: ${USERS} usuarios virtuales durante ${SECONDS}s contra ${BASE}`);
await Promise.all(Array.from({ length: USERS }, (_, i) => vu(i)));
lat.sort((a, b) => a - b);
const p = (q) => Math.round(lat[Math.min(lat.length - 1, Math.floor(lat.length * q))]);
const total = ok + fail;
console.log(JSON.stringify({ requests: total, rps: Math.round(total / SECONDS), ok, fail, errorRate: `${((fail / Math.max(1, total)) * 100).toFixed(2)}%`, rateLimited: limited, statuses, passesIssued: passes, p50ms: p(0.5), p95ms: p(0.95), p99ms: p(0.99) }, null, 2));
if (limited) console.warn(`Aviso: ${limited} respuestas 429. Esta prueba concentra la carga en 3 cuentas; arranque la API con API_RATE_LIMIT alto para medir capacidad.`);
process.exit(fail / Math.max(1, total) > 0.01 ? 1 : 0);
