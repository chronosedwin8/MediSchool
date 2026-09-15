import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { statsQuerySchema } from '@sgee/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { type AuthUser, CurrentUser, Meta, Perms, type RequestMeta } from '../../common/auth';
import { zp } from '../../common/zod.pipe';
import { StatsService } from './stats.service';

@ApiTags('stats')
@Controller('stats')
@Perms('stats:clinical', 'stats:anonymous')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() u: AuthUser, @Query(zp(statsQuerySchema)) q: z.infer<typeof statsQuerySchema>) {
    return this.stats.dashboard(u, q);
  }

  @Get('export/:dataset')
  async export(
    @CurrentUser() u: AuthUser,
    @Param('dataset') dataset: string,
    @Query(zp(statsQuerySchema.extend({ format: z.enum(['csv', 'xlsx', 'pdf']).default('csv') }))) q: z.infer<typeof statsQuerySchema> & { format: string },
    @Meta() m: RequestMeta,
    @Res() res: Response,
  ) {
    const out = await this.stats.export(u, dataset, q.format, q, m);
    res.setHeader('Content-Type', out.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    res.send(out.buffer);
  }

  @Get('scheduled-reports')
  @Perms('admin:settings', 'compliance:manage')
  scheduled(@CurrentUser() u: AuthUser) {
    return this.stats.scheduledReports(u);
  }

  @Post('scheduled-reports')
  @Perms('admin:settings', 'compliance:manage')
  createScheduled(
    @CurrentUser() u: AuthUser,
    @Body(zp(z.object({ name: z.string().min(3).max(120), frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']), recipients: z.array(z.string().email()).min(1).max(20), params: z.record(z.string(), z.unknown()).default({}) })))
    b: { name: string; frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'; recipients: string[]; params: Record<string, unknown> },
    @Meta() m: RequestMeta,
  ) {
    return this.stats.createScheduledReport(u, b, m);
  }
}
