import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { batchReceiveSchema, fridgeLogSchema, itemSchema, kitCheckSchema, kitSchema, locationSchema, purchaseOrderSchema, stockMovementSchema, supplierSchema } from '@sgee/shared';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Meta, Perms, type RequestMeta } from '../../common/auth';
import { zp } from '../../common/zod.pipe';
import { InventoryService } from './inventory.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('inventory')
@Controller('inventory')
@Perms('inventory:read')
export class InventoryController {
  constructor(private readonly inv: InventoryService) {}

  @Get('summary')
  summary(@CurrentUser() u: AuthUser) {
    return this.inv.summary(u);
  }

  @Get('items')
  items(@CurrentUser() u: AuthUser, @Query('q') q?: string, @Query('kind') kind?: string) {
    return this.inv.items(u, q, kind);
  }

  @Post('items')
  @Perms('inventory:write')
  createItem(@CurrentUser() u: AuthUser, @Body(zp(itemSchema)) b: z.infer<typeof itemSchema>, @Meta() m: RequestMeta) {
    return this.inv.createItem(u, b, m);
  }

  @Patch('items/:id')
  @Perms('inventory:write')
  updateItem(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(itemSchema.partial())) b: Partial<z.infer<typeof itemSchema>>, @Meta() m: RequestMeta) {
    return this.inv.updateItem(u, id, b, m);
  }

  @Get('locations')
  locations(@CurrentUser() u: AuthUser) {
    return this.inv.locations(u);
  }

  @Post('locations')
  @Perms('inventory:write')
  createLocation(@CurrentUser() u: AuthUser, @Body(zp(locationSchema)) b: z.infer<typeof locationSchema>, @Meta() m: RequestMeta) {
    return this.inv.createLocation(u, b, m);
  }

  @Get('suppliers')
  suppliers(@CurrentUser() u: AuthUser) {
    return this.inv.suppliers(u);
  }

  @Post('suppliers')
  @Perms('inventory:write')
  createSupplier(@CurrentUser() u: AuthUser, @Body(zp(supplierSchema)) b: z.infer<typeof supplierSchema>, @Meta() m: RequestMeta) {
    return this.inv.createSupplier(u, b, m);
  }

  @Post('batches')
  @Perms('inventory:write')
  receive(@CurrentUser() u: AuthUser, @Body(zp(batchReceiveSchema)) b: z.infer<typeof batchReceiveSchema>, @Meta() m: RequestMeta) {
    return this.inv.receive(u, b, m);
  }

  @Get('movements')
  movements(@CurrentUser() u: AuthUser, @Query('itemId') itemId?: string, @Query('limit') limit?: string) {
    return this.inv.movements(u, itemId, Number(limit) || 200);
  }

  @Post('movements')
  @Perms('inventory:write')
  movement(@CurrentUser() u: AuthUser, @Body(zp(stockMovementSchema)) b: z.infer<typeof stockMovementSchema>, @Meta() m: RequestMeta) {
    return this.inv.movement(u, b, m);
  }

  @Get('kits')
  kits(@CurrentUser() u: AuthUser) {
    return this.inv.kits(u);
  }

  @Post('kits')
  @Perms('inventory:write')
  createKit(@CurrentUser() u: AuthUser, @Body(zp(kitSchema)) b: z.infer<typeof kitSchema>, @Meta() m: RequestMeta) {
    return this.inv.createKit(u, b, m);
  }

  @Post('kits/:id/checks')
  @Perms('inventory:write')
  checkKit(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(kitCheckSchema)) b: z.infer<typeof kitCheckSchema>, @Meta() m: RequestMeta) {
    return this.inv.checkKit(u, id, b, m);
  }

  @Get('fridge-logs')
  fridge(@CurrentUser() u: AuthUser, @Query('locationId') locationId?: string, @Query('days') days?: string) {
    return this.inv.fridgeLogs(u, locationId, Number(days) || 14);
  }

  @Post('fridge-logs')
  @Perms('inventory:write')
  logFridge(@CurrentUser() u: AuthUser, @Body(zp(fridgeLogSchema)) b: z.infer<typeof fridgeLogSchema>, @Meta() m: RequestMeta) {
    return this.inv.logFridge(u, b, m);
  }

  @Get('purchase-orders')
  purchaseOrders(@CurrentUser() u: AuthUser) {
    return this.inv.purchaseOrders(u);
  }

  @Post('purchase-orders')
  @Perms('inventory:write')
  createPo(@CurrentUser() u: AuthUser, @Body(zp(purchaseOrderSchema)) b: z.infer<typeof purchaseOrderSchema>, @Meta() m: RequestMeta) {
    return this.inv.createPurchaseOrder(u, b, m);
  }

  @Post('purchase-orders/:id/status')
  @Perms('inventory:write')
  poStatus(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(zp(z.object({ status: z.enum(['SENT', 'RECEIVED', 'CANCELLED']) }))) b: { status: 'SENT' | 'RECEIVED' | 'CANCELLED' }, @Meta() m: RequestMeta) {
    return this.inv.setPurchaseOrderStatus(u, id, b.status, m);
  }
}
