import { Prisma, PrismaClient } from '@prisma/client';

export * from '@prisma/client';

export type Tx = Prisma.TransactionClient;

export interface DbContext {
  tenantId?: string | null;
  userId?: string | null;
  /** Only for system jobs and SECURITY-reviewed paths (ADR-0002). */
  bypassRls?: boolean;
}

export function createPrisma(url = process.env.DATABASE_URL): PrismaClient {
  return new PrismaClient({
    datasourceUrl: url,
    log: process.env.PRISMA_LOG === 'query' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}

/**
 * Runs `fn` inside a transaction where PostgreSQL RLS sees the tenant and the
 * actor (`app.tenant_id`, `app.user_id`). Every data access of the API goes
 * through here, so a missing `where tenantId` can never leak another tenant.
 */
export async function withTenant<T>(
  prisma: PrismaClient,
  ctx: DbContext,
  fn: (tx: Tx) => Promise<T>,
  options: { timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel } = {},
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId ?? ''}, true),
                                set_config('app.user_id', ${ctx.userId ?? ''}, true),
                                set_config('app.bypass_rls', ${ctx.bypassRls ? 'on' : 'off'}, true)`;
      return fn(tx);
    },
    { maxWait: 15_000, timeout: options.timeout ?? 30_000, isolationLevel: options.isolationLevel },
  );
}

/** Maps database integrity errors raised by triggers to stable codes. */
export function dbErrorCode(err: unknown): 'IMMUTABLE' | 'INVALID_TRANSITION' | 'UNIQUE' | 'CHECK' | 'FOREIGN_KEY' | null {
  const msg = String((err as { message?: string })?.message ?? '');
  const code = (err as { code?: string })?.code;
  if (msg.includes('SGEE_IMMUTABLE')) return 'IMMUTABLE';
  if (msg.includes('SGEE_INVALID_TRANSITION')) return 'INVALID_TRANSITION';
  if (code === 'P2002' || msg.includes('23505')) return 'UNIQUE';
  if (msg.includes('23514') || msg.includes('violates check constraint')) return 'CHECK';
  if (code === 'P2003' || msg.includes('23503')) return 'FOREIGN_KEY';
  return null;
}
