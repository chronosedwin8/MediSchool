import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@sgee/db';
import { addDays, dateInTz, ROLE_PERMISSIONS, ROLES } from '@sgee/shared';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/bootstrap';
import { hashSecret } from '../src/common/crypto';

export const PASSWORD = 'Test-Pass-2026';
export const admin = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_ADMIN_URL });

export async function truncateAll() {
  const tables = await admin.$queryRaw<{ schemaname: string; tablename: string }[]>`
    SELECT schemaname, tablename FROM pg_tables
    WHERE schemaname IN ('core','people','clinical','meds','inventory','flow','comms','compliance','audit','integration')
      AND tablename NOT IN ('pass_transitions','permissions') AND tablename NOT LIKE 'audit_log_%'`;
  await admin.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.schemaname}"."${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

type UserKey = 'nurse' | 'doctor' | 'coordinator' | 'teacher' | 'parent' | 'gate' | 'admin' | 'director';

export interface TenantWorld {
  id: string;
  slug: string;
  users: Record<UserKey, { id: string; email: string; personId: string | null }>;
  groupId: string;
  sectionId: string;
  students: { a1: { id: string; personId: string; code: string }; a2: { id: string; personId: string; code: string } };
  guardianPersonId: string;
  item: { id: string; locationId: string; old: string; fresh: string; expired: string };
  catalog: { acetaminophen: string; ibuprofen: string; methylphenidate: string };
  templates: { medication: string; photo: string; data: string };
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

async function seedTenant(slug: string, pwHash: string): Promise<TenantWorld> {
  const t = await admin.tenant.create({ data: { slug, name: `Colegio ${slug}`, country: 'CO', settings: { enabledChannels: ['IN_APP', 'EMAIL'] } } });
  const tenantId = t.id;
  await admin.permissionDef.createMany({ data: Object.values(ROLE_PERMISSIONS).flat().map((key) => ({ key })), skipDuplicates: true });
  await admin.rolePermission.createMany({ data: ROLES.flatMap((role) => ROLE_PERMISSIONS[role].map((permissionKey) => ({ tenantId, roleKey: role, permissionKey }))) });
  const section = await admin.section.create({ data: { tenantId, code: 'PRI', name: 'Primaria' } });
  const grade = await admin.grade.create({ data: { tenantId, sectionId: section.id, code: 'P5', name: 'Quinto' } });
  const group = await admin.group.create({ data: { tenantId, gradeId: grade.id, code: `${slug}-5A`.toUpperCase(), name: '5A' } });

  const mkStudent = async (code: string, first: string) => {
    const person = await admin.person.create({ data: { tenantId, kind: 'STUDENT', firstName: first, lastName: 'Prueba', birthDate: new Date('2016-03-10'), sex: 'F', documentType: 'TI', documentNumber: `10${code}` } });
    const student = await admin.student.create({ data: { tenantId, personId: person.id, code, currentGroupId: group.id } });
    return { id: student.id, personId: person.id, code };
  };
  const a1 = await mkStudent(slug === 'tenant-a' ? '1001' : '2001', 'Ana');
  const a2 = await mkStudent(slug === 'tenant-a' ? '1002' : '2002', 'Bea');
  await admin.allergy.create({ data: { tenantId, personId: a2.personId, category: 'MEDICATION', agent: 'Ibuprofeno', severity: 'SEVERE', verified: true } });

  const guardianPerson = await admin.person.create({ data: { tenantId, kind: 'GUARDIAN', firstName: 'Pedro', lastName: 'Padre', documentType: 'CC', documentNumber: '123456', mobile: '3001234567' } });
  const guardian = await admin.guardian.create({ data: { tenantId, personId: guardianPerson.id } });
  await admin.studentGuardian.create({ data: { tenantId, studentId: a1.id, guardianId: guardian.id, relationship: 'FATHER', isPrimary: true } });

  const mk = async (key: UserKey, role: string, extra: Record<string, unknown> = {}) => {
    const email = `${key}@${slug}.test`;
    const u = await admin.user.create({ data: { tenantId, email, passwordHash: pwHash, firstName: key, lastName: 'Test', roles: { create: { tenantId, role } }, ...extra } });
    return { id: u.id, email, personId: (extra.personId as string) ?? null };
  };
  const users = {
    nurse: await mk('nurse', 'NURSE'),
    doctor: await mk('doctor', 'DOCTOR'),
    coordinator: await mk('coordinator', 'HEALTH_COORDINATOR'),
    teacher: await mk('teacher', 'TEACHER'),
    parent: await mk('parent', 'PARENT', { personId: guardianPerson.id }),
    gate: await mk('gate', 'GATE', { kioskDeviceCode: 'GATE-1', kioskPinHash: await hashSecret('2468') }),
    admin: await mk('admin', 'ADMIN'),
    director: await mk('director', 'DIRECTOR'),
  };
  await admin.teacherGroup.create({ data: { tenantId, userId: users.teacher.id, groupId: group.id, subject: 'Matemáticas' } });

  const today = dateInTz(new Date());
  const location = await admin.location.create({ data: { tenantId, name: 'Estante', kind: 'SHELF' } });
  const item = await admin.item.create({ data: { tenantId, kind: 'SUPPLY', name: 'Gasa estéril', unit: 'unidad', minStock: 10 } });
  const batch = (lot: string, days: number, quantity: number) => admin.itemBatch.create({ data: { tenantId, itemId: item.id, locationId: location.id, lot, expiryDate: new Date(`${addDays(today, days)}T00:00:00Z`), quantity, source: 'PURCHASE' } });
  const old = await batch('OLD', 10, 5);
  const fresh = await batch('NEW', 200, 50);
  const expired = await batch('EXP', -3, 100);

  const cat = (genericName: string, form: string, concentration: string, otcAllowed: boolean, controlled: boolean) =>
    admin.medicationCatalog.create({ data: { tenantId, genericName, brandNames: [], form, concentration, route: 'ORAL', otcAllowed, controlled } });
  const acetaminophen = await cat('Acetaminofén', 'Tableta', '500 mg', true, false);
  const ibuprofen = await cat('Ibuprofeno', 'Tableta', '400 mg', true, false);
  const methylphenidate = await cat('Metilfenidato', 'Tableta', '10 mg', false, true);

  const tpl = (type: string, mandatory: boolean) => admin.consentTemplate.create({ data: { tenantId, type, title: type, body: `Texto del consentimiento ${type} para pruebas automatizadas.`, bodyHash: sha(type), version: '1.0', effectiveFrom: new Date('2026-01-01'), mandatory } });
  const medication = await tpl('MEDICATION_ADMIN', false);
  const photo = await tpl('PHOTO_INJURY', false);
  const data = await tpl('DATA_PROCESSING', true);
  await admin.complianceProfile.create({ data: { tenantId, country: 'CO', name: 'Colombia', rules: (await import('@sgee/shared')).profileFor('CO') as object, active: true } });
  await admin.retentionPolicy.create({ data: { tenantId, entity: 'clinical_record', retentionYears: 15 } });

  return {
    id: tenantId,
    slug,
    users,
    groupId: group.id,
    sectionId: section.id,
    students: { a1, a2 },
    guardianPersonId: guardianPerson.id,
    item: { id: item.id, locationId: location.id, old: old.id, fresh: fresh.id, expired: expired.id },
    catalog: { acetaminophen: acetaminophen.id, ibuprofen: ibuprofen.id, methylphenidate: methylphenidate.id },
    templates: { medication: medication.id, photo: photo.id, data: data.id },
  };
}

export interface World {
  app: INestApplication;
  A: TenantWorld;
  B: TenantWorld;
  token: (email: string) => Promise<string>;
  http: () => ReturnType<typeof request>;
}

export async function setupWorld(): Promise<World> {
  await truncateAll();
  const pwHash = await hashSecret(PASSWORD);
  const A = await seedTenant('tenant-a', pwHash);
  const B = await seedTenant('tenant-b', pwHash);
  const app = await createApp({ logger: false });
  await app.init();
  const cache = new Map<string, string>();
  const http = () => request(app.getHttpServer());
  return {
    app,
    A,
    B,
    http,
    token: async (email) => {
      if (cache.has(email)) return cache.get(email)!;
      const res = await http().post('/api/v1/auth/login').send({ email, password: PASSWORD });
      if (res.status !== 200) throw new Error(`login ${email} failed: ${res.status} ${JSON.stringify(res.body)}`);
      cache.set(email, res.body.accessToken);
      return res.body.accessToken;
    },
  };
}

export const idem = () => `test-${Math.random().toString(36).slice(2)}-${Date.now()}`;
export const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
