import { createPrisma, withTenant } from '@sgee/db';
import { authenticator } from 'otplib';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, bearer, PASSWORD, setupWorld, type World } from './world';

let w: World;
const appDb = createPrisma(process.env.TEST_DATABASE_URL);

beforeAll(async () => {
  w = await setupWorld();
});
afterAll(async () => {
  await w.app.close();
  await appDb.$disconnect();
});

describe('Row Level Security (tenant isolation)', () => {
  it('the application role only sees rows of the current tenant', async () => {
    const countA = await withTenant(appDb, { tenantId: w.A.id }, (tx) => tx.student.count());
    const countB = await withTenant(appDb, { tenantId: w.B.id }, (tx) => tx.student.count());
    expect(countA).toBe(2);
    expect(countB).toBe(2);
    const leaked = await withTenant(appDb, { tenantId: w.B.id }, (tx) => tx.student.findUnique({ where: { id: w.A.students.a1.id } }));
    expect(leaked).toBeNull();
  });

  it('without tenant context nothing is visible', async () => {
    expect(await withTenant(appDb, {}, (tx) => tx.student.count())).toBe(0);
    expect(await withTenant(appDb, {}, (tx) => tx.user.count())).toBe(0);
  });

  it('rejects writes into another tenant (WITH CHECK)', async () => {
    await expect(
      withTenant(appDb, { tenantId: w.A.id }, (tx) => tx.person.create({ data: { tenantId: w.B.id, kind: 'STUDENT', firstName: 'X', lastName: 'Y' } })),
    ).rejects.toThrow();
  });

  it('the app role cannot bypass RLS with a superuser privilege', async () => {
    const [r] = await appDb.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(r).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('API: a nurse of tenant A cannot read a student of tenant B', async () => {
    const t = await w.token(w.A.users.nurse.email);
    const res = await w.http().get(`/api/v1/students/${w.B.students.a1.id}`).set(bearer(t));
    expect(res.status).toBe(404);
  });
});

describe('Authentication & authorization', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await w.http().get('/api/v1/students');
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('enforces role permissions (RBAC) and scopes (ABAC)', async () => {
    const teacher = await w.token(w.A.users.teacher.email);
    expect((await w.http().get('/api/v1/encounters').set(bearer(teacher))).status).toBe(403);
    const parent = await w.token(w.A.users.parent.email);
    expect((await w.http().get(`/api/v1/students/${w.A.students.a1.id}`).set(bearer(parent))).status).toBe(200);
    expect((await w.http().get(`/api/v1/students/${w.A.students.a2.id}`).set(bearer(parent))).status).toBe(403);
    const list = await w.http().get('/api/v1/students').set(bearer(parent));
    expect(list.body.items.map((s: { id: string }) => s.id)).toEqual([w.A.students.a1.id]);
    expect((await w.http().get('/api/v1/admin/users').set(bearer(parent))).status).toBe(403);
  });

  it('logs clinical record access', async () => {
    const nurse = await w.token(w.A.users.nurse.email);
    await w.http().get(`/api/v1/students/${w.A.students.a2.id}/health-profile`).set(bearer(nurse)).expect(200);
    const logs = await admin.clinicalAccessLog.count({ where: { tenantId: w.A.id, personId: w.A.students.a2.personId, userId: w.A.users.nurse.id } });
    expect(logs).toBeGreaterThan(0);
  });

  it('locks the account after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await w.http().post('/api/v1/auth/login').send({ email: w.B.users.director.email, password: 'wrong' });
      expect(r.status).toBe(401);
    }
    const locked = await w.http().post('/api/v1/auth/login').send({ email: w.B.users.director.email, password: PASSWORD });
    expect(locked.status).toBe(423);
    expect(locked.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('protects cookie sessions against CSRF and rotates refresh tokens', async () => {
    const agent = request.agent(w.app.getHttpServer());
    const login = await agent.post('/api/v1/auth/login').send({ email: w.A.users.admin.email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200);
    const csrf = await agent.post('/api/v1/notifications/read-all');
    expect(csrf.status).toBe(403);
    expect(csrf.body.code).toBe('CSRF');
    expect((await agent.post('/api/v1/notifications/read-all').set('X-Requested-With', 'sgee')).status).toBe(200);

    const oldCookie = (login.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('sgee_rt='))!.split(';')[0];
    const refreshed = await agent.post('/api/v1/auth/refresh').set('X-Requested-With', 'sgee');
    expect(refreshed.status).toBe(200);
    const reuse = await w.http().post('/api/v1/auth/refresh').set('Cookie', oldCookie);
    expect(reuse.status).toBe(401);
  });

  it('supports TOTP multi-factor authentication', async () => {
    const t = await w.token(w.B.users.doctor.email);
    const setup = await w.http().post('/api/v1/auth/mfa/setup').set(bearer(t));
    expect(setup.status).toBe(201);
    await w.http().post('/api/v1/auth/mfa/enable').set(bearer(t)).send({ code: authenticator.generate(setup.body.secret) }).expect(200);
    const login = await w.http().post('/api/v1/auth/login').send({ email: w.B.users.doctor.email, password: PASSWORD });
    expect(login.body.mfaRequired).toBe(true);
    expect((await w.http().post('/api/v1/auth/mfa/verify').send({ challengeToken: login.body.challengeToken, code: '000000' })).status).toBe(401);
    const ok = await w.http().post('/api/v1/auth/mfa/verify').send({ challengeToken: login.body.challengeToken, code: authenticator.generate(setup.body.secret) });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTruthy();
  });

  it('authenticates the gate kiosk with device code and PIN', async () => {
    expect((await w.http().post('/api/v1/auth/kiosk').send({ tenantSlug: 'tenant-a', deviceCode: 'GATE-1', pin: '0000' })).status).toBe(401);
    const ok = await w.http().post('/api/v1/auth/kiosk').send({ tenantSlug: 'tenant-a', deviceCode: 'GATE-1', pin: '2468' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.roles).toContain('GATE');
  });

  it('writes an append-only, hash-chained audit log', async () => {
    const t = await w.token(w.A.users.admin.email);
    const res = await w.http().get('/api/v1/admin/audit/verify').set(bearer(t));
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.ok).toBe(true);
    await expect(admin.$executeRaw`UPDATE audit.audit_log SET action = 'x' WHERE tenant_id = ${w.A.id}::uuid`).rejects.toThrow(/SGEE_IMMUTABLE/);
  });
});
