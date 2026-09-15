import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { from, lastValueFrom, Observable, of } from 'rxjs';
import { type AppRequest, IDEMPOTENT } from './auth';
import { canonicalJson, sha256 } from './crypto';
import { badRequest, conflict, unprocessable } from './errors';
import { PrismaService } from './prisma.service';

/**
 * Idempotency-Key support for critical writes (PLAN §8). The first request
 * stores its response; retries with the same key and body get the same
 * response; a different body with the same key is rejected.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<{ required: boolean } | undefined>(IDEMPOTENT, ctx.getHandler());
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (!meta || req.method !== 'POST') return next.handle();
    const key = req.headers['idempotency-key'];
    const user = req.user;
    if (!key || typeof key !== 'string' || !user) {
      if (meta.required) throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'Esta operación requiere el encabezado Idempotency-Key.');
      return next.handle();
    }
    if (!/^[\w-]{8,100}$/.test(key)) throw badRequest('IDEMPOTENCY_KEY_INVALID', 'Idempotency-Key inválido.');
    return from(this.run(ctx, next, key, req));
  }

  private async run(ctx: ExecutionContext, next: CallHandler, key: string, req: AppRequest) {
    const user = req.user!;
    const res = ctx.switchToHttp().getResponse<Response>();
    const path = req.originalUrl.split('?')[0];
    const requestHash = sha256(`${req.method} ${path} ${canonicalJson(req.body ?? {})}`);

    const existing = await this.prisma.forUser(user, async (tx) => {
      const found = await tx.idempotencyKey.findUnique({ where: { tenantId_userId_key: { tenantId: user.tenantId, userId: user.id, key } } });
      if (found) return found;
      await tx.idempotencyKey.create({ data: { tenantId: user.tenantId, userId: user.id, key, method: req.method, path, requestHash } });
      return null;
    });

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw unprocessable('IDEMPOTENCY_KEY_REUSED', 'El Idempotency-Key ya se usó con datos distintos.');
      }
      if (existing.statusCode === null) throw conflict('IDEMPOTENCY_IN_PROGRESS', 'La solicitud original aún se está procesando.');
      res.status(existing.statusCode);
      res.setHeader('Idempotent-Replay', 'true');
      return lastValueFrom(of(existing.responseBody));
    }

    try {
      const body = await lastValueFrom(next.handle());
      const statusCode = res.statusCode || 201;
      await this.prisma.forUser(user, (tx) =>
        tx.idempotencyKey.update({
          where: { tenantId_userId_key: { tenantId: user.tenantId, userId: user.id, key } },
          data: { statusCode, responseBody: JSON.parse(JSON.stringify(body ?? null, bigintReplacer)) },
        }),
      );
      return body;
    } catch (err) {
      await this.prisma
        .forUser(user, (tx) => tx.idempotencyKey.delete({ where: { tenantId_userId_key: { tenantId: user.tenantId, userId: user.id, key } } }))
        .catch(() => undefined);
      throw err;
    }
  }
}

export function bigintReplacer(_: string, v: unknown) {
  return typeof v === 'bigint' ? v.toString() : v;
}
