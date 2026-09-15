import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma, type Tx } from '@sgee/db';
import { addDays, dateInTz, dayBounds, DISPOSITION_LABELS, type Disposition, ENCOUNTER_TYPE_LABELS, type EncounterType, type statsQuerySchema } from '@sgee/shared';
import ExcelJS from 'exceljs';
import type { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import { type AuthUser, can, hasRole, type RequestMeta } from '../../common/auth';
import { badRequest, forbidden } from '../../common/errors';
import { createPdf, field, footer, pdfToBuffer, section, table } from '../../common/pdf';
import { PrismaService } from '../../common/prisma.service';
import { TenantSettingsService } from '../../common/tenant-settings.service';
import { NotifyService } from '../comms/notify.service';
import { StorageService } from '../files/storage.service';
import { JobsService } from '../jobs/jobs.service';

type Query = z.infer<typeof statsQuerySchema>;
const median = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const avg = (v: number[]) => (v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null);

@Injectable()
export class StatsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: TenantSettingsService,
    private readonly jobs: JobsService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly notify: NotifyService,
  ) {}

  onModuleInit() {
    this.jobs.register('reporting.refresh', () => this.prisma.client.$executeRawUnsafe('SELECT reporting.refresh_all()').then(() => ({ refreshed: true })));
    this.jobs.register('stats.scheduled', (job) => this.runScheduledReports(job.tenantId!));
    this.jobs.every('reporting.refresh', 15, false);
    this.jobs.dailyAt('stats.scheduled', '06:00');
  }

  private async range(tx: Tx, tenantId: string, q: Query) {
    const tz = await this.settings.timezone(tx, tenantId);
    const to = q.to ?? dateInTz(new Date(), tz);
    const from = q.from ?? addDays(to, -29);
    if (from > to) throw badRequest('INVALID_RANGE', 'La fecha inicial debe ser anterior a la final.');
    return { tz, from, to, start: dayBounds(from, tz).start, end: dayBounds(to, tz).end };
  }

  /** Student filter honoring the director's section scope (ABAC). */
  private studentScope(user: AuthUser, q: Query): Prisma.Sql {
    const parts: Prisma.Sql[] = [];
    const sections = hasRole(user, 'DIRECTOR') && !can(user, 'stats:clinical') && user.sectionScopes.length ? user.sectionScopes : null;
    if (sections) parts.push(Prisma.sql`sec.id IN (${Prisma.join(sections.map((s) => Prisma.sql`${s}::uuid`))})`);
    if (q.sectionId) parts.push(Prisma.sql`sec.id = ${q.sectionId}::uuid`);
    if (q.gradeId) parts.push(Prisma.sql`g.id = ${q.gradeId}::uuid`);
    if (q.groupId) parts.push(Prisma.sql`gr.id = ${q.groupId}::uuid`);
    return parts.length ? Prisma.sql`AND ${Prisma.join(parts, ' AND ')}` : Prisma.empty;
  }

  async dashboard(user: AuthUser, q: Query) {
    if (!can(user, 'stats:clinical', 'stats:anonymous')) throw forbidden();
    return this.prisma.forUser(user, async (tx) => {
      const { tz, from, to, start, end } = await this.range(tx, user.tenantId, q);
      const scope = this.studentScope(user, q);
      const join = Prisma.sql`LEFT JOIN people.students s ON s.id = e.student_id LEFT JOIN core.groups gr ON gr.id = s.current_group_id LEFT JOIN core.grades g ON g.id = gr.grade_id LEFT JOIN core.sections sec ON sec.id = g.section_id`;
      const base = Prisma.sql`FROM clinical.encounters e ${join} WHERE e.status <> 'ANNULLED' AND e.started_at >= ${start} AND e.started_at < ${end} ${scope}`;
      const onlyStudents = !!(q.sectionId || q.gradeId || q.groupId || (hasRole(user, 'DIRECTOR') && user.sectionScopes.length));
      const subject = onlyStudents ? Prisma.sql`AND e.subject_type = 'STUDENT'` : Prisma.empty;

      const [totals] = await tx.$queryRaw<{ encounters: bigint; students: bigint; accidents: bigint; pickups: bigint; transfers: bigint; staff: bigint }[]>`
        SELECT count(*) AS encounters, count(DISTINCT e.person_id) FILTER (WHERE e.subject_type = 'STUDENT') AS students,
               count(*) FILTER (WHERE e.type = 'ACCIDENT') AS accidents, count(*) FILTER (WHERE e.disposition = 'GUARDIAN_PICKUP') AS pickups,
               count(*) FILTER (WHERE e.disposition = 'TRANSFER_IPS') AS transfers, count(*) FILTER (WHERE e.subject_type = 'STAFF') AS staff
        ${base} ${subject}`;
      const byDay = await tx.$queryRaw<{ day: string; count: bigint }[]>`SELECT to_char((e.started_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day, count(*) AS count ${base} ${subject} GROUP BY 1 ORDER BY 1`;
      const byHour = await tx.$queryRaw<{ hour: number; count: bigint }[]>`SELECT extract(hour FROM e.started_at AT TIME ZONE ${tz})::int AS hour, count(*) AS count ${base} ${subject} GROUP BY 1 ORDER BY 1`;
      const byWeekdayHour = await tx.$queryRaw<{ dow: number; hour: number; count: bigint }[]>`SELECT extract(isodow FROM e.started_at AT TIME ZONE ${tz})::int AS dow, extract(hour FROM e.started_at AT TIME ZONE ${tz})::int AS hour, count(*) AS count ${base} ${subject} GROUP BY 1, 2`;
      const byType = await tx.$queryRaw<{ key: string; count: bigint }[]>`SELECT e.type AS key, count(*) AS count ${base} ${subject} GROUP BY 1 ORDER BY 2 DESC`;
      const byMotive = await tx.$queryRaw<{ key: string; count: bigint }[]>`SELECT e.chief_complaint AS key, count(*) AS count ${base} ${subject} GROUP BY 1 ORDER BY 2 DESC LIMIT 15`;
      const byDiagnosis = await tx.$queryRaw<{ key: string; label: string; count: bigint }[]>`
        SELECT d.code AS key, min(d.description) AS label, count(*) AS count
        FROM clinical.encounters e ${join} JOIN clinical.encounter_diagnoses d ON d.encounter_id = e.id AND d."primary"
        WHERE e.status <> 'ANNULLED' AND e.started_at >= ${start} AND e.started_at < ${end} ${scope} ${subject}
        GROUP BY 1 ORDER BY 3 DESC LIMIT 15`;
      const byDisposition = await tx.$queryRaw<{ key: string; count: bigint }[]>`SELECT coalesce(e.disposition, 'SIN_CIERRE') AS key, count(*) AS count ${base} ${subject} GROUP BY 1 ORDER BY 2 DESC`;
      const bySection = await tx.$queryRaw<{ key: string; count: bigint }[]>`SELECT coalesce(sec.name, CASE WHEN e.subject_type = 'STAFF' THEN 'Personal' ELSE 'Sin grupo' END) AS key, count(*) AS count ${base} ${subject} GROUP BY 1 ORDER BY 2 DESC`;
      const byGrade = await tx.$queryRaw<{ key: string; count: bigint; sort: number }[]>`SELECT g.name AS key, count(*) AS count, min(sec.sort_order * 100 + g.sort_order) AS sort ${base} AND g.id IS NOT NULL GROUP BY 1 ORDER BY 3`;
      const byGroup = await tx.$queryRaw<{ key: string; count: bigint }[]>`SELECT gr.name AS key, count(*) AS count ${base} AND gr.id IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 20`;
      const byZone = await tx.$queryRaw<{ key: string; count: bigint; severe: bigint }[]>`SELECT i.place AS key, count(*) AS count, count(*) FILTER (WHERE i.severity <> 'MILD') AS severe FROM clinical.encounters e ${join} JOIN clinical.incident_reports i ON i.encounter_id = e.id WHERE e.status <> 'ANNULLED' AND e.started_at >= ${start} AND e.started_at < ${end} ${scope} GROUP BY 1 ORDER BY 2 DESC`;
      const byActivity = await tx.$queryRaw<{ key: string; count: bigint }[]>`SELECT coalesce(i.activity, 'Sin dato') AS key, count(*) AS count FROM clinical.encounters e ${join} JOIN clinical.incident_reports i ON i.encounter_id = e.id WHERE e.status <> 'ANNULLED' AND e.started_at >= ${start} AND e.started_at < ${end} ${scope} GROUP BY 1 ORDER BY 2 DESC`;

      // Pass times and teachers
      const passes = await tx.$queryRaw<{ transit: number | null; wait: number | null; care: number | null; pickup: number | null; total: number | null; issued_by: string | null; state: string }[]>`
        SELECT extract(epoch FROM (p.received_at - p.requested_at)) / 60 AS transit, extract(epoch FROM (p.in_care_at - p.received_at)) / 60 AS wait,
               extract(epoch FROM (coalesce(p.returned_at, p.waiting_guardian_at, p.transferred_at) - p.in_care_at)) / 60 AS care,
               extract(epoch FROM (p.handed_over_at - p.waiting_guardian_at)) / 60 AS pickup,
               extract(epoch FROM (coalesce(p.closed_at, p.handed_over_at, p.transferred_at, p.returned_at) - p.requested_at)) / 60 AS total,
               p.issued_by_user_id AS issued_by, p.state
        FROM flow.passes p JOIN people.students s ON s.id = p.student_id LEFT JOIN core.groups gr ON gr.id = s.current_group_id LEFT JOIN core.grades g ON g.id = gr.grade_id LEFT JOIN core.sections sec ON sec.id = g.section_id
        WHERE p.requested_at >= ${start} AND p.requested_at < ${end} ${scope}`;
      const clean = (k: keyof (typeof passes)[number], max: number) => passes.map((p) => Number(p[k])).filter((v) => Number.isFinite(v) && v >= 0 && v <= max);
      const teacherCounts = new Map<string, number>();
      for (const p of passes) if (p.issued_by) teacherCounts.set(p.issued_by, (teacherCounts.get(p.issued_by) ?? 0) + 1);
      const teacherUsers = await tx.user.findMany({ where: { id: { in: [...teacherCounts.keys()] } }, select: { id: true, firstName: true, lastName: true } });
      const byTeacher = [...teacherCounts.entries()].map(([id, count]) => ({ key: teacherUsers.find((t) => t.id === id) ? `${teacherUsers.find((t) => t.id === id)!.firstName} ${teacherUsers.find((t) => t.id === id)!.lastName}` : 'Otro', count })).sort((a, b) => b.count - a.count).slice(0, 15);

      // Frequent students (anonymized without clinical permission)
      const frequent = await tx.$queryRaw<{ student_id: string; name: string; group_name: string | null; count: bigint }[]>`
        SELECT e.student_id, min(pp.first_name || ' ' || pp.last_name) AS name, min(gr.name) AS group_name, count(*) AS count
        FROM clinical.encounters e ${join} JOIN people.persons pp ON pp.id = e.person_id
        WHERE e.status <> 'ANNULLED' AND e.subject_type = 'STUDENT' AND e.started_at >= ${start} AND e.started_at < ${end} ${scope}
        GROUP BY e.student_id ORDER BY 4 DESC LIMIT 10`;
      const clinical = can(user, 'stats:clinical');

      // Medication adherence
      const [med] = await tx.$queryRaw<{ given: bigint; not_given: bigint; missed: bigint }[]>`
        SELECT count(*) FILTER (WHERE a.outcome = 'GIVEN') AS given, count(*) FILTER (WHERE a.outcome <> 'GIVEN') AS not_given,
               (SELECT count(*) FROM meds.medication_schedule ms WHERE ms.status = 'MISSED' AND ms.scheduled_for >= ${start} AND ms.scheduled_for < ${end}) AS missed
        FROM meds.medication_administrations a WHERE a.administered_at >= ${start} AND a.administered_at < ${end}`;
      const topMeds = await tx.$queryRaw<{ key: string; count: bigint }[]>`SELECT r.medication_name AS key, count(*) AS count FROM meds.medication_administrations a JOIN meds.medication_requests r ON r.id = a.request_id WHERE a.outcome = 'GIVEN' AND a.administered_at >= ${start} AND a.administered_at < ${end} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`;
      const [inv] = await tx.$queryRaw<{ consumed_cost: number | null; movements: bigint }[]>`SELECT sum(-m.quantity * coalesce(i.unit_cost, 0)) AS consumed_cost, count(*) AS movements FROM inventory.stock_movements m JOIN inventory.items i ON i.id = m.item_id WHERE m.quantity < 0 AND m.created_at >= ${start} AND m.created_at < ${end}`;
      const expiredBatches = await tx.itemBatch.count({ where: { status: 'EXPIRED' } });

      // Compliance
      const activeStudents = await tx.student.count({ where: { status: 'ACTIVE' } });
      const [profilesUpdated, vaccinated, mandatoryTemplates] = await Promise.all([
        tx.healthProfile.count({ where: { lastGuardianUpdateAt: { gte: new Date(new Date().getFullYear(), 0, 1) }, person: { student: { status: 'ACTIVE' } } } }),
        tx.$queryRaw<{ person_id: string }[]>`SELECT DISTINCT i.person_id FROM clinical.immunizations i JOIN people.students s ON s.person_id = i.person_id WHERE s.status = 'ACTIVE'`,
        tx.consentTemplate.findMany({ where: { mandatory: true, active: true }, select: { id: true } }),
      ]);
      const consentRows = mandatoryTemplates.length
        ? await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM (SELECT c.student_id FROM compliance.consents c WHERE c.status = 'GRANTED' AND c.template_id IN (${Prisma.join(mandatoryTemplates.map((t) => Prisma.sql`${t.id}::uuid`))}) GROUP BY c.student_id HAVING count(DISTINCT c.template_id) = ${mandatoryTemplates.length}) x`
        : [{ n: BigInt(0) }];

      let comparison: { encounters: number; from: string; to: string } | null = null;
      if (q.compareYear) {
        const pf = `${Number(from.slice(0, 4)) - 1}${from.slice(4)}`;
        const pt = `${Number(to.slice(0, 4)) - 1}${to.slice(4)}`;
        const [prev] = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM clinical.encounters e ${join} WHERE e.status <> 'ANNULLED' AND e.started_at >= ${dayBounds(pf, tz).start} AND e.started_at < ${dayBounds(pt, tz).end} ${scope} ${subject}`;
        comparison = { encounters: Number(prev.n), from: pf, to: pt };
      }
      const n = (x: bigint | number | null | undefined) => Number(x ?? 0);
      const kv = (rows: { key: string; count: bigint }[], labels?: Record<string, string>) => rows.map((r) => ({ key: r.key, label: labels?.[r.key] ?? r.key, count: n(r.count) }));
      const given = n(med?.given);
      const notGiven = n(med?.not_given) + n(med?.missed);
      return {
        range: { from, to },
        anonymized: !clinical,
        totals: { encounters: n(totals.encounters), students: n(totals.students), accidents: n(totals.accidents), pickups: n(totals.pickups), transfers: n(totals.transfers), staff: n(totals.staff), passes: passes.length },
        comparison,
        byDay: byDay.map((r) => ({ day: r.day, count: n(r.count) })),
        byHour: byHour.map((r) => ({ hour: r.hour, count: n(r.count) })),
        heatmap: byWeekdayHour.map((r) => ({ dow: r.dow, hour: r.hour, count: n(r.count) })),
        byType: kv(byType, ENCOUNTER_TYPE_LABELS as Record<string, string>),
        byMotive: kv(byMotive),
        byDiagnosis: byDiagnosis.map((r) => ({ key: r.key, label: `${r.key} ${r.label}`, count: n(r.count) })),
        byDisposition: kv(byDisposition, { ...(DISPOSITION_LABELS as Record<Disposition, string>), SIN_CIERRE: 'Abierta' }),
        bySection: kv(bySection),
        byGrade: byGrade.map((r) => ({ key: r.key, label: r.key, count: n(r.count) })),
        byGroup: kv(byGroup),
        byZone: byZone.map((r) => ({ key: r.key, label: r.key, count: n(r.count), severe: n(r.severe) })),
        byActivity: kv(byActivity),
        byTeacher,
        times: {
          transit: { avg: avg(clean('transit', 120)), median: median(clean('transit', 120)) },
          wait: { avg: avg(clean('wait', 120)), median: median(clean('wait', 120)) },
          care: { avg: avg(clean('care', 240)), median: median(clean('care', 240)) },
          pickup: { avg: avg(clean('pickup', 480)), median: median(clean('pickup', 480)) },
          total: { avg: avg(clean('total', 480)), median: median(clean('total', 480)) },
        },
        frequent: frequent.map((f, i) => ({ studentId: clinical ? f.student_id : null, name: clinical ? f.name : `Estudiante ${i + 1}`, group: f.group_name, count: n(f.count) })),
        medication: { given, notGiven, adherencePct: given + notGiven ? Math.round((given / (given + notGiven)) * 100) : null, top: kv(topMeds) },
        inventory: { consumedCost: Math.round(Number(inv?.consumed_cost ?? 0)), movements: n(inv?.movements), expiredBatches },
        compliance: {
          activeStudents,
          profilesUpdatedPct: activeStudents ? Math.round((profilesUpdated / activeStudents) * 100) : 0,
          consentsCompletePct: activeStudents ? Math.round((n(consentRows[0]?.n) / activeStudents) * 100) : 0,
          vaccinationRegisteredPct: activeStudents ? Math.round((vaccinated.length / activeStudents) * 100) : 0,
        },
      };
    });
  }

  // ── exports ──────────────────────────────────────────────────────────────
  private async dataset(user: AuthUser, name: string, q: Query): Promise<{ title: string; columns: string[]; rows: (string | number | null)[][] }> {
    return this.prisma.forUser(user, async (tx) => {
      const { tz, start, end } = await this.range(tx, user.tenantId, q);
      const clinical = can(user, 'stats:clinical');
      const fmt = (d: Date | null) => (d ? `${dateInTz(d, tz)} ${new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(d)}` : null);
      const sectionScope = hasRole(user, 'DIRECTOR') && !clinical && user.sectionScopes.length ? { group: { grade: { sectionId: { in: user.sectionScopes } } } } : {};
      if (name === 'encounters') {
        const rows = await tx.encounter.findMany({
          where: { status: { not: 'ANNULLED' }, startedAt: { gte: start, lt: end }, ...(Object.keys(sectionScope).length ? { person: { student: sectionScope } } : {}) },
          include: { person: { include: { student: { include: { group: { include: { grade: { include: { section: true } } } } } } } }, diagnoses: { where: { primary: true } }, incident: true },
          orderBy: { startedAt: 'asc' },
          take: 50000,
        });
        return {
          title: 'Atenciones',
          columns: clinical ? ['Fecha', 'Paciente', 'Código', 'Sección', 'Grupo', 'Tipo', 'Motivo', 'CIE-10', 'Conducta', 'Lugar accidente', 'Histórico'] : ['Fecha', 'Sección', 'Grupo', 'Tipo', 'Motivo', 'CIE-10', 'Conducta', 'Lugar accidente'],
          rows: rows.map((e) => {
            const st = e.person.student;
            const common = [st?.group?.grade.section.name ?? (e.subjectType === 'STAFF' ? 'Personal' : ''), st?.group?.name ?? '', ENCOUNTER_TYPE_LABELS[e.type as EncounterType] ?? e.type, e.chiefComplaint, e.diagnoses[0]?.code ?? '', e.disposition ? DISPOSITION_LABELS[e.disposition as Disposition] : '', e.incident?.place ?? ''];
            return clinical ? [fmt(e.startedAt), `${e.person.firstName} ${e.person.lastName}`, st?.code ?? '', ...common, e.isHistorical ? 'Sí' : ''] : [fmt(e.startedAt), ...common];
          }),
        };
      }
      if (name === 'passes') {
        const rows = await tx.pass.findMany({ where: { requestedAt: { gte: start, lt: end }, student: sectionScope }, include: { student: { include: { person: true, group: true } } }, orderBy: { requestedAt: 'asc' }, take: 50000 });
        const mins = (a: Date | null, b: Date | null) => (a && b ? Math.round((b.getTime() - a.getTime()) / 60000) : null);
        return {
          title: 'Pases de enfermería',
          columns: [...(clinical ? ['Estudiante'] : []), 'Grupo', 'Solicitado', 'Estado', 'Urgencia', 'Motivo', 'Asignatura', 'Tránsito (min)', 'Atención (min)', 'Espera acudiente (min)', 'Total (min)'],
          rows: rows.map((p) => [...(clinical ? [`${p.student.person.firstName} ${p.student.person.lastName}`] : []), p.student.group?.name ?? '', fmt(p.requestedAt), p.state, p.urgency, p.reason, p.subject, mins(p.requestedAt, p.receivedAt), mins(p.inCareAt, p.returnedAt ?? p.waitingGuardianAt ?? p.transferredAt), mins(p.waitingGuardianAt, p.handedOverAt), mins(p.requestedAt, p.closedAt)]),
        };
      }
      if (name === 'administrations') {
        if (!clinical) throw forbidden();
        const rows = await tx.medicationAdministration.findMany({ where: { administeredAt: { gte: start, lt: end } }, include: { request: { include: { student: { include: { person: true } } } } }, orderBy: { administeredAt: 'asc' }, take: 50000 });
        return { title: 'Administración de medicamentos', columns: ['Fecha', 'Estudiante', 'Medicamento', 'Dosis', 'Vía', 'Resultado', 'Motivo'], rows: rows.map((a) => [fmt(a.administeredAt), `${a.request.student.person.firstName} ${a.request.student.person.lastName}`, a.request.medicationName, `${a.dose} ${a.doseUnit}`, a.route, a.outcome, a.reason]) };
      }
      if (name === 'inventory') {
        const rows = await tx.stockMovement.findMany({ where: { createdAt: { gte: start, lt: end } }, include: { item: true, batch: true }, orderBy: { createdAt: 'asc' }, take: 50000 });
        return { title: 'Movimientos de inventario', columns: ['Fecha', 'Ítem', 'Lote', 'Tipo', 'Cantidad', 'Costo', 'Motivo'], rows: rows.map((m) => [fmt(m.createdAt), m.item.name, m.batch?.lot ?? '', m.type, m.quantity, Math.round(m.quantity * (m.item.unitCost ?? 0)), m.reason]) };
      }
      throw badRequest('UNKNOWN_DATASET', 'Conjunto de datos no disponible.');
    });
  }

  async export(user: AuthUser, name: string, format: string, q: Query, meta: RequestMeta): Promise<{ buffer: Buffer; mime: string; filename: string }> {
    if (!can(user, 'stats:clinical', 'stats:anonymous')) throw forbidden();
    const ds = await this.dataset(user, name, q);
    await this.prisma.forUser(user, (tx) => this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'stats.exported', entity: 'dataset', entityId: name, after: { format, rows: ds.rows.length, from: q.from, to: q.to }, meta }));
    const base = `${name}-${q.from ?? 'inicio'}-${q.to ?? 'hoy'}`;
    if (format === 'csv') {
      const esc = (v: unknown) => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = [ds.columns.join(';'), ...ds.rows.map((r) => r.map(esc).join(';'))].join('\n');
      return { buffer: Buffer.from('﻿' + csv, 'utf8'), mime: 'text/csv; charset=utf-8', filename: `${base}.csv` };
    }
    if (format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'MediSchool SGEE';
      const ws = wb.addWorksheet(ds.title.slice(0, 30));
      ws.addRow(ds.columns).font = { bold: true };
      ds.rows.forEach((r) => ws.addRow(r));
      ws.columns.forEach((c) => (c.width = 18));
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `${base}.xlsx` };
    }
    if (format === 'pdf') {
      const d = await this.dashboard(user, q);
      return { buffer: await this.summaryPdf(user, d), mime: 'application/pdf', filename: `${base}.pdf` };
    }
    throw badRequest('UNKNOWN_FORMAT', 'Formato no soportado.');
  }

  private async summaryPdf(user: AuthUser, d: Awaited<ReturnType<StatsService['dashboard']>>) {
    const tenant = await this.prisma.forUser(user, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: user.tenantId } }));
    const doc = createPdf('Informe de enfermería escolar', `${tenant.name} · ${d.range.from} a ${d.range.to}${d.anonymized ? ' · datos agregados anónimos' : ''}`);
    section(doc, 'Indicadores');
    field(doc, 'Atenciones', d.totals.encounters);
    field(doc, 'Estudiantes atendidos', d.totals.students);
    field(doc, 'Accidentes', d.totals.accidents);
    field(doc, 'Retiros por acudiente', d.totals.pickups);
    field(doc, 'Traslados a IPS', d.totals.transfers);
    field(doc, 'Tiempo medio de tránsito (min)', d.times.transit.avg);
    field(doc, 'Adherencia a medicación', d.medication.adherencePct !== null ? `${d.medication.adherencePct}%` : '—');
    section(doc, 'Motivos más frecuentes');
    table(doc, ['Motivo', 'Atenciones'], d.byMotive.map((m) => [m.label, m.count]), [400, 112]);
    section(doc, 'Por sección');
    table(doc, ['Sección', 'Atenciones'], d.bySection.map((m) => [m.label, m.count]), [400, 112]);
    if (d.byZone.length) {
      section(doc, 'Accidentalidad por lugar');
      table(doc, ['Lugar', 'Accidentes', 'Moderados/graves'], d.byZone.map((z) => [z.label, z.count, z.severe]), [300, 106, 106]);
    }
    section(doc, 'Cumplimiento');
    field(doc, 'Fichas actualizadas este año', `${d.compliance.profilesUpdatedPct}%`);
    field(doc, 'Consentimientos obligatorios completos', `${d.compliance.consentsCompletePct}%`);
    field(doc, 'Vacunación registrada', `${d.compliance.vaccinationRegisteredPct}%`);
    footer(doc, `${tenant.name} · MediSchool SGEE`);
    return pdfToBuffer(doc);
  }

  // ── scheduled reports ────────────────────────────────────────────────────
  scheduledReports(user: AuthUser) {
    return this.prisma.forUser(user, (tx) => tx.scheduledReport.findMany({ orderBy: { createdAt: 'desc' } }));
  }

  async createScheduledReport(user: AuthUser, b: { name: string; frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'; recipients: string[]; params: Record<string, unknown> }, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const r = await tx.scheduledReport.create({ data: { tenantId: user.tenantId, name: b.name, kind: 'SUMMARY_PDF', frequency: b.frequency, recipients: b.recipients, params: b.params as object, createdBy: user.id } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'stats.scheduled_report_created', entity: 'scheduled_report', entityId: r.id, meta });
      return r;
    });
  }

  async runScheduledReports(tenantId: string) {
    const reports = await this.prisma.forTenant(tenantId, (tx) => tx.scheduledReport.findMany({ where: { active: true } }));
    let sent = 0;
    for (const r of reports) {
      const now = new Date();
      const due = r.frequency === 'DAILY' || (r.frequency === 'WEEKLY' && now.getDay() === 1) || (r.frequency === 'MONTHLY' && now.getDate() === 1);
      if (!due || (r.lastRunAt && now.getTime() - r.lastRunAt.getTime() < 20 * 3600_000)) continue;
      const owner = await this.prisma.forTenant(tenantId, (tx) => tx.user.findFirst({ where: { id: r.createdBy ?? undefined }, include: { roles: true } }));
      if (!owner) continue;
      const days = r.frequency === 'DAILY' ? 1 : r.frequency === 'WEEKLY' ? 7 : 30;
      const today = dateInTz(now, 'America/Bogota');
      const user: AuthUser = { id: owner.id, tenantId, email: owner.email, name: `${owner.firstName} ${owner.lastName}`, personId: owner.personId, roles: owner.roles.map((x) => x.role) as AuthUser['roles'], permissions: ['stats:clinical', 'stats:anonymous'], sectionScopes: [], sessionId: 'job', kiosk: false, mustChangePassword: false };
      const { buffer } = await this.export(user, 'encounters', 'pdf', { from: addDays(today, -days), to: addDays(today, -1) }, { ip: null, userAgent: 'scheduler', requestId: 'job' });
      const file = await this.storage.save(user, { buffer, originalName: `${r.name}-${today}.pdf`, kind: 'EXPORT' });
      await this.prisma.forTenant(tenantId, async (tx) => {
        const recipients = await tx.user.findMany({ where: { email: { in: r.recipients }, active: true }, select: { id: true } });
        await tx.notification.createMany({ data: recipients.map((u) => ({ tenantId, userId: u.id, channel: 'IN_APP', event: 'CIRCULAR', subject: `Informe programado: ${r.name}`, body: `Disponible el informe ${r.name} (${today}).`, link: `/api/v1/files/${file.id}` })) });
        await this.notify.notify(tx, { tenantId, event: 'CIRCULAR', userIds: recipients.map((u) => u.id), channels: ['EMAIL'], data: { title: `Informe programado: ${r.name}` }, link: `/api/v1/files/${file.id}` });
        await tx.scheduledReport.update({ where: { id: r.id }, data: { lastRunAt: now } });
      });
      sent++;
    }
    return { sent };
  }
}
