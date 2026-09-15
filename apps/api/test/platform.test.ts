import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { redact } from '../src/common/audit.service';
import { canonicalJson, Encryptor, hashSecret, verifySecret } from '../src/common/crypto';
import { ComplianceService } from '../src/modules/compliance/compliance.service';
import { NotificationDispatcher } from '../src/modules/comms/notify.service';
import { PublicHealthService } from '../src/modules/public-health/public-health.service';
import { admin, bearer, idem, setupWorld, type World } from './world';

describe('crypto & redaction', () => {
  it('encrypts with AES-256-GCM and detects tampering', () => {
    const enc = new Encryptor(Buffer.alloc(32, 7).toString('base64'));
    const c = enc.encrypt('dato sensible');
    expect(enc.decrypt(c).toString()).toBe('dato sensible');
    c[c.length - 1] ^= 1;
    expect(() => enc.decrypt(c)).toThrow();
  });

  it('hashes passwords with scrypt', async () => {
    const h = await hashSecret('Secreta-2026');
    expect(await verifySecret('Secreta-2026', h)).toBe(true);
    expect(await verifySecret('otra', h)).toBe(false);
  });

  it('redacts secrets and clinical free text from audit entries', () => {
    expect(redact({ password: 'x', subjective: 'dolor fuerte', code: 'R51', nested: { otp: '123456' } })).toEqual({ password: '[redacted]', subjective: '[texto 12 car.]', code: 'R51', nested: { otp: '[redacted]' } });
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
  });
});

describe('platform services', () => {
  let w: World;
  beforeAll(async () => {
    w = await setupWorld();
  });
  afterAll(() => w.app.close());

  it('health endpoint and OpenAPI document are available', async () => {
    expect((await w.http().get('/api/v1/health')).body.status).toBe('ok');
    const metrics = await w.http().get('/api/v1/metrics');
    expect(metrics.text).toContain('sgee_notifications_queued');
  });

  it('dispatches in-app and e-mail (outbox) notifications', async () => {
    const t = await w.token(w.A.users.teacher.email);
    await w.http().post('/api/v1/passes').set(bearer(t)).set('Idempotency-Key', idem()).send({ studentId: w.A.students.a1.id, reason: 'Dolor', urgency: 'HIGH' }).expect(201);
    const sent = await w.app.get(NotificationDispatcher).dispatchPending();
    expect(sent).toBeGreaterThan(0);
    const nurseInbox = await w.http().get('/api/v1/notifications').set(bearer(await w.token(w.A.users.nurse.email)));
    expect(nurseInbox.body.unread).toBeGreaterThan(0);
    expect(await admin.notification.count({ where: { tenantId: w.A.id, status: 'QUEUED', scheduledFor: { lte: new Date() } } })).toBe(0);
  });

  it('parent portal aggregates today status, completeness and pending consents', async () => {
    const parent = await w.token(w.A.users.parent.email);
    const home = await w.http().get('/api/v1/portal/home').set(bearer(parent));
    expect(home.status).toBe(200);
    expect(home.body.children).toHaveLength(1);
    expect(home.body.children[0].pendingConsents).toBe(1);
    expect(home.body.children[0].today.openPass.state).toBe('IN_TRANSIT');
  });

  it('detects outbreaks by attack rate within a group', async () => {
    const nurse = await w.token(w.A.users.nurse.email);
    for (const s of [w.A.students.a1, w.A.students.a2]) {
      const e = await w.http().post('/api/v1/encounters').set(bearer(nurse)).set('Idempotency-Key', idem()).send({ subjectType: 'STUDENT', studentId: s.id, type: 'ILLNESS', chiefComplaint: 'Náuseas / vómito' });
      expect(e.status).toBe(201);
    }
    const adminToken = await w.token(w.A.users.admin.email);
    await w.http().put('/api/v1/admin/settings').set(bearer(adminToken)).send({ settings: { outbreak: { windowDays: 7, minCases: 2, attackRatePct: 50 } } }).expect(200);
    const r = await w.app.get(PublicHealthService).runOutbreakDetection(w.A.id);
    expect(r.created).toBeGreaterThanOrEqual(1);
    const signal = await admin.outbreakSignal.findFirstOrThrow({ where: { tenantId: w.A.id } });
    expect(signal).toMatchObject({ syndrome: 'GASTROINTESTINAL', cases: 2, population: 2, attackRatePct: 100 });
    expect((await w.app.get(PublicHealthService).runOutbreakDetection(w.A.id)).created).toBe(0);
  });

  it('statistics are anonymized for directors', async () => {
    const director = await w.token(w.A.users.director.email);
    const d = await w.http().get('/api/v1/stats/dashboard').set(bearer(director));
    expect(d.status).toBe(200);
    expect(d.body.anonymized).toBe(true);
    expect(d.body.frequent.every((f: { studentId: string | null; name: string }) => f.studentId === null && f.name.startsWith('Estudiante'))).toBe(true);
    const csv = await w.http().get('/api/v1/stats/export/encounters?format=csv').set(bearer(director));
    expect(csv.status).toBe(200);
    expect(csv.text).not.toContain('Ana Prueba');
    expect((await w.http().get('/api/v1/stats/export/administrations?format=csv').set(bearer(director))).status).toBe(403);
  });

  it('retention never deletes clinical data and honors legal holds', async () => {
    const coordinator = await w.token(w.A.users.coordinator.email);
    await admin.person.update({ where: { id: w.A.students.a2.personId }, data: { status: 'INACTIVE' } });
    await admin.$executeRaw`ALTER TABLE clinical.encounters DISABLE TRIGGER encounter_guard`;
    await admin.$executeRaw`UPDATE clinical.encounters SET started_at = now() - interval '20 years' WHERE person_id = ${w.A.students.a2.personId}::uuid`;
    await admin.$executeRaw`ALTER TABLE clinical.encounters ENABLE TRIGGER encounter_guard`;
    await w.http().post('/api/v1/legal-holds').set(bearer(coordinator)).send({ personId: w.A.students.a2.personId, reason: 'Proceso judicial en curso' }).expect(201);
    const before = await admin.encounter.count({ where: { personId: w.A.students.a2.personId } });
    const r = await w.app.get(ComplianceService).retention(w.A.id);
    expect(r.flagged).toBe(1);
    expect((await admin.retentionFlag.findFirstOrThrow({ where: { tenantId: w.A.id } })).status).toBe('HELD');
    expect(await admin.encounter.count({ where: { personId: w.A.students.a2.personId } })).toBe(before);
  });

  it('exports a data subject record for portability (ARCO)', async () => {
    const parent = await w.token(w.A.users.parent.email);
    const dsr = await w.http().post('/api/v1/dsr').set(bearer(parent)).send({ type: 'PORTABILITY', subjectPersonId: w.A.students.a1.personId, description: 'Solicito copia de los datos de mi hija' });
    expect(dsr.status).toBe(201);
    expect(new Date(dsr.body.dueAt).getTime()).toBeGreaterThan(Date.now() + 14 * 86400000);
    const coordinator = await w.token(w.A.users.coordinator.email);
    const exp = await w.http().post(`/api/v1/persons/${w.A.students.a1.personId}/export?dsrId=${dsr.body.id}`).set(bearer(coordinator));
    expect(exp.status).toBe(200);
    const file = await w.http().get(`/api/v1/files/${exp.body.fileId}`).set(bearer(coordinator));
    const json = JSON.parse(file.text);
    expect(json.format).toBe('SGEE-portability/1.0');
    expect(json.person.id).toBe(w.A.students.a1.personId);
  });
});
