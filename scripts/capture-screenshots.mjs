// Captures the screenshots used by the public home page and the help center
// (apps/web/public/ayuda/capturas). Uses ONLY the synthetic demo school
// (colegio-demo) and blocks every student photo request, so no real student
// data or image can appear in public material.
//
//   node scripts/capture-screenshots.mjs            (web :3100 and API :4000 running)
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const DOMAIN = 'colegio-demo.test';
const PASSWORD = process.env.SEED_PASSWORD ?? 'MediSchool2026!';
const OUT = path.resolve('apps/web/public/ayuda/capturas');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome' });
const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
const MOBILE = { ...devices['Pixel 7'], viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 };
const STYLE = '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important} nextjs-portal{display:none!important}';

async function context(profile) {
  const ctx = await browser.newContext({ ...profile, locale: 'es-CO', timezoneId: 'America/Bogota', colorScheme: 'light' });
  await ctx.route('**/api/v1/students/*/photo**', (r) => r.abort());
  return ctx;
}

async function login(email, profile = DESKTOP) {
  const ctx = await context(profile);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Correo electrónico').fill(`${email}@${DOMAIN}`);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
  return page;
}

async function api(page, method, url, body) {
  const res = await page.request.fetch(`${BASE}/api/v1${url}`, { method, data: body, headers: { 'X-Requested-With': 'sgee', 'Idempotency-Key': `shot-${Date.now()}-${Math.random().toString(36).slice(2)}` } });
  if (!res.ok()) throw new Error(`${method} ${url} → ${res.status()} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function shot(page, name, { settle = 1200 } = {}) {
  await page.addStyleTag({ content: STYLE }).catch(() => undefined);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(settle);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 78 });
  console.log(`  ✓ ${name}.jpg`);
}

const LEFTOVER = { REQUESTED: ['CANCELLED'], IN_TRANSIT: ['CANCELLED'], RECEIVED: ['CANCELLED'], IN_CARE: ['RETURNED_TO_CLASS', 'CLOSED'], OBSERVATION: ['RETURNED_TO_CLASS', 'CLOSED'], RETURNED_TO_CLASS: ['CLOSED'], WAITING_GUARDIAN: ['TRANSFERRED_IPS', 'CLOSED'], EXIT_AUTHORIZED: ['WAITING_GUARDIAN', 'TRANSFERRED_IPS', 'CLOSED'], HANDED_OVER: ['CLOSED'], TRANSFERRED_IPS: ['CLOSED'] };
async function clearStudent(nurse, studentId) {
  const open = await api(nurse, 'GET', `/encounters?studentId=${studentId}&status=OPEN`);
  for (const e of open.items) await api(nurse, 'PATCH', `/encounters/${e.id}`, { assessment: 'Cierre de datos de demostración' }).then(() => api(nurse, 'POST', `/encounters/${e.id}/close`, { disposition: 'RETURN_TO_CLASS', notifyGuardians: false })).catch(() => undefined);
  for (const p of await api(nurse, 'GET', `/passes?studentId=${studentId}&open=true`)) {
    for (const to of LEFTOVER[p.state] ?? []) await api(nurse, 'POST', `/passes/${p.id}/transition`, { to, note: 'Limpieza de datos de demostración' }).catch(() => undefined);
  }
}

console.log(`Capturas → ${OUT}`);

// Public login page
{
  const ctx = await context(DESKTOP);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await shot(page, 'login');
  await ctx.close();
}

const teacher = await login('docente', MOBILE);
const nurse = await login('enfermera1');
const parent = await login('padre', MOBILE);

// Demo activity: a few passes from the teacher's class in different states.
const classes = await api(teacher, 'GET', '/teacher/class');
const free = classes.flatMap((g) => g.students).filter((s) => !s.openPass).slice(0, 4);
const reasons = [['Dolor de cabeza', 'MEDIUM'], ['Golpe / caída', 'HIGH'], ['Malestar estomacal', 'MEDIUM'], ['Fiebre', 'HIGH']];
const created = [];
for (const [i, s] of free.entries()) created.push(await api(teacher, 'POST', '/passes', { studentId: s.id, reason: reasons[i][0], urgency: reasons[i][1] }));
let encounterId = null;
if (created[0]) {
  await api(nurse, 'POST', `/passes/${created[0].id}/transition`, { to: 'RECEIVED' });
  const enc = await api(nurse, 'POST', '/encounters', { subjectType: 'STUDENT', studentId: created[0].student.id, passId: created[0].id, type: 'ILLNESS', chiefComplaint: 'Dolor de cabeza', templateKey: 'headache' });
  encounterId = enc.id;
  await api(nurse, 'POST', `/encounters/${enc.id}/vitals`, { temperatureC: 36.9, heartRate: 92, respiratoryRate: 20, spo2: 98, painScore: 4 });
  await api(nurse, 'PATCH', `/encounters/${enc.id}`, { subjective: 'Refiere cefalea frontal desde el recreo, sin vómito.', objective: 'Alerta, orientado, sin signos meníngeos.', assessment: 'Cefalea tensional leve', diagnoses: [{ system: 'ICD10', code: 'R51', description: 'Cefalea', primary: true }], plan: 'Reposo 20 minutos, hidratación y reevaluación.' });
}
if (created[1]) {
  await api(nurse, 'POST', `/passes/${created[1].id}/transition`, { to: 'RECEIVED' });
  const enc = await api(nurse, 'POST', '/encounters', { subjectType: 'STUDENT', studentId: created[1].student.id, passId: created[1].id, type: 'ACCIDENT', chiefComplaint: 'Golpe / caída', templateKey: 'contusion' });
  await api(nurse, 'POST', `/encounters/${enc.id}/observation`, { minutes: 20, reason: 'Vigilar dolor e inflamación en rodilla' });
}

// Exit flow for the demo parent's child so the gate has someone ready to leave.
const me = await api(parent, 'GET', '/auth/me');
const child = me.children?.[0];
if (child) {
  await clearStudent(nurse, child.id);
  const pass = await api(nurse, 'POST', '/passes', { studentId: child.id, reason: 'Fiebre', urgency: 'HIGH' });
  const enc = await api(nurse, 'POST', '/encounters', { subjectType: 'STUDENT', studentId: child.id, passId: pass.id, type: 'ILLNESS', chiefComplaint: 'Fiebre', templateKey: 'fever' });
  await api(nurse, 'PATCH', `/encounters/${enc.id}`, { assessment: 'Síndrome febril', parentSummary: 'Presentó fiebre; se recomienda valoración y reposo en casa.' });
  await api(nurse, 'POST', `/encounters/${enc.id}/close`, { disposition: 'GUARDIAN_PICKUP', notifyGuardians: false });
  const exit = await api(nurse, 'POST', '/exit-authorizations', { passId: pass.id, reason: 'Requiere retiro por acudiente según valoración de enfermería.', guardianIds: [] });
  await api(parent, 'POST', `/exit-authorizations/${exit.exit.id}/confirm`, { pickupGuardianPersonId: null, pickupName: 'Carmen Rodríguez', pickupDocument: '52123456', pickupRelationship: 'Tía', pickupPhone: null, estimatedArrival: '11:30' });
}

// Nurse screens
await nurse.goto(`${BASE}/enfermeria`);
await nurse.getByRole('heading', { name: 'Tablero en vivo' }).waitFor();
await shot(nurse, 'tablero-enfermeria', { settle: 2500 });
if (encounterId) {
  await nurse.goto(`${BASE}/enfermeria/atenciones/${encounterId}`);
  await nurse.getByText('1. Motivo y tipo').waitFor();
  await shot(nurse, 'atencion-clinica');
}
await nurse.goto(`${BASE}/enfermeria/medicacion`);
await nurse.getByRole('heading', { name: 'Medicación' }).waitFor();
await shot(nurse, 'medicacion-agenda');
await nurse.goto(`${BASE}/enfermeria/inventario`);
await nurse.getByRole('heading', { name: 'Inventario y botiquines' }).waitFor();
await shot(nurse, 'inventario');
await nurse.goto(`${BASE}/estudiantes`);
await nurse.getByRole('heading', { name: 'Estudiantes' }).waitFor();
await shot(nurse, 'estudiantes-lista');
const withAlert = await api(nurse, 'GET', '/students?withAlerts=true&limit=1');
if (withAlert.items[0]) {
  await nurse.goto(`${BASE}/estudiantes/${withAlert.items[0].id}`);
  await nurse.getByRole('tab', { name: 'Resumen' }).waitFor();
  await shot(nurse, 'ficha-estudiante');
  await nurse.getByRole('button', { name: /EMERGENCIA/ }).first().click();
  const dialog = nurse.getByRole('dialog');
  await dialog.getByLabel('Buscar estudiante').fill(withAlert.items[0].name.split(' ')[0]);
  await dialog.getByRole('option').filter({ hasText: withAlert.items[0].name }).first().click();
  await dialog.getByRole('button', { name: 'Llamar al 123' }).waitFor();
  await shot(nurse, 'emergencia');
  await nurse.keyboard.press('Escape');
}
await nurse.goto(`${BASE}/mensajes`);
await nurse.getByRole('heading', { name: 'Mensajes' }).waitFor();
const firstThread = nurse.locator('main ul li button').first();
if (await firstThread.count()) await firstThread.click().catch(() => undefined);
await shot(nurse, 'mensajes');
await nurse.goto(`${BASE}/perfil`);
await nurse.getByRole('heading', { name: 'Mi perfil' }).waitFor();
await shot(nurse, 'perfil');

// Teacher (mobile)
await teacher.goto(`${BASE}/docente`);
await teacher.getByRole('heading', { name: 'Mi clase' }).waitFor();
await shot(teacher, 'docente-mi-clase-movil');
const card = teacher.locator('ul li button:not([disabled])').first();
if (await card.count()) {
  await card.click();
  await teacher.getByRole('button', { name: 'Dolor de cabeza' }).click();
  await shot(teacher, 'docente-pase-movil');
}

// Gate
const gate = await login('porteria');
await gate.goto(`${BASE}/porteria`);
await gate.getByText('Listos para salir').waitFor();
await shot(gate, 'porteria', { settle: 2000 });

// Family (mobile)
await parent.goto(`${BASE}/familia`);
await parent.getByText('Hoy en enfermería').first().waitFor();
await shot(parent, 'familia-inicio-movil');
await parent.goto(`${BASE}/familia/consentimientos`);
await parent.getByRole('heading', { name: 'Consentimientos' }).waitFor();
await shot(parent, 'familia-consentimientos-movil');
if (child) {
  await parent.goto(`${BASE}/familia/salud/${child.id}`);
  await parent.getByText('Datos generales y aseguramiento').waitFor();
  await shot(parent, 'familia-ficha-salud-movil');
}

// Director
const director = await login('directivo');
await director.goto(`${BASE}/estadisticas`);
await director.getByText('Atenciones por día').waitFor({ timeout: 60_000 });
await shot(director, 'estadisticas', { settle: 3000 });

// Coordination
const coordination = await login('coordinacion');
await coordination.goto(`${BASE}/salud-publica`);
await coordination.getByRole('heading', { name: 'Salud pública escolar' }).waitFor();
await shot(coordination, 'salud-publica', { settle: 2000 });

// Administration
const admin = await login('admin');
await admin.goto(`${BASE}/admin`);
await admin.getByRole('button', { name: /Nuevo usuario/ }).waitFor();
await shot(admin, 'admin-usuarios');
for (const [tab, name, marker] of [['Configuración', 'admin-configuracion', 'Guardar configuración'], ['Phidias', 'admin-phidias', 'Sincronización con Phidias'], ['Cumplimiento legal', 'admin-cumplimiento', 'Perfiles por país'], ['Auditoría', 'admin-auditoria', 'Verificar cadena de hash']]) {
  await admin.getByRole('tab', { name: tab }).click();
  await admin.getByText(marker).first().waitFor();
  await shot(admin, name);
}

await browser.close();
console.log('Listo.');
