import { ageInYears } from '@sgee/shared';

type PersonLike = { id: string; firstName: string; lastName: string; birthDate: Date | null; sex: string | null; photoKey?: string | null; photoHash?: string | null; documentType?: string | null; documentNumber?: string | null };
type GroupLike = { id: string; name: string; grade?: { id: string; name: string; section?: { id: string; name: string; code: string } | null } | null } | null;

/** Photos uploaded in MediSchool are stored as `local:<fileId>`; others are Phidias-linked S3 keys. */
export const LOCAL_PHOTO_PREFIX = 'local:';

/** Photo URL for any panel (all roles allowed to see the student). A version parameter busts caches after a change. */
export function studentPhotoUrl(studentId: string, person: { photoKey?: string | null; photoHash?: string | null }, photosEnabled: boolean): string | null {
  const key = person.photoKey;
  if (!key || (!key.startsWith(LOCAL_PHOTO_PREFIX) && !photosEnabled)) return null;
  const v = (person.photoHash ?? key).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  return `/api/v1/students/${studentId}/photo?v=${v}`;
}

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
    photoUrl: studentPhotoUrl(s.id, s.person, opts.photosEnabled),
    hasPhoto: !!s.person.photoKey,
  };
}

export const studentInclude = {
  person: true,
  group: { include: { grade: { include: { section: true } } } },
} as const;
