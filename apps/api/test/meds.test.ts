import { addDays, dateInTz, timeInTz } from '@sgee/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MedsService } from '../src/modules/meds/meds.service';
import { admin, bearer, idem, setupWorld, type World } from './world';

let w: World;
beforeAll(async () => {
  w = await setupWorld();
});
afterAll(() => w.app.close());

const today = () => dateInTz(new Date());

describe('Medication administration record (MAR)', () => {
  let requestId = '';
  let scheduleId = '';

  const requestBody = (over: Record<string, unknown> = {}) => ({
    studentId: w.A.students.a1.id,
    catalogId: w.A.catalog.acetaminophen,
    medicationName: 'Acetaminofén 500 mg',
    dose: 500,
    doseUnit: 'mg',
    route: 'ORAL',
    frequency: 'DAILY',
    times: [timeInTz(new Date())],
    startDate: today(),
    endDate: addDays(today(), 5),
    indication: 'Dolor',
    ...over,
  });

  it('blocks a guardian request until the medication consent is signed with OTP', async () => {
    const parent = await w.token(w.A.users.parent.email);
    const r = await w.http().post('/api/v1/medication-requests').set(bearer(parent)).send(requestBody());
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('CONSENT_REQUIRED');

    const otp = await w.http().post('/api/v1/consents/otp').set(bearer(parent)).send({ templateId: w.A.templates.medication, studentId: w.A.students.a1.id });
    expect(otp.status).toBe(200);
    expect(otp.body.devOtp).toMatch(/^\d{6}$/);
    const wrong = otp.body.devOtp === '000000' ? '111111' : '000000';
    expect((await w.http().post('/api/v1/consents').set(bearer(parent)).send({ templateId: w.A.templates.medication, studentId: w.A.students.a1.id, otp: wrong, accepted: true })).body.code).toBe('OTP_INVALID');
    const signed = await w.http().post('/api/v1/consents').set(bearer(parent)).send({ templateId: w.A.templates.medication, studentId: w.A.students.a1.id, otp: otp.body.devOtp, accepted: true });
    expect(signed.status).toBe(201);
    expect(signed.body.signatureHash).toMatch(/^[0-9a-f]{64}$/);

    const ok = await w.http().post('/api/v1/medication-requests').set(bearer(parent)).send(requestBody());
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('SUBMITTED');
    requestId = ok.body.id;
  });

  it('requires a prescription for controlled drugs and rejects allergy conflicts', async () => {
    const parent = await w.token(w.A.users.parent.email);
    const controlled = await w.http().post('/api/v1/medication-requests').set(bearer(parent)).send(requestBody({ catalogId: w.A.catalog.methylphenidate, medicationName: 'Metilfenidato 10 mg', dose: 10 }));
    expect(controlled.body.code).toBe('PRESCRIPTION_REQUIRED');
    const nurse = await w.token(w.A.users.nurse.email);
    const allergy = await w.http().post('/api/v1/medication-requests').set(bearer(nurse)).send(requestBody({ studentId: w.A.students.a2.id, catalogId: w.A.catalog.ibuprofen, medicationName: 'Ibuprofeno 400 mg', dose: 400 }));
    expect(allergy.status).toBe(422);
    expect(allergy.body.code).toBe('ALLERGY_CONFLICT');
    const invalid = await w.http().post('/api/v1/medication-requests').set(bearer(nurse)).send(requestBody({ dose: 0 }));
    expect(invalid.status).toBe(422);
  });

  it('nurse reviews with checks and receives custody', async () => {
    const nurse = await w.token(w.A.users.nurse.email);
    const checks = { prescriptionMatches: true, doseMatches: true, notExpired: true, packagingIntact: true, labeled: false };
    expect((await w.http().post(`/api/v1/medication-requests/${requestId}/review`).set(bearer(nurse)).send({ decision: 'APPROVE', checks })).body.code).toBe('CHECKS_INCOMPLETE');
    const approved = await w.http().post(`/api/v1/medication-requests/${requestId}/review`).set(bearer(nurse)).send({ decision: 'APPROVE', checks: { ...checks, labeled: true } });
    expect(approved.body.status).toBe('APPROVED');
    const custody = { requestId, quantity: 20, unit: 'tabletas', lot: 'L1', expiryDate: addDays(today(), 300), deliveredBy: 'Pedro Padre', storage: 'SHELF', packagingIntact: false, labeled: true };
    expect((await w.http().post('/api/v1/medication-custody').set(bearer(nurse)).send(custody)).body.code).toBe('PACKAGING_REJECTED');
    expect((await w.http().post('/api/v1/medication-custody').set(bearer(nurse)).send({ ...custody, packagingIntact: true })).status).toBe(201);
    expect((await admin.medicationRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe('ACTIVE');
    expect(await admin.notification.count({ where: { userId: w.A.users.parent.id, event: 'MEDICATION_REQUEST_REVIEWED' } })).toBeGreaterThan(0);
  });

  it('generates today\'s schedule idempotently', async () => {
    const nurse = await w.token(w.A.users.nurse.email);
    const t1 = await w.http().get('/api/v1/medication-schedule/today').set(bearer(nurse));
    const t2 = await w.http().get('/api/v1/medication-schedule/today').set(bearer(nurse));
    const mine = t2.body.scheduled.filter((s: { request: { id: string } }) => s.request.id === requestId);
    expect(mine).toHaveLength(1);
    expect(t1.body.scheduled.length).toBe(t2.body.scheduled.length);
    expect(mine[0].dueNow).toBe(true);
    scheduleId = mine[0].id;
  });

  it('enforces the 5 rights, then records a chained administration', async () => {
    const nurse = await w.token(w.A.users.nurse.email);
    const body = { requestId, scheduleId, scannedStudentId: w.A.students.a1.id, medicationName: 'Acetaminofén 500 mg', catalogId: w.A.catalog.acetaminophen, dose: 500, doseUnit: 'mg', route: 'ORAL', outcome: 'GIVEN' };
    const wrongPatient = await w.http().post('/api/v1/administrations').set(bearer(nurse)).set('Idempotency-Key', idem()).send({ ...body, scannedStudentId: w.A.students.a2.id });
    expect(wrongPatient.status).toBe(422);
    expect(wrongPatient.body.code).toBe('FIVE_RIGHTS_FAILED');
    expect(wrongPatient.body.verification.rights.patient).toBe(false);
    const wrongDose = await w.http().post('/api/v1/administrations').set(bearer(nurse)).set('Idempotency-Key', idem()).send({ ...body, dose: 1000 });
    expect(wrongDose.body.verification.rights.dose).toBe(false);

    const ok = await w.http().post('/api/v1/administrations').set(bearer(nurse)).set('Idempotency-Key', idem()).send(body);
    expect(ok.status).toBe(201);
    expect(ok.body.hash).toMatch(/^[0-9a-f]{64}$/);
    expect((await admin.medicationSchedule.findUniqueOrThrow({ where: { id: scheduleId } })).status).toBe('GIVEN');
    const custody = await admin.medicationCustody.findFirstOrThrow({ where: { requestId } });
    expect(custody.quantityRemaining).toBe(19);
    const again = await w.http().post('/api/v1/administrations').set(bearer(nurse)).set('Idempotency-Key', idem()).send(body);
    expect(again.body.code).toBe('DOSE_ALREADY_RECORDED');
    expect(await admin.notification.count({ where: { userId: w.A.users.parent.id, event: 'DOSE_GIVEN' } })).toBeGreaterThan(0);
    await expect(admin.$executeRaw`UPDATE meds.medication_administrations SET dose = 1 WHERE request_id = ${requestId}::uuid`).rejects.toThrow(/SGEE_IMMUTABLE/);

    const doctor = await w.token(w.A.users.doctor.email);
    const chain = await w.http().get('/api/v1/encounters/verify-chain').set(bearer(doctor));
    expect(chain.body.administrations).toMatchObject({ total: 1, broken: [] });
  });

  it('alerts overdue doses (omissions)', async () => {
    const now = new Date();
    if (now.getHours() < 2) return; // the scheduled time would fall on the previous day
    const nurse = await w.token(w.A.users.nurse.email);
    const past = timeInTz(new Date(now.getTime() - 90 * 60_000));
    const r = await w.http().post('/api/v1/medication-requests').set(bearer(nurse)).send(requestBody({ times: [past], medicationName: 'Acetaminofén 500 mg (tarde)' }));
    await w.http().post(`/api/v1/medication-requests/${r.body.id}/review`).set(bearer(nurse)).send({ decision: 'APPROVE', checks: { prescriptionMatches: true, doseMatches: true, notExpired: true, packagingIntact: true, labeled: true } });
    await w.http().post('/api/v1/medication-custody').set(bearer(nurse)).send({ requestId: r.body.id, quantity: 5, unit: 'tabletas', lot: 'L2', expiryDate: addDays(today(), 100), deliveredBy: 'Padre', storage: 'SHELF', packagingIntact: true, labeled: true }).expect(201);
    const out = await w.app.get(MedsService).omissionCheck(w.A.id);
    expect(out.alerted).toBeGreaterThanOrEqual(1);
    expect(await admin.notification.count({ where: { event: 'DOSE_OMITTED', userId: w.A.users.nurse.id } })).toBeGreaterThanOrEqual(1);
  });
});
