import { Injectable } from '@nestjs/common';
import type { Tx } from '@sgee/db';
import { type AuthUser, can, hasRole, isClinical, type RequestMeta } from './auth';
import { forbidden, notFound } from './errors';

export type AccessPurpose = 'basic' | 'clinical' | 'mental_health';

/**
 * ABAC on top of RBAC:
 *  - clinical roles and admins: all students of the tenant;
 *  - directors with section scope: students of their sections (basic only);
 *  - teachers: students of their groups (basic only);
 *  - gate: basic identification only;
 *  - parents: their own children (basic + clinical summary).
 * Every clinical read is written to clinical_access_log.
 */
@Injectable()
export class AccessService {
  async childrenIds(tx: Tx, user: AuthUser): Promise<string[]> {
    if (!user.personId) return [];
    const links = await tx.studentGuardian.findMany({
      where: { active: true, guardian: { personId: user.personId } },
      select: { studentId: true },
    });
    return links.map((l) => l.studentId);
  }

  async teacherGroupIds(tx: Tx, user: AuthUser): Promise<string[]> {
    const rows = await tx.teacherGroup.findMany({ where: { userId: user.id }, select: { groupId: true } });
    return rows.map((r) => r.groupId);
  }

  async assertStudent(tx: Tx, user: AuthUser, studentId: string, purpose: AccessPurpose = 'basic', meta?: RequestMeta | null) {
    const student = await tx.student.findUnique({
      where: { id: studentId },
      include: { person: true, group: { include: { grade: { include: { section: true } } } } },
    });
    if (!student) throw notFound('Estudiante');

    let allowed = false;
    let outOfRole = false;
    if (purpose === 'mental_health') {
      allowed = can(user, 'mental_health:read');
    } else if (purpose === 'clinical') {
      if (can(user, 'clinical:read')) allowed = true;
      else if (hasRole(user, 'PARENT')) allowed = (await this.childrenIds(tx, user)).includes(studentId);
    } else {
      if (can(user, 'students:read_all') || isClinical(user)) {
        allowed = true;
        if (hasRole(user, 'DIRECTOR') && user.sectionScopes.length && !isClinical(user)) {
          allowed = !!student.group && user.sectionScopes.includes(student.group.grade.sectionId);
        }
      } else if (hasRole(user, 'GATE')) allowed = true;
      else if (hasRole(user, 'TEACHER')) allowed = !!student.currentGroupId && (await this.teacherGroupIds(tx, user)).includes(student.currentGroupId);
      if (!allowed && hasRole(user, 'PARENT')) allowed = (await this.childrenIds(tx, user)).includes(studentId);
    }
    if (!allowed) throw forbidden('No tiene acceso a la información de este estudiante.');

    if (purpose !== 'basic') {
      outOfRole = !isClinical(user) && !hasRole(user, 'PARENT', 'PSYCHOLOGIST');
      await tx.clinicalAccessLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          personId: student.personId,
          resource: purpose === 'mental_health' ? 'mental_health' : 'health_record',
          action: 'READ',
          outOfRole,
          ip: meta?.ip ?? null,
          userAgent: meta?.userAgent?.slice(0, 300) ?? null,
        },
      });
    }
    return student;
  }

  async assertPerson(tx: Tx, user: AuthUser, personId: string, purpose: AccessPurpose, meta?: RequestMeta | null) {
    const student = await tx.student.findUnique({ where: { personId }, select: { id: true } });
    if (student) return this.assertStudent(tx, user, student.id, purpose, meta);
    if (!can(user, 'clinical:read')) throw forbidden();
    await tx.clinicalAccessLog.create({
      data: { tenantId: user.tenantId, userId: user.id, personId, resource: 'staff_health_record', ip: meta?.ip ?? null, userAgent: meta?.userAgent ?? null },
    });
    return null;
  }
}
