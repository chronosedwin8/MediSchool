import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, bearer, idem, setupWorld, type World } from './world';

let w: World;
let encounterId = '';
beforeAll(async () => {
  w = await setupWorld();
});
afterAll(() => w.app.close());

async function closedEncounter(treatments: unknown[] = []) {
  const t = await w.token(w.A.users.nurse.email);
  const e = await w.http().post('/api/v1/encounters').set(bearer(t)).set('Idempotency-Key', idem()).send({ subjectType: 'STUDENT', studentId: w.A.students.a1.id, type: 'ACCIDENT', chiefComplaint: 'Raspadura' });
  expect(e.status).toBe(201);
  await w.http().patch(`/api/v1/encounters/${e.body.id}`).set(bearer(t)).send({ assessment: 'Raspadura en rodilla', treatments, incident: { place: 'Polideportivo', mechanism: 'Caída', severity: 'MILD', witnesses: [] } }).expect(200);
  return { id: e.body.id as string, close: () => w.http().post(`/api/v1/encounters/${e.body.id}/close`).set(bearer(t)).set('Idempotency-Key', idem()).send({ disposition: 'RETURN_TO_CLASS' }) };
}

describe('Clinical record integrity', () => {
  it('closes and chains encounters', async () => {
    const c = await closedEncounter();
    expect((await c.close()).status).toBe(200);
    encounterId = c.id;
    const second = await closedEncounter();
    expect((await second.close()).status).toBe(200);
    const [a, b] = await admin.encounter.findMany({ where: { tenantId: w.A.id }, orderBy: { seq: 'asc' } });
    expect(b.prevHash).toBe(a.hash);
  });

  it('closed encounters are immutable (API and database)', async () => {
    const t = await w.token(w.A.users.nurse.email);
    const patch = await w.http().patch(`/api/v1/encounters/${encounterId}`).set(bearer(t)).send({ assessment: 'cambiado' });
    expect(patch.status).toBe(409);
    expect((await w.http().post(`/api/v1/encounters/${encounterId}/vitals`).set(bearer(t)).send({ heartRate: 80 })).status).toBe(409);
    await expect(admin.$executeRaw`UPDATE clinical.encounters SET assessment = 'x' WHERE id = ${encounterId}::uuid`).rejects.toThrow(/SGEE_IMMUTABLE/);
    await expect(admin.$executeRaw`DELETE FROM clinical.encounters WHERE id = ${encounterId}::uuid`).rejects.toThrow(/SGEE_IMMUTABLE/);
    await expect(admin.$executeRaw`INSERT INTO clinical.vital_signs (id, tenant_id, encounter_id, heart_rate) VALUES (gen_random_uuid(), ${w.A.id}::uuid, ${encounterId}::uuid, 70)`).rejects.toThrow(/SGEE_IMMUTABLE/);
  });

  it('allows addenda on closed encounters', async () => {
    const t = await w.token(w.A.users.nurse.email);
    const r = await w.http().post(`/api/v1/encounters/${encounterId}/notes`).set(bearer(t)).send({ note: 'Acudiente informa mejoría.' });
    expect(r.status).toBe(201);
    expect(r.body.kind).toBe('ADDENDUM');
    expect(r.body.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verifies the chain and detects tampering', async () => {
    const doctor = await w.token(w.A.users.doctor.email);
    const ok = await w.http().get('/api/v1/encounters/verify-chain').set(bearer(doctor));
    expect(ok.status).toBe(200);
    expect(ok.body.encounters.total).toBe(2);
    expect(ok.body.encounters.broken).toEqual([]);

    await admin.$executeRawUnsafe('ALTER TABLE clinical.encounters DISABLE TRIGGER encounter_guard');
    await admin.$executeRaw`UPDATE clinical.encounters SET subjective = 'alterado' WHERE id = ${encounterId}::uuid`;
    await admin.$executeRawUnsafe('ALTER TABLE clinical.encounters ENABLE TRIGGER encounter_guard');
    const tampered = await w.http().get('/api/v1/encounters/verify-chain').set(bearer(doctor));
    expect(tampered.body.encounters.broken).toHaveLength(1);
    expect(tampered.body.encounters.broken[0].id).toBe(encounterId);
  });

  it('annulment requires permission and a reason; records are never deleted', async () => {
    const nurse = await w.token(w.A.users.nurse.email);
    expect((await w.http().post(`/api/v1/encounters/${encounterId}/annul`).set(bearer(nurse)).send({ reason: 'Registro duplicado por error' })).status).toBe(403);
    const doctor = await w.token(w.A.users.doctor.email);
    expect((await w.http().post(`/api/v1/encounters/${encounterId}/annul`).set(bearer(doctor)).send({ reason: 'corto' })).status).toBe(422);
    const r = await w.http().post(`/api/v1/encounters/${encounterId}/annul`).set(bearer(doctor)).send({ reason: 'Registro duplicado por error' });
    expect(r.status).toBe(200);
    const e = await admin.encounter.findUniqueOrThrow({ where: { id: encounterId } });
    expect(e.status).toBe('ANNULLED');
    expect((await w.http().post(`/api/v1/encounters/${encounterId}/annul`).set(bearer(doctor)).send({ reason: 'Registro duplicado por error' })).status).toBe(409);
  });

  it('generates the legal PDF', async () => {
    const doctor = await w.token(w.A.users.doctor.email);
    const r = await w.http().get(`/api/v1/encounters/${encounterId}/pdf`).set(bearer(doctor)).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    expect((r.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('health profile: guardian updates, completeness and WHO growth', async () => {
    const parent = await w.token(w.A.users.parent.email);
    const up = await w.http().put(`/api/v1/students/${w.A.students.a1.id}/health-profile`).set(bearer(parent)).send({ bloodType: 'O+', eps: 'Sura', preferredIps: 'Clínica X' });
    expect(up.status).toBe(200);
    expect(up.body.completenessPct).toBeGreaterThanOrEqual(30);
    expect((await w.http().post(`/api/v1/students/${w.A.students.a1.id}/allergies`).set(bearer(parent)).send({ category: 'FOOD', agent: 'Maní', severity: 'ANAPHYLAXIS', requiresEpinephrine: true })).body.verified).toBe(false);
    expect((await w.http().post(`/api/v1/students/${w.A.students.a1.id}/anthropometrics`).set(bearer(parent)).send({ measuredAt: '2026-09-01', weightKg: 35, heightCm: 140 })).status).toBe(403);
    const nurse = await w.token(w.A.users.nurse.email);
    const m = await w.http().post(`/api/v1/students/${w.A.students.a1.id}/anthropometrics`).set(bearer(nurse)).send({ measuredAt: '2026-09-01', weightKg: 35, heightCm: 140 });
    expect(m.status).toBe(201);
    expect(m.body.bmi).toBeCloseTo(17.86, 1);
    expect(m.body.bmiPercentile).toBeGreaterThan(0);
    expect(m.body.classification).toBeTruthy();
    const card = await w.http().get(`/api/v1/students/${w.A.students.a1.id}/emergency-card`).set(bearer(nurse));
    expect(card.body.protocols.map((p: { key: string }) => p.key)).toContain('anaphylaxis');
  });

  it('mental health notes are encrypted at rest and restricted', async () => {
    const doctor = await w.token(w.A.users.doctor.email);
    const secret = 'Nota confidencial de seguimiento emocional';
    await w.http().post('/api/v1/mental-health-notes').set(bearer(doctor)).send({ studentId: w.A.students.a1.id, note: secret, riskLevel: 'LOW' }).expect(201);
    const row = await admin.mentalHealthNote.findFirstOrThrow({ where: { tenantId: w.A.id } });
    expect(Buffer.from(row.noteEnc).toString('utf8')).not.toContain('confidencial');
    const read = await w.http().get(`/api/v1/students/${w.A.students.a1.id}/mental-health-notes`).set(bearer(doctor));
    expect(read.body[0].note).toBe(secret);
    const nurse = await w.token(w.A.users.nurse.email);
    expect((await w.http().get(`/api/v1/students/${w.A.students.a1.id}/mental-health-notes`).set(bearer(nurse))).status).toBe(403);
  });

  it('injury photos require the guardian consent', async () => {
    const nurse = await w.token(w.A.users.nurse.email);
    const c = await closedEncounter();
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
    const r = await w.http().post(`/api/v1/encounters/${c.id}/attachments`).set(bearer(nurse)).field('kind', 'INJURY_PHOTO').attach('file', png, 'lesion.png');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('CONSENT_REQUIRED');
    const fake = await w.http().post(`/api/v1/encounters/${c.id}/attachments`).set(bearer(nurse)).field('kind', 'ATTACHMENT').attach('file', Buffer.from('MZ not a real image....'), 'virus.png');
    expect(fake.status).toBe(415);
    expect((await c.close()).status).toBe(200);
  });
});

describe('Inventory (FEFO, expired blocked, exact stock)', () => {
  it('consumes the earliest non-expired batch first when closing an encounter', async () => {
    const c = await closedEncounter([{ description: 'Curación con gasa', itemId: w.A.item.id, quantity: 8 }]);
    expect((await c.close()).status).toBe(200);
    const [old, fresh, expired] = await Promise.all([w.A.item.old, w.A.item.fresh, w.A.item.expired].map((id) => admin.itemBatch.findUniqueOrThrow({ where: { id } })));
    expect(old.quantity).toBe(0);
    expect(old.status).toBe('DEPLETED');
    expect(fresh.quantity).toBe(47);
    expect(expired.quantity).toBe(100);
    expect(await admin.stockMovement.count({ where: { encounterId: c.id } })).toBe(2);
    expect(await admin.encounterProcedure.count({ where: { encounterId: c.id } })).toBe(1);
  });

  it('rolls back the clinical close when stock is insufficient', async () => {
    const c = await closedEncounter([{ description: 'Gasas', itemId: w.A.item.id, quantity: 500 }]);
    const r = await c.close();
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('INSUFFICIENT_STOCK');
    expect((await admin.encounter.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('OPEN');
    expect((await admin.itemBatch.findUniqueOrThrow({ where: { id: w.A.item.fresh } })).quantity).toBe(47);
  });

  it('adjustments require a second signer', async () => {
    const nurse = await w.token(w.A.users.nurse.email);
    const body = { itemId: w.A.item.id, batchId: w.A.item.fresh, locationId: w.A.item.locationId, type: 'ADJUSTMENT_OUT', quantity: 2, reason: 'Conteo físico' };
    expect((await w.http().post('/api/v1/inventory/movements').set(bearer(nurse)).send(body)).body.code).toBe('SECOND_SIGNATURE_REQUIRED');
    expect((await w.http().post('/api/v1/inventory/movements').set(bearer(nurse)).send({ ...body, secondSignerEmail: w.A.users.nurse.email, secondSignerPassword: 'Test-Pass-2026' })).status).toBe(403);
    const ok = await w.http().post('/api/v1/inventory/movements').set(bearer(nurse)).send({ ...body, secondSignerEmail: w.A.users.doctor.email, secondSignerPassword: 'Test-Pass-2026' });
    expect(ok.status).toBe(201);
    expect(ok.body.secondSignerUserId).toBe(w.A.users.doctor.id);
    expect((await admin.itemBatch.findUniqueOrThrow({ where: { id: w.A.item.fresh } })).quantity).toBe(45);
  });

  it('the alerts job blocks expired batches', async () => {
    const admin_ = await w.token(w.A.users.admin.email);
    const coordinator = await w.token(w.A.users.coordinator.email);
    void admin_;
    const items = await w.http().get('/api/v1/inventory/items').set(bearer(coordinator));
    const gauze = items.body.find((i: { id: string }) => i.id === w.A.item.id);
    expect(gauze.stock).toBe(45);
    expect(gauze.expiredQuantity).toBe(100);
    const { InventoryService } = await import('../src/modules/inventory/inventory.service');
    const r = await w.app.get(InventoryService).alerts(w.A.id);
    expect(r.expiredBlocked).toBe(1);
    expect((await admin.itemBatch.findUniqueOrThrow({ where: { id: w.A.item.expired } })).status).toBe('EXPIRED');
  });
});
