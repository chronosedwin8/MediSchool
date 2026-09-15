import { ageInYears } from '@sgee/shared';

type PersonLike = { id: string; firstName: string; lastName: string; birthDate: Date | null; sex: string | null; photoKey?: string | null; documentType?: string | null; documentNumber?: string | null };
type GroupLike = { id: string; name: string; grade?: { id: string; name: string; section?: { id: string; name: string; code: string } | null } | null } | null;

export function personName(p: { firstName: string; lastName: string }) {
  return `${p.firstName} ${p.lastName}`.trim();
}

export function studentSummary(s: { id: string; code: string; status: string; person: PersonLike; group?: GroupLike }, opts: { photosEnabled: boolean }) {
  return {
    id: s.id,
    personId: s.person.id,
    code: s.code,
    name: personName(s.person),
    firstName: s.person.firstName,
    lastName: s.person.lastName,
    sex: s.person.sex,
    birthDate: s.person.birthDate?.toISOString().slice(0, 10) ?? null,
    age: s.person.birthDate ? ageInYears(s.person.birthDate) : null,
    status: s.status,
    group: s.group ? { id: s.group.id, name: s.group.name } : null,
    grade: s.group?.grade ? { id: s.group.grade.id, name: s.group.grade.name } : null,
    section: s.group?.grade?.section ? { id: s.group.grade.section.id, name: s.group.grade.section.name, code: s.group.grade.section.code } : null,
    photoUrl: s.person.photoKey && opts.photosEnabled ? `/api/v1/students/${s.id}/photo` : null,
    hasPhoto: !!s.person.photoKey,
  };
}

export const studentInclude = {
  person: true,
  group: { include: { grade: { include: { section: true } } } },
} as const;
