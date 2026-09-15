import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, bearer, setupWorld, type World } from './world';

// 1×1 transparent PNG.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

describe('Independent mode (everything managed inside MediSchool)', () => {
  let w: World;
  beforeAll(async () => {
    w = await setupWorld();
  });
  afterAll(() => w.app.close());

  let studentId = '';

  it('administration builds the academic structure', async () => {
    const t = await w.token(w.A.users.admin.email);
    const section = await w.http().post('/api/v1/structure/sections').set(bearer(t)).send({ code: 'bac', name: 'Bachillerato', sortOrder: 3 });
    expect(section.status).toBe(201);
    expect(section.body.code).toBe('BAC');
    const grade = await w.http().post('/api/v1/structure/grades').set(bearer(t)).send({ sectionId: section.body.id, code: 's6', name: 'Sexto', sortOrder: 6 });
    expect(grade.status).toBe(201);
    const group = await w.http().post('/api/v1/structure/groups').set(bearer(t)).send({ gradeId: grade.body.id, code: '6a', name: '6A' });
    expect(group.status).toBe(201);
    expect((await w.http().post('/api/v1/structure/groups').set(bearer(t)).send({ gradeId: grade.body.id, code: '6A', name: 'Duplicado' })).body.code).toBe('CODE_IN_USE');
    const nurse = await w.token(w.A.users.nurse.email);
    expect((await w.http().post('/api/v1/structure/sections').set(bearer(nurse)).send({ code: 'X', name: 'X' })).status).toBe(403);
    // A group with active students cannot be deactivated.
    expect((await w.http().patch(`/api/v1/structure/groups/${w.A.groupId}`).set(bearer(t)).send({ active: false })).body.code).toBe('GROUP_HAS_STUDENTS');
    const tree = await w.http().get('/api/v1/structure').query({ all: 1 }).set(bearer(t));
    expect(tree.body.find((s: { code: string }) => s.code === 'BAC').grades[0].groups[0]).toMatchObject({ code: '6A', active: true, students: 0 });
  });

  it('administration creates and edits students', async () => {
    const t = await w.token(w.A.users.admin.email);
    const created = await w.http().post('/api/v1/students').set(bearer(t)).send({ code: '3001', firstName: 'Lucas', lastName: 'Nuevo Registro', documentType: 'TI', documentNumber: '1043000999', birthDate: '2014-05-02', sex: 'M', groupId: w.A.groupId, email: '' });
    expect(created.status).toBe(201);
    studentId = created.body.id;
    expect((await w.http().post('/api/v1/students').set(bearer(t)).send({ code: '3001', firstName: 'Otro', lastName: 'Estudiante' })).body.code).toBe('STUDENT_CODE_IN_USE');

    const updated = await w.http().patch(`/api/v1/students/${studentId}`).set(bearer(t)).send({ transport: 'Ruta 4', lastName: 'Nuevo Pérez' });
    expect(updated.status).toBe(200);
    const detail = await w.http().get(`/api/v1/students/${studentId}`).set(bearer(t));
    expect(detail.body).toMatchObject({ name: 'Lucas Nuevo Pérez', transport: 'Ruta 4', dataSource: 'LOCAL', phidiasLocked: false, edit: { code: '3001', birthDate: '2014-05-02', groupId: w.A.groupId } });
    expect(await admin.enrollment.count({ where: { studentId } })).toBe(1);

    const teacher = await w.token(w.A.users.teacher.email);
    expect((await w.http().patch(`/api/v1/students/${studentId}`).set(bearer(teacher)).send({ transport: 'x' })).status).toBe(403);
  });

  it('uploads a photo that every role allowed to see the student can view', async () => {
    const t = await w.token(w.A.users.admin.email);
    const up = await w.http().post(`/api/v1/students/${studentId}/photo`).set(bearer(t)).attach('file', PNG, { filename: 'foto.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    expect(up.body.photoUrl).toMatch(new RegExp(`/api/v1/students/${studentId}/photo\\?v=`));

    for (const key of ['nurse', 'teacher', 'gate', 'director', 'admin'] as const) {
      const token = await w.token(w.A.users[key].email);
      const img = await w.http().get(`/api/v1/students/${studentId}/photo`).set(bearer(token));
      expect(img.status, key).toBe(200);
      expect(img.headers['content-type']).toBe('image/png');
    }
    // Visible in the lists used by the panels.
    const nurse = await w.token(w.A.users.nurse.email);
    expect((await w.http().get('/api/v1/students').query({ q: '3001' }).set(bearer(nurse))).body.items[0].photoUrl).toBe(up.body.photoUrl);
    const teacher = await w.token(w.A.users.teacher.email);
    const cls = await w.http().get('/api/v1/teacher/class').set(bearer(teacher));
    expect(cls.body[0].students.find((s: { id: string }) => s.id === studentId).photoUrl).toBe(up.body.photoUrl);

    // A parent of another child and another school cannot see it.
    const parent = await w.token(w.A.users.parent.email);
    expect((await w.http().get(`/api/v1/students/${studentId}/photo`).set(bearer(parent))).status).toBe(403);
    const otherSchool = await w.token(w.B.users.admin.email);
    expect((await w.http().get(`/api/v1/students/${studentId}/photo`).set(bearer(otherSchool))).status).toBe(404);

    // Stored encrypted; only images are accepted.
    const person = await admin.person.findFirstOrThrow({ where: { student: { id: studentId } } });
    expect(person.photoKey).toMatch(/^local:/);
    const file = await admin.storedFile.findUniqueOrThrow({ where: { id: person.photoKey!.slice(6) } });
    expect(file).toMatchObject({ kind: 'STUDENT_PHOTO', encrypted: true, mimeType: 'image/png' });
    const bad = await w.http().post(`/api/v1/students/${studentId}/photo`).set(bearer(t)).attach('file', Buffer.from('hola, esto no es una imagen'), { filename: 'x.png', contentType: 'image/png' });
    expect(bad.status).toBe(415);

    expect((await w.http().delete(`/api/v1/students/${studentId}/photo`).set(bearer(t))).status).toBe(200);
    expect((await w.http().get(`/api/v1/students/${studentId}`).set(bearer(t))).body.photoUrl).toBeNull();
  });

  it('switches between independent and Phidias modes', async () => {
    const t = await w.token(w.A.users.admin.email);
    const refused = await w.http().post('/api/v1/integrations/phidias/sync').set(bearer(t)).send({ kind: 'INCREMENTAL', wait: true });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('DATA_SOURCE_LOCAL');

    await w.http().put('/api/v1/admin/settings').set(bearer(t)).send({ settings: { dataSource: 'PHIDIAS' } }).expect(200);
    const setting = () => admin.integrationSetting.findUnique({ where: { tenantId_provider: { tenantId: w.A.id, provider: 'PHIDIAS' } } });
    expect((await setting())?.enabled).toBe(true);

    // A student linked to Phidias keeps Phidias-owned data read-only; local data stays editable.
    await admin.externalId.create({ data: { tenantId: w.A.id, source: 'phidias', entity: 'student', externalId: '777001', localId: w.A.students.a1.id, contentHash: 'x' } });
    const locked = await w.http().patch(`/api/v1/students/${w.A.students.a1.id}`).set(bearer(t)).send({ firstName: 'Cambio' });
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe('PHIDIAS_OWNED');
    await w.http().patch(`/api/v1/students/${w.A.students.a1.id}`).set(bearer(t)).send({ firstName: 'Ana', transport: 'Ruta 2' }).expect(200);
    // Students created locally remain fully editable, and the structure is managed by Phidias.
    await w.http().patch(`/api/v1/students/${studentId}`).set(bearer(t)).send({ firstName: 'Lucas Andrés' }).expect(200);
    expect((await w.http().post('/api/v1/structure/sections').set(bearer(t)).send({ code: 'NEW', name: 'Nueva' })).body.code).toBe('PHIDIAS_MANAGED');
    const me = await w.http().get('/api/v1/auth/me').set(bearer(t));
    expect(me.body.settings.dataSource).toBe('PHIDIAS');

    await w.http().put('/api/v1/admin/settings').set(bearer(t)).send({ settings: { dataSource: 'LOCAL' } }).expect(200);
    expect((await setting())?.enabled).toBe(false);
    await w.http().patch(`/api/v1/students/${w.A.students.a1.id}`).set(bearer(t)).send({ firstName: 'Ana María' }).expect(200);
  });
});
