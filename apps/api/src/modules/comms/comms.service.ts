import { Injectable } from '@nestjs/common';
import { CHANNELS, type circularSchema, type messageCreateSchema, NOTIFICATION_EVENTS, type notificationPreferencesSchema, type templateUpdateSchema } from '@sgee/shared';
import type { z } from 'zod';
import { AccessService } from '../../common/access.service';
import { AuditService } from '../../common/audit.service';
import { type AuthUser, can, hasRole, type RequestMeta } from '../../common/auth';
import { forbidden, notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { personName } from '../../common/serializers';
import { config } from '../../config';
import { RealtimeService } from '../realtime/live.gateway';
import { NotifyService } from './notify.service';
import { DEFAULT_TEMPLATES, type NotificationEvent } from './templates';

@Injectable()
export class CommsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
    private readonly realtime: RealtimeService,
  ) {}

  async inbox(user: AuthUser, unreadOnly: boolean, limit: number) {
    return this.prisma.forUser(user, async (tx) => {
      const where = { userId: user.id, channel: 'IN_APP', ...(unreadOnly ? { readAt: null } : {}) };
      const [items, unread] = await Promise.all([
        tx.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(limit, 200), select: { id: true, event: true, subject: true, body: true, link: true, urgent: true, readAt: true, createdAt: true, entity: true, entityId: true } }),
        tx.notification.count({ where: { userId: user.id, channel: 'IN_APP', readAt: null } }),
      ]);
      return { items, unread };
    });
  }

  async markRead(user: AuthUser, id: string | 'all') {
    return this.prisma.forUser(user, async (tx) => {
      const where = id === 'all' ? { userId: user.id, readAt: null } : { id, userId: user.id };
      const r = await tx.notification.updateMany({ where, data: { readAt: new Date(), status: 'READ' } });
      return { updated: r.count };
    });
  }

  async outbound(user: AuthUser, q: { status?: string; channel?: string; event?: string; limit?: number }) {
    return this.prisma.forUser(user, async (tx) => {
      const rows = await tx.notification.findMany({
        where: { ...(q.status ? { status: q.status } : {}), ...(q.channel ? { channel: q.channel } : {}), ...(q.event ? { event: q.event } : {}) },
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: Math.min(q.limit ?? 200, 1000),
      });
      const stats = await tx.notification.groupBy({ by: ['channel', 'status'], _count: true, where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } } });
      return { items: rows.map((r) => ({ ...r, recipient: r.user ? personName(r.user) : r.recipientAddress, user: undefined })), stats };
    });
  }

  async preferences(user: AuthUser) {
    return this.prisma.forUser(user, async (tx) => {
      const p = await tx.notificationPreference.findUnique({ where: { userId: user.id } });
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
      return {
        channels: (p?.channels as Record<string, boolean>) ?? { IN_APP: true, EMAIL: true },
        quietHoursStart: p?.quietHoursStart ?? '20:00',
        quietHoursEnd: p?.quietHoursEnd ?? '06:00',
        language: p?.language ?? 'es-CO',
        whatsappNumber: p?.whatsappNumber ?? null,
        availableChannels: ((tenant.settings as { enabledChannels?: string[] })?.enabledChannels ?? ['IN_APP', 'EMAIL']).filter((c) => (CHANNELS as readonly string[]).includes(c)),
        vapidPublicKey: config().VAPID_PUBLIC_KEY ?? null,
      };
    });
  }

  async updatePreferences(user: AuthUser, b: z.infer<typeof notificationPreferencesSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const data = { channels: { ...b.channels, IN_APP: true }, quietHoursStart: b.quietHoursStart, quietHoursEnd: b.quietHoursEnd, language: b.language, whatsappNumber: b.whatsappNumber ?? null };
      const p = await tx.notificationPreference.upsert({ where: { userId: user.id }, create: { tenantId: user.tenantId, userId: user.id, ...data }, update: data });
      await tx.user.update({ where: { id: user.id }, data: { locale: b.language } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'comms.preferences_updated', entity: 'notification_preference', entityId: p.id, after: data, meta });
      return p;
    });
  }

  async subscribePush(user: AuthUser, b: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    return this.prisma.forUser(user, (tx) =>
      tx.pushSubscription.upsert({ where: { endpoint: b.endpoint }, create: { tenantId: user.tenantId, userId: user.id, endpoint: b.endpoint, p256dh: b.keys.p256dh, auth: b.keys.auth }, update: { userId: user.id, p256dh: b.keys.p256dh, auth: b.keys.auth } }),
    );
  }

  // ── threads ──────────────────────────────────────────────────────────────
  async threads(user: AuthUser) {
    return this.prisma.forUser(user, async (tx) => {
      const staffView = can(user, 'comms:send');
      const threads = await tx.messageThread.findMany({
        where: staffView ? {} : { participants: { some: { userId: user.id } } },
        include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 }, participants: true },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      });
      const studentIds = threads.map((t) => t.studentId).filter((x): x is string => !!x);
      const students = await tx.student.findMany({ where: { id: { in: studentIds } }, include: { person: true } });
      return threads.map((t) => {
        const me = t.participants.find((p) => p.userId === user.id);
        const last = t.messages[0];
        return {
          id: t.id,
          subject: t.subject,
          studentId: t.studentId,
          studentName: students.find((s) => s.id === t.studentId) ? personName(students.find((s) => s.id === t.studentId)!.person) : null,
          encounterId: t.encounterId,
          updatedAt: t.updatedAt,
          lastMessage: last ? { body: last.body.slice(0, 140), at: last.createdAt, mine: last.authorUserId === user.id } : null,
          unread: !!last && last.authorUserId !== user.id && (!me?.lastReadAt || me.lastReadAt < last.createdAt),
        };
      });
    });
  }

  async thread(user: AuthUser, id: string) {
    return this.prisma.forUser(user, async (tx) => {
      const t = await tx.messageThread.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: 'asc' } }, participants: true } });
      if (!t) throw notFound('Conversación');
      const participant = t.participants.find((p) => p.userId === user.id);
      if (!participant && !can(user, 'comms:send')) throw forbidden();
      if (participant) await tx.threadParticipant.update({ where: { id: participant.id }, data: { lastReadAt: new Date() } });
      const authors = await tx.user.findMany({ where: { id: { in: t.messages.map((m) => m.authorUserId) } }, select: { id: true, firstName: true, lastName: true, roles: { select: { role: true } } } });
      return {
        ...t,
        messages: t.messages.map((m) => {
          const a = authors.find((x) => x.id === m.authorUserId);
          return { ...m, author: a ? personName(a) : '', authorRoles: a?.roles.map((r) => r.role) ?? [], mine: m.authorUserId === user.id };
        }),
      };
    });
  }

  async postMessage(user: AuthUser, b: z.infer<typeof messageCreateSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      let threadId = b.threadId ?? null;
      let studentId = b.studentId ?? null;
      if (threadId) {
        const t = await tx.messageThread.findUnique({ where: { id: threadId }, include: { participants: true } });
        if (!t) throw notFound('Conversación');
        if (!t.participants.some((p) => p.userId === user.id) && !can(user, 'comms:send')) throw forbidden();
        studentId = t.studentId;
      } else {
        if (studentId) {
          const isParent = hasRole(user, 'PARENT') && (await this.access.childrenIds(tx, user)).includes(studentId);
          if (!isParent && !can(user, 'comms:send')) throw forbidden();
        } else if (!can(user, 'comms:send')) throw forbidden();
        const student = studentId ? await tx.student.findUnique({ where: { id: studentId }, include: { person: true } }) : null;
        const t = await tx.messageThread.create({ data: { tenantId: user.tenantId, studentId, encounterId: b.encounterId ?? null, subject: b.subject ?? (student ? `Enfermería — ${personName(student.person)}` : 'Mensaje'), createdByUserId: user.id } });
        threadId = t.id;
        const participants = new Set([user.id]);
        if (studentId && can(user, 'comms:send')) {
          const links = await tx.studentGuardian.findMany({ where: { studentId, active: true }, select: { guardian: { select: { personId: true } } } });
          const guardians = await tx.user.findMany({ where: { personId: { in: links.map((l) => l.guardian.personId) }, active: true }, select: { id: true } });
          guardians.forEach((g) => participants.add(g.id));
        }
        await tx.threadParticipant.createMany({ data: [...participants].map((userId) => ({ tenantId: user.tenantId, threadId: t.id, userId })), skipDuplicates: true });
      }
      if (can(user, 'comms:send')) await tx.threadParticipant.upsert({ where: { threadId_userId: { threadId, userId: user.id } }, create: { tenantId: user.tenantId, threadId, userId: user.id, lastReadAt: new Date() }, update: { lastReadAt: new Date() } });
      const msg = await tx.message.create({ data: { tenantId: user.tenantId, threadId, authorUserId: user.id, body: b.body, attachmentIds: b.attachmentIds } });
      await tx.messageThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });
      const others = (await tx.threadParticipant.findMany({ where: { threadId, userId: { not: user.id } } })).map((p) => p.userId);
      const student = studentId ? await tx.student.findUnique({ where: { id: studentId }, include: { person: true } }) : null;
      const data = { studentName: student ? personName(student.person) : 'su hijo(a)' };
      if (others.length) await this.notify.notify(tx, { tenantId: user.tenantId, event: 'MESSAGE_RECEIVED', userIds: others, data, link: hasRole(user, 'PARENT') ? `/enfermeria/mensajes/${threadId}` : `/familia/mensajes/${threadId}`, entity: 'message', entityId: msg.id });
      if (hasRole(user, 'PARENT') && !can(user, 'comms:send')) await this.notify.notify(tx, { tenantId: user.tenantId, event: 'MESSAGE_RECEIVED', roles: ['NURSE'], channels: ['IN_APP'], data, link: `/enfermeria/mensajes/${threadId}`, entity: 'message', entityId: msg.id });
      for (const uid of others) this.realtime.user(uid, 'message', { threadId });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'comms.message_sent', entity: 'message', entityId: msg.id, after: { threadId }, meta });
      return { threadId, message: msg };
    });
  }

  // ── circulars ────────────────────────────────────────────────────────────
  async createCircular(user: AuthUser, b: z.infer<typeof circularSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const scoped = hasRole(user, 'DIRECTOR') && user.sectionScopes.length ? user.sectionScopes : null;
      const studentWhere = {
        status: 'ACTIVE',
        ...(b.groupIds.length ? { currentGroupId: { in: b.groupIds } } : {}),
        ...(b.gradeIds.length ? { group: { gradeId: { in: b.gradeIds } } } : {}),
        ...(b.sectionIds.length || scoped ? { group: { grade: { sectionId: { in: b.sectionIds.length ? b.sectionIds : scoped! } } } } : {}),
      };
      const students = await tx.student.findMany({ where: studentWhere, select: { id: true } });
      const links = await tx.studentGuardian.findMany({ where: { studentId: { in: students.map((s) => s.id) }, active: true }, select: { guardian: { select: { personId: true } } } });
      const users = await tx.user.findMany({ where: { personId: { in: links.map((l) => l.guardian.personId) }, active: true }, select: { id: true } });
      const circular = await tx.circular.create({ data: { tenantId: user.tenantId, title: b.title, body: b.body, category: b.category, audience: { sectionIds: b.sectionIds, gradeIds: b.gradeIds, groupIds: b.groupIds, students: students.length }, channels: b.channels, createdByUserId: user.id, recipientsCount: users.length } });
      await tx.circularRecipient.createMany({ data: users.map((u) => ({ tenantId: user.tenantId, circularId: circular.id, userId: u.id })), skipDuplicates: true });
      await this.notify.notify(tx, { tenantId: user.tenantId, event: 'CIRCULAR', userIds: users.map((u) => u.id), data: { title: b.title }, link: `/familia/circulares/${circular.id}`, channels: b.channels, entity: 'circular', entityId: circular.id, dedupeKey: `circular:${circular.id}` });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'comms.circular_published', entity: 'circular', entityId: circular.id, after: { recipients: users.length, category: b.category }, meta });
      return circular;
    });
  }

  async circulars(user: AuthUser) {
    return this.prisma.forUser(user, async (tx) => {
      if (can(user, 'comms:circulars', 'comms:send')) {
        const rows = await tx.circular.findMany({ orderBy: { publishedAt: 'desc' }, take: 100, include: { _count: { select: { recipients: { where: { readAt: { not: null } } } } } } });
        return rows.map((r) => ({ ...r, readCount: r._count.recipients }));
      }
      const rec = await tx.circularRecipient.findMany({ where: { userId: user.id }, include: { circular: true }, orderBy: { circular: { publishedAt: 'desc' } } });
      return rec.map((r) => ({ ...r.circular, readAt: r.readAt }));
    });
  }

  async readCircular(user: AuthUser, id: string) {
    return this.prisma.forUser(user, async (tx) => {
      const rec = await tx.circularRecipient.findUnique({ where: { circularId_userId: { circularId: id, userId: user.id } } });
      if (rec && !rec.readAt) await tx.circularRecipient.update({ where: { id: rec.id }, data: { readAt: new Date() } });
      const c = await tx.circular.findUnique({ where: { id } });
      if (!c || (!rec && !can(user, 'comms:circulars', 'comms:send'))) throw notFound('Circular');
      return c;
    });
  }

  // ── templates ────────────────────────────────────────────────────────────
  async templates(user: AuthUser) {
    return this.prisma.forUser(user, async (tx) => {
      const overrides = await tx.notificationTemplate.findMany();
      return NOTIFICATION_EVENTS.map((event) => ({
        event,
        default: DEFAULT_TEMPLATES[event],
        overrides: overrides.filter((o) => o.event === event),
      }));
    });
  }

  async updateTemplate(user: AuthUser, event: string, channel: string, b: z.infer<typeof templateUpdateSchema>, meta: RequestMeta) {
    if (!(NOTIFICATION_EVENTS as readonly string[]).includes(event) || !(CHANNELS as readonly string[]).includes(channel)) throw notFound('Plantilla');
    return this.prisma.forUser(user, async (tx) => {
      const t = await tx.notificationTemplate.upsert({
        where: { tenantId_event_channel_locale: { tenantId: user.tenantId, event, channel, locale: 'es-CO' } },
        create: { tenantId: user.tenantId, event, channel, locale: 'es-CO', subject: b.subject ?? null, body: b.body, active: b.active },
        update: { subject: b.subject ?? null, body: b.body, active: b.active },
      });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'comms.template_updated', entity: 'notification_template', entityId: t.id, after: { event: event as NotificationEvent, channel }, meta });
      return t;
    });
  }

  /** WhatsApp Cloud API delivery/read statuses. */
  async whatsappWebhook(payload: { entry?: { changes?: { value?: { statuses?: { id: string; status: string }[] } }[] }[] }) {
    const statuses = payload.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.statuses ?? []) ?? []) ?? [];
    let updated = 0;
    for (const s of statuses) {
      const status = s.status === 'delivered' ? 'DELIVERED' : s.status === 'read' ? 'READ' : s.status === 'failed' ? 'FAILED' : null;
      if (!status) continue;
      const r = await this.prisma.system((tx) =>
        tx.notification.updateMany({ where: { providerMessageId: s.id }, data: { status, ...(status === 'DELIVERED' ? { deliveredAt: new Date() } : status === 'READ' ? { readAt: new Date() } : {}) } }),
      );
      updated += r.count;
    }
    return { updated };
  }
}
