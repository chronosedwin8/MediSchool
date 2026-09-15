import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Tx } from '@sgee/db';
import {
  addDays,
  type batchReceiveSchema,
  dateInTz,
  type fridgeLogSchema,
  type itemSchema,
  type kitCheckSchema,
  type kitSchema,
  type locationSchema,
  type purchaseOrderSchema,
  type stockMovementSchema,
  type supplierSchema,
} from '@sgee/shared';
import type { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import { type AuthUser, type RequestMeta } from '../../common/auth';
import { verifySecret } from '../../common/crypto';
import { conflict, forbidden, notFound, unprocessable } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { TenantSettingsService } from '../../common/tenant-settings.service';
import { NotifyService } from '../comms/notify.service';
import { JobsService } from '../jobs/jobs.service';

const OUT_TYPES = ['CONSUMPTION', 'EXPIRED', 'RETURN', 'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'DAMAGED'];

@Injectable()
export class InventoryService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notify: NotifyService,
    private readonly jobs: JobsService,
    private readonly settings: TenantSettingsService,
  ) {}

  onModuleInit() {
    this.jobs.register('inventory.alerts', (job) => this.alerts(job.tenantId!));
    this.jobs.every('inventory.alerts', 60);
  }

  private async todayDate(tx: Tx, tenantId: string) {
    return new Date(`${dateInTz(new Date(), await this.settings.timezone(tx, tenantId))}T00:00:00Z`);
  }

  async items(user: AuthUser, q?: string, kind?: string) {
    return this.prisma.forUser(user, async (tx) => {
      const today = await this.todayDate(tx, user.tenantId);
      const soon = new Date(today.getTime() + 30 * 86400000);
      const items = await tx.item.findMany({
        where: { active: true, ...(kind ? { kind } : {}), ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { genericName: { contains: q, mode: 'insensitive' } }] } : {}) },
        include: { batches: { where: { status: 'ACTIVE', quantity: { gt: 0 } }, include: { location: true }, orderBy: { expiryDate: 'asc' } } },
        orderBy: { name: 'asc' },
      });
      return items.map((i) => {
        const usable = i.batches.filter((b) => !b.expiryDate || b.expiryDate >= today);
        const stock = usable.reduce((a, b) => a + b.quantity, 0);
        return {
          ...i,
          batches: i.batches.map((b) => ({ ...b, expired: !!b.expiryDate && b.expiryDate < today, expiringSoon: !!b.expiryDate && b.expiryDate >= today && b.expiryDate <= soon })),
          stock,
          expiredQuantity: i.batches.filter((b) => b.expiryDate && b.expiryDate < today).reduce((a, b) => a + b.quantity, 0),
          nextExpiry: usable[0]?.expiryDate ?? null,
          lowStock: stock < i.minStock,
          expiringSoon: usable.some((b) => b.expiryDate && b.expiryDate <= soon),
        };
      });
    });
  }

  async createItem(user: AuthUser, b: z.infer<typeof itemSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const item = await tx.item.create({ data: { tenantId: user.tenantId, ...b } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'inventory.item_created', entity: 'item', entityId: item.id, after: item, meta });
      return item;
    });
  }

  async updateItem(user: AuthUser, id: string, b: Partial<z.infer<typeof itemSchema>>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const before = await tx.item.findUnique({ where: { id } });
      if (!before) throw notFound('Ítem');
      const item = await tx.item.update({ where: { id }, data: b });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'inventory.item_updated', entity: 'item', entityId: id, before, after: item, meta });
      return item;
    });
  }

  locations(user: AuthUser) {
    return this.prisma.forUser(user, (tx) => tx.location.findMany({ where: { active: true }, orderBy: { name: 'asc' } }));
  }

  async createLocation(user: AuthUser, b: z.infer<typeof locationSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const l = await tx.location.create({ data: { tenantId: user.tenantId, ...b } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'inventory.location_created', entity: 'location', entityId: l.id, meta });
      return l;
    });
  }

  suppliers(user: AuthUser) {
    return this.prisma.forUser(user, (tx) => tx.supplier.findMany({ where: { active: true }, orderBy: { name: 'asc' } }));
  }

  async createSupplier(user: AuthUser, b: z.infer<typeof supplierSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const s = await tx.supplier.create({ data: { tenantId: user.tenantId, ...b } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'inventory.supplier_created', entity: 'supplier', entityId: s.id, meta });
      return s;
    });
  }

  async receive(user: AuthUser, b: z.infer<typeof batchReceiveSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const item = await tx.item.findUnique({ where: { id: b.itemId } });
      if (!item) throw notFound('Ítem');
      const today = await this.todayDate(tx, user.tenantId);
      if (b.expiryDate && new Date(b.expiryDate) < today) throw unprocessable('EXPIRED_BATCH', 'No se puede ingresar un lote vencido.');
      if (item.kind === 'MEDICATION' && !b.expiryDate) throw unprocessable('EXPIRY_REQUIRED', 'Los medicamentos requieren fecha de vencimiento.');
      const existing = await tx.itemBatch.findUnique({ where: { itemId_lot_locationId: { itemId: b.itemId, lot: b.lot, locationId: b.locationId } } });
      const batch = existing
        ? await tx.itemBatch.update({ where: { id: existing.id }, data: { quantity: { increment: b.quantity }, status: 'ACTIVE' } })
        : await tx.itemBatch.create({ data: { tenantId: user.tenantId, itemId: b.itemId, locationId: b.locationId, lot: b.lot, expiryDate: b.expiryDate ? new Date(b.expiryDate) : null, quantity: b.quantity, unitCost: b.unitCost ?? null, supplierId: b.supplierId ?? null, source: b.source } });
      const mv = await tx.stockMovement.create({ data: { tenantId: user.tenantId, itemId: b.itemId, batchId: batch.id, locationId: b.locationId, type: 'RECEIPT', quantity: b.quantity, reason: b.notes ?? `Ingreso (${b.source})`, purchaseOrderId: b.purchaseOrderId ?? null, performedByUserId: user.id } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'inventory.batch_received', entity: 'item_batch', entityId: batch.id, after: { itemId: b.itemId, lot: b.lot, quantity: b.quantity, movementId: mv.id }, meta });
      return batch;
    });
  }

  /**
   * FEFO consumption (first expired, first out). Expired batches are never
   * used. Throws when stock is insufficient — clinical close is rolled back.
   */
  async consume(tx: Tx, tenantId: string, userId: string, input: { itemId: string; quantity: number; reason: string; encounterId?: string | null; administrationId?: string | null; locationId?: string | null; type?: string }) {
    const today = await this.todayDate(tx, tenantId);
    const batches = await tx.itemBatch.findMany({
      where: { itemId: input.itemId, status: 'ACTIVE', quantity: { gt: 0 }, OR: [{ expiryDate: null }, { expiryDate: { gte: today } }], ...(input.locationId ? { locationId: input.locationId } : {}) },
      orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { receivedAt: 'asc' }],
    });
    const available = batches.reduce((a, b) => a + b.quantity, 0);
    if (available + 1e-9 < input.quantity) {
      const item = await tx.item.findUnique({ where: { id: input.itemId } });
      throw conflict('INSUFFICIENT_STOCK', `Stock insuficiente de ${item?.name ?? 'ítem'} (disponible ${available}).`);
    }
    let remaining = input.quantity;
    const movements = [];
    for (const b of batches) {
      if (remaining <= 1e-9) break;
      const take = Math.min(b.quantity, remaining);
      await tx.itemBatch.update({ where: { id: b.id }, data: { quantity: { decrement: take }, status: b.quantity - take <= 1e-9 ? 'DEPLETED' : 'ACTIVE' } });
      movements.push(
        await tx.stockMovement.create({
          data: { tenantId, itemId: input.itemId, batchId: b.id, locationId: b.locationId, type: input.type ?? 'CONSUMPTION', quantity: -take, reason: input.reason, encounterId: input.encounterId ?? null, administrationId: input.administrationId ?? null, performedByUserId: userId },
        }),
      );
      remaining -= take;
    }
    return movements;
  }

  async movement(user: AuthUser, b: z.infer<typeof stockMovementSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const item = await tx.item.findUnique({ where: { id: b.itemId } });
      if (!item) throw notFound('Ítem');
      const needsDouble = b.type.startsWith('ADJUSTMENT') || item.controlled || b.type === 'DAMAGED';
      let secondSignerUserId: string | null = null;
      if (needsDouble) {
        if (!b.secondSignerEmail || !b.secondSignerPassword) throw unprocessable('SECOND_SIGNATURE_REQUIRED', 'Este movimiento requiere doble firma (segundo responsable).');
        const signer = await tx.user.findFirst({ where: { email: b.secondSignerEmail, active: true }, include: { roles: true } });
        if (!signer || signer.id === user.id || !(await verifySecret(b.secondSignerPassword, signer.passwordHash))) throw forbidden('La segunda firma no es válida.');
        if (!signer.roles.some((r) => ['NURSE', 'DOCTOR', 'HEALTH_COORDINATOR'].includes(r.role))) throw forbidden('El segundo responsable debe ser personal de salud.');
        secondSignerUserId = signer.id;
      }
      let result: unknown;
      if (b.type === 'CONSUMPTION' && !b.batchId) {
        result = await this.consume(tx, user.tenantId, user.id, { itemId: b.itemId, quantity: b.quantity, reason: b.reason, encounterId: b.encounterId, locationId: b.locationId });
      } else {
        if (!b.batchId) throw unprocessable('BATCH_REQUIRED', 'Seleccione el lote.');
        const batch = await tx.itemBatch.findUnique({ where: { id: b.batchId } });
        if (!batch || batch.itemId !== b.itemId) throw notFound('Lote');
        const out = OUT_TYPES.includes(b.type);
        if (out && batch.quantity + 1e-9 < b.quantity) throw conflict('INSUFFICIENT_STOCK', `El lote solo tiene ${batch.quantity}.`);
        const newQty = out ? batch.quantity - b.quantity : batch.quantity + b.quantity;
        await tx.itemBatch.update({ where: { id: batch.id }, data: { quantity: newQty, status: b.type === 'EXPIRED' ? 'EXPIRED' : newQty <= 1e-9 ? 'DEPLETED' : 'ACTIVE' } });
        result = await tx.stockMovement.create({
          data: { tenantId: user.tenantId, itemId: b.itemId, batchId: batch.id, locationId: b.locationId, type: b.type, quantity: out ? -b.quantity : b.quantity, reason: b.reason, encounterId: b.encounterId ?? null, performedByUserId: user.id, secondSignerUserId },
        });
      }
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'inventory.movement', entity: 'item', entityId: b.itemId, after: { type: b.type, quantity: b.quantity, batchId: b.batchId, doubleSigned: !!secondSignerUserId }, meta });
      return result;
    });
  }

  movements(user: AuthUser, itemId?: string, limit = 200) {
    return this.prisma.forUser(user, (tx) =>
      tx.stockMovement.findMany({ where: itemId ? { itemId } : {}, include: { item: { select: { name: true, unit: true } }, batch: { select: { lot: true, expiryDate: true } } }, orderBy: { createdAt: 'desc' }, take: Math.min(limit, 1000) }),
    );
  }

  async kits(user: AuthUser) {
    return this.prisma.forUser(user, async (tx) => {
      const kits = await tx.kit.findMany({ where: { active: true }, include: { checks: { orderBy: { createdAt: 'desc' }, take: 5 } }, orderBy: { name: 'asc' } });
      const itemIds = kits.flatMap((k) => (k.items as { itemId: string }[]).map((i) => i.itemId));
      const items = await tx.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true, unit: true } });
      return kits.map((k) => {
        const due = !k.lastCheckedAt || k.lastCheckedAt.getTime() + k.checkEveryDays * 86400000 < Date.now();
        return { ...k, due, items: (k.items as { itemId: string; expectedQuantity: number }[]).map((i) => ({ ...i, item: items.find((it) => it.id === i.itemId) })) };
      });
    });
  }

  async createKit(user: AuthUser, b: z.infer<typeof kitSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const k = await tx.kit.create({ data: { tenantId: user.tenantId, ...b, items: b.items } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'inventory.kit_created', entity: 'kit', entityId: k.id, meta });
      return k;
    });
  }

  async checkKit(user: AuthUser, kitId: string, b: z.infer<typeof kitCheckSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const kit = await tx.kit.findUnique({ where: { id: kitId } });
      if (!kit) throw notFound('Botiquín');
      const expected = kit.items as { itemId: string; expectedQuantity: number }[];
      const lines = expected.map((e) => {
        const l = b.lines.find((x) => x.itemId === e.itemId);
        return { itemId: e.itemId, expected: e.expectedQuantity, present: l?.present ?? 0, expiryOk: l?.expiryOk ?? false, ok: !!l && l.present >= e.expectedQuantity && l.expiryOk };
      });
      const ok = lines.every((l) => l.ok);
      const check = await tx.kitCheck.create({ data: { tenantId: user.tenantId, kitId, checkedByUserId: user.id, lines, ok, notes: b.notes ?? null } });
      await tx.kit.update({ where: { id: kitId }, data: { lastCheckedAt: new Date() } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'inventory.kit_checked', entity: 'kit', entityId: kitId, after: { ok, missing: lines.filter((l) => !l.ok).length }, meta });
      return { ...check, lines };
    });
  }

  async fridgeLogs(user: AuthUser, locationId?: string, days = 14) {
    return this.prisma.forUser(user, (tx) =>
      tx.fridgeTemperatureLog.findMany({ where: { ...(locationId ? { locationId } : {}), recordedAt: { gte: new Date(Date.now() - days * 86400000) } }, orderBy: { recordedAt: 'asc' } }),
    );
  }

  async logFridge(user: AuthUser, b: z.infer<typeof fridgeLogSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const loc = await tx.location.findUnique({ where: { id: b.locationId } });
      if (!loc) throw notFound('Ubicación');
      const out = (loc.minTempC !== null && b.temperatureC < loc.minTempC) || (loc.maxTempC !== null && b.temperatureC > loc.maxTempC);
      const log = await tx.fridgeTemperatureLog.create({ data: { tenantId: user.tenantId, locationId: loc.id, temperatureC: b.temperatureC, recordedAt: b.recordedAt ? new Date(b.recordedAt) : new Date(), recordedByUserId: user.id, outOfRange: out, notes: b.notes ?? null } });
      if (out) {
        await this.notify.notify(tx, { tenantId: user.tenantId, event: 'FRIDGE_OUT_OF_RANGE', roles: ['NURSE', 'HEALTH_COORDINATOR'], data: { location: loc.name, temperature: b.temperatureC }, link: '/enfermeria/inventario', channels: ['IN_APP', 'EMAIL'], entity: 'fridge_log', entityId: log.id });
      }
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'inventory.fridge_logged', entity: 'fridge_log', entityId: log.id, after: { temperatureC: b.temperatureC, outOfRange: out }, meta });
      return log;
    });
  }

  purchaseOrders(user: AuthUser) {
    return this.prisma.forUser(user, (tx) => tx.purchaseOrder.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }));
  }

  async createPurchaseOrder(user: AuthUser, b: z.infer<typeof purchaseOrderSchema>, meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const last = await tx.purchaseOrder.findFirst({ orderBy: { number: 'desc' }, select: { number: true } });
      const total = b.lines.reduce((a, l) => a + l.quantity * l.unitCost, 0);
      const po = await tx.purchaseOrder.create({ data: { tenantId: user.tenantId, supplierId: b.supplierId, number: (last?.number ?? 0) + 1, expectedOn: b.expectedOn ? new Date(b.expectedOn) : null, lines: b.lines, total, notes: b.notes ?? null, createdBy: user.id } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'inventory.purchase_order_created', entity: 'purchase_order', entityId: po.id, after: { number: po.number, total }, meta });
      return po;
    });
  }

  async setPurchaseOrderStatus(user: AuthUser, id: string, status: 'SENT' | 'RECEIVED' | 'CANCELLED', meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const po = await tx.purchaseOrder.update({ where: { id }, data: { status } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'inventory.purchase_order_status', entity: 'purchase_order', entityId: id, after: { status }, meta });
      return po;
    });
  }

  async summary(user: AuthUser) {
    const items = await this.items(user);
    return this.prisma.forUser(user, async (tx) => {
      const since = new Date(Date.now() - 30 * 86400000);
      const consumption = await tx.stockMovement.groupBy({ by: ['itemId'], where: { createdAt: { gte: since }, quantity: { lt: 0 }, type: { in: ['CONSUMPTION', 'ADMINISTRATION'] } }, _sum: { quantity: true } });
      return {
        items: items.length,
        lowStock: items.filter((i) => i.lowStock).map((i) => ({ id: i.id, name: i.name, stock: i.stock, minStock: i.minStock, unit: i.unit })),
        expiringSoon: items.filter((i) => i.expiringSoon).map((i) => ({ id: i.id, name: i.name, nextExpiry: i.nextExpiry })),
        expired: items.filter((i) => i.expiredQuantity > 0).map((i) => ({ id: i.id, name: i.name, quantity: i.expiredQuantity })),
        stockValue: Math.round(items.reduce((a, i) => a + i.stock * (i.unitCost ?? 0), 0)),
        topConsumption: consumption
          .map((c) => ({ itemId: c.itemId, name: items.find((i) => i.id === c.itemId)?.name ?? '', quantity: -(c._sum.quantity ?? 0) }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 10),
      };
    });
  }

  /** Hourly: block expired batches, alert low stock (once a day). */
  async alerts(tenantId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const today = await this.todayDate(tx, tenantId);
      const expired = await tx.itemBatch.findMany({ where: { status: 'ACTIVE', expiryDate: { lt: today } } });
      for (const b of expired) {
        await tx.itemBatch.update({ where: { id: b.id }, data: { status: 'EXPIRED' } });
        if (b.quantity > 0) {
          await tx.stockMovement.create({ data: { tenantId, itemId: b.itemId, batchId: b.id, locationId: b.locationId, type: 'EXPIRED', quantity: 0, reason: `Lote ${b.lot} bloqueado por vencimiento (${b.quantity} unidades para disposición final)`, performedByUserId: '00000000-0000-0000-0000-000000000000' } });
        }
      }
      const items = await tx.item.findMany({ where: { active: true }, include: { batches: { where: { status: 'ACTIVE', quantity: { gt: 0 } } } } });
      const day = dateInTz(new Date(), await this.settings.timezone(tx, tenantId));
      let low = 0;
      for (const i of items) {
        const stock = i.batches.reduce((a, b) => a + b.quantity, 0);
        if (stock < i.minStock) {
          low++;
          await this.notify.notify(tx, { tenantId, event: 'LOW_STOCK', roles: ['NURSE', 'HEALTH_COORDINATOR'], data: { item: i.name, quantity: stock, unit: i.unit }, link: '/enfermeria/inventario', channels: ['IN_APP'], entity: 'item', entityId: i.id, dedupeKey: `lowstock:${i.id}:${day}` });
        }
      }
      return { expiredBlocked: expired.length, lowStock: low, nextCheck: addDays(day, 0) };
    });
  }
}
