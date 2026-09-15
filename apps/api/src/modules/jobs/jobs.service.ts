import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { Job } from '@sgee/db';
import { hostname } from 'node:os';
import { config } from '../../config';
import { PrismaService } from '../../common/prisma.service';

export type JobHandler = (job: Job) => Promise<unknown>;

interface Recurring {
  name: string;
  everyMinutes: number;
  /** Local time HH:mm (tenant timezone ignored; server TZ) for daily jobs. */
  at?: string;
  perTenant: boolean;
}

/**
 * PostgreSQL-backed job queue (ADR-0003): `FOR UPDATE SKIP LOCKED` workers,
 * exponential retries, dedupe keys for idempotent scheduling.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Jobs');
  private readonly handlers = new Map<string, JobHandler>();
  private readonly recurring: Recurring[] = [];
  private readonly workerId = `${hostname()}:${process.pid}`;
  private timers: NodeJS.Timeout[] = [];
  private running = 0;
  private stopped = false;

  constructor(private readonly prisma: PrismaService) {}

  register(name: string, handler: JobHandler) {
    this.handlers.set(name, handler);
  }

  every(name: string, everyMinutes: number, perTenant = true) {
    this.recurring.push({ name, everyMinutes, perTenant });
  }

  dailyAt(name: string, at: string, perTenant = true) {
    this.recurring.push({ name, everyMinutes: 1440, at, perTenant });
  }

  async enqueue(name: string, payload: Record<string, unknown> = {}, opts: { tenantId?: string | null; runAt?: Date; dedupeKey?: string; maxAttempts?: number } = {}) {
    const rows = await this.prisma.client.$queryRaw<{ id: string }[]>`
      INSERT INTO integration.jobs (tenant_id, name, payload, run_at, dedupe_key, max_attempts)
      VALUES (${opts.tenantId ?? null}::uuid, ${name}, ${JSON.stringify(payload)}::jsonb, ${opts.runAt ?? new Date()}, ${opts.dedupeKey ?? null}, ${opts.maxAttempts ?? 5})
      ON CONFLICT (dedupe_key) DO NOTHING
      RETURNING id`;
    return rows[0]?.id ?? null;
  }

  /** Runs a handler synchronously (tests, CLI, "run now" buttons). */
  async runNow(name: string, payload: Record<string, unknown>, tenantId: string | null) {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`No handler for job ${name}`);
    const fake = { id: 'inline', tenantId, name, payload, attempts: 1 } as unknown as Job;
    return handler(fake);
  }

  onApplicationBootstrap() {
    if (!config().JOBS_ENABLED) return;
    this.timers.push(setInterval(() => void this.poll(), 2000));
    this.timers.push(setInterval(() => void this.schedule(), 60_000));
    setTimeout(() => void this.schedule(), 3000);
    this.logger.log(`worker ${this.workerId} started (${this.handlers.size} handlers)`);
  }

  onModuleDestroy() {
    this.stopped = true;
    this.timers.forEach(clearInterval);
  }

  private async schedule() {
    try {
      const tenants = await this.prisma.system((tx) => tx.tenant.findMany({ where: { active: true }, select: { id: true } }));
      const now = new Date();
      const minuteOfDay = now.getHours() * 60 + now.getMinutes();
      for (const r of this.recurring) {
        let bucket: string;
        if (r.at) {
          const [h, m] = r.at.split(':').map(Number);
          if (minuteOfDay < h * 60 + m) continue;
          bucket = now.toISOString().slice(0, 10);
        } else {
          bucket = String(Math.floor(now.getTime() / (r.everyMinutes * 60_000)));
        }
        const targets = r.perTenant ? tenants.map((t) => t.id) : [null];
        for (const tenantId of targets) {
          await this.enqueue(r.name, {}, { tenantId, dedupeKey: `${r.name}:${tenantId ?? 'system'}:${bucket}`, maxAttempts: 3 });
        }
      }
      await this.prisma.client.$executeRaw`
        UPDATE integration.jobs SET status = 'PENDING', locked_at = NULL, locked_by = NULL
        WHERE status = 'RUNNING' AND locked_at < now() - interval '15 minutes'`;
      await this.prisma.client.$executeRaw`
        DELETE FROM integration.jobs WHERE status IN ('DONE', 'FAILED') AND finished_at < now() - interval '14 days'`;
    } catch (e) {
      this.logger.error(`schedule failed: ${(e as Error).message}`);
    }
  }

  private async poll() {
    if (this.stopped || this.running >= 4) return;
    let jobs: Job[] = [];
    try {
      jobs = await this.prisma.client.$queryRaw<Job[]>`
        UPDATE integration.jobs SET status = 'RUNNING', locked_at = now(), locked_by = ${this.workerId}, attempts = attempts + 1
        WHERE id IN (
          SELECT id FROM integration.jobs WHERE status = 'PENDING' AND run_at <= now()
          ORDER BY run_at FOR UPDATE SKIP LOCKED LIMIT ${4 - this.running}
        )
        RETURNING id, tenant_id AS "tenantId", name, payload, attempts, max_attempts AS "maxAttempts"`;
    } catch (e) {
      this.logger.error(`poll failed: ${(e as Error).message}`);
      return;
    }
    for (const job of jobs) void this.execute(job);
  }

  private async execute(job: Job) {
    this.running++;
    const handler = this.handlers.get(job.name);
    try {
      if (!handler) throw new Error(`No handler registered for ${job.name}`);
      const result = await handler(job);
      await this.prisma.client.$executeRaw`
        UPDATE integration.jobs SET status = 'DONE', finished_at = now(), result = ${JSON.stringify(result ?? null)}::jsonb, last_error = NULL
        WHERE id = ${job.id}::uuid`;
    } catch (e) {
      const msg = (e as Error).message?.slice(0, 1000) ?? 'error';
      const final = job.attempts >= job.maxAttempts;
      const delaySec = Math.min(3600, 15 * 2 ** job.attempts);
      this.logger.warn(`job ${job.name} failed (attempt ${job.attempts}): ${msg}`);
      await this.prisma.client.$executeRaw`
        UPDATE integration.jobs
        SET status = ${final ? 'FAILED' : 'PENDING'}, last_error = ${msg},
            run_at = now() + make_interval(secs => ${delaySec}), finished_at = ${final ? new Date() : null}
        WHERE id = ${job.id}::uuid`;
    } finally {
      this.running--;
    }
  }
}
