import { Injectable } from '@nestjs/common';
import type { Tx } from '@sgee/db';
import type { AuthUser, RequestMeta } from './auth';

const SECRET_KEYS = /(password|secret|token|otp|pin|hash|signature|note_enc|noteEnc|mfa)/i;
const CLINICAL_TEXT = new Set([
  'subjective',
  'objective',
  'assessment',
  'plan',
  'parentSummary',
  'note',
  'notes',
  'details',
  'description',
  'reaction',
  'generalNotes',
  'body',
  'adverseEffects',
  'reason',
]);

/** Redacts secrets and clinical free text so audit rows stay non-sensitive. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (depth > 4) return '[depth]';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return '[binary]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.test(k)) out[k] = '[redacted]';
      else if (CLINICAL_TEXT.has(k) && typeof v === 'string') out[k] = v ? `[texto ${v.length} car.]` : '';
      else out[k] = redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 300) return `${value.slice(0, 300)}…`;
  return value;
}

export interface AuditEntry {
  tenantId: string | null;
  actor?: Pick<AuthUser, 'id' | 'roles'> | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: RequestMeta | null;
}

@Injectable()
export class AuditService {
  async log(tx: Tx, e: AuditEntry) {
    await tx.auditLog.create({
      data: {
        tenantId: e.tenantId,
        actorUserId: e.actor?.id ?? null,
        actorRole: e.actor?.roles?.join(',') ?? 'SYSTEM',
        action: e.action,
        entity: e.entity,
        entityId: e.entityId ?? null,
        before: (redact(e.before) as object) ?? undefined,
        after: (redact(e.after) as object) ?? undefined,
        ip: e.meta?.ip ?? null,
        userAgent: e.meta?.userAgent?.slice(0, 300) ?? null,
        requestId: e.meta?.requestId ?? null,
      },
    });
  }
}
