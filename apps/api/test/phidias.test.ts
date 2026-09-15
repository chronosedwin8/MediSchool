import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseConsolidate, parseNursingPoll, parsePhidiasDenied, parseRelatives, relationshipCode, splitFullName, studentHash, toCanonicalStudent } from '../src/modules/phidias/phidias.adapter';
import { PhidiasSyncService } from '../src/modules/phidias/phidias-sync.service';
import { admin, bearer, setupWorld, type World } from './world';

describe('Phidias adapter', () => {
  it('maps the consolidate hierarchy to canonical DTOs', () => {
    const raw = [{ id: 18, name: 'PRIMARIA', courses: [{ id: 86, name: 'KLASSE 5', sections: [{ id: 336, name: 'K5A', students: [{ id: 1, code: 3480, document: 99, idtype: 1, gender: 0, firstname: 'SOFÍA', lastname: 'MARTÍNEZ RUIZ', birthday: 1471237200, enrollment: { status: 'retirado' }, _changed: '0000-00-00 00:00:00' }] }] }] }];
    const p = parseConsolidate(raw);
    expect(p.sections[0]).toMatchObject({ code: 'PRI', name: 'Primaria' });
    expect(p.grades[0]).toMatchObject({ code: 'KLASSE-5', name: 'Klasse 5' });
    expect(p.groups[0]).toMatchObject({ code: 'K5A' });
    expect(p.students[0]).toMatchObject({ code: '3480', documentType: 'TI', sex: 'F', firstName: 'Sofía', lastName: 'Martínez Ruiz', birthDate: '2016-08-15', active: false, sourceUpdatedAt: null });
  });

  it('content hash ignores source timestamps', () => {
    const s = toCanonicalStudent({ id: 1, firstname: 'A', lastname: 'B', _changed: '2026-01-01 10:00:00' }, '9');
    const s2 = toCanonicalStudent({ id: 1, firstname: 'A', lastname: 'B', _changed: '2026-02-01 10:00:00' }, '9');
    expect(studentHash(s)).toBe(studentHash(s2));
  });

  it('parses nursing polls with HTML and "false" dates', () => {
    const [e] = parseNursingPoll([{ person_id: 5, person: 'ANA GIL', timestamp: '2026-09-01 10:00:00', 'Hora y fecha de ingreso': 'false', 'Tipo de Atención': 'Incidente', 'Motivo de Atención': 'Raspadura', 'Descripción de la Atención': '<p>Curaci&oacute;n</p>', 'Nombre del medicamento': 'NO', 'Tipo de Accidente': 'Leve', 'Zona o Juego': 'Polideportivo' }], 114, 'STUDENT');
    expect(e).toMatchObject({ type: 'ACCIDENT', description: 'Curación', medication: null, accident: { severity: 'MILD', zone: 'Polideportivo' } });
    expect(e.startedAt.toISOString()).toBe('2026-09-01T15:00:00.000Z');
  });

  it('parses relatives in the known payload variants without reading credentials', () => {
    const directory = new Map([['80001', { id: 80001, firstname: 'MARTA', lastname: 'GÓMEZ', mobile: 3001112233, idtype: 2, document: 52111222, password: 'x', username: 'y' } as never]]);
    const rel = parseRelatives(
      [
        { relative: 80001, relationship: 'Madre', responsible: '1', emergency: 0 },
        { relative: { id: 80002, firstname: 'ROSA', lastname: 'PÉREZ' }, kinship: 'ABUELA', emergency: true },
        { person: { id: 90001 }, relative_id: 80003, relationship: 'Tío' },
        { relative: 80001, relationship: 'Madre', pickup: 1 },
      ],
      '90001',
      directory,
    );
    expect(rel).toHaveLength(3);
    expect(rel[0]).toMatchObject({ relativeExternalId: '80001', relationship: 'MOTHER', isResponsible: true, canPickUp: true, person: { firstName: 'Marta', documentType: 'CC', mobile: '3001112233' } });
    expect(JSON.stringify(rel)).not.toMatch(/password|username/);
    expect(rel[1]).toMatchObject({ relationship: 'GRANDPARENT', isEmergencyContact: true, person: { firstName: 'Rosa' } });
    expect(rel[2]).toMatchObject({ relativeExternalId: '80003', relationship: 'UNCLE_AUNT', person: null });
    expect(relationshipCode('Madrastra')).toBe('OTHER');
    expect(relationshipCode('PADRE')).toBe('FATHER');
  });

  it('recognizes Phidias permission errors', () => {
    expect(parsePhidiasDenied([{ code: 'denied', message: 'access denied', arguments: { module: 'Person_Relative_Controller::getRelatives' } }])).toBe('Person_Relative_Controller::getRelatives');
    expect(parsePhidiasDenied([{ code: 'DEFINITION ERROR', message: 'no equivalences for route' }])).toBeNull();
  });

  it('splits Colombian full names', () => {
    expect(splitFullName('SAMANTHA LUZARDO MENDOZA')).toEqual({ firstName: 'Samantha', lastName: 'Luzardo Mendoza' });
    expect(splitFullName('ANDRÉS FELIPE GIL NARANJO')).toEqual({ firstName: 'Andrés Felipe', lastName: 'Gil Naranjo' });
  });
});

describe('Phidias synchronization (mock fixtures)', () => {
  let w: World;
  let sync: PhidiasSyncService;
  beforeAll(async () => {
    w = await setupWorld();
    sync = w.app.get(PhidiasSyncService);
  });
  afterAll(() => w.app.close());

  it('first full sync inserts students, flags conflicts and inactivates withdrawn students', async () => {
    const r = await sync.syncStudents(w.B.id, 'FULL');
    expect(r.status).toBe('SUCCESS');
    expect(await admin.externalId.count({ where: { tenantId: w.B.id, entity: 'student' } })).toBe(7);
    expect(await admin.syncConflict.count({ where: { tenantId: w.B.id, kind: 'MISSING_CODE' } })).toBe(1);
    const withdrawn = await admin.student.findFirstOrThrow({ where: { tenantId: w.B.id, externalId: '90007' } });
    expect(withdrawn.status).toBe('INACTIVE');
  });

  it('second run writes nothing (idempotent)', async () => {
    const before = await admin.person.findMany({ where: { tenantId: w.B.id, source: 'PHIDIAS' }, select: { id: true, updatedAt: true } });
    const r = await sync.syncStudents(w.B.id, 'FULL');
    expect(r).toMatchObject({ inserted: 0, updated: 0, deactivated: 0, errors: 0, skipped: 7 });
    const after = await admin.person.findMany({ where: { tenantId: w.B.id, source: 'PHIDIAS' }, select: { id: true, updatedAt: true } });
    expect(after).toEqual(before);
  });

  it('never overwrites local clinical data and respects field ownership', async () => {
    const link = await admin.externalId.findFirstOrThrow({ where: { tenantId: w.B.id, entity: 'student', externalId: '90003' } });
    const st = await admin.student.findUniqueOrThrow({ where: { id: link.localId } });
    await admin.healthProfile.create({ data: { tenantId: w.B.id, personId: st.personId, bloodType: 'A+' } });
    await admin.person.update({ where: { id: st.personId }, data: { firstName: 'Nombre local', email: 'local@example.com' } });
    await admin.externalId.update({ where: { id: link.id }, data: { contentHash: 'changed' } });
    const r = await sync.syncStudents(w.B.id, 'INCREMENTAL');
    expect(r.updated).toBe(1);
    const p = await admin.person.findUniqueOrThrow({ where: { id: st.personId } });
    expect(p.firstName).toBe('Sofía'); // PHIDIAS-owned field restored
    expect(p.email).toBe('local@example.com'); // MERGE field keeps local value
    expect((await admin.healthProfile.findUniqueOrThrow({ where: { personId: st.personId } })).bloodType).toBe('A+');
  });

  it('imports historical nursing polls idempotently', async () => {
    const first = await sync.importHistory(w.B.id);
    expect(first.inserted).toBe(4);
    const second = await sync.importHistory(w.B.id);
    expect(second).toMatchObject({ inserted: 0, skipped: 4 });
    const staff = await admin.encounter.findFirstOrThrow({ where: { tenantId: w.B.id, subjectType: 'STAFF' } });
    expect(staff.status).toBe('CLOSED');
    expect(await admin.incidentReport.count({ where: { tenantId: w.B.id } })).toBe(1);
  });

  it('imports guardians and emergency contacts from Phidias relatives idempotently', async () => {
    const first = await sync.syncRelatives(w.B.id);
    expect(first).toMatchObject({ status: 'SUCCESS', inserted: 4, errors: 0 });
    const studentOf = async (ext: string) => (await admin.externalId.findFirstOrThrow({ where: { tenantId: w.B.id, entity: 'student', externalId: ext } })).localId;

    // 90001: mother (responsible, can pick up) and father become guardians — not duplicated as contacts.
    const links = await admin.studentGuardian.findMany({ where: { studentId: await studentOf('90001') }, include: { guardian: { include: { person: true } } } });
    expect(links.map((l) => l.relationship).sort()).toEqual(['FATHER', 'MOTHER']);
    const mother = links.find((l) => l.relationship === 'MOTHER')!;
    expect(mother).toMatchObject({ isPrimary: true, canPickUp: true, judicialRestriction: false });
    expect(mother.guardian.person).toMatchObject({ kind: 'GUARDIAN', source: 'PHIDIAS', documentType: 'CC', documentNumber: '52111222', email: 'marta.gomez@example.com', mobile: '3001112233' });
    expect(await admin.emergencyContact.count({ where: { studentId: await studentOf('90001') } })).toBe(0);

    // 90002: grandmother becomes an emergency contact (cannot pick up); the sibling is not stored.
    const contacts = await admin.emergencyContact.findMany({ where: { studentId: await studentOf('90002') } });
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ name: 'Rosa Pérez', relationship: 'Abuela', phone: '3009998877', canPickUp: false, verified: true });

    // The same Phidias person related to two students is one guardian person.
    expect(await admin.person.count({ where: { tenantId: w.B.id, kind: 'GUARDIAN', documentNumber: '52111222' } })).toBe(1);

    const second = await sync.syncRelatives(w.B.id);
    expect(second).toMatchObject({ inserted: 0, updated: 0, deactivated: 0, errors: 0 });

    // Local decisions are preserved when Phidias data changes.
    await admin.studentGuardian.update({ where: { id: mother.id }, data: { canPickUp: false, judicialRestriction: true } });
    await admin.externalId.updateMany({ where: { tenantId: w.B.id, entity: 'student_guardian' }, data: { contentHash: 'changed' } });
    const third = await sync.syncRelatives(w.B.id);
    expect(third.updated).toBe(2);
    expect(await admin.studentGuardian.findUniqueOrThrow({ where: { id: mother.id } })).toMatchObject({ canPickUp: false, judicialRestriction: true, isPrimary: true });

    // Credentials present in the Phidias payload are never persisted.
    const runs = await admin.syncRun.findMany({ where: { tenantId: w.B.id, kind: 'RELATIVES' } });
    expect(JSON.stringify(runs)).not.toContain('fixture-secret-never-stored');
    expect(JSON.stringify(await admin.person.findMany({ where: { tenantId: w.B.id, kind: 'GUARDIAN' } }))).not.toContain('fixture-secret-never-stored');
  });

  it('exposes status to administrators only', async () => {
    const adminToken = await w.token(w.B.users.admin.email);
    const s = await w.http().get('/api/v1/integrations/phidias/status').set(bearer(adminToken));
    expect(s.status).toBe(200);
    expect(s.body.mock).toBe(true);
    expect(s.body.linkedStudents).toBe(7);
    const nurse = await w.token(w.B.users.nurse.email);
    expect((await w.http().get('/api/v1/integrations/phidias/status').set(bearer(nurse))).status).toBe(403);
  });
});
