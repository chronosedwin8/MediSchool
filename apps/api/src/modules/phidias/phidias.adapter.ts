import { dateInTz, plainText, titleCase, zonedToUtc } from '@sgee/shared';
import { canonicalJson, sha256 } from '../../common/crypto';

/** Raw shapes (subset) returned by Phidias. */
export interface RawStudent {
  id: number;
  code?: number | string | null;
  document?: number | string | null;
  idtype?: number | null;
  gender?: number | null;
  firstname?: string | null;
  lastname?: string | null;
  lastname1?: string | null;
  lastname2?: string | null;
  birthday?: number | null;
  email?: string | null;
  phone?: number | string | null;
  mobile?: number | string | null;
  address?: string | null;
  nationality?: string | null;
  blood?: string | null;
  _changed?: string | null;
  enrollment?: { status?: string | null } | null;
}
export interface RawSection { id: number; name: string; students?: RawStudent[] }
export interface RawCourse { id: number; name: string; sections?: RawSection[] }
export interface RawGrade { id: number; name: string; courses?: RawCourse[] }

export interface CanonicalSection { externalId: string; code: string; name: string; sortOrder: number }
export interface CanonicalGrade { externalId: string; sectionExternalId: string; code: string; name: string; sortOrder: number }
export interface CanonicalGroup { externalId: string; gradeExternalId: string; code: string; name: string }
export interface CanonicalStudent {
  externalId: string;
  code: string | null;
  documentType: string;
  documentNumber: string | null;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  sex: 'M' | 'F' | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  address: string | null;
  nationality: string | null;
  enrollmentStatus: string | null;
  active: boolean;
  groupExternalId: string;
  sourceUpdatedAt: string | null;
}

const SECTION_MAP: Record<string, { code: string; name: string; sortOrder: number }> = {
  KINDERGARTEN: { code: 'PRE', name: 'Preescolar', sortOrder: 1 },
  PREESCOLAR: { code: 'PRE', name: 'Preescolar', sortOrder: 1 },
  PRIMARIA: { code: 'PRI', name: 'Primaria', sortOrder: 2 },
  SECUNDARIA: { code: 'BAC', name: 'Bachillerato', sortOrder: 3 },
  BACHILLERATO: { code: 'BAC', name: 'Bachillerato', sortOrder: 3 },
};

/**
 * Phidias `idtype` codes. Inferred from the age distribution of the real
 * data (4 → children under 7, 1 → 7–17). Verify against the Phidias admin.
 */
export const ID_TYPES: Record<number, string> = { 1: 'TI', 2: 'CC', 3: 'CE', 4: 'RC', 6: 'PA', 7: 'PPT' };
const INACTIVE_ENROLLMENT = ['retirado', 'cancelado', 'no continua', 'graduado'];

const clean = (v: unknown): string | null => {
  const s = v === null || v === undefined ? '' : String(v).trim();
  return s && s !== '0' ? s : null;
};

function gradeSortOrder(name: string): number {
  const n = name.toUpperCase();
  if (n.includes('KRIPPE')) return 1;
  if (n.includes('PREKINDER')) return 2;
  if (n === 'KINDER' || n.includes('KINDER')) return 3;
  const m = n.match(/(\d+)/);
  return m ? 10 + Number(m[1]) : 50;
}

export function parseConsolidate(raw: unknown, timeZone = 'America/Bogota') {
  const sections: CanonicalSection[] = [];
  const grades: CanonicalGrade[] = [];
  const groups: CanonicalGroup[] = [];
  const students: CanonicalStudent[] = [];

  for (const g of (Array.isArray(raw) ? raw : []) as RawGrade[]) {
    const mapped = SECTION_MAP[g.name.trim().toUpperCase()] ?? { code: g.name.trim().toUpperCase().slice(0, 10), name: titleCase(g.name), sortOrder: 9 };
    sections.push({ externalId: String(g.id), ...mapped });
    for (const c of g.courses ?? []) {
      grades.push({
        externalId: String(c.id),
        sectionExternalId: String(g.id),
        code: c.name.trim().toUpperCase().replace(/\s+/g, '-'),
        name: titleCase(c.name.trim()),
        sortOrder: gradeSortOrder(c.name),
      });
      for (const s of c.sections ?? []) {
        groups.push({ externalId: String(s.id), gradeExternalId: String(c.id), code: s.name.trim().toUpperCase(), name: s.name.trim().toUpperCase() });
        for (const st of s.students ?? []) students.push(toCanonicalStudent(st, String(s.id), timeZone));
      }
    }
  }
  return { sections, grades, groups, students };
}

export function toCanonicalStudent(s: RawStudent, groupExternalId: string, timeZone = 'America/Bogota'): CanonicalStudent {
  const status = clean(s.enrollment?.status)?.toLowerCase() ?? null;
  const lastName = clean(s.lastname) ?? [clean(s.lastname1), clean(s.lastname2)].filter(Boolean).join(' ');
  const changed = clean(s._changed);
  return {
    externalId: String(s.id),
    code: clean(s.code),
    documentType: s.idtype ? (ID_TYPES[s.idtype] ?? 'OTRO') : 'OTRO',
    documentNumber: clean(s.document),
    firstName: titleCase(clean(s.firstname) ?? ''),
    lastName: titleCase(lastName ?? ''),
    birthDate: s.birthday ? dateInTz(new Date(s.birthday * 1000), timeZone) : null,
    sex: s.gender === 1 ? 'M' : s.gender === 0 ? 'F' : null,
    email: clean(s.email)?.toLowerCase() ?? null,
    phone: clean(s.phone),
    mobile: clean(s.mobile),
    address: clean(s.address),
    nationality: clean(s.nationality),
    enrollmentStatus: status,
    active: !status || !INACTIVE_ENROLLMENT.includes(status),
    groupExternalId,
    sourceUpdatedAt: changed && !changed.startsWith('0000') ? changed : null,
  };
}

/** Content hash over the fields Phidias owns — used to skip unchanged rows. */
export function studentHash(s: CanonicalStudent): string {
  const { sourceUpdatedAt: _ignored, ...rest } = s;
  return sha256(canonicalJson(rest));
}

export function structureHash(v: object): string {
  return sha256(canonicalJson(v));
}

// ── nursing polls (historical import) ──────────────────────────────────────

export interface HistoricEncounter {
  externalId: string;
  pollId: number;
  personExternalId: string;
  personName: string;
  personDocument: string | null;
  subjectType: 'STUDENT' | 'STAFF';
  startedAt: Date;
  type: string;
  chiefComplaint: string;
  description: string;
  symptoms: string | null;
  diagnosisText: string | null;
  medication: string | null;
  referredBy: string | null;
  referredFrom: string | null;
  attendedBy: string | null;
  schoolSection: string | null;
  accident: { severity: 'MILD' | 'MODERATE' | 'SEVERE'; zone: string; classification: string | null } | null;
}

const TYPE_MAP: Record<string, string> = {
  'enfermedad general': 'ILLNESS',
  incidente: 'ACCIDENT',
  accidente: 'ACCIDENT',
  'llamada de seguimiento': 'FOLLOW_UP',
  'accidente laboral': 'STAFF_FIRST_AID',
};

function parseLocal(value: unknown, timeZone: string): Date | null {
  const s = clean(value);
  if (!s || s === 'false') return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return m ? zonedToUtc(m[1], m[2], timeZone) : null;
}

function normalizeMedication(v: unknown): string | null {
  const s = clean(v);
  if (!s) return null;
  const k = s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  return ['NO', 'N/A', 'NA', 'NINGUNO', 'NINGUNA', '--', '-'].includes(k) ? null : s;
}

export function parseNursingPoll(records: unknown, pollId: number, subjectType: 'STUDENT' | 'STAFF', timeZone = 'America/Bogota'): HistoricEncounter[] {
  const out: HistoricEncounter[] = [];
  for (const r of (Array.isArray(records) ? records : records ? [records] : []) as Record<string, unknown>[]) {
    if (!r.person_id || !r.timestamp) continue;
    const startedAt = parseLocal(r['Hora y fecha de ingreso'], timeZone) ?? parseLocal(r['Fecha y hora de la atención'], timeZone) ?? parseLocal(r.timestamp, timeZone);
    if (!startedAt) continue;
    const accidentType = clean(r['Tipo de Accidente']);
    const typeRaw = (clean(r['Tipo de Atención']) ?? clean(r['Motivo de Atención']) ?? '').toLowerCase();
    const motive = subjectType === 'STAFF' ? (clean(r['Diagnóstico']) ?? clean(r['Motivo de Atención'])) : clean(r['Motivo de Atención']);
    out.push({
      externalId: `${pollId}:${r.person_id}:${r.timestamp}`,
      pollId,
      personExternalId: String(r.person_id),
      personName: String(r.person ?? ''),
      personDocument: clean(r.person_document),
      subjectType,
      startedAt,
      type: subjectType === 'STAFF' ? (typeRaw.includes('accidente') ? 'STAFF_FIRST_AID' : 'ILLNESS') : (TYPE_MAP[typeRaw] ?? 'ILLNESS'),
      chiefComplaint: motive ?? 'Sin especificar',
      description: plainText(r['Descripción de la Atención']),
      symptoms: clean(plainText(r['Sintomas'])),
      diagnosisText: clean(r['Diagnóstico']),
      medication: normalizeMedication(r['Nombre del medicamento']),
      referredBy: clean(r['Profesor que remite']),
      referredFrom: clean(r['De donde se remite ']),
      attendedBy: clean(r['Quien Atiende']) ?? clean(r.author),
      schoolSection: clean(r['Sección']),
      accident:
        accidentType && accidentType !== 'No Aplica'
          ? {
              severity: /grave|severo/i.test(accidentType) ? 'SEVERE' : /moderado/i.test(accidentType) ? 'MODERATE' : 'MILD',
              zone: clean(r['Zona o Juego']) && r['Zona o Juego'] !== 'No Aplica' ? String(r['Zona o Juego']).trim() : 'Sin especificar',
              classification: clean(r['Accidente/Incidente']),
            }
          : null,
    });
  }
  return out;
}

/** "SAMANTHA LUZARDO MENDOZA" → first/last names (Colombian convention). */
export function splitFullName(full: string): { firstName: string; lastName: string } {
  const t = full.trim().split(/\s+/).filter(Boolean);
  if (t.length <= 1) return { firstName: titleCase(t[0] ?? ''), lastName: '' };
  if (t.length === 2) return { firstName: titleCase(t[0]), lastName: titleCase(t[1]) };
  if (t.length === 3) return { firstName: titleCase(t[0]), lastName: titleCase(t.slice(1).join(' ')) };
  return { firstName: titleCase(t.slice(0, t.length - 2).join(' ')), lastName: titleCase(t.slice(-2).join(' ')) };
}
