import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth';
import { PrismaService } from '../../common/prisma.service';

const startedAt = Date.now();

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  async health() {
    let db = 'up';
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    return { status: db === 'up' ? 'ok' : 'degraded', db, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000), version: process.env.npm_package_version ?? '1.0.0' };
  }

  /** Prometheus text format with business metrics (PLAN §11). */
  @Public()
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4')
  async metrics() {
    const rows = await this.prisma.system(async (tx) => {
      const [openPasses, pendingDoses, queued, failedJobs] = await Promise.all([
        tx.pass.groupBy({ by: ['tenantId'], where: { state: { notIn: ['CLOSED', 'CANCELLED', 'EXPIRED'] } }, _count: true }),
        tx.medicationSchedule.groupBy({ by: ['tenantId'], where: { status: 'PENDING', scheduledFor: { lte: new Date() } }, _count: true }),
        tx.notification.count({ where: { status: 'QUEUED' } }),
        tx.job.count({ where: { status: 'FAILED' } }),
      ]);
      return { openPasses, pendingDoses, queued, failedJobs };
    });
    const mem = process.memoryUsage();
    const lines = [
      '# HELP sgee_open_passes Open nursing passes',
      '# TYPE sgee_open_passes gauge',
      ...rows.openPasses.map((r) => `sgee_open_passes{tenant="${r.tenantId}"} ${r._count}`),
      '# HELP sgee_overdue_doses Scheduled doses pending past due time',
      '# TYPE sgee_overdue_doses gauge',
      ...rows.pendingDoses.map((r) => `sgee_overdue_doses{tenant="${r.tenantId}"} ${r._count}`),
      '# TYPE sgee_notifications_queued gauge',
      `sgee_notifications_queued ${rows.queued}`,
      '# TYPE sgee_jobs_failed gauge',
      `sgee_jobs_failed ${rows.failedJobs}`,
      '# TYPE process_resident_memory_bytes gauge',
      `process_resident_memory_bytes ${mem.rss}`,
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${Math.round((Date.now() - startedAt) / 1000)}`,
    ];
    return lines.join('\n') + '\n';
  }
}
