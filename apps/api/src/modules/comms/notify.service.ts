import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { Notification, Prisma, Tx } from '@sgee/db';
import { CHANNELS, isWithinQuietHours, type Role, zonedToUtc, dateInTz, addDays } from '@sgee/shared';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import webpush from 'web-push';
import { PrismaService } from '../../common/prisma.service';
import { TenantSettingsService } from '../../common/tenant-settings.service';
import { config } from '../../config';
import { RealtimeService } from '../realtime/live.gateway';
import { DEFAULT_TEMPLATES, type NotificationEvent, render } from './templates';

export type Channel = (typeof CHANNELS)[number];

export interface NotifyInput {
  tenantId: string;
  event: NotificationEvent;
  userIds?: string[];
  guardiansOfStudentId?: string;
  roles?: Role[];
  data: Record<string, string | number | null | undefined>;
  link?: string;
  urgent?: boolean;
  entity?: string;
  entityId?: string;
  dedupeKey?: string;
  channels?: Channel[];
}

@Injectable()
export class NotifyService {
  constructor(private readonly settings: TenantSettingsService) {}

  /** Creates notification rows inside the caller's transaction (atomic with the event). */
  async notify(tx: Tx, input: NotifyInput): Promise<number> {
    const userIds = new Set(input.userIds ?? []);
    if (input.guardiansOfStudentId) {
      const links = await tx.studentGuardian.findMany({
        where: { studentId: input.guardiansOfStudentId, active: true },
        select: { guardian: { select: { personId: true } } },
      });
      const personIds = links.map((l) => l.guardian.personId);
      if (personIds.length) {
        const users = await tx.user.findMany({ where: { personId: { in: personIds }, active: true }, select: { id: true } });
        users.forEach((u) => userIds.add(u.id));
      }
    }
    if (input.roles?.length) {
      const rows = await tx.userRole.findMany({ where: { role: { in: input.roles }, user: { active: true } }, select: { userId: true } });
      rows.forEach((r) => userIds.add(r.userId));
    }
    if (!userIds.size) return 0;

    const tenantSettings = await this.settings.get(tx, input.tenantId);
    const tenant = await tx.tenant.findUnique({ where: { id: input.tenantId }, select: { timezone: true } });
    const tz = tenant?.timezone ?? 'America/Bogota';
    const users = await tx.user.findMany({
      where: { id: { in: [...userIds] }, active: true },
      select: { id: true, email: true, phone: true, locale: true, preference: true },
    });
    const templates = await tx.notificationTemplate.findMany({ where: { event: input.event, active: true } });
    const def = DEFAULT_TEMPLATES[input.event];
    const urgent = input.urgent ?? def.urgent ?? false;
    const now = new Date();

    const rows: Prisma.NotificationCreateManyInput[] = [];
    for (const u of users) {
      const pref = u.preference;
      const prefChannels = (pref?.channels as Record<string, boolean> | undefined) ?? { IN_APP: true, EMAIL: true };
      const wanted = new Set<Channel>(['IN_APP']);
      for (const ch of input.channels ?? (Object.keys(prefChannels) as Channel[])) {
        if ((input.channels || prefChannels[ch]) && tenantSettings.enabledChannels.includes(ch)) wanted.add(ch);
      }
      let scheduledFor = now;
      const qs = pref?.quietHoursStart ?? tenantSettings.quietHours.start;
      const qe = pref?.quietHoursEnd ?? tenantSettings.quietHours.end;
      if (!urgent && isWithinQuietHours(now, qs, qe, tz)) {
        const today = dateInTz(now, tz);
        const candidate = zonedToUtc(today, qe, tz);
        scheduledFor = candidate > now ? candidate : zonedToUtc(addDays(today, 1), qe, tz);
      }
      for (const channel of wanted) {
        const tpl = templates.find((t) => t.channel === channel && t.locale === (pref?.language ?? u.locale)) ?? templates.find((t) => t.channel === channel);
        const subject = render(tpl?.subject ?? def.subject, input.data);
        let body = render(tpl?.body ?? def.body, input.data);
        const address = channel === 'EMAIL' ? u.email : channel === 'SMS' || channel === 'WHATSAPP' ? (pref?.whatsappNumber ?? u.phone) : null;
        if ((channel === 'SMS' || channel === 'WHATSAPP' || channel === 'EMAIL') && !address) continue;
        if (channel !== 'IN_APP' && input.link) body += ` ${config().PUBLIC_WEB_URL}${input.link}`;
        rows.push({
          tenantId: input.tenantId,
          userId: u.id,
          recipientAddress: address,
          channel,
          event: input.event,
          subject,
          body,
          link: input.link ?? null,
          urgent,
          status: 'QUEUED',
          entity: input.entity ?? null,
          entityId: input.entityId ?? null,
          dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${u.id}:${channel}` : null,
          // IN_APP is visible immediately; quiet hours only defer outbound channels.
          scheduledFor: channel === 'IN_APP' ? now : scheduledFor,
        });
      }
    }
    if (!rows.length) return 0;
    const r = await tx.notification.createMany({ data: rows, skipDuplicates: true });
    return r.count;
  }
}

/** Sends queued notifications through channel adapters. */
@Injectable()
export class NotificationDispatcher implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Dispatcher');
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private mailer: Transporter | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  onApplicationBootstrap() {
    const c = config();
    if (c.VAPID_PUBLIC_KEY && c.VAPID_PRIVATE_KEY) webpush.setVapidDetails(c.VAPID_SUBJECT, c.VAPID_PUBLIC_KEY, c.VAPID_PRIVATE_KEY);
    if (c.JOBS_ENABLED) this.timer = setInterval(() => void this.dispatchPending(), 3000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async dispatchPending(limit = 100): Promise<number> {
    if (this.busy) return 0;
    this.busy = true;
    try {
      const batch = await this.prisma.system((tx) =>
        tx.$queryRaw<Notification[]>`
          UPDATE comms.notifications SET attempts = attempts + 1
          WHERE id IN (SELECT id FROM comms.notifications WHERE status = 'QUEUED' AND scheduled_for <= now() AND attempts < 5
                       ORDER BY urgent DESC, scheduled_for LIMIT ${limit} FOR UPDATE SKIP LOCKED)
          RETURNING id, tenant_id AS "tenantId", user_id AS "userId", channel, event, subject, body, link, urgent,
                    recipient_address AS "recipientAddress", attempts`,
      );
      for (const n of batch) await this.send(n);
      return batch.length;
    } finally {
      this.busy = false;
    }
  }

  private async send(n: Notification) {
    let status: 'SENT' | 'FAILED' | 'SUPPRESSED' | 'QUEUED' = 'SENT';
    let provider = n.channel.toLowerCase();
    let providerMessageId: string | null = null;
    let error: string | null = null;
    try {
      switch (n.channel) {
        case 'IN_APP':
          provider = 'in-app';
          if (n.userId) this.realtime.user(n.userId, 'notification', { id: n.id, event: n.event, subject: n.subject, link: n.link, urgent: n.urgent });
          break;
        case 'EMAIL':
          ({ provider, providerMessageId } = await this.sendEmail(n));
          break;
        case 'WHATSAPP':
          ({ provider, providerMessageId, status } = await this.sendWhatsApp(n));
          break;
        case 'SMS':
          ({ provider, providerMessageId, status } = await this.sendSms(n));
          break;
        case 'PUSH':
          ({ provider, status } = await this.sendPush(n));
          break;
      }
    } catch (e) {
      error = (e as Error).message.slice(0, 500);
      status = n.attempts >= 5 ? 'FAILED' : 'QUEUED';
      this.logger.warn(`notification ${n.id} ${n.channel} failed: ${error}`);
    }
    await this.prisma.system((tx) =>
      tx.notification.update({
        where: { id: n.id },
        data: {
          status,
          provider,
          providerMessageId,
          error,
          sentAt: status === 'SENT' ? new Date() : null,
          scheduledFor: status === 'QUEUED' ? new Date(Date.now() + 60_000 * n.attempts) : undefined,
        },
      }),
    );
  }

  private async sendEmail(n: Notification) {
    const c = config();
    if (!c.SMTP_HOST) {
      // Development outbox: messages are written to storage/outbox for inspection.
      const dir = path.join(c.storageDir, 'outbox');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, `${n.id}.json`), JSON.stringify({ to: n.recipientAddress, subject: n.subject, body: n.body }, null, 2));
      return { provider: 'outbox', providerMessageId: n.id };
    }
    this.mailer ??= nodemailer.createTransport({
      host: c.SMTP_HOST,
      port: c.SMTP_PORT,
      secure: c.SMTP_PORT === 465,
      auth: c.SMTP_USER ? { user: c.SMTP_USER, pass: c.SMTP_PASS } : undefined,
    });
    const info = await this.mailer.sendMail({ from: c.SMTP_FROM, to: n.recipientAddress!, subject: n.subject ?? 'Enfermería', text: n.body });
    return { provider: 'smtp', providerMessageId: info.messageId };
  }

  private async sendWhatsApp(n: Notification) {
    const c = config();
    if (!c.WHATSAPP_TOKEN || !c.WHATSAPP_PHONE_NUMBER_ID) return { provider: 'whatsapp', providerMessageId: null, status: 'SUPPRESSED' as const };
    const res = await fetch(`https://graph.facebook.com/v21.0/${c.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: n.recipientAddress?.replace(/\D/g, ''), type: 'text', text: { body: n.body } }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`WhatsApp ${res.status}`);
    const j = (await res.json()) as { messages?: { id: string }[] };
    return { provider: 'whatsapp-cloud', providerMessageId: j.messages?.[0]?.id ?? null, status: 'SENT' as const };
  }

  private async sendSms(n: Notification) {
    const c = config();
    if (!c.TWILIO_ACCOUNT_SID || !c.TWILIO_AUTH_TOKEN || !c.TWILIO_FROM) return { provider: 'twilio', providerMessageId: null, status: 'SUPPRESSED' as const };
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${c.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${c.TWILIO_ACCOUNT_SID}:${c.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: n.recipientAddress!, From: c.TWILIO_FROM, Body: n.body }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Twilio ${res.status}`);
    const j = (await res.json()) as { sid?: string };
    return { provider: 'twilio', providerMessageId: j.sid ?? null, status: 'SENT' as const };
  }

  private async sendPush(n: Notification) {
    const c = config();
    if (!c.VAPID_PUBLIC_KEY || !n.userId) return { provider: 'web-push', status: 'SUPPRESSED' as const };
    const subs = await this.prisma.forTenant(n.tenantId, (tx) => tx.pushSubscription.findMany({ where: { userId: n.userId! } }));
    if (!subs.length) return { provider: 'web-push', status: 'SUPPRESSED' as const };
    await Promise.all(
      subs.map((s) =>
        webpush
          .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: n.subject, body: n.body, link: n.link }))
          .catch(async (e: { statusCode?: number }) => {
            if (e.statusCode === 410 || e.statusCode === 404) await this.prisma.forTenant(n.tenantId, (tx) => tx.pushSubscription.delete({ where: { id: s.id } }));
          }),
      ),
    );
    return { provider: 'web-push', status: 'SENT' as const };
  }
}
