/**
 * Seed (PLAN §11):
 *  - Tenant "colegio-aleman": real school. Base configuration + one account per
 *    role. Students come from Phidias (`npm run phidias:sync`); afterwards run
 *    `npm run seed -w @sgee/db -- --links` to attach demo accounts to groups.
 *  - Tenant "colegio-demo": realistic synthetic data (faker es) with 1 500
 *    students, 3 sections, 120 teachers and months of operational history for
 *    dashboards, E2E and load tests.
 * Runs with the superuser connection (RLS bypassed). Idempotent per tenant.
 */
import { fakerES_MX as faker } from '@faker-js/faker';
import { PrismaClient, type Prisma } from '@prisma/client';
import {
  COMPLIANCE_PROFILES,
  CONSENT_TYPE_LABELS,
  ENCOUNTER_TEMPLATES,
  MEDICATION_CATALOG,
  PERMISSIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  ROLES,
  SCHOOL_ZONES,
  SUPPLY_CATALOG,
  computeGrowth,
  zonedToUtc,
  addDays,
  dateInTz,
} from '@sgee/shared';
import { createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto';

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_ADMIN_URL });
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'MediSchool2026!';
const TZ = 'America/Bogota';
faker.seed(2026);

// ── helpers ─────────────────────────────────────────────────────────────────
function hashSecret(secret: string) {
  const salt = randomBytes(16);
  const key = scryptSync(secret, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}
const PASSWORD_HASH = hashSecret(DEMO_PASSWORD);
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
const chance = (p: number) => Math.random() < p;
const int = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
function weighted<T>(items: [T, number][]): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of items) if ((r -= w) <= 0) return v;
  return items[items.length - 1][0];
}
async function chunked<T>(rows: T[], size: number, fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}
const today = dateInTz(new Date(), TZ);

const CONSENT_TEXTS: Record<string, string> = {
  DATA_PROCESSING: `En cumplimiento de la Ley 1581 de 2012 y el Decreto 1377 de 2013, autorizo de manera previa, expresa e informada al colegio, como responsable del tratamiento, para recolectar, almacenar, usar y circular los datos personales del estudiante y de sus acudientes con las siguientes finalidades: (i) gestión académica y de bienestar; (ii) comunicación con la familia; (iii) atención en la enfermería escolar; (iv) cumplimiento de obligaciones legales. Declaro conocer mis derechos a conocer, actualizar, rectificar y suprimir los datos, solicitar prueba de la autorización y revocarla, así como presentar quejas ante la Superintendencia de Industria y Comercio. El tratamiento de datos de menores de edad respeta su interés superior (Ley 1098 de 2006). La política de tratamiento y el aviso de privacidad están disponibles en el portal.`,
  HEALTH_DATA: `Autorizo el tratamiento de los datos sensibles de salud del estudiante (antecedentes, alergias, condiciones crónicas, medicamentos, vacunación, atenciones y evolución) con la única finalidad de brindar atención de primeros auxilios y enfermería escolar, prevenir riesgos y gestionar emergencias. Entiendo que la entrega de estos datos es facultativa, que la historia clínica escolar es reservada y solo accesible por el personal de salud autorizado (Resolución 1995 de 1999 y Resolución 866 de 2021), que se conserva durante el tiempo que exige la norma y que la información mínima necesaria podrá compartirse con servicios de emergencia cuando la vida o la integridad del estudiante lo requieran.`,
  EMERGENCY_CARE: `Autorizo al personal de enfermería y a los brigadistas del colegio a prestar primeros auxilios al estudiante y, cuando su estado lo requiera, a solicitar ambulancia y trasladarlo a la IPS más cercana o a la IPS preferida registrada, acompañado por personal del colegio, mientras se contacta a los acudientes. Me comprometo a mantener actualizados los números de contacto y la información de aseguramiento (EPS, medicina prepagada, póliza de accidentes).`,
  MEDICATION_ADMIN: `Solicito y autorizo la administración, en el colegio, de los medicamentos que registre en el portal con la respectiva fórmula médica vigente. Entiendo que enfermería verificará la coincidencia entre la fórmula, la dosis, la vía, el horario y el envase; que podrá rechazar solicitudes incompletas; que aplicará la verificación de los "5 correctos"; que registrará cada dosis administrada u omitida con su motivo; y que los medicamentos entregados permanecen en custodia y no son propiedad del colegio.`,
  PHOTO_INJURY: `Autorizo que, cuando sea clínicamente útil, se tomen fotografías de lesiones del estudiante con fines exclusivos de registro en la historia clínica escolar y seguimiento de la evolución. Las fotografías se almacenan cifradas, no se publican ni se comparten fuera del personal de salud autorizado y de los acudientes.`,
};

// ── base configuration common to every tenant ──────────────────────────────
async function seedTenantBase(slug: string, name: string, domain: string, settings: Prisma.InputJsonValue) {
  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) {
    console.log(`  · ${slug} ya existe — se omite la base`);
    return { tenant: existing, created: false };
  }
  const tenant = await prisma.tenant.create({ data: { slug, name, country: 'CO', timezone: TZ, settings } });
  const tenantId = tenant.id;

  await prisma.permissionDef.createMany({ data: PERMISSIONS.map((key) => ({ key })), skipDuplicates: true });
  await prisma.roleDef.createMany({ data: ROLES.map((key) => ({ tenantId, key, label: ROLE_LABELS[key] })) });
  await prisma.rolePermission.createMany({
    data: ROLES.flatMap((role) => ROLE_PERMISSIONS[role].map((permissionKey) => ({ tenantId, roleKey: role, permissionKey }))),
  });
  await prisma.complianceProfile.createMany({
    data: COMPLIANCE_PROFILES.map((p) => ({ tenantId, country: p.country, name: p.name, rules: p as unknown as Prisma.InputJsonValue, active: p.country === 'CO' })),
  });
  await prisma.retentionPolicy.createMany({
    data: [
      { tenantId, entity: 'clinical_record', retentionYears: 15, action: 'REVIEW' },
      { tenantId, entity: 'audit_log', retentionYears: 15, action: 'ARCHIVE' },
      { tenantId, entity: 'notifications', retentionYears: 2, action: 'ANONYMIZE' },
      { tenantId, entity: 'passes', retentionYears: 5, action: 'ANONYMIZE' },
    ],
  });
  const consentTypes = ['DATA_PROCESSING', 'HEALTH_DATA', 'EMERGENCY_CARE', 'MEDICATION_ADMIN', 'PHOTO_INJURY'] as const;
  await prisma.consentTemplate.createMany({
    data: consentTypes.map((type) => ({
      tenantId,
      type,
      title: CONSENT_TYPE_LABELS[type],
      body: CONSENT_TEXTS[type],
      bodyHash: sha256(CONSENT_TEXTS[type]),
      version: '1.0',
      effectiveFrom: new Date('2026-08-01'),
      mandatory: ['DATA_PROCESSING', 'HEALTH_DATA', 'EMERGENCY_CARE'].includes(type),
    })),
  });
  await prisma.campus.create({ data: { tenantId, name: 'Sede principal', address: 'Barranquilla, Atlántico' } });

  // Medication catalog + inventory
  const catalog = await Promise.all(
    MEDICATION_CATALOG.map((m) =>
      prisma.medicationCatalog.create({
        data: { tenantId, genericName: m.genericName, brandNames: m.brandNames, form: m.form, concentration: m.concentration, route: m.route, atc: m.atc, otcAllowed: m.otcAllowed, controlled: m.controlled, requiresRefrigeration: m.requiresRefrigeration, rescue: m.rescue },
      }),
    ),
  );
  const locations = {
    shelf: await prisma.location.create({ data: { tenantId, name: 'Estante principal enfermería', kind: 'SHELF' } }),
    fridge: await prisma.location.create({ data: { tenantId, name: 'Nevera enfermería', kind: 'FRIDGE', minTempC: 2, maxTempC: 8 } }),
    controlled: await prisma.location.create({ data: { tenantId, name: 'Gabinete de controlados', kind: 'CONTROLLED_CABINET' } }),
    gateKit: await prisma.location.create({ data: { tenantId, name: 'Botiquín portería', kind: 'KIT' } }),
  };
  const supplier = await prisma.supplier.create({ data: { tenantId, name: 'Droguería Institucional S.A.S.', taxId: '900123456-7', contactName: 'Área comercial', phone: '6053000000', email: 'ventas@drogueria.example' } });
  const items: { id: string; name: string; unit: string }[] = [];
  for (const m of catalog.filter((m) => ['Acetaminofén', 'Ibuprofeno', 'Loratadina', 'Salbutamol', 'Epinefrina', 'Glucosa', 'Hidróxido de aluminio + hidróxido de magnesio', 'Sales de rehidratación oral', 'Butilbromuro de hioscina', 'Hidrocortisona', 'Clorhexidina', 'Lágrimas artificiales', 'Glucagón'].includes(m.genericName))) {
    const item = await prisma.item.create({
      data: {
        tenantId,
        kind: 'MEDICATION',
        name: `${m.genericName} ${m.concentration} ${m.form}`,
        genericName: m.genericName,
        presentation: m.form,
        concentration: m.concentration,
        unit: m.form === 'Tableta' ? 'tableta' : m.form === 'Autoinyector' ? 'unidad' : 'frasco',
        atcCode: m.atc,
        requiresRefrigeration: m.requiresRefrigeration,
        controlled: m.controlled,
        minStock: m.form === 'Tableta' ? 50 : 3,
        unitCost: m.form === 'Tableta' ? 150 : 25000,
        catalogMedicationId: m.id,
      },
    });
    items.push(item);
    const loc = m.requiresRefrigeration ? locations.fridge : m.controlled ? locations.controlled : locations.shelf;
    const qty = item.unit === 'tableta' ? int(80, 300) : int(3, 10);
    const lotA = `L${int(10000, 99999)}`;
    const batchA = await prisma.itemBatch.create({ data: { tenantId, itemId: item.id, locationId: loc.id, lot: lotA, expiryDate: new Date(addDays(today, int(200, 700))), quantity: qty, unitCost: item.unit === 'tableta' ? 150 : 25000, supplierId: supplier.id, source: 'PURCHASE' } });
    await prisma.stockMovement.create({ data: { tenantId, itemId: item.id, batchId: batchA.id, locationId: loc.id, type: 'RECEIPT', quantity: qty, reason: 'Inventario inicial', performedByUserId: randomUUID() } });
    if (chance(0.35)) {
      const soon = await prisma.itemBatch.create({ data: { tenantId, itemId: item.id, locationId: loc.id, lot: `L${int(10000, 99999)}`, expiryDate: new Date(addDays(today, int(5, 25))), quantity: item.unit === 'tableta' ? 20 : 1, source: 'PURCHASE', supplierId: supplier.id } });
      await prisma.stockMovement.create({ data: { tenantId, itemId: item.id, batchId: soon.id, locationId: loc.id, type: 'RECEIPT', quantity: soon.quantity, reason: 'Inventario inicial', performedByUserId: randomUUID() } });
    }
  }
  for (const s of SUPPLY_CATALOG) {
    const item = await prisma.item.create({ data: { tenantId, kind: 'SUPPLY', name: s.name, unit: s.unit, minStock: s.minStock, unitCost: 500 } });
    items.push(item);
    const qty = chance(0.15) ? Math.floor(s.minStock * 0.5) : s.minStock * int(2, 4);
    const b = await prisma.itemBatch.create({ data: { tenantId, itemId: item.id, locationId: locations.shelf.id, lot: `S${int(1000, 9999)}`, expiryDate: new Date(addDays(today, int(300, 900))), quantity: qty, source: 'PURCHASE', supplierId: supplier.id } });
    await prisma.stockMovement.create({ data: { tenantId, itemId: item.id, batchId: b.id, locationId: locations.shelf.id, type: 'RECEIPT', quantity: qty, reason: 'Inventario inicial', performedByUserId: randomUUID() } });
  }
  const byName = (n: string) => items.find((i) => i.name.startsWith(n))!;
  await prisma.kit.createMany({
    data: [
      {
        tenantId,
        name: 'Botiquín de emergencia — Portería',
        kind: 'EMERGENCY',
        locationDescription: 'Portería principal, junto al DEA',
        checkEveryDays: 15,
        items: [
          { itemId: byName('Epinefrina').id, expectedQuantity: 1 },
          { itemId: byName('Gasa').id, expectedQuantity: 10 },
          { itemId: byName('Guantes').id, expectedQuantity: 5 },
          { itemId: byName('Compresa fría').id, expectedQuantity: 3 },
        ],
        lastCheckedAt: new Date(addDays(today, -20)),
      },
      {
        tenantId,
        name: 'Kit salidas pedagógicas',
        kind: 'FIELD_TRIP',
        locationDescription: 'Enfermería, gabinete 2',
        checkEveryDays: 30,
        items: [
          { itemId: byName('Curitas').id, expectedQuantity: 20 },
          { itemId: byName('Venda').id, expectedQuantity: 2 },
          { itemId: byName('Salbutamol').id, expectedQuantity: 1 },
        ],
        lastCheckedAt: new Date(addDays(today, -5)),
      },
    ],
  });
  // Fridge log of the last 14 days (one excursion)
  for (let d = 14; d >= 0; d--) {
    for (const hour of ['07:00', '13:00']) {
      const temp = d === 3 && hour === '13:00' ? 9.4 : Math.round((3.5 + Math.random() * 3) * 10) / 10;
      await prisma.fridgeTemperatureLog.create({ data: { tenantId, locationId: locations.fridge.id, temperatureC: temp, recordedAt: zonedToUtc(addDays(today, -d), hour, TZ), outOfRange: temp < 2 || temp > 8 } });
    }
  }
  await prisma.safetyResource.createMany({
    data: [
      { tenantId, kind: 'AED', name: 'DEA 1', location: 'Portería principal' },
      { tenantId, kind: 'AED', name: 'DEA 2', location: 'Polideportivo' },
      { tenantId, kind: 'AED', name: 'DEA 3', location: 'Enfermería' },
      { tenantId, kind: 'MEETING_POINT', name: 'Punto de encuentro A', location: 'Cancha de fútbol' },
      { tenantId, kind: 'EXTINGUISHER', name: 'Extintor bloque primaria', location: 'Pasillo primaria, piso 1' },
    ],
  });
  await prisma.emergencyDrill.createMany({
    data: [
      { tenantId, protocolKey: 'anaphylaxis', performedOn: new Date(addDays(today, -40)), participants: 12, durationMinutes: 25, findings: 'Tiempo de llegada del autoinyector 3 min. Reforzar ubicación del botiquín.' },
      { tenantId, protocolKey: 'cpr', performedOn: new Date(addDays(today, -75)), participants: 30, durationMinutes: 90, findings: 'Capacitación de brigadistas completada.' },
    ],
  });
  await prisma.integrationSetting.createMany({
    data: [
      { tenantId, provider: 'PHIDIAS', enabled: slug === 'colegio-aleman' },
      { tenantId, provider: 'SMTP', enabled: false },
      { tenantId, provider: 'WHATSAPP', enabled: false },
    ],
  });

  // Accounts by role
  const mk = async (email: string, firstName: string, lastName: string, roles: { role: string; scopeSectionId?: string | null }[], extra: Partial<Prisma.UserUncheckedCreateInput> = {}) => {
    return prisma.user.create({
      data: {
        tenantId,
        email,
        passwordHash: PASSWORD_HASH,
        firstName,
        lastName,
        roles: { create: roles.map((r) => ({ tenantId, role: r.role, scopeSectionId: r.scopeSectionId ?? null })) },
        preference: { create: { tenantId, channels: { IN_APP: true, EMAIL: true } } },
        ...extra,
      },
    });
  };
  const users = {
    superadmin: slug === 'colegio-aleman' ? await mk(`superadmin@${domain}`, 'Super', 'Administrador', [{ role: 'SUPERADMIN' }]) : null,
    admin: await mk(`admin@${domain}`, 'Andrea', 'Administradora', [{ role: 'ADMIN' }]),
    coordinator: await mk(`coordinacion@${domain}`, 'Patricia', 'Coordinadora', [{ role: 'HEALTH_COORDINATOR' }]),
    nurse1: await mk(`enfermera1@${domain}`, 'Laura', 'Enfermera', [{ role: 'NURSE' }]),
    nurse2: await mk(`enfermera2@${domain}`, 'Carlos', 'Enfermero', [{ role: 'NURSE' }]),
    doctor: await mk(`medico@${domain}`, 'Ricardo', 'Médico', [{ role: 'DOCTOR' }]),
    psychologist: await mk(`psicologia@${domain}`, 'Mónica', 'Psicóloga', [{ role: 'PSYCHOLOGIST' }]),
    gate: await mk(`porteria@${domain}`, 'Jorge', 'Portero', [{ role: 'GATE' }], { kioskDeviceCode: 'PORTERIA-1', kioskPinHash: hashSecret('2468') }),
    director: await mk(`directivo@${domain}`, 'Elena', 'Rectora', [{ role: 'DIRECTOR' }]),
  };
  await prisma.auditLog.create({ data: { tenantId, action: 'seed.base_loaded', entity: 'tenant', entityId: tenantId, actorRole: 'SYSTEM' } });
  console.log(`  ✓ base ${slug}`);
  return { tenant, created: true, users, items, locations };
}

// ── demo tenant with synthetic data ────────────────────────────────────────
async function seedDemoTenant() {
  const base = await seedTenantBase('colegio-demo', 'Colegio Demo MediSchool', 'colegio-demo.test', { mfaEnforced: false, enabledChannels: ['IN_APP', 'EMAIL'] });
  if (!base.created) return;
  const tenantId = base.tenant.id;
  const U = base.users!;

  // Structure: 3 sections, 14 grades, 56 groups
  const structure = [
    { code: 'PRE', name: 'Preescolar', grades: [['PREJ', 'Prejardín', 3], ['JAR', 'Jardín', 4], ['TRA', 'Transición', 5]] },
    { code: 'PRI', name: 'Primaria', grades: [['P1', 'Primero', 6], ['P2', 'Segundo', 7], ['P3', 'Tercero', 8], ['P4', 'Cuarto', 9], ['P5', 'Quinto', 10]] },
    { code: 'BAC', name: 'Bachillerato', grades: [['B6', 'Sexto', 11], ['B7', 'Séptimo', 12], ['B8', 'Octavo', 13], ['B9', 'Noveno', 14], ['B10', 'Décimo', 15], ['B11', 'Undécimo', 16]] },
  ] as const;
  const groups: { id: string; code: string; age: number; gradeId: string; sectionId: string; sectionCode: string }[] = [];
  let order = 0;
  for (const s of structure) {
    const section = await prisma.section.create({ data: { tenantId, code: s.code, name: s.name, sortOrder: ++order } });
    let go = 0;
    for (const [code, name, age] of s.grades) {
      const grade = await prisma.grade.create({ data: { tenantId, sectionId: section.id, code, name, sortOrder: ++go } });
      for (const letter of ['A', 'B', 'C', 'D']) {
        const g = await prisma.group.create({ data: { tenantId, gradeId: grade.id, code: `${code}${letter}`, name: `${name} ${letter}` } });
        groups.push({ id: g.id, code: g.code, age, gradeId: grade.id, sectionId: section.id, sectionCode: s.code });
      }
    }
  }
  const primaria = await prisma.section.findFirstOrThrow({ where: { tenantId, code: 'PRI' } });
  await prisma.userRole.update({ where: { userId_role_scopeSectionId: { userId: U.director.id, role: 'DIRECTOR', scopeSectionId: null as unknown as string } }, data: { scopeSectionId: primaria.id } }).catch(async () => {
    await prisma.userRole.deleteMany({ where: { userId: U.director.id } });
    await prisma.userRole.create({ data: { tenantId, userId: U.director.id, role: 'DIRECTOR', scopeSectionId: primaria.id } });
  });

  // Teachers (120)
  const SUBJECTS = ['Matemáticas', 'Lenguaje', 'Ciencias', 'Sociales', 'Inglés', 'Alemán', 'Educación Física', 'Artes', 'Música', 'Tecnología'];
  const teachers: { id: string; name: string }[] = [];
  const teacherPersons: Prisma.PersonCreateManyInput[] = [];
  const teacherUsers: Prisma.UserCreateManyInput[] = [];
  for (let i = 1; i <= 120; i++) {
    const personId = randomUUID();
    const userId = randomUUID();
    const firstName = faker.person.firstName();
    const lastName = `${faker.person.lastName()} ${faker.person.lastName()}`;
    teacherPersons.push({ id: personId, tenantId, kind: 'STAFF', documentType: 'CC', documentNumber: String(30000000 + i), firstName, lastName, sex: chance(0.6) ? 'F' : 'M' });
    teacherUsers.push({ id: userId, tenantId, email: `docente${String(i).padStart(3, '0')}@colegio-demo.test`, passwordHash: PASSWORD_HASH, firstName, lastName, personId });
    teachers.push({ id: userId, name: `${firstName} ${lastName}` });
  }
  await prisma.person.createMany({ data: teacherPersons });
  await prisma.staff.createMany({ data: teacherPersons.map((p, i) => ({ tenantId, personId: p.id!, position: 'Docente', isTeacher: true, isFirstResponder: i % 12 === 0 })) });
  await prisma.user.createMany({ data: teacherUsers });
  await prisma.userRole.createMany({ data: teachers.map((t) => ({ tenantId, userId: t.id, role: 'TEACHER' })) });
  const tg: Prisma.TeacherGroupCreateManyInput[] = [];
  groups.forEach((g, gi) => {
    for (let k = 0; k < 3; k++) tg.push({ tenantId, userId: teachers[(gi * 2 + k) % 120].id, groupId: g.id, subject: SUBJECTS[(gi + k) % SUBJECTS.length] });
  });
  await prisma.teacherGroup.createMany({ data: tg, skipDuplicates: true });
  // Friendly demo teacher
  const demoTeacher = await prisma.user.create({
    data: { tenantId, email: 'docente@colegio-demo.test', passwordHash: PASSWORD_HASH, firstName: 'Diana', lastName: 'Docente', roles: { create: { tenantId, role: 'TEACHER' } } },
  });
  const demoGroups = groups.filter((g) => ['P3B', 'B8B'].includes(g.code));
  await prisma.teacherGroup.createMany({ data: demoGroups.map((g, i) => ({ tenantId, userId: demoTeacher.id, groupId: g.id, subject: i ? 'Matemáticas' : 'Ciencias' })) });

  // Students (1 500) + guardians
  const persons: Prisma.PersonCreateManyInput[] = [];
  const students: Prisma.StudentCreateManyInput[] = [];
  const guardianPersons: Prisma.PersonCreateManyInput[] = [];
  const guardians: Prisma.GuardianCreateManyInput[] = [];
  const links: Prisma.StudentGuardianCreateManyInput[] = [];
  const studentInfo: { id: string; personId: string; groupId: string; sex: 'M' | 'F'; birth: string; name: string; sectionCode: string; groupCode: string; guardianPersonIds: string[] }[] = [];
  for (let i = 0; i < 1500; i++) {
    const g = groups[i % groups.length];
    const sex = chance(0.5) ? 'M' : 'F';
    const personId = randomUUID();
    const studentId = randomUUID();
    const birth = addDays(`${new Date().getFullYear() - g.age}-01-01`, int(-150, 200));
    const firstName = faker.person.firstName(sex === 'M' ? 'male' : 'female');
    const ln1 = faker.person.lastName();
    const ln2 = faker.person.lastName();
    persons.push({ id: personId, tenantId, kind: 'STUDENT', documentType: g.age < 7 ? 'RC' : 'TI', documentNumber: String(1040000000 + i), firstName, lastName: `${ln1} ${ln2}`, birthDate: new Date(birth), sex, source: 'LOCAL' });
    students.push({ id: studentId, tenantId, personId, code: String(5000 + i), currentGroupId: g.id, enrollmentStatus: 'activo', shift: 'Única', transport: chance(0.4) ? `Ruta ${int(1, 18)}` : null });
    const gids: string[] = [];
    for (const [rel, gsex] of [['MOTHER', 'female'], ['FATHER', 'male']] as const) {
      if (rel === 'FATHER' && chance(0.45)) continue;
      const gp = randomUUID();
      const gd = randomUUID();
      guardianPersons.push({
        id: gp,
        tenantId,
        kind: 'GUARDIAN',
        documentType: 'CC',
        documentNumber: String(22000000 + guardianPersons.length),
        firstName: faker.person.firstName(gsex),
        lastName: rel === 'FATHER' ? `${ln1} ${faker.person.lastName()}` : `${ln2} ${faker.person.lastName()}`,
        email: `familia${i}${rel === 'MOTHER' ? 'm' : 'p'}@example.com`,
        mobile: `3${int(0, 2)}${int(10000000, 99999999)}`,
      });
      guardians.push({ id: gd, tenantId, personId: gp, occupation: faker.person.jobTitle().slice(0, 60) });
      links.push({ tenantId, studentId, guardianId: gd, relationship: rel, isPrimary: rel === 'MOTHER', priority: rel === 'MOTHER' ? 1 : 2 });
      gids.push(gp);
    }
    studentInfo.push({ id: studentId, personId, groupId: g.id, sex, birth, name: `${firstName} ${ln1}`, sectionCode: g.sectionCode, groupCode: g.code, guardianPersonIds: gids });
  }
  await chunked(persons, 1000, (c) => prisma.person.createMany({ data: c }));
  await chunked(students, 1000, (c) => prisma.student.createMany({ data: c }));
  await chunked(guardianPersons, 1000, (c) => prisma.person.createMany({ data: c }));
  await chunked(guardians, 1000, (c) => prisma.guardian.createMany({ data: c }));
  await chunked(links, 1000, (c) => prisma.studentGuardian.createMany({ data: c }));
  await chunked(
    studentInfo.map((s) => ({ tenantId, studentId: s.id, groupId: s.groupId, yearLabel: String(new Date().getFullYear()), status: 'activo' })),
    1000,
    (c) => prisma.enrollment.createMany({ data: c }),
  );
  // Parent accounts for the first 40 families; padre@ is the friendly one
  const parentUsers: Prisma.UserCreateManyInput[] = [];
  for (let i = 0; i < 40; i++) {
    const s = studentInfo[i * 37];
    const gp = guardianPersons.find((p) => p.id === s.guardianPersonIds[0])!;
    parentUsers.push({ id: randomUUID(), tenantId, email: i === 0 ? 'padre@colegio-demo.test' : `padre${String(i).padStart(3, '0')}@colegio-demo.test`, passwordHash: PASSWORD_HASH, firstName: gp.firstName, lastName: gp.lastName, personId: gp.id!, phone: gp.mobile });
  }
  await prisma.user.createMany({ data: parentUsers });
  await prisma.userRole.createMany({ data: parentUsers.map((u) => ({ tenantId, userId: u.id!, role: 'PARENT' })) });
  await prisma.notificationPreference.createMany({ data: parentUsers.map((u) => ({ tenantId, userId: u.id!, channels: { IN_APP: true, EMAIL: true, WHATSAPP: true } })) });
  console.log('  ✓ 1 500 estudiantes, 120 docentes, acudientes');

  // Health profiles, allergies, conditions, care plans, anthropometrics, vaccines
  const EPS = ['Sura', 'Sanitas', 'Nueva EPS', 'Compensar', 'Salud Total', 'Coomeva', 'Famisanar'];
  const BLOOD = ['O+', 'O+', 'O+', 'A+', 'A+', 'B+', 'O-', 'AB+', 'A-'];
  const profiles: Prisma.HealthProfileCreateManyInput[] = [];
  const allergies: Prisma.AllergyCreateManyInput[] = [];
  const conditions: Prisma.ChronicConditionCreateManyInput[] = [];
  const carePlans: Prisma.CarePlanCreateManyInput[] = [];
  const anthropo: Prisma.AnthropometricCreateManyInput[] = [];
  const vaccines: Prisma.ImmunizationCreateManyInput[] = [];
  const devices: Prisma.MedicalDeviceCreateManyInput[] = [];
  const conditionOf = new Map<string, string>();
  const ALLERGY_POOL = [
    ['MEDICATION', 'Penicilina', 'SEVERE', false, 'Urticaria generalizada'],
    ['FOOD', 'Maní', 'ANAPHYLAXIS', true, 'Edema de labios y dificultad respiratoria'],
    ['FOOD', 'Mariscos', 'SEVERE', false, 'Urticaria y vómito'],
    ['INSECT', 'Picadura de abeja', 'ANAPHYLAXIS', true, 'Anafilaxia previa'],
    ['ENVIRONMENTAL', 'Ácaros del polvo', 'MILD', false, 'Rinitis'],
    ['MEDICATION', 'Ibuprofeno', 'MODERATE', false, 'Angioedema leve'],
    ['LATEX', 'Látex', 'MODERATE', false, 'Dermatitis de contacto'],
    ['FOOD', 'Huevo', 'MODERATE', false, 'Urticaria'],
  ] as const;
  for (const s of studentInfo) {
    if (chance(0.78)) {
      const p = { bloodType: pick(BLOOD), eps: pick(EPS), prepaidPlan: chance(0.35) ? pick(['Colsanitas', 'Sura Prepagada', 'Coomeva MP']) : null, accidentInsurance: 'Póliza estudiantil', accidentPolicyNumber: `PE-${int(100000, 999999)}`, preferredIps: pick(['Clínica General del Norte', 'Clínica Portoazul', 'Clínica La Asunción']) };
      const filled = Object.values(p).filter(Boolean).length;
      profiles.push({ tenantId, personId: s.personId, ...p, completenessPct: Math.min(100, 40 + filled * 10), lastGuardianUpdateAt: chance(0.7) ? new Date(addDays(today, -int(5, 300))) : null });
    }
    if (chance(0.08)) {
      const a = pick(ALLERGY_POOL);
      allergies.push({ tenantId, personId: s.personId, category: a[0], agent: a[1], severity: a[2], requiresEpinephrine: a[3], reaction: a[4], verified: true });
    }
    const cond = weighted<[string, string, boolean] | null>([
      [null, 900],
      [['Asma', 'J45.9', true], 50],
      [['TDAH', 'F90.0', false], 30],
      [['Migraña', 'G43.9', false], 10],
      [['Epilepsia', 'G40.9', true], 7],
      [['Diabetes mellitus tipo 1', 'E10.9', true], 5],
      [['Enfermedad celíaca', 'K90.0', false], 5],
    ]);
    if (cond) {
      const condId = randomUUID();
      conditionOf.set(s.id, cond[0]);
      conditions.push({ id: condId, tenantId, personId: s.personId, name: cond[0], icd10Code: cond[1], critical: cond[2], diagnosedAt: new Date(addDays(today, -int(300, 2500))), treatingPhysician: `Dr(a). ${faker.person.lastName()}` });
      const plan = ENCOUNTER_TEMPLATES.find((t) => (cond[0] === 'Asma' && t.key === 'asthma_attack') || (cond[0] === 'Epilepsia' && t.key === 'seizure') || (cond[0].startsWith('Diabetes') && t.key === 'hypoglycemia'));
      if (plan) {
        carePlans.push({ tenantId, personId: s.personId, conditionId: condId, title: `Plan de acción — ${cond[0]}`, triggers: plan.redFlags.slice(0, 2), symptoms: plan.checklist.slice(0, 3), steps: plan.actions, rescueMedications: cond[0] === 'Asma' ? ['Salbutamol 100 mcg inhalador'] : cond[0] === 'Epilepsia' ? ['Midazolam bucal 5 mg/mL'] : ['Gel de glucosa 15 g', 'Glucagón 1 mg'], contacts: ['Acudiente principal', 'Médico tratante'], approvedBy: U.doctor.id, approvedAt: new Date(addDays(today, -30)) });
        if (cond[0] === 'Asma') devices.push({ tenantId, personId: s.personId, type: 'INHALER', description: 'Inhalador de salbutamol con inhalocámara', location: 'Maleta del estudiante' });
        if (cond[0].startsWith('Diabetes')) devices.push({ tenantId, personId: s.personId, type: 'GLUCOMETER', description: 'Glucómetro personal', location: 'Enfermería' });
      }
    }
    if (chance(0.6)) {
      const ageY = Number(today.slice(0, 4)) - Number(s.birth.slice(0, 4));
      const height = Math.round((75 + ageY * 6.2 + (Math.random() - 0.5) * 12) * 10) / 10;
      const weight = Math.round((9 + ageY * 2.9 + (Math.random() - 0.3) * ageY * 1.2) * 10) / 10;
      const measuredAt = addDays(today, -int(10, 200));
      const growth = computeGrowth({ sex: s.sex, birthDate: s.birth, measuredAt, weightKg: weight, heightCm: height });
      anthropo.push({ tenantId, personId: s.personId, measuredAt: new Date(measuredAt), weightKg: weight, heightCm: height, bmi: growth.bmi, bmiZ: growth.bmiForAge?.z, bmiPercentile: growth.bmiForAge?.percentile, heightZ: growth.heightForAge?.z, weightZ: growth.weightForAge?.z, classification: growth.classification?.code });
    }
    if (chance(0.5)) {
      vaccines.push({ tenantId, personId: s.personId, vaccine: 'Triple viral (SRP)', doseLabel: 'Refuerzo', administeredOn: new Date(addDays(s.birth, 540)), verified: true });
      if (chance(0.6)) vaccines.push({ tenantId, personId: s.personId, vaccine: 'Influenza', doseLabel: 'Anual', administeredOn: new Date(addDays(today, -int(30, 300))) });
    }
  }
  await chunked(profiles, 1000, (c) => prisma.healthProfile.createMany({ data: c }));
  await prisma.allergy.createMany({ data: allergies });
  await prisma.chronicCondition.createMany({ data: conditions });
  await prisma.carePlan.createMany({ data: carePlans });
  await prisma.medicalDevice.createMany({ data: devices });
  await chunked(anthropo, 1000, (c) => prisma.anthropometric.createMany({ data: c }));
  await chunked(vaccines, 1000, (c) => prisma.immunization.createMany({ data: c }));

  // Consents for 70 % of students
  const templates = await prisma.consentTemplate.findMany({ where: { tenantId, mandatory: true } });
  const consents: Prisma.ConsentCreateManyInput[] = [];
  for (const s of studentInfo) {
    if (!chance(0.7)) continue;
    for (const t of templates) consents.push({ tenantId, templateId: t.id, studentId: s.id, guardianPersonId: s.guardianPersonIds[0], signedByUserId: U.admin.id, method: 'OTP', signatureHash: sha256(`${t.id}:${s.id}:${t.bodyHash}`), signedAt: new Date(addDays(today, -int(10, 40))) });
  }
  await chunked(consents, 2000, (c) => prisma.consent.createMany({ data: c }));
  console.log('  ✓ fichas de salud, alergias, crónicos, consentimientos');

  // Encounters over the last 150 days, with passes for the recent ones
  const MOTIVES: [string, number, string, string, 'ILLNESS' | 'ACCIDENT'][] = [
    ['Dolor de cabeza', 151, 'headache', 'R51', 'ILLNESS'],
    ['Malestar estomacal', 92, 'abdominal_pain', 'K30', 'ILLNESS'],
    ['Raspadura', 79, 'wound', 'T14.0', 'ACCIDENT'],
    ['Malestar general', 48, 'fever', 'R53', 'ILLNESS'],
    ['Golpe leve', 45, 'contusion', 'T14.0', 'ACCIDENT'],
    ['Dolor de garganta', 40, 'fever', 'J02.9', 'ILLNESS'],
    ['Dolor muscular', 40, 'contusion', 'M79.1', 'ILLNESS'],
    ['Golpe en miembros inferiores', 19, 'contusion', 'S80.0', 'ACCIDENT'],
    ['Cólico menstrual', 16, 'menstrual_pain', 'N94.6', 'ILLNESS'],
    ['Congestión nasal', 16, 'fever', 'J00', 'ILLNESS'],
    ['Torcedura de tobillo', 14, 'contusion', 'S93.4', 'ACCIDENT'],
    ['Golpe en la cabeza', 12, 'head_trauma', 'S00.9', 'ACCIDENT'],
    ['Náuseas / vómito', 9, 'abdominal_pain', 'R11', 'ILLNESS'],
    ['Reacción alérgica', 7, 'allergic_reaction', 'T78.4', 'ILLNESS'],
    ['Fiebre', 6, 'fever', 'R50.9', 'ILLNESS'],
    ['Epistaxis', 4, 'epistaxis', 'R04.0', 'ILLNESS'],
    ['Crisis de ansiedad', 5, 'anxiety', 'F41.9', 'ILLNESS'],
    ['Crisis asmática', 3, 'asthma_attack', 'J45.9', 'ILLNESS'],
  ];
  const nurses = [U.nurse1, U.nurse2];
  const teacherByGroup = new Map<string, string[]>();
  for (const t of tg) teacherByGroup.set(t.groupId, [...(teacherByGroup.get(t.groupId) ?? []), t.userId]);
  const subjectByTeacherGroup = new Map(tg.map((t) => [`${t.userId}:${t.groupId}`, t.subject ?? 'Clase']));
  const encounters: Prisma.EncounterCreateManyInput[] = [];
  const vitals: Prisma.VitalSignCreateManyInput[] = [];
  const diagnoses: Prisma.EncounterDiagnosisCreateManyInput[] = [];
  const incidents: Prisma.IncidentReportCreateManyInput[] = [];
  const passes: Prisma.PassCreateManyInput[] = [];
  const passEvents: Prisma.PassEventCreateManyInput[] = [];
  const schoolDays: string[] = [];
  for (let d = 150; d >= 1; d--) {
    const date = addDays(today, -d);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) schoolDays.push(date);
  }
  const frequent = studentInfo[123];
  const outbreakGroup = groups.find((g) => g.code === 'P3B')!;
  const outbreakStudents = studentInfo.filter((s) => s.groupId === outbreakGroup.id).slice(0, 6);

  const addEncounter = (s: (typeof studentInfo)[number], date: string, motive: (typeof MOTIVES)[number], opts: { subject?: string; teacherId?: string } = {}) => {
    const time = `${String(int(7, 14)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}`;
    const startedAt = zonedToUtc(date, time, TZ);
    const careMinutes = int(6, 35);
    const endedAt = new Date(startedAt.getTime() + careMinutes * 60_000);
    const nurse = pick(nurses);
    const id = randomUUID();
    const disposition = weighted([['RETURN_TO_CLASS', 85], ['GUARDIAN_PICKUP', 12], ['COORDINATION_REPORT', 2.5], ['TRANSFER_IPS', 0.5]] as [string, number][]);
    const template = ENCOUNTER_TEMPLATES.find((t) => t.key === motive[2])!;
    const teacherId = opts.teacherId ?? pick(teacherByGroup.get(s.groupId) ?? [teachers[0].id]);
    const recent = schoolDays.indexOf(date) > schoolDays.length - 45;
    let passId: string | null = null;
    if (recent) {
      passId = randomUUID();
      const requestedAt = new Date(startedAt.getTime() - int(2, 11) * 60_000);
      const inCareAt = new Date(startedAt.getTime() + int(1, 4) * 60_000);
      const waiting = disposition === 'GUARDIAN_PICKUP';
      const handedOverAt = waiting ? new Date(endedAt.getTime() + int(20, 70) * 60_000) : null;
      const closedAt = waiting ? handedOverAt! : new Date(endedAt.getTime() + int(3, 10) * 60_000);
      passes.push({
        id: passId,
        tenantId,
        studentId: s.id,
        issuedByUserId: teacherId,
        code: randomBytes(3).toString('hex').toUpperCase(),
        qrToken: randomBytes(18).toString('base64url'),
        subject: opts.subject ?? subjectByTeacherGroup.get(`${teacherId}:${s.groupId}`) ?? 'Clase',
        reason: motive[0],
        urgency: motive[0].includes('Crisis') || motive[0].includes('cabeza') ? 'HIGH' : 'MEDIUM',
        state: 'CLOSED',
        requestedAt,
        inTransitAt: requestedAt,
        receivedAt: startedAt,
        inCareAt,
        returnedAt: waiting ? null : endedAt,
        waitingGuardianAt: waiting ? endedAt : null,
        exitAuthorizedAt: waiting ? new Date(endedAt.getTime() + 5 * 60_000) : null,
        handedOverAt,
        closedAt,
      });
      const evs: [string | null, string, Date, string][] = waiting
        ? [[null, 'REQUESTED', requestedAt, 'TEACHER'], ['REQUESTED', 'IN_TRANSIT', requestedAt, 'TEACHER'], ['IN_TRANSIT', 'RECEIVED', startedAt, 'NURSE'], ['RECEIVED', 'IN_CARE', inCareAt, 'NURSE'], ['IN_CARE', 'WAITING_GUARDIAN', endedAt, 'NURSE'], ['WAITING_GUARDIAN', 'EXIT_AUTHORIZED', new Date(endedAt.getTime() + 5 * 60_000), 'NURSE'], ['EXIT_AUTHORIZED', 'HANDED_OVER', handedOverAt!, 'GATE'], ['HANDED_OVER', 'CLOSED', closedAt, 'SYSTEM']]
        : [[null, 'REQUESTED', requestedAt, 'TEACHER'], ['REQUESTED', 'IN_TRANSIT', requestedAt, 'TEACHER'], ['IN_TRANSIT', 'RECEIVED', startedAt, 'NURSE'], ['RECEIVED', 'IN_CARE', inCareAt, 'NURSE'], ['IN_CARE', 'RETURNED_TO_CLASS', endedAt, 'NURSE'], ['RETURNED_TO_CLASS', 'CLOSED', closedAt, 'SYSTEM']];
      for (const [from, to, at, role] of evs) passEvents.push({ tenantId, passId, fromState: from, toState: to, actorRole: role, actorUserId: role === 'TEACHER' ? teacherId : role === 'NURSE' ? nurse.id : role === 'GATE' ? U.gate.id : null, createdAt: at });
    }
    encounters.push({
      id,
      tenantId,
      personId: s.personId,
      studentId: s.id,
      subjectType: 'STUDENT',
      passId,
      type: motive[4] === 'ACCIDENT' ? 'ACCIDENT' : template.type === 'CHRONIC_CONTROL' ? 'CHRONIC_CONTROL' : template.type === 'MENTAL_HEALTH' ? 'MENTAL_HEALTH' : 'ILLNESS',
      status: 'OPEN',
      chiefComplaint: motive[0],
      templateKey: template.key,
      referredBy: teachers.find((t) => t.id === teacherId)?.name ?? null,
      startedAt,
      endedAt,
      disposition,
      subjective: `Estudiante refiere ${motive[0].toLowerCase()} de inicio reciente.`,
      objective: 'Alerta, orientado(a), hidratado(a).',
      assessment: template.label,
      plan: template.actions.join('. '),
      treatments: motive[0] === 'Dolor de cabeza' && chance(0.4) ? [{ description: 'Acetaminofén 500 mg VO (autorizado por acudiente)' }] : [],
      parentSummary: disposition === 'GUARDIAN_PICKUP' ? 'Se recomienda reposo en casa y observación.' : 'Retornó al aula en buenas condiciones.',
      attendedByUserId: nurse.id,
      signedByUserId: nurse.id,
      signedAt: endedAt,
    });
    if (chance(0.7)) {
      const fever = motive[0] === 'Fiebre' || (motive[2] === 'fever' && chance(0.4));
      vitals.push({ tenantId, encounterId: id, takenAt: new Date(startedAt.getTime() + 60_000), temperatureC: fever ? Math.round((38 + Math.random() * 1.2) * 10) / 10 : Math.round((36.2 + Math.random() * 1) * 10) / 10, heartRate: int(70, 110), respiratoryRate: int(16, 24), spo2: int(95, 99), painScore: int(0, 6), worstLevel: fever ? 'warning' : 'normal', takenBy: nurse.id });
    }
    diagnoses.push({ tenantId, encounterId: id, system: 'ICD10', code: motive[3], description: template.icd10.find((d) => d.code === motive[3])?.description ?? template.label, primary: true });
    if (motive[4] === 'ACCIDENT') {
      incidents.push({ tenantId, encounterId: id, place: weighted(SCHOOL_ZONES.slice(0, 14).map((z, i) => [z, 14 - i] as [string, number])), mechanism: motive[0], severity: chance(0.95) ? 'MILD' : 'MODERATE', activity: pick(['Recreo', 'Educación física', 'Clase', 'Almuerzo', 'Salida']), witnesses: [] });
    }
  };

  for (const date of schoolDays) {
    const n = int(12, 22);
    for (let k = 0; k < n; k++) addEncounter(pick(studentInfo), date, weighted(MOTIVES.map((m) => [m, m[1]] as [(typeof MOTIVES)[number], number])));
  }
  // Frequent visitor: 12 visits, 9 of them during Mathematics
  const mathTeacher = demoTeacher.id;
  for (let k = 0; k < 12; k++) addEncounter(frequent, schoolDays[schoolDays.length - 1 - k * 2], MOTIVES[1], k < 9 ? { subject: 'Matemáticas', teacherId: mathTeacher } : {});
  // Outbreak cluster: gastrointestinal cases in P3B during the last 4 school days
  outbreakStudents.forEach((s, i) => addEncounter(s, schoolDays[schoolDays.length - 1 - (i % 4)], MOTIVES[12]));

  await chunked(passes, 1000, (c) => prisma.pass.createMany({ data: c }));
  await chunked(encounters, 1000, (c) => prisma.encounter.createMany({ data: c }));
  await chunked(passEvents, 2000, (c) => prisma.passEvent.createMany({ data: c }));
  await chunked(vitals, 2000, (c) => prisma.vitalSign.createMany({ data: c }));
  await chunked(diagnoses, 2000, (c) => prisma.encounterDiagnosis.createMany({ data: c }));
  await chunked(incidents, 2000, (c) => prisma.incidentReport.createMany({ data: c }));
  await prisma.$executeRaw`UPDATE clinical.encounters SET status = 'CLOSED' WHERE tenant_id = ${tenantId}::uuid AND status = 'OPEN'`;
  // Staff first aid
  const staffEnc: Prisma.EncounterCreateManyInput[] = teacherPersons.slice(0, 60).map((p, i) => {
    const startedAt = zonedToUtc(schoolDays[(i * 7) % schoolDays.length], `${String(int(7, 15)).padStart(2, '0')}:15`, TZ);
    return { tenantId, personId: p.id!, subjectType: 'STAFF', type: 'STAFF_FIRST_AID', status: 'CLOSED', chiefComplaint: pick(['Dolor de cabeza', 'Dolor de espalda', 'Malestar general', 'Golpe leve']), startedAt, endedAt: new Date(startedAt.getTime() + 15 * 60_000), disposition: 'STAFF_RETURN_TO_WORK', attendedByUserId: U.nurse1.id, signedByUserId: U.nurse1.id, signedAt: new Date(startedAt.getTime() + 15 * 60_000) };
  });
  for (const e of staffEnc) await prisma.encounter.create({ data: e });
  console.log(`  ✓ ${encounters.length} atenciones, ${passes.length} pases`);

  // Medication requests with custody and administration history
  const catalog = await prisma.medicationCatalog.findMany({ where: { tenantId } });
  const cat = (g: string, form?: string) => catalog.find((c) => c.genericName === g && (!form || c.form === form))!;
  const medStudents = studentInfo.filter((s) => conditionOf.has(s.id)).slice(0, 40);
  const shelf = await prisma.location.findFirstOrThrow({ where: { tenantId, kind: 'SHELF' } });
  let adminCount = 0;
  for (const [i, s] of medStudents.entries()) {
    const condition = conditionOf.get(s.id)!;
    const spec =
      condition === 'TDAH'
        ? { c: cat('Metilfenidato'), dose: 10, unit: 'mg', times: ['10:00'], prn: false, route: 'ORAL', controlled: true }
        : condition === 'Asma'
          ? { c: cat('Salbutamol'), dose: 2, unit: 'inhalaciones', times: [], prn: true, route: 'INHALED', controlled: false }
          : condition.startsWith('Diabetes')
            ? { c: cat('Insulina lispro'), dose: 4, unit: 'UI', times: ['12:00'], prn: false, route: 'SUBCUTANEOUS', controlled: false }
            : condition === 'Epilepsia'
              ? { c: cat('Midazolam'), dose: 5, unit: 'mg', times: [], prn: true, route: 'BUCCAL', controlled: true }
              : { c: cat('Acetaminofén', 'Tableta'), dose: 500, unit: 'mg', times: [], prn: true, route: 'ORAL', controlled: false };
    const status = i < 3 ? 'SUBMITTED' : 'ACTIVE';
    const start = addDays(today, -30);
    const req = await prisma.medicationRequest.create({
      data: {
        tenantId,
        studentId: s.id,
        guardianPersonId: s.guardianPersonIds[0],
        catalogId: spec.c.id,
        medicationName: `${spec.c.genericName} ${spec.c.concentration}`,
        activeIngredient: spec.c.genericName,
        presentation: spec.c.form,
        dose: spec.dose,
        doseUnit: spec.unit,
        route: spec.route,
        frequency: spec.prn ? 'PRN' : 'WEEKDAYS',
        times: spec.times,
        daysOfWeek: spec.prn ? [] : [1, 2, 3, 4, 5],
        startDate: new Date(start),
        endDate: new Date(addDays(today, 120)),
        indication: spec.prn ? `Rescate según plan de acción (${condition})` : `Tratamiento de ${condition}`,
        prescriberName: `Dr(a). ${faker.person.lastName()}`,
        prescriberLicense: `RM-${int(10000, 99999)}`,
        isPrn: spec.prn,
        prnCriteria: spec.prn ? 'Según síntomas del plan de acción individual' : null,
        minIntervalMinutes: spec.prn ? 240 : null,
        maxDosesPerDay: spec.prn ? 3 : null,
        controlled: spec.controlled,
        storage: spec.c.requiresRefrigeration ? 'FRIDGE' : spec.controlled ? 'CONTROLLED' : 'SHELF',
        status,
        reviewedBy: status === 'ACTIVE' ? U.nurse1.id : null,
        reviewedAt: status === 'ACTIVE' ? new Date(start) : null,
        reviewChecks: status === 'ACTIVE' ? { prescriptionMatches: true, doseMatches: true, notExpired: true, packagingIntact: true, labeled: true } : undefined,
      },
    });
    if (status !== 'ACTIVE') continue;
    const custody = await prisma.medicationCustody.create({
      data: { tenantId, requestId: req.id, quantityReceived: 60, quantityRemaining: 60, unit: spec.unit === 'mg' ? 'tabletas' : 'unidades', lot: `M${int(1000, 9999)}`, expiryDate: new Date(addDays(today, i === 4 ? 12 : int(90, 400))), deliveredBy: 'Acudiente', receivedByUserId: U.nurse1.id, storage: spec.c.requiresRefrigeration ? 'FRIDGE' : 'SHELF', locationId: shelf.id, packagingIntact: true, labeled: true, receivedAt: new Date(start) },
    });
    if (spec.prn) continue;
    let remaining = 60;
    for (const date of schoolDays.filter((d) => d >= start)) {
      const scheduledFor = zonedToUtc(date, spec.times[0], TZ);
      const omitted = chance(0.05);
      const sched = await prisma.medicationSchedule.create({ data: { tenantId, requestId: req.id, studentId: s.id, scheduledFor, status: omitted ? 'OMITTED' : 'GIVEN' } });
      await prisma.medicationAdministration.create({
        data: {
          tenantId,
          requestId: req.id,
          scheduleId: sched.id,
          studentId: s.id,
          custodyId: custody.id,
          administeredAt: new Date(scheduledFor.getTime() + int(-10, 15) * 60_000),
          administeredByUserId: pick(nurses).id,
          dose: spec.dose,
          doseUnit: spec.unit,
          route: spec.route,
          outcome: omitted ? 'OMITTED' : 'GIVEN',
          reason: omitted ? 'Estudiante ausente' : null,
          verification: { ok: !omitted, rights: { patient: true, medication: true, dose: true, route: true, time: true } },
        },
      });
      if (!omitted) remaining -= 1;
      adminCount++;
    }
    await prisma.medicationCustody.update({ where: { id: custody.id }, data: { quantityRemaining: remaining } });
  }
  console.log(`  ✓ ${medStudents.length} solicitudes de medicación, ${adminCount} administraciones`);

  // Public health
  const campaign = await prisma.campaign.create({ data: { tenantId, name: 'Vacunación VPH 2026', kind: 'VACCINATION', startsOn: new Date(addDays(today, -10)), endsOn: new Date(addDays(today, 20)), description: 'Jornada con la Secretaría de Salud para estudiantes de 9 a 17 años.', audience: { sectionCodes: ['BAC'] }, status: 'ACTIVE', createdBy: U.coordinator.id } });
  await prisma.campaignParticipant.createMany({
    data: studentInfo.filter((s) => s.sectionCode === 'BAC').slice(0, 300).map((s) => ({ tenantId, campaignId: campaign.id, studentId: s.id, status: weighted([['DONE', 45], ['PENDING', 45], ['REFUSED', 5], ['EXEMPT', 5]] as [string, number][]) })),
  });
  const screening = await prisma.campaign.create({ data: { tenantId, name: 'Tamizaje visual Primaria', kind: 'SCREENING', startsOn: new Date(addDays(today, -60)), endsOn: new Date(addDays(today, -30)), audience: { sectionCodes: ['PRI'] }, status: 'CLOSED', createdBy: U.nurse1.id } });
  const screenings: Prisma.ScreeningCreateManyInput[] = studentInfo.filter((s) => s.sectionCode === 'PRI').slice(0, 250).map((s) => {
    const abnormal = chance(0.12);
    return { tenantId, personId: s.personId, type: 'VISUAL', performedOn: new Date(addDays(today, -int(31, 59))), result: abnormal ? 'ABNORMAL' : 'NORMAL', details: { od: abnormal ? '20/40' : '20/20', oi: abnormal ? '20/50' : '20/20' }, referral: abnormal ? 'Remisión a optometría' : null, campaignId: screening.id, createdBy: U.nurse1.id };
  });
  await prisma.screening.createMany({ data: screenings });
  await prisma.absenceExcuse.createMany({
    data: Array.from({ length: 40 }, () => {
      const s = pick(studentInfo);
      const from = addDays(today, -int(1, 60));
      return { tenantId, studentId: s.id, fromDate: new Date(from), toDate: new Date(addDays(from, int(0, 3))), reason: pick(['Gripa', 'Gastroenteritis', 'Control médico', 'Fiebre', 'Varicela']), illness: true, symptoms: pick(['Fiebre y tos', 'Vómito y diarrea', 'Brote en la piel', null]), status: pick(['SUBMITTED', 'VALIDATED']) };
    }),
  });
  await prisma.circular.create({ data: { tenantId, title: 'Recomendaciones ante casos de gastroenteritis', body: 'Refuerce el lavado de manos, el consumo de agua segura y no envíe al estudiante al colegio si presenta vómito, diarrea o fiebre en las últimas 24 horas.', category: 'OUTBREAK', audience: { groupCodes: ['P3B'] }, channels: ['IN_APP', 'EMAIL'], createdByUserId: U.coordinator.id, recipientsCount: 0 } });
  await prisma.fieldTrip.create({ data: { tenantId, name: 'Visita al Museo del Caribe', date: new Date(addDays(today, 7)), destination: 'Museo del Caribe, Barranquilla', groupIds: demoGroups.map((g) => g.id), responsibleStaff: 'Diana Docente' } });
  await prisma.auditLog.create({ data: { tenantId, action: 'seed.demo_loaded', entity: 'tenant', entityId: tenantId, actorRole: 'SYSTEM' } });
  await prisma.$executeRawUnsafe('SELECT reporting.refresh_all()');
  console.log('  ✓ campañas, tamizajes, excusas, circulares');
}

// ── real tenant: base + demo links after the Phidias sync ──────────────────
async function seedRealTenant() {
  await seedTenantBase('colegio-aleman', 'Colegio Alemán de Barranquilla', 'colegio-aleman.test', {
    mfaEnforced: false,
    enabledChannels: ['IN_APP', 'EMAIL'],
    passTransitAlertMinutes: 10,
  });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: 'colegio-aleman' } });
  if (!(await prisma.user.findFirst({ where: { tenantId: tenant.id, email: 'docente@colegio-aleman.test' } }))) {
    await prisma.user.create({ data: { tenantId: tenant.id, email: 'docente@colegio-aleman.test', passwordHash: PASSWORD_HASH, firstName: 'Diana', lastName: 'Docente', roles: { create: { tenantId: tenant.id, role: 'TEACHER' } } } });
    await prisma.user.create({ data: { tenantId: tenant.id, email: 'padre@colegio-aleman.test', passwordHash: PASSWORD_HASH, firstName: 'Pablo', lastName: 'Acudiente', phone: '3000000000', roles: { create: { tenantId: tenant.id, role: 'PARENT' } }, preference: { create: { tenantId: tenant.id, channels: { IN_APP: true, EMAIL: true } } } } });
  }
}

/**
 * Institutional administrator of the real school, read from the environment so
 * credentials never live in the repository:
 *   SCHOOL_EMAIL_DOMAIN, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_FIRST_NAME, SEED_ADMIN_LAST_NAME
 * Idempotent: creates the user once; an existing user keeps its current password.
 */
async function seedRealAdmin() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: 'colegio-aleman' } });
  const domain = process.env.SCHOOL_EMAIL_DOMAIN?.trim().toLowerCase();
  if (domain) {
    const settings = { ...((tenant.settings as Record<string, unknown>) ?? {}), institutionalEmailDomain: domain };
    await prisma.tenant.update({ where: { id: tenant.id }, data: { settings: settings as Prisma.InputJsonValue } });
    console.log(`  ✓ dominio institucional: @${domain}`);
  }
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) return;
  if (password.length < 10) throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 10 caracteres');
  const existing = await prisma.user.findFirst({ where: { tenantId: tenant.id, email }, include: { roles: true } });
  if (existing) {
    if (!existing.roles.some((r) => r.role === 'ADMIN')) await prisma.userRole.create({ data: { tenantId: tenant.id, userId: existing.id, role: 'ADMIN' } });
    console.log(`  · administrador ${email} ya existe (se conserva su contraseña)`);
    return;
  }
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email,
      passwordHash: hashSecret(password),
      firstName: process.env.SEED_ADMIN_FIRST_NAME ?? 'Administrador',
      lastName: process.env.SEED_ADMIN_LAST_NAME ?? 'Institucional',
      mustChangePassword: false,
      roles: { create: [{ tenantId: tenant.id, role: 'ADMIN' }] },
      preference: { create: { tenantId: tenant.id, channels: { IN_APP: true, EMAIL: true } } },
    },
  });
  await prisma.auditLog.create({ data: { tenantId: tenant.id, action: 'seed.admin_created', entity: 'user', entityId: user.id, actorRole: 'SYSTEM' } });
  console.log(`  ✓ administrador institucional ${email}`);
}

async function seedRealLinks() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: 'colegio-aleman' } });
  const tenantId = tenant.id;
  const teacher = await prisma.user.findFirstOrThrow({ where: { tenantId, email: 'docente@colegio-aleman.test' } });
  const parent = await prisma.user.findFirstOrThrow({ where: { tenantId, email: 'padre@colegio-aleman.test' } });
  const director = await prisma.user.findFirstOrThrow({ where: { tenantId, email: 'directivo@colegio-aleman.test' } });
  const groups = await prisma.group.findMany({ where: { tenantId, code: { in: ['K8B', 'K5A', 'KIN1'] } } });
  for (const g of groups) {
    await prisma.teacherGroup.upsert({ where: { userId_groupId: { userId: teacher.id, groupId: g.id } }, create: { tenantId, userId: teacher.id, groupId: g.id, subject: g.code === 'K5A' ? 'Matemáticas' : 'Ciencias' }, update: {} });
  }
  const primaria = await prisma.section.findFirst({ where: { tenantId, code: 'PRI' } });
  if (primaria) {
    await prisma.userRole.deleteMany({ where: { userId: director.id } });
    await prisma.userRole.create({ data: { tenantId, userId: director.id, role: 'DIRECTOR', scopeSectionId: primaria.id } });
  }
  // The Phidias test record "ESTUDIANTE PRUEBA" (code 8888) is linked to the demo parent.
  const student = (await prisma.student.findFirst({ where: { tenantId, code: '8888' }, include: { person: true } })) ?? (await prisma.student.findFirst({ where: { tenantId, status: 'ACTIVE' }, include: { person: true } }));
  if (!student) {
    console.log('  ! no hay estudiantes: ejecute primero npm run phidias:sync');
    return;
  }
  let guardianPerson = parent.personId ? await prisma.person.findUnique({ where: { id: parent.personId } }) : null;
  if (!guardianPerson) {
    guardianPerson = await prisma.person.create({ data: { tenantId, kind: 'GUARDIAN', documentType: 'CC', documentNumber: '1000000000', firstName: 'Pablo', lastName: 'Acudiente', email: parent.email, mobile: '3000000000' } });
    await prisma.user.update({ where: { id: parent.id }, data: { personId: guardianPerson.id } });
  }
  const guardian = (await prisma.guardian.findUnique({ where: { personId: guardianPerson.id } })) ?? (await prisma.guardian.create({ data: { tenantId, personId: guardianPerson.id } }));
  await prisma.studentGuardian.upsert({ where: { studentId_guardianId: { studentId: student.id, guardianId: guardian.id } }, create: { tenantId, studentId: student.id, guardianId: guardian.id, relationship: 'FATHER', isPrimary: true }, update: { active: true } });
  if (!(await prisma.healthProfile.findUnique({ where: { personId: student.personId } }))) {
    await prisma.healthProfile.create({ data: { tenantId, personId: student.personId, bloodType: 'O+', eps: 'Sura', accidentInsurance: 'Póliza estudiantil', preferredIps: 'Clínica Portoazul', completenessPct: 70 } });
    await prisma.allergy.create({ data: { tenantId, personId: student.personId, category: 'FOOD', agent: 'Maní', severity: 'ANAPHYLAXIS', requiresEpinephrine: true, reaction: 'Edema de labios y dificultad respiratoria', verified: true } });
    await prisma.emergencyContact.create({ data: { tenantId, studentId: student.id, name: 'Abuela Rosa', relationship: 'Abuela', phone: '3001112233', canPickUp: true } });
  }
  console.log(`  ✓ vínculos demo: docente → ${groups.map((g) => g.code).join(', ')}; padre → ${student.person.firstName} ${student.person.lastName} (${student.code})`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  console.log('Seed MediSchool');
  if (args.has('--links')) {
    await seedRealLinks();
    return;
  }
  if (args.has('--admin')) {
    await seedRealAdmin();
    return;
  }
  await seedRealTenant();
  await seedRealAdmin();
  if (!args.has('--no-demo')) await seedDemoTenant();
  console.log(`\nContraseña de las cuentas demo: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
