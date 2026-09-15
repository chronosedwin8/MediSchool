import { Injectable } from '@nestjs/common';
import type { Tx } from '@sgee/db';
import { tenantSettingsSchema, type TenantSettings } from '@sgee/shared';

@Injectable()
export class TenantSettingsService {
  private cache = new Map<string, { at: number; value: TenantSettings; timezone: string }>();

  async get(tx: Tx, tenantId: string): Promise<TenantSettings> {
    return (await this.full(tx, tenantId)).value;
  }

  async timezone(tx: Tx, tenantId: string): Promise<string> {
    return (await this.full(tx, tenantId)).timezone;
  }

  private async full(tx: Tx, tenantId: string) {
    const hit = this.cache.get(tenantId);
    if (hit && Date.now() - hit.at < 30_000) return hit;
    const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { settings: true, timezone: true } });
    const value = tenantSettingsSchema.parse(t?.settings ?? {});
    const entry = { at: Date.now(), value, timezone: t?.timezone ?? value.timezone };
    this.cache.set(tenantId, entry);
    return entry;
  }

  invalidate(tenantId: string) {
    this.cache.delete(tenantId);
  }
}
