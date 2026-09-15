import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FlowService } from '../src/modules/flow/flow.service';
import { admin, bearer, idem, setupWorld, type World } from './world';

let w: World;
beforeAll(async () => {
  w = await setupWorld();
});
afterAll(() => w.app.close());

describe('Classroom → nursing → guardian → gate (full trace)', () => {
  let passId = '';
  let encounterId = '';
  let exitId = '';
  let token = '';

  it('teacher issues a pass in two taps (idempotent)', async () => {
    const t = await w.token(w.A.users.teacher.email);
    const key = idem();
    const body = { studentId: w.A.students.a1.id, reason: 'Dolor de cabeza', urgency: 'MEDIUM' };
    const res = await w.http().post('/api/v1/passes').set(bearer(t)).set('Idempotency-Key', key).send(body);
    expect(res.status).toBe(201);
    expect(res.body.state).toBe('IN_TRANSIT');
    expect(res.body.subject).toBe('Matemáticas');
    passId = res.body.id;

    const replay = await w.http().post('/api/v1/passes').set(bearer(t)).set('Idempotency-Key', key).send(body);
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(replay.body.id).toBe(passId);
    expect(await admin.pass.count({ where: { tenantId: w.A.id } })).toBe(1);

    const reused = await w.http().post('/api/v1/passes').set(bearer(t)).set('Idempotency-Key', key).send({ ...body, reason: 'Otro' });
    expect(reused.status).toBe(422);
    expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect((await w.http().post('/api/v1/passes').set(bearer(t)).send(body)).body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const dup = await w.http().post('/api/v1/passes').set(bearer(t)).set('Idempotency-Key', idem()).send(body);
    expect(dup.body.code).toBe('PASS_ALREADY_OPEN');
  });

  it('forbids transitions outside the actor role and the state machine', async () => {
    const teacher = await w.token(w.A.users.teacher.email);
    const r = await w.http().post(`/api/v1/passes/${passId}/transition`).set(bearer(teacher)).send({ to: 'RECEIVED' });
    expect(r.status).toBe(403);
    const nurse = await w.token(w.A.users.nurse.email);
    const bad = await w.http().post(`/api/v1/passes/${passId}/transition`).set(bearer(nurse)).send({ to: 'HANDED_OVER' });
    expect(bad.status).toBe(409);
    await expect(admin.$executeRaw`UPDATE flow.passes SET state = 'CLOSED' WHERE id = ${passId}::uuid`).rejects.toThrow(/SGEE_INVALID_TRANSITION/);
  });

  it('nurse receives the student and documents the encounter', async () => {
    const t = await w.token(w.A.users.nurse.email);
    const res = await w.http().post('/api/v1/encounters').set(bearer(t)).set('Idempotency-Key', idem()).send({ subjectType: 'STUDENT', studentId: w.A.students.a1.id, passId, type: 'ILLNESS', chiefComplaint: 'Cefalea' });
    expect(res.status).toBe(201);
    encounterId = res.body.id;
    expect((await w.http().get(`/api/v1/passes/${passId}`).set(bearer(t))).body.state).toBe('IN_CARE');

    const vit = await w.http().post(`/api/v1/encounters/${encounterId}/vitals`).set(bearer(t)).send({ temperatureC: 39.9, heartRate: 95 });
    expect(vit.status).toBe(201);
    expect(vit.body.worst).toBe('critical');
    await w.http().patch(`/api/v1/encounters/${encounterId}`).set(bearer(t)).send({ assessment: 'Cefalea con fiebre', diagnoses: [{ system: 'ICD10', code: 'R51', description: 'Cefalea', primary: true }] }).expect(200);
  });

  it('closes with guardian pickup and signs (hash chain)', async () => {
    const t = await w.token(w.A.users.nurse.email);
    const res = await w.http().post(`/api/v1/encounters/${encounterId}/close`).set(bearer(t)).set('Idempotency-Key', idem()).send({ disposition: 'GUARDIAN_PICKUP', parentSummary: 'Fiebre; se recomienda reposo en casa.' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CLOSED');
    expect(res.body.hash).toMatch(/^[0-9a-f]{64}$/);
    expect((await w.http().get(`/api/v1/passes/${passId}`).set(bearer(t))).body.state).toBe('WAITING_GUARDIAN');
  });

  it('authorizes the exit and notifies the guardian with a signed single-use link', async () => {
    const t = await w.token(w.A.users.nurse.email);
    const res = await w.http().post('/api/v1/exit-authorizations').set(bearer(t)).set('Idempotency-Key', idem()).send({ passId, reason: 'Retiro por fiebre', guardianIds: [] });
    expect(res.status).toBe(201);
    expect(res.body.links).toHaveLength(1);
    exitId = res.body.exit.id;
    token = new URL(res.body.links[0].link).searchParams.get('token')!;
    const notifications = await admin.notification.findMany({ where: { userId: w.A.users.parent.id, event: 'EXIT_AUTHORIZATION' } });
    expect(notifications.length).toBeGreaterThan(0);
    for (const n of notifications) expect(n.body).not.toMatch(/fiebre|cefalea/i);
  });

  it('guardian confirms who picks up through the public link', async () => {
    const view = await w.http().get(`/api/v1/public/exit-confirmations/${token}`);
    expect(view.status).toBe(200);
    expect(view.body.options.some((o: { personId: string }) => o.personId === w.A.guardianPersonId)).toBe(true);
    const ok = await w.http().post(`/api/v1/public/exit-confirmations/${token}`).send({ pickupGuardianPersonId: w.A.guardianPersonId, pickupName: 'Pedro Padre', pickupDocument: '123456', pickupRelationship: 'Padre' });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('CONFIRMED');
    const again = await w.http().post(`/api/v1/public/exit-confirmations/${token}`).send({ pickupName: 'Otro', pickupDocument: '999', pickupRelationship: 'Tío' });
    expect(again.status).toBe(410);
    const nurse = await w.token(w.A.users.nurse.email);
    expect((await w.http().get(`/api/v1/passes/${passId}`).set(bearer(nurse))).body.state).toBe('EXIT_AUTHORIZED');
  });

  it('gate verifies identity document and hands over; the pass closes', async () => {
    const t = await w.token(w.A.users.gate.email);
    const queue = await w.http().get('/api/v1/gate/queue').set(bearer(t));
    expect(queue.body.queue.map((q: { id: string }) => q.id)).toContain(exitId);
    const bad = await w.http().post('/api/v1/gate-checkouts').set(bearer(t)).set('Idempotency-Key', idem()).send({ exitAuthorizationId: exitId, method: 'DOCUMENT', verifiedDocument: '999999' });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe('DOCUMENT_MISMATCH');
    const ok = await w.http().post('/api/v1/gate-checkouts').set(bearer(t)).set('Idempotency-Key', idem()).send({ exitAuthorizationId: exitId, method: 'DOCUMENT', verifiedDocument: '123456' });
    expect(ok.status).toBe(201);

    const pass = await admin.pass.findUniqueOrThrow({ where: { id: passId }, include: { events: { orderBy: { createdAt: 'asc' } } } });
    expect(pass.state).toBe('CLOSED');
    expect(pass.events.map((e) => e.toState)).toEqual(['REQUESTED', 'IN_TRANSIT', 'RECEIVED', 'IN_CARE', 'WAITING_GUARDIAN', 'EXIT_AUTHORIZED', 'HANDED_OVER', 'CLOSED']);
    for (const f of ['requestedAt', 'receivedAt', 'inCareAt', 'waitingGuardianAt', 'exitAuthorizedAt', 'handedOverAt', 'closedAt'] as const) expect(pass[f]).toBeTruthy();
    const events = await admin.notification.groupBy({ by: ['event'], where: { userId: w.A.users.parent.id } });
    expect(events.map((e) => e.event)).toEqual(expect.arrayContaining(['ENCOUNTER_CLOSED', 'EXIT_AUTHORIZATION', 'EXIT_COMPLETED']));
  });

  it('raises a transit SLA alert when the student does not arrive', async () => {
    const t = await w.token(w.A.users.teacher.email);
    const created = await w.http().post('/api/v1/passes').set(bearer(t)).set('Idempotency-Key', idem()).send({ studentId: w.A.students.a2.id, reason: 'Mareo', urgency: 'HIGH', clientCreatedAt: new Date(Date.now() - 25 * 60_000).toISOString() });
    expect(created.status).toBe(201);
    const out = await w.app.get(FlowService).slaTick(w.A.id);
    expect(out.transitAlerts).toBe(1);
    const p = await admin.pass.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(p.transitAlertedAt).toBeTruthy();
    expect(await admin.notification.count({ where: { event: 'PASS_TRANSIT_ALERT', userId: w.A.users.teacher.id } })).toBe(1);
    expect((await w.app.get(FlowService).slaTick(w.A.id)).transitAlerts).toBe(0);
  });

  it('voids a pending exit authorization and its link when the pass leaves the pickup path', async () => {
    const nurse = await w.token(w.A.users.nurse.email);
    const pass = (await w.http().get('/api/v1/passes').query({ studentId: w.A.students.a2.id, open: true }).set(bearer(nurse))).body[0];
    const enc = await w.http().post('/api/v1/encounters').set(bearer(nurse)).set('Idempotency-Key', idem()).send({ subjectType: 'STUDENT', studentId: w.A.students.a2.id, passId: pass.id, type: 'ILLNESS', chiefComplaint: 'Mareo' });
    expect(enc.status).toBe(201);
    await w.http().patch(`/api/v1/encounters/${enc.body.id}`).set(bearer(nurse)).send({ assessment: 'Mareo persistente' }).expect(200);
    await w.http().post(`/api/v1/encounters/${enc.body.id}/close`).set(bearer(nurse)).set('Idempotency-Key', idem()).send({ disposition: 'GUARDIAN_PICKUP', notifyGuardians: false }).expect(200);
    const exit = await w.http().post('/api/v1/exit-authorizations').set(bearer(nurse)).set('Idempotency-Key', idem()).send({ passId: pass.id, reason: 'Retiro por mareo', guardianIds: [] });
    expect(exit.status).toBe(201);
    const link = exit.body.links[0]?.link as string | undefined;

    const moved = await w.http().post(`/api/v1/passes/${pass.id}/transition`).set(bearer(nurse)).send({ to: 'TRANSFERRED_IPS', note: 'Empeora; traslado' });
    expect(moved.status).toBe(200);
    expect((await admin.exitAuthorization.findUniqueOrThrow({ where: { id: exit.body.exit.id } })).status).toBe('CANCELLED');
    if (link) expect((await w.http().get(`/api/v1/public/exit-confirmations/${new URL(link).searchParams.get('token')}`)).status).not.toBe(200);
    const gate = await w.token(w.A.users.gate.email);
    const queue = await w.http().get('/api/v1/gate/queue').set(bearer(gate));
    expect(JSON.stringify(queue.body)).not.toContain(exit.body.exit.id);
  });
});
