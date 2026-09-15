import { Injectable } from '@nestjs/common';
import { dateInTz, dayBounds, DISPOSITION_LABELS, type Disposition, PASS_STATE_LABELS, type PassState, timeInTz } from '@sgee/shared';
import QRCode from 'qrcode';
import { AccessService } from '../../common/access.service';
import { type AuthUser } from '../../common/auth';
import { forbidden } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { personName, studentInclude, studentSummary } from '../../common/serializers';
import { TenantSettingsService } from '../../common/tenant-settings.service';
import { ClinicalService } from '../clinical/clinical.service';
import { PhotoService } from '../files/storage.service';

/** Parent (PWA) home: today's status, children, profile completeness, pending actions. */
@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly clinical: ClinicalService,
    private readonly settings: TenantSettingsService,
    private readonly photos: PhotoService,
  ) {}

  async home(user: AuthUser) {
    return this.prisma.forUser(user, async (tx) => {
      const tz = await this.settings.timezone(tx, user.tenantId);
      const today = dateInTz(new Date(), tz);
      const { start, end } = dayBounds(today, tz);
      const ids = await this.access.childrenIds(tx, user);
      const students = await tx.student.findMany({ where: { id: { in: ids } }, include: studentInclude });
      const children = [];
      for (const s of students) {
        const [openPass, todayEncounters, exits, completeness, templates, consents, meds, doses, threads] = await Promise.all([
          tx.pass.findFirst({ where: { studentId: s.id, state: { notIn: ['CLOSED', 'CANCELLED', 'EXPIRED'] } }, orderBy: { requestedAt: 'desc' } }),
          tx.encounter.findMany({ where: { studentId: s.id, startedAt: { gte: start, lt: end }, isMentalHealth: false, status: { not: 'ANNULLED' } }, orderBy: { startedAt: 'desc' } }),
          tx.exitAuthorization.findMany({ where: { studentId: s.id, status: 'PENDING_GUARDIAN', expiresAt: { gt: new Date() } } }),
          this.clinical.completeness(tx, s.id, s.personId),
          tx.consentTemplate.findMany({ where: { active: true, mandatory: true }, select: { id: true } }),
          tx.consent.findMany({ where: { studentId: s.id, status: 'GRANTED' }, select: { templateId: true } }),
          tx.medicationRequest.count({ where: { studentId: s.id, status: { in: ['ACTIVE', 'APPROVED', 'SUBMITTED'] } } }),
          tx.medicationSchedule.findMany({ where: { studentId: s.id, scheduledFor: { gte: start, lt: end }, status: { not: 'CANCELLED' } }, orderBy: { scheduledFor: 'asc' } }),
          tx.threadParticipant.findMany({ where: { userId: user.id, thread: { studentId: s.id } }, include: { thread: { include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } } } } }),
        ]);
        const signed = new Set(consents.map((c) => c.templateId));
        children.push({
          ...studentSummary(s, { photosEnabled: this.photos.enabled }),
          today: {
            openPass: openPass ? { id: openPass.id, state: openPass.state, label: PASS_STATE_LABELS[openPass.state as PassState], since: timeInTz(openPass.requestedAt, tz) } : null,
            encounters: todayEncounters.map((e) => ({ id: e.id, time: timeInTz(e.startedAt, tz), chiefComplaint: e.chiefComplaint, status: e.status, disposition: e.disposition ? DISPOSITION_LABELS[e.disposition as Disposition] : null, summary: e.status === 'CLOSED' ? e.parentSummary : 'En atención' })),
            pendingExit: exits.map((x) => ({ id: x.id, reason: x.reason, expiresAt: x.expiresAt })),
            doses: doses.map((d) => ({ time: timeInTz(d.scheduledFor, tz), status: d.status })),
          },
          profileCompleteness: completeness,
          pendingConsents: templates.filter((t) => !signed.has(t.id)).length,
          medicationRequests: meds,
          unreadMessages: threads.filter((t) => t.thread.messages[0] && t.thread.messages[0].authorUserId !== user.id && (!t.lastReadAt || t.lastReadAt < t.thread.messages[0].createdAt)).length,
        });
      }
      const unreadNotifications = await tx.notification.count({ where: { userId: user.id, channel: 'IN_APP', readAt: null } });
      const circulars = await tx.circularRecipient.count({ where: { userId: user.id, readAt: null } });
      return { date: today, children, unreadNotifications, unreadCirculars: circulars, guardian: { name: user.name } };
    });
  }

  /** Student portal (optional, secondary school): active pass QR. */
  async student(user: AuthUser) {
    return this.prisma.forUser(user, async (tx) => {
      if (!user.personId) throw forbidden();
      const s = await tx.student.findUnique({ where: { personId: user.personId }, include: studentInclude });
      if (!s) throw forbidden();
      const pass = await tx.pass.findFirst({ where: { studentId: s.id, state: { in: ['REQUESTED', 'IN_TRANSIT', 'RECEIVED', 'IN_CARE', 'OBSERVATION', 'RETURNED_TO_CLASS'] } }, orderBy: { requestedAt: 'desc' } });
      return {
        student: studentSummary(s, { photosEnabled: this.photos.enabled }),
        pass: pass ? { id: pass.id, code: pass.code, state: pass.state, label: PASS_STATE_LABELS[pass.state as PassState], qr: await QRCode.toDataURL(`SGEE:PASS:${pass.qrToken}`, { margin: 1, width: 280 }) } : null,
        name: personName(s.person),
      };
    });
  }
}
