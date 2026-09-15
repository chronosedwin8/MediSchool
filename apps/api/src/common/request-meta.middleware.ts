import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { AppRequest } from './auth';

@Injectable()
export class RequestMetaMiddleware implements NestMiddleware {
  use(req: AppRequest, res: Response, next: NextFunction) {
    const incoming = req.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && /^[\w-]{8,80}$/.test(incoming) ? incoming : randomUUID();
    req.meta = {
      ip: (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.ip || null,
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
      requestId,
    };
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
