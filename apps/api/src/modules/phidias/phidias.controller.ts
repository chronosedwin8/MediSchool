import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Meta, Perms, type RequestMeta } from '../../common/auth';
import { AuditService } from '../../common/audit.service';
import { notFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';
import { zp } from '../../common/zod.pipe';
import { JobsService } from '../jobs/jobs.service';
import { DEFAULT_FIELD_OWNERSHIP, PhidiasSyncService } from './phidias-sync.service';

const syncSchema = z.object({ kind: z.enum(['FULL', 'INCREMENTAL', 'PHOTOS', 'HISTORY']), wait: z.boolean().default(false) });
const ownershipSchema = z.object({ rows: z.array(z.object({ entity: z.string(), field: z.string(), owner: z.enum(['PHIDIAS', 'LOCAL', 'MERGE']) })).min(1) });

@ApiTags('integrations')
@Controller('integrations/phidias')
@Perms('admin:integrations')
export class PhidiasController {
  constructor(
    private readonly sync: PhidiasSyncService,
    private readonly jobs: JobsService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.sync.status(user.tenantId);
  }

  @Post('sync')
  async run(@CurrentUser() user: AuthUser, @Body(zp(syncSchema)) body: z.infer<typeof syncSchema>) {
    const t = user.tenantId;
    if (body.wait) {
      if (body.kind === 'PHOTOS') return this.sync.syncPhotos(t, user.id);
      if (body.kind === 'HISTORY') return this.sync.importHistory(t, user.id);
      return this.sync.syncStudents(t, body.kind, user.id);
    }
    const name = { FULL: 'phidias.sync.full', INCREMENTAL: 'phidias.sync.incremental', PHOTOS: 'phidias.photos', HISTORY: 'phidias.history' }[body.kind];
    const jobId = await this.jobs.enqueue(name, { triggeredBy: user.id }, { tenantId: t, dedupeKey: `${name}:${t}:manual:${Math.floor(Date.now() / 30_000)}` });
    return { queued: true, jobId };
  }

  @Post('sync-one/:studentId')
  async syncOne(@CurrentUser() user: AuthUser, @Param('studentId') studentId: string) {
    const link = await this.prisma.forUser(user, (tx) => tx.externalId.findFirst({ where: { source: 'phidias', entity: 'student', localId: studentId } }));
    if (!link) throw notFound('Vínculo con Phidias del estudiante');
    return this.sync.syncStudents(user.tenantId, 'ONE', user.id, link.externalId);
  }

  @Get('runs')
  runs(@CurrentUser() user: AuthUser, @Query('limit') limit = '50') {
    return this.prisma.forUser(user, (tx) => tx.syncRun.findMany({ orderBy: { startedAt: 'desc' }, take: Math.min(200, Number(limit) || 50) }));
  }

  @Get('conflicts')
  conflicts(@CurrentUser() user: AuthUser, @Query('status') status = 'OPEN') {
    return this.prisma.forUser(user, (tx) => tx.syncConflict.findMany({ where: { status }, orderBy: { createdAt: 'desc' }, take: 500 }));
  }

  @Post('conflicts/:id/resolve')
  resolve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(zp(z.object({ status: z.enum(['RESOLVED', 'IGNORED']) }))) body: { status: string }, @Meta() meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const r = await tx.syncConflict.update({ where: { id }, data: { status: body.status, resolvedBy: user.id, resolvedAt: new Date() } });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'phidias.conflict_resolved', entity: 'sync_conflict', entityId: id, after: { status: body.status }, meta });
      return r;
    });
  }

  @Get('field-ownership')
  async ownership(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.forUser(user, (tx) => tx.fieldOwnership.findMany());
    return DEFAULT_FIELD_OWNERSHIP.map((d) => rows.find((r) => r.entity === d.entity && r.field === d.field) ?? d);
  }

  @Put('field-ownership')
  setOwnership(@CurrentUser() user: AuthUser, @Body(zp(ownershipSchema)) body: z.infer<typeof ownershipSchema>, @Meta() meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      for (const r of body.rows) {
        await tx.fieldOwnership.upsert({
          where: { tenantId_entity_field: { tenantId: user.tenantId, entity: r.entity, field: r.field } },
          create: { tenantId: user.tenantId, ...r },
          update: { owner: r.owner },
        });
      }
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'phidias.field_ownership_updated', entity: 'field_ownership', after: body.rows, meta });
      return { updated: body.rows.length };
    });
  }

  @Put('settings')
  settings(@CurrentUser() user: AuthUser, @Body(zp(z.object({ enabled: z.boolean() }))) body: { enabled: boolean }, @Meta() meta: RequestMeta) {
    return this.prisma.forUser(user, async (tx) => {
      const r = await tx.integrationSetting.upsert({
        where: { tenantId_provider: { tenantId: user.tenantId, provider: 'PHIDIAS' } },
        create: { tenantId: user.tenantId, provider: 'PHIDIAS', enabled: body.enabled },
        update: { enabled: body.enabled },
      });
      await this.audit.log(tx, { tenantId: user.tenantId, actor: user, action: 'phidias.settings_updated', entity: 'integration_setting', entityId: r.id, after: body, meta });
      return r;
    });
  }
}
