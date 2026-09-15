import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Pass, Tx } from '@sgee/db';
import {
  boardColumn,
  canTransition,
  type exitAuthorizationCreateSchema,
  type gateCheckoutSchema,
  type guardianExitConfirmSchema,
  nextStates,
  PASS_STATE_LABELS,
  PASS_URGENCY_LABELS,
  type passCreateSchema,
  type PassActor,
  type passQuerySchema,
  type PassState,
  passStageMinutes,
  type PassUrgency,
  shortCode,
  type standingExitPermissionSchema,
  TERMINAL_PASS_STATES,
  timeInTz,
  dateInTz,
  dayBounds,
} from '@sgee/shared';
import QRCode from 'qrcode';
import type { z } from 'zod';
import { AccessService } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import { type AuthUser, can, hasRole, isClinical, type RequestMeta } from '../../common/auth';
import { randomToken, sha256 } from '../../common/crypto';
import { badRequest, conflict, forbidden, notFound, Problem, unprocessable } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { personName, studentInclude, studentSummary } from '../../common/serializers';
import { TenantSettingsService } from '../../common/tenant-settings.service';
import { config } from '../../config';
import { NotifyService } from '../comms/notify.service';
import { PhotoService, StorageService } from '../files/storage.service';
import { JobsService } from '../jobs/jobs.service';
import { RealtimeService } from '../realtime/live.gateway';

const TIMESTAMP_FIELD: Record<PassState, keyof Pass> = {
  REQUESTED: 'requestedAt',
  IN_TRANSIT: 'inTransitAt',
  RECEIVED: 'receivedAt',
  IN_CARE: 'inCareAt',
  OBSERVATION: 'observationAt',
  RETURNED_TO_CLASS: 'returnedAt',
  WAITING_GUARDIAN: 'waitingGuardianAt',
  EXIT_AUTHORIZED: 'exitAuthorizedAt',
  HANDED_OVER: 'handedOverAt',
  TRANSFERRED_IPS: 'transferredAt',
  CLOSED: 'closedAt',
  CANCELLED: 'cancelledAt',
  EXPIRED: 'expiredAt',
};

export interface Actor {
  userId: string | null;
  roles: PassActor[];
  meta?: RequestMeta | null;
}

export const actorOf = (u: AuthUser, meta?: RequestMeta | null): Actor => ({ userId: u.id, roles: u.roles, meta });
export const SYSTEM_ACTOR: Actor = { userId: null, roles: ['SYSTEM'] };

@Injectable()
export class FlowService implements OnModuleInit {
  private readonly logger = new Logger('Flow');

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
    private readonly realtime: RealtimeService,
    private readonly jobs: JobsService,
    private readonly settings: TenantSettingsService,
    private readonly photos: PhotoService,
    private readonly storage: StorageService,
  ) {}

  onModuleInit() {
    this.jobs.register('flow.sla', (job) => this.slaTick(job.tenantId!));
    this.jobs.every('flow.sla', 1);
  }

  // ── core transition ──────────────────────────────────────────────────────
  /** Validates and applies a state change (also enforced by a DB trigger). */
  async applyTransition(tx: Tx, pass: Pass, to: PassState, actor: Actor, note?: string | null): Promise<Pass> {
    const check = canTransition(pass.state as PassState, to, actor.roles);
    if (!check.ok) throw new Problem(check.code === 'FORBIDDEN_ACTOR' ? 403 : 409, check.code, check.message);
    if (check.requiresReason && !note?.trim()) throw unprocessable('REASON_REQUIRED', 'Indique el motivo.');
    const now = new Date();
    const updated = await tx.pass.update({ where: { id: pass.id }, data: { state: to, [TIMESTAMP_FIELD[to]]: now } });
    await tx.passEvent.create({
      data: {
        tenantId: pass.tenantId,
        passId: pass.id,
        fromState: pass.state,
        toState: to,
        actorUserId: actor.userId,
        actorRole: actor.roles.join(','),
        note: note ?? null,
        ip: actor.meta?.ip ?? null,
        userAgent: actor.meta?.userAgent?.slice(0, 300) ?? null,
      },
    });
    this.realtime.nursing(pass.tenantId, 'pass:updated', { id: pass.id, state: to, from: pass.state });
    if (pass.issuedByUserId) this.realtime.user(pass.issuedByUserId, 'pass:updated', { id: pass.id, state: to });
    if (['EXIT_AUTHORIZED', 'HANDED_OVER', 'CLOSED', 'CANCELLED'].includes(to)) this.realtime.gate(pass.tenantId, 'gate:updated', { passId: pass.id, state: to });
    return updated;
  }

  private async sideEffects(tx: Tx, pass: Pass, to: PassState) {
    const student = await tx.student.findUniqueOrThrow({ where: { id: pass.studentId }, include: { person: true } });
    const tz = await this.settings.timezone(tx, pass.tenantId);
    const studentName = personName(student.person);
    if (to === 'RECEIVED') {
      await this.notify.notify(tx, { tenantId: pass.tenantId, event: 'NURSING_ARRIVAL', guardiansOfStudentId: pass.studentId, data: { studentName, time: timeInTz(new Date(), tz) }, link: `/familia`, entity: 'pass', entityId: pass.id, dedupeKey: `arrival:${pass.id}` });
    }
    if (to === 'RETURNED_TO_CLASS' && pass.issuedByUserId) {
      await tx.notification.create({ data: { tenantId: pass.tenantId, userId: pass.issuedByUserId, channel: 'IN_APP', event: 'PASS_CREATED', subject: 'Retorno al aula', body: `${studentName} regresa al aula desde enfermería.`, link: `/docente`, entity: 'pass', entityId: pass.id } });
    }
    if (to === 'HANDED_OVER') {
      await this.applyTransition(tx, (await tx.pass.findUniqueOrThrow({ where: { id: pass.id } })), 'CLOSED', SYSTEM_ACTOR, 'Cierre automático tras entrega en portería');
    }
    // Leaving the guardian-pickup path voids any open exit authorization (and its signed links),
    // so families and the gate never act on a stale request.
    if (['IN_CARE', 'RETURNED_TO_CLASS', 'TRANSFERRED_IPS', 'CANCELLED', 'EXPIRED'].includes(to)) {
      const open = await tx.exitAuthorization.findMany({ where: { passId: pass.id, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, select: { id: true } });
      if (open.length) {
        const ids = open.map((x) => x.id);
        await tx.exitAuthorization.updateMany({ where: { id: { in: ids } }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
        await tx.linkToken.updateMany({ where: { subjectId: { in: ids }, usedAt: null }, data: { usedAt: new Date() } });
        this.realtime.gate(pass.tenantId, 'gate:updated', { passId: pass.id, state: to });
      }
    }
  }

  // ── passes ───────────────────────────────────────────────────────────────
  async create(user: AuthUser, body: z.infer<typeof passCreateSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const student = await this.access.assertStudent(tx, user, body.studentId, 'basic');
      if (student.status !== 'ACTIVE') throw conflict('STUDENT_INACTIVE', 'El estudiante no está activo.');
      const open = await tx.pass.findFirst({ where: { studentId: body.studentId, state: { notIn: [...TERMINAL_PASS_STATES, 'RETURNED_TO_CLASS', 'HANDED_OVER', 'TRANSFERRED_IPS'] } } });
      if (open) throw conflict('PASS_ALREADY_OPEN', 'El estudiante ya tiene un pase abierto.', { passId: open.id, state: open.state });
      const clientAt = body.clientCreatedAt ? new Date(body.clientCreatedAt) : null;
      const requestedAt = clientAt && Date.now() - clientAt.getTime() < 2 * 3600_000 && clientAt.getTime() <= Date.now() + 60_000 ? clientAt : new Date();
      let subject = body.subject ?? null;
      if (!subject && hasRole(user, 'TEACHER') && student.currentGroupId) {
        subject = (await tx.teacherGroup.findFirst({ where: { userId: user.id, groupId: student.currentGroupId } }))?.subject ?? null;
      }
      const pass = await tx.pass.create({
        data: {
          tenantId: user.tenantId,
          studentId: body.studentId,
          issuedByUserId: user.id,
          code: shortCode(),
          qrToken: randomToken(18),
          subject,
          classroom: body.classroom ?? student.group?.name ?? null,
          reason: body.reason,
          urgency: body.urgency,
          accompanied: body.accompanied,
          companionName: body.companionName ?? null,
          notes: body.notes ?? null,
          requestedAt,
        },
      });
      await tx.passEvent.create({ data: { tenantId: user.tenantId, passId: pass.id, toState: 'REQUESTED', actorUserId: user.id, actorRole: user.roles.join(','), ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300), createdAt: requestedAt } });
      let current = pass;
      if (body.urgency !== 'EMERGENCY') current = await this.applyTransition(tx, pass, 'IN_TRANSIT', actorOf(user, meta), body.accompanied ? `Acompañado por ${body.companionName ?? 'compañero'}` : null);
      await this.notify.notify(tx, {
        tenantId: user.tenantId,
        event: 'PASS_CREATED',
        roles: ['NURSE', 'DOCTOR'],
        data: { studentName: personName(student.person), group: student.group?.name ?? '', urgency: PASS_URGENCY_LABELS[body.urgency as PassUrgency] },
        link: `/enfermeria`,
        urgent: ['HIGH', 'EMERGENCY'].includes(body.urgency),
        channels: ['IN_APP'],
        entity: 'pass',
        entityId: pass.id,
      });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'flow.pass_created', entity: 'pass', entityId: pass.id, after: { studentId: body.studentId, urgency: body.urgency, state: current.state }, meta });
      this.realtime.nursing(user.tenantId, 'pass:created', { id: pass.id, urgency: body.urgency });
      return this.detailTx(tx, user, current.id);
    });
  }

  async transition(user: AuthUser, passId: string, to: PassState, note: string | null | undefined, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const pass = await tx.pass.findUnique({ where: { id: passId } });
      if (!pass) throw notFound('Pase');
      await this.assertPassAccess(tx, user, pass);
      if (to === 'EXIT_AUTHORIZED') {
        const exit = await tx.exitAuthorization.findUnique({ where: { passId } });
        if (!exit || exit.status !== 'CONFIRMED') throw conflict('EXIT_NOT_CONFIRMED', 'La salida requiere confirmación del acudiente o autorización permanente.');
      }
      if (to === 'HANDED_OVER' && !isClinical(user)) throw badRequest('USE_GATE_CHECKOUT', 'Registre la entrega desde el módulo de portería.');
      const updated = await this.applyTransition(tx, pass, to, actorOf(user, meta), note);
      await this.sideEffects(tx, updated, to);
      if (to === 'OBSERVATION' || to === 'IN_CARE') {
        const enc = await tx.encounter.findUnique({ where: { passId } });
        if (enc && ['OPEN', 'OBSERVATION'].includes(enc.status)) await tx.encounter.update({ where: { id: enc.id }, data: { status: to === 'OBSERVATION' ? 'OBSERVATION' : 'OPEN' } });
      }
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'flow.pass_transition', entity: 'pass', entityId: passId, before: { state: pass.state }, after: { state: to }, meta });
      return this.detailTx(tx, user, passId);
    });
  }

  async receiveByCode(user: AuthUser, code: string, meta: RequestMeta) {
    const pass = await this.prisma.forUser(user, (tx) =>
      tx.pass.findFirst({ where: { OR: [{ qrToken: code.replace(/^SGEE:PASS:/, '') }, { code: code.toUpperCase() }], state: { in: ['REQUESTED', 'IN_TRANSIT'] } }, orderBy: { requestedAt: 'desc' } }),
    );
    if (!pass) throw notFound('Pase abierto con ese código');
    return this.transition(user, pass.id, 'RECEIVED', 'Recibido por QR/código', meta);
  }

  private async assertPassAccess(tx: Tx, user: AuthUser, pass: Pass) {
    if (can(user, 'passes:read_all', 'passes:nursing')) return;
    if (hasRole(user, 'TEACHER') && pass.issuedByUserId === user.id) return;
    if (hasRole(user, 'TEACHER')) {
      const s = await tx.student.findUnique({ where: { id: pass.studentId }, select: { currentGroupId: true } });
      if (s?.currentGroupId && (await this.access.teacherGroupIds(tx, user)).includes(s.currentGroupId)) return;
    }
    if (hasRole(user, 'PARENT') && (await this.access.childrenIds(tx, user)).includes(pass.studentId)) return;
    throw forbidden();
  }

  async list(user: AuthUser, q: z.infer<typeof passQuerySchema>) {
    return this.prisma.forUser(user, async (tx) => {
      const tz = await this.settings.timezone(tx, user.tenantId);
      const where: Record<string, unknown> = {};
      if (q.open) where.state = { notIn: TERMINAL_PASS_STATES };
      else if (q.state) where.state = { in: q.state.split(',') };
      if (q.studentId) where.studentId = q.studentId;
      if (q.from || q.to) where.requestedAt = { gte: q.from ? dayBounds(q.from, tz).start : undefined, lt: q.to ? dayBounds(q.to, tz).end : undefined };
      if (!can(user, 'passes:read_all') || q.mine) {
        if (hasRole(user, 'PARENT')) where.studentId = { in: await this.access.childrenIds(tx, user) };
        else where.issuedByUserId = user.id;
      }
      const passes = await tx.pass.findMany({ where, include: { student: { include: studentInclude } }, orderBy: { requestedAt: 'desc' }, take: q.limit });
      return passes.map((p) => this.summary(p, user));
    });
  }

  private summary(p: Pass & { student: Parameters<typeof studentSummary>[0] }, user: AuthUser) {
    const stage = passStageMinutes({ REQUESTED: p.requestedAt, RECEIVED: p.receivedAt, IN_CARE: p.inCareAt, RETURNED_TO_CLASS: p.returnedAt, WAITING_GUARDIAN: p.waitingGuardianAt, HANDED_OVER: p.handedOverAt, TRANSFERRED_IPS: p.transferredAt, CLOSED: p.closedAt });
    return {
      id: p.id,
      code: p.code,
      state: p.state,
      stateLabel: PASS_STATE_LABELS[p.state as PassState],
      urgency: p.urgency,
      reason: p.reason,
      subject: p.subject,
      classroom: p.classroom,
      accompanied: p.accompanied,
      companionName: p.companionName,
      requestedAt: p.requestedAt,
      updatedAt: p.updatedAt,
      elapsedMinutes: Math.round((Date.now() - p.requestedAt.getTime()) / 60000),
      stageMinutes: stage,
      student: studentSummary(p.student, { photosEnabled: this.photos.enabled }),
      nextStates: nextStates(p.state as PassState, user.roles),
      column: boardColumn(p.state as PassState),
      slaBreaches: p.slaBreaches,
    };
  }

  async detail(user: AuthUser, id: string) {
    return this.prisma.forUser(user, (tx) => this.detailTx(tx, user, id));
  }

  private async detailTx(tx: Tx, user: AuthUser, id: string) {
    const p = await tx.pass.findUnique({ where: { id }, include: { student: { include: studentInclude }, events: { orderBy: { createdAt: 'asc' } }, exitAuthorization: { include: { checkout: true } }, encounter: { select: { id: true, status: true, disposition: true } } } });
    if (!p) throw notFound('Pase');
    await this.assertPassAccess(tx, user, p);
    const actors = await tx.user.findMany({ where: { id: { in: p.events.map((e) => e.actorUserId).filter((x): x is string => !!x) } }, select: { id: true, firstName: true, lastName: true } });
    const issuer = p.issuedByUserId ? await tx.user.findUnique({ where: { id: p.issuedByUserId }, select: { firstName: true, lastName: true } }) : null;
    return {
      ...this.summary(p, user),
      qr: await QRCode.toDataURL(`SGEE:PASS:${p.qrToken}`, { margin: 1, width: 240 }),
      notes: p.notes,
      issuedBy: issuer ? personName(issuer) : null,
      events: p.events.map((e) => ({ ...e, fromLabel: e.fromState ? PASS_STATE_LABELS[e.fromState as PassState] : null, toLabel: PASS_STATE_LABELS[e.toState as PassState], actor: actors.find((a) => a.id === e.actorUserId) ? personName(actors.find((a) => a.id === e.actorUserId)!) : e.actorRole })),
      encounter: isClinical(user) ? p.encounter : p.encounter ? { id: p.encounter.id, status: p.encounter.status } : null,
      exitAuthorization: p.exitAuthorization ? this.exitSummary(p.exitAuthorization) : null,
    };
  }

  /** Live board (PLAN §9.2): open passes grouped by column. */
  async board(user: AuthUser) {
    return this.prisma.forUser(user, async (tx) => {
      const tz = await this.settings.timezone(tx, user.tenantId);
      const { start } = dayBounds(dateInTz(new Date(), tz), tz);
      const passes = await tx.pass.findMany({
        where: { OR: [{ state: { in: ['REQUESTED', 'IN_TRANSIT', 'RECEIVED', 'IN_CARE', 'OBSERVATION', 'WAITING_GUARDIAN', 'EXIT_AUTHORIZED'] } }] },
        include: {
          student: { include: { ...studentInclude, person: { include: { allergies: { where: { active: true } }, conditions: { where: { active: true, critical: true } } } } } },
          encounter: { include: { observations: { where: { endedAt: null } } } },
          exitAuthorization: true,
        },
        orderBy: [{ requestedAt: 'asc' }],
      });
      const walkIns = await tx.encounter.findMany({
        where: { status: { in: ['OPEN', 'OBSERVATION'] }, passId: null },
        include: { person: { include: { student: { include: studentInclude }, allergies: { where: { active: true } } } }, observations: { where: { endedAt: null } } },
      });
      const cards = passes.map((p) => ({
        ...this.summary(p, user),
        alerts: {
          anaphylaxis: p.student.person.allergies.some((a) => a.severity === 'ANAPHYLAXIS' || a.requiresEpinephrine),
          allergies: p.student.person.allergies.map((a) => a.agent),
          criticalConditions: p.student.person.conditions.map((c) => c.name),
        },
        encounterId: p.encounter?.id ?? null,
        observationDueAt: p.encounter?.observations[0]?.dueAt ?? null,
        exit: p.exitAuthorization ? this.exitSummary(p.exitAuthorization) : null,
      }));
      const [closedToday, avgTransit] = await Promise.all([
        tx.pass.count({ where: { closedAt: { gte: start } } }),
        tx.pass.findMany({ where: { receivedAt: { gte: start } }, select: { requestedAt: true, receivedAt: true } }),
      ]);
      return {
        columns: {
          INCOMING: cards.filter((c) => c.column === 'INCOMING'),
          IN_ROOM: cards.filter((c) => c.column === 'IN_ROOM'),
          OBSERVATION: cards.filter((c) => c.column === 'OBSERVATION'),
          WAITING_GUARDIAN: cards.filter((c) => c.column === 'WAITING_GUARDIAN'),
          EXITING: cards.filter((c) => c.column === 'EXITING'),
        },
        walkIns: walkIns.map((e) => ({
          encounterId: e.id,
          status: e.status,
          chiefComplaint: e.chiefComplaint,
          startedAt: e.startedAt,
          subjectType: e.subjectType,
          name: personName(e.person),
          student: e.person.student ? studentSummary(e.person.student, { photosEnabled: this.photos.enabled }) : null,
          anaphylaxis: e.person.allergies.some((a) => a.severity === 'ANAPHYLAXIS'),
          observationDueAt: e.observations[0]?.dueAt ?? null,
        })),
        kpis: {
          open: cards.length + walkIns.length,
          closedToday,
          avgTransitMinutes: avgTransit.length ? Math.round(avgTransit.reduce((a, p) => a + (p.receivedAt!.getTime() - p.requestedAt.getTime()) / 60000, 0) / avgTransit.length) : null,
        },
      };
    });
  }

  // ── exit authorizations ──────────────────────────────────────────────────
  private exitSummary(e: { id: string; status: string; pickupName: string | null; pickupDocument: string | null; pickupRelationship: string | null; confirmedAt: Date | null; expiresAt: Date; standingPermissionId: string | null; reason: string; estimatedArrival: string | null; qrToken: string }) {
    return { id: e.id, status: e.status, pickupName: e.pickupName, pickupDocument: e.pickupDocument, pickupRelationship: e.pickupRelationship, confirmedAt: e.confirmedAt, expiresAt: e.expiresAt, standing: !!e.standingPermissionId, reason: e.reason, estimatedArrival: e.estimatedArrival };
  }

  async createExit(user: AuthUser, body: z.infer<typeof exitAuthorizationCreateSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      let pass = await tx.pass.findUnique({ where: { id: body.passId }, include: { student: { include: { person: true } } } });
      if (!pass) throw notFound('Pase');
      if (await tx.exitAuthorization.findUnique({ where: { passId: pass.id } })) throw conflict('EXIT_EXISTS', 'Ya existe una autorización de salida para este pase.');
      if (['IN_CARE', 'OBSERVATION'].includes(pass.state)) {
        const p2 = await this.applyTransition(tx, pass, 'WAITING_GUARDIAN', actorOf(user, meta), 'Requiere retiro por acudiente');
        pass = { ...pass, ...p2 };
      }
      if (pass.state !== 'WAITING_GUARDIAN') throw conflict('INVALID_STATE', 'El pase debe estar en atención o esperando acudiente.');
      const tz = await this.settings.timezone(tx, user.tenantId);
      const studentName = personName(pass.student.person);

      let standing: { id: string } | null = null;
      if (body.useStandingPermission) {
        const today = new Date(`${dateInTz(new Date(), tz)}T00:00:00Z`);
        standing = await tx.standingExitPermission.findFirst({ where: { studentId: pass.studentId, active: true, validFrom: { lte: today }, validTo: { gte: today } } });
        if (!standing) throw conflict('NO_STANDING_PERMISSION', 'El estudiante no tiene autorización permanente de salida vigente.');
      }
      const exit = await tx.exitAuthorization.create({
        data: {
          tenantId: user.tenantId,
          passId: pass.id,
          studentId: pass.studentId,
          authorizedByUserId: user.id,
          reason: body.reason,
          status: standing ? 'CONFIRMED' : 'PENDING_GUARDIAN',
          standingPermissionId: standing?.id ?? null,
          confirmedAt: standing ? new Date() : null,
          pickupName: standing ? 'Salida autónoma (autorización permanente)' : null,
          pickupRelationship: standing ? 'El mismo estudiante' : null,
          qrToken: randomToken(18),
          expiresAt: new Date(Date.now() + 6 * 3600_000),
        },
      });
      const links: { guardianPersonId: string; name: string; phone: string | null; link: string }[] = [];
      if (standing) {
        await this.applyTransition(tx, pass, 'EXIT_AUTHORIZED', actorOf(user, meta), 'Autorización permanente vigente');
      } else {
        const guardians = await tx.studentGuardian.findMany({
          where: { studentId: pass.studentId, active: true, canPickUp: true, judicialRestriction: false, ...(body.guardianIds.length ? { guardianId: { in: body.guardianIds } } : {}) },
          include: { guardian: { include: { person: true } } },
          orderBy: { priority: 'asc' },
        });
        for (const g of guardians) {
          const token = randomToken(32);
          await tx.linkToken.create({ data: { tenantId: user.tenantId, purpose: 'EXIT_CONFIRM', tokenHash: sha256(token), subjectId: exit.id, personId: g.guardian.personId, expiresAt: exit.expiresAt, maxUses: 1 } });
          links.push({ guardianPersonId: g.guardian.personId, name: personName(g.guardian.person), phone: g.guardian.person.mobile ?? g.guardian.person.phone, link: `${config().PUBLIC_WEB_URL}/confirmar-salida?token=${token}` });
          const guardianUsers = await tx.user.findMany({ where: { personId: g.guardian.personId, active: true }, select: { id: true } });
          if (guardianUsers.length) {
            await this.notify.notify(tx, { tenantId: user.tenantId, event: 'EXIT_AUTHORIZATION', userIds: guardianUsers.map((u) => u.id), data: { studentName }, link: `/confirmar-salida?token=${token}`, urgent: true, entity: 'exit_authorization', entityId: exit.id, dedupeKey: `exit:${exit.id}` });
          }
        }
        await tx.exitAuthorization.update({ where: { id: exit.id }, data: { guardiansNotified: links.map((l) => ({ personId: l.guardianPersonId, name: l.name, at: new Date().toISOString() })) } });
      }
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'flow.exit_authorized', entity: 'exit_authorization', entityId: exit.id, after: { passId: pass.id, standing: !!standing, guardiansNotified: links.length }, meta });
      this.realtime.gate(user.tenantId, 'gate:updated', { exitId: exit.id });
      return { exit: this.exitSummary(exit), links, timeCreated: timeInTz(new Date(), tz) };
    });
  }

  private async resolveToken(token: string) {
    const rows = await this.prisma.client.$queryRaw<{ token_id: string; tenant_id: string }[]>`SELECT * FROM core.link_token_tenant(${sha256(token)})`;
    if (!rows.length) throw notFound('Enlace');
    return rows[0];
  }

  /** Public page opened from the WhatsApp/SMS/e-mail link. */
  async exitByToken(token: string) {
    const r = await this.resolveToken(token);
    return this.prisma.forTenant(r.tenant_id, async (tx) => {
      const link = await tx.linkToken.findUniqueOrThrow({ where: { id: r.token_id } });
      if (link.purpose !== 'EXIT_CONFIRM') throw notFound('Enlace');
      const exit = await tx.exitAuthorization.findUniqueOrThrow({ where: { id: link.subjectId } });
      const [student, tenant] = await Promise.all([tx.student.findUniqueOrThrow({ where: { id: exit.studentId }, include: studentInclude }), tx.tenant.findUniqueOrThrow({ where: { id: r.tenant_id } })]);
      const options = await this.pickupOptions(tx, exit.studentId);
      return {
        tenant: tenant.name,
        student: { firstName: student.person.firstName, lastName: student.person.lastName, group: student.group?.name ?? null },
        reason: exit.reason,
        status: exit.status,
        expired: exit.expiresAt < new Date() || !!link.usedAt,
        confirmed: exit.status !== 'PENDING_GUARDIAN',
        pickupName: exit.pickupName,
        options,
        guardianPersonId: link.personId,
      };
    });
  }

  private async pickupOptions(tx: Tx, studentId: string) {
    const [guardians, contacts] = await Promise.all([
      tx.studentGuardian.findMany({ where: { studentId, active: true, canPickUp: true, judicialRestriction: false }, include: { guardian: { include: { person: true } } } }),
      tx.emergencyContact.findMany({ where: { studentId, active: true, canPickUp: true } }),
    ]);
    return [
      ...guardians.map((g) => ({ kind: 'GUARDIAN', personId: g.guardian.personId, name: personName(g.guardian.person), relationship: g.relationship, document: g.guardian.person.documentNumber })),
      ...contacts.map((c) => ({ kind: 'CONTACT', personId: null, name: c.name, relationship: c.relationship, document: c.documentNumber })),
    ];
  }

  async confirmExitByToken(token: string, body: z.infer<typeof guardianExitConfirmSchema>, meta: RequestMeta) {
    const r = await this.resolveToken(token);
    return this.prisma.forTenant(r.tenant_id, async (tx) => {
      const link = await tx.linkToken.findUniqueOrThrow({ where: { id: r.token_id } });
      if (link.purpose !== 'EXIT_CONFIRM' || link.usedAt || link.uses >= link.maxUses || link.expiresAt < new Date()) throw new Problem(410, 'LINK_EXPIRED', 'El enlace expiró o ya fue utilizado.');
      const result = await this.confirmExit(tx, r.tenant_id, link.subjectId, link.personId, null, body, meta);
      await tx.linkToken.update({ where: { id: link.id }, data: { usedAt: new Date(), uses: { increment: 1 } } });
      await tx.linkToken.updateMany({ where: { subjectId: link.subjectId, purpose: 'EXIT_CONFIRM', usedAt: null }, data: { usedAt: new Date() } });
      return result;
    });
  }

  async confirmExitAsParent(user: AuthUser, exitId: string, body: z.infer<typeof guardianExitConfirmSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const exit = await tx.exitAuthorization.findUnique({ where: { id: exitId } });
      if (!exit || !(await this.access.childrenIds(tx, user)).includes(exit.studentId)) throw forbidden();
      return this.confirmExit(tx, user.tenantId, exitId, user.personId, user.id, body, meta);
    });
  }

  private async confirmExit(tx: Tx, tenantId: string, exitId: string, confirmedByPersonId: string | null, confirmedByUserId: string | null, body: z.infer<typeof guardianExitConfirmSchema>, meta: RequestMeta) {
    const exit = await tx.exitAuthorization.findUniqueOrThrow({ where: { id: exitId } });
    if (exit.status !== 'PENDING_GUARDIAN') throw conflict('EXIT_NOT_PENDING', 'La salida ya fue confirmada o cerrada.');
    if (exit.expiresAt < new Date()) throw new Problem(410, 'EXIT_EXPIRED', 'La autorización de salida expiró. Comuníquese con enfermería.');
    if (body.pickupGuardianPersonId) {
      const ok = await tx.studentGuardian.findFirst({ where: { studentId: exit.studentId, active: true, canPickUp: true, judicialRestriction: false, guardian: { personId: body.pickupGuardianPersonId } } });
      if (!ok) throw forbidden('La persona seleccionada no está autorizada para recoger al estudiante.');
    }
    const updated = await tx.exitAuthorization.update({
      where: { id: exitId },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        confirmedByPersonId,
        confirmedByUserId,
        pickupGuardianPersonId: body.pickupGuardianPersonId ?? null,
        pickupName: body.pickupName,
        pickupDocument: body.pickupDocument.replace(/\s/g, ''),
        pickupRelationship: body.pickupRelationship,
        pickupPhone: body.pickupPhone ?? null,
        estimatedArrival: body.estimatedArrival ?? null,
      },
    });
    if (exit.passId) {
      const pass = await tx.pass.findUniqueOrThrow({ where: { id: exit.passId } });
      if (pass.state === 'WAITING_GUARDIAN') await this.applyTransition(tx, pass, 'EXIT_AUTHORIZED', { ...SYSTEM_ACTOR, meta }, `Confirmado por acudiente: recoge ${body.pickupName}`);
    }
    await this.audit.log(tx, { tenantId, actor: confirmedByUserId ? { id: confirmedByUserId, roles: ['PARENT'] } : null, action: 'flow.exit_confirmed_by_guardian', entity: 'exit_authorization', entityId: exitId, after: { pickupRelationship: body.pickupRelationship, verifiedGuardian: !!body.pickupGuardianPersonId }, meta });
    this.realtime.gate(tenantId, 'gate:updated', { exitId });
    this.realtime.nursing(tenantId, 'pass:updated', { exitId, state: 'EXIT_AUTHORIZED' });
    return { status: updated.status, pickupName: updated.pickupName, confirmedAt: updated.confirmedAt };
  }

  async cancelExit(user: AuthUser, exitId: string, reason: string, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const exit = await tx.exitAuthorization.findUnique({ where: { id: exitId } });
      if (!exit) throw notFound('Autorización');
      if (['COMPLETED', 'CANCELLED'].includes(exit.status)) throw conflict('EXIT_CLOSED', 'La autorización ya está cerrada.');
      await tx.exitAuthorization.update({ where: { id: exitId }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      await tx.linkToken.updateMany({ where: { subjectId: exitId, usedAt: null }, data: { usedAt: new Date() } });
      if (exit.passId) {
        const pass = await tx.pass.findUniqueOrThrow({ where: { id: exit.passId } });
        if (pass.state === 'EXIT_AUTHORIZED') await this.applyTransition(tx, pass, 'WAITING_GUARDIAN', actorOf(user, meta), reason);
      }
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'flow.exit_cancelled', entity: 'exit_authorization', entityId: exitId, meta });
      this.realtime.gate(user.tenantId, 'gate:updated', { exitId });
      return { cancelled: true };
    });
  }

  // ── gate ─────────────────────────────────────────────────────────────────
  async gateQueue(user: AuthUser) {
    return this.prisma.forUser(user, async (tx) => {
      const exits = await tx.exitAuthorization.findMany({
        where: { status: { in: ['PENDING_GUARDIAN', 'CONFIRMED'] }, expiresAt: { gt: new Date(Date.now() - 3600_000) } },
        orderBy: [{ status: 'asc' }, { confirmedAt: 'asc' }],
      });
      const students = await tx.student.findMany({ where: { id: { in: exits.map((e) => e.studentId) } }, include: studentInclude });
      const recent = await tx.gateCheckout.findMany({ where: { checkedOutAt: { gte: new Date(Date.now() - 8 * 3600_000) } }, include: { exitAuthorization: true }, orderBy: { checkedOutAt: 'desc' }, take: 30 });
      const recentStudents = await tx.student.findMany({ where: { id: { in: recent.map((r) => r.studentId) } }, include: studentInclude });
      return {
        queue: exits.map((e) => ({ ...this.exitSummary(e), student: studentSummary(students.find((s) => s.id === e.studentId)!, { photosEnabled: this.photos.enabled }) })),
        recent: recent.map((r) => ({ id: r.id, checkedOutAt: r.checkedOutAt, method: r.method, pickupName: r.exitAuthorization.pickupName, student: studentSummary(recentStudents.find((s) => s.id === r.studentId)!, { photosEnabled: this.photos.enabled }) })),
      };
    });
  }

  async gateLookup(user: AuthUser, code: string) {
    return this.prisma.forUser(user, async (tx) => {
      const token = code.replace(/^SGEE:(EXIT|PASS):/, '');
      let exit = await tx.exitAuthorization.findUnique({ where: { qrToken: token } });
      if (!exit) {
        const pass = await tx.pass.findFirst({ where: { OR: [{ qrToken: token }, { code: code.toUpperCase() }] }, orderBy: { requestedAt: 'desc' } });
        if (pass) exit = await tx.exitAuthorization.findUnique({ where: { passId: pass.id } });
      }
      if (!exit) throw notFound('Autorización de salida');
      const s = await tx.student.findUniqueOrThrow({ where: { id: exit.studentId }, include: studentInclude });
      return { ...this.exitSummary(exit), student: studentSummary(s, { photosEnabled: this.photos.enabled }) };
    });
  }

  async checkout(user: AuthUser, body: z.infer<typeof gateCheckoutSchema>, meta: RequestMeta) {
    let signatureFileId: string | null = null;
    if (body.signature) {
      const m = body.signature.match(/^data:image\/png;base64,(.+)$/);
      if (!m) throw badRequest('SIGNATURE_INVALID', 'Firma inválida.');
      signatureFileId = (await this.storage.save(user, { buffer: Buffer.from(m[1], 'base64'), originalName: 'firma-porteria.png', kind: 'SIGNATURE' })).id;
    }
    return this.prisma.forUser(user, async (tx) => {
      const exit = await tx.exitAuthorization.findUnique({ where: { id: body.exitAuthorizationId } });
      if (!exit) throw notFound('Autorización de salida');
      if (exit.status !== 'CONFIRMED') throw conflict('EXIT_NOT_CONFIRMED', exit.status === 'COMPLETED' ? 'La salida ya fue registrada.' : 'La salida aún no está confirmada por el acudiente.');
      if (body.method === 'DOCUMENT' && !exit.standingPermissionId) {
        const norm = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '');
        if (!body.verifiedDocument || norm(body.verifiedDocument) !== norm(exit.pickupDocument)) {
          throw unprocessable('DOCUMENT_MISMATCH', 'El documento presentado no coincide con el de la persona autorizada. No entregue al estudiante.');
        }
      }
      const tz = await this.settings.timezone(tx, user.tenantId);
      const checkout = await tx.gateCheckout.create({
        data: { tenantId: user.tenantId, exitAuthorizationId: exit.id, studentId: exit.studentId, validatedByUserId: user.id, method: body.method, verifiedDocument: body.verifiedDocument ?? null, signatureFileId, observations: body.observations ?? null },
      });
      await tx.exitAuthorization.update({ where: { id: exit.id }, data: { status: 'COMPLETED' } });
      if (exit.passId) {
        const pass = await tx.pass.findUniqueOrThrow({ where: { id: exit.passId } });
        const handed = await this.applyTransition(tx, pass, 'HANDED_OVER', actorOf(user, meta), `Entregado a ${exit.pickupName}`);
        await this.sideEffects(tx, handed, 'HANDED_OVER');
      }
      const student = await tx.student.findUniqueOrThrow({ where: { id: exit.studentId }, include: { person: true } });
      await this.notify.notify(tx, { tenantId: user.tenantId, event: 'EXIT_COMPLETED', guardiansOfStudentId: exit.studentId, data: { studentName: personName(student.person), time: timeInTz(checkout.checkedOutAt, tz), pickupName: exit.pickupName ?? '' }, link: '/familia', entity: 'gate_checkout', entityId: checkout.id, dedupeKey: `exitdone:${exit.id}` });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'flow.gate_checkout', entity: 'gate_checkout', entityId: checkout.id, after: { exitId: exit.id, method: body.method }, meta });
      this.realtime.gate(user.tenantId, 'gate:updated', { exitId: exit.id, completed: true });
      return { id: checkout.id, checkedOutAt: checkout.checkedOutAt, studentName: personName(student.person), pickupName: exit.pickupName };
    });
  }

  // ── standing permissions ─────────────────────────────────────────────────
  async createStanding(user: AuthUser, body: z.infer<typeof standingExitPermissionSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const isParent = hasRole(user, 'PARENT') && (await this.access.childrenIds(tx, user)).includes(body.studentId);
      if (!isParent && !isClinical(user)) throw forbidden();
      const s = await this.access.assertStudent(tx, user, body.studentId, 'basic');
      if (s.person.birthDate) {
        const age = (Date.now() - s.person.birthDate.getTime()) / (365.25 * 86400000);
        if (age < 14) throw unprocessable('TOO_YOUNG', 'La salida autónoma solo aplica a estudiantes de 14 años o más.');
      }
      const p = await tx.standingExitPermission.create({
        data: { tenantId: user.tenantId, studentId: body.studentId, grantedByGuardianPersonId: isParent ? user.personId : null, grantedByUserId: user.id, validFrom: new Date(body.validFrom), validTo: new Date(body.validTo), conditions: body.conditions },
      });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'flow.standing_permission_granted', entity: 'standing_exit_permission', entityId: p.id, after: { studentId: body.studentId, validTo: body.validTo }, meta });
      return p;
    });
  }

  async listStanding(user: AuthUser, studentId: string) {
    return this.prisma.forUser(user, async (tx) => {
      await this.access.assertStudent(tx, user, studentId, 'basic');
      return tx.standingExitPermission.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } });
    });
  }

  async revokeStanding(user: AuthUser, id: string, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const p = await tx.standingExitPermission.findUnique({ where: { id } });
      if (!p) throw notFound('Autorización');
      const isParent = hasRole(user, 'PARENT') && (await this.access.childrenIds(tx, user)).includes(p.studentId);
      if (!isParent && !isClinical(user)) throw forbidden();
      const r = await tx.standingExitPermission.update({ where: { id }, data: { active: false, revokedAt: new Date() } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'flow.standing_permission_revoked', entity: 'standing_exit_permission', entityId: id, meta });
      return r;
    });
  }

  // ── SLA job ──────────────────────────────────────────────────────────────
  async slaTick(tenantId: string) {
    const out = { transitAlerts: 0, expired: 0, autoClosed: 0, observationAlerts: 0 };
    await this.prisma.forTenant(tenantId, async (tx) => {
      const s = await this.settings.get(tx, tenantId);
      const now = Date.now();
      const late = await tx.pass.findMany({
        where: { state: { in: ['REQUESTED', 'IN_TRANSIT'] }, transitAlertedAt: null, requestedAt: { lt: new Date(now - s.passTransitAlertMinutes * 60_000) } },
        include: { student: { include: { person: true } } },
      });
      for (const p of late) {
        const minutes = Math.round((now - p.requestedAt.getTime()) / 60000);
        await tx.pass.update({ where: { id: p.id }, data: { transitAlertedAt: new Date(), slaBreaches: [...((p.slaBreaches as object[]) ?? []), { type: 'TRANSIT', minutes, at: new Date().toISOString() }] } });
        await this.notify.notify(tx, {
          tenantId,
          event: 'PASS_TRANSIT_ALERT',
          userIds: p.issuedByUserId ? [p.issuedByUserId] : [],
          roles: ['NURSE', 'HEALTH_COORDINATOR'],
          data: { studentName: personName(p.student.person), minutes },
          link: '/enfermeria',
          channels: ['IN_APP'],
          entity: 'pass',
          entityId: p.id,
          dedupeKey: `transit:${p.id}`,
        });
        this.realtime.nursing(tenantId, 'pass:sla', { id: p.id, type: 'TRANSIT', minutes });
        out.transitAlerts++;
      }
      const toExpire = await tx.pass.findMany({ where: { state: 'IN_TRANSIT', requestedAt: { lt: new Date(now - s.passExpireMinutes * 60_000) } } });
      for (const p of toExpire) {
        await this.applyTransition(tx, p, 'EXPIRED', SYSTEM_ACTOR, `Vencido: sin llegada a enfermería en ${s.passExpireMinutes} min`);
        out.expired++;
      }
      const returned = await tx.pass.findMany({ where: { state: 'RETURNED_TO_CLASS', returnedAt: { lt: new Date(now - s.returnedAutoCloseMinutes * 60_000) } } });
      for (const p of returned) {
        await this.applyTransition(tx, p, 'CLOSED', SYSTEM_ACTOR, 'Cierre automático');
        out.autoClosed++;
      }
      const due = await tx.observationPeriod.findMany({ where: { endedAt: null, alertedAt: null, dueAt: { lt: new Date() } }, include: { encounter: { include: { person: true } } } });
      for (const o of due) {
        await tx.observationPeriod.update({ where: { id: o.id }, data: { alertedAt: new Date() } });
        await this.notify.notify(tx, { tenantId, event: 'OBSERVATION_RECHECK', roles: ['NURSE'], data: { studentName: personName(o.encounter.person) }, link: `/enfermeria/atenciones/${o.encounterId}`, channels: ['IN_APP'], entity: 'encounter', entityId: o.encounterId, dedupeKey: `obs:${o.id}` });
        this.realtime.nursing(tenantId, 'observation:due', { encounterId: o.encounterId });
        out.observationAlerts++;
      }
    });
    return out;
  }
}
