import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createPrisma, withTenant, type Prisma, type PrismaClient, type Tx } from '@sgee/db';
import type { AuthUser } from './auth';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient = createPrisma();

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }

  /** Tenant-scoped transaction for an authenticated user. */
  forUser<T>(user: Pick<AuthUser, 'tenantId' | 'id'>, fn: (tx: Tx) => Promise<T>, opts?: { timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }) {
    return withTenant(this.client, { tenantId: user.tenantId, userId: user.id }, fn, opts);
  }

  /** Tenant-scoped transaction without a user (jobs, public signed links). */
  forTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>, opts?: { timeout?: number }) {
    return withTenant(this.client, { tenantId }, fn, opts);
  }

  /** Cross-tenant system access (scheduler only). */
  system<T>(fn: (tx: Tx) => Promise<T>, opts?: { timeout?: number }) {
    return withTenant(this.client, { bypassRls: true }, fn, opts);
  }
}
