import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { AppRequest } from './auth';
import { Problem } from './errors';
import { ACCESS_COOKIE, verifyAccessToken } from './guards';

/** In-memory fixed-window limiter (per API instance). */
export class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly limit: number, private readonly windowMs: number) {}

  hit(key: string): { allowed: boolean; retryAfter: number } {
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.buckets.size > 50_000) this.gc(now);
      return { allowed: true, retryAfter: 0 };
    }
    b.count++;
    return { allowed: b.count <= this.limit, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }

  reset() {
    this.buckets.clear();
  }

  private gc(now: number) {
    for (const [k, v] of this.buckets) if (v.resetAt <= now) this.buckets.delete(k);
  }
}

function userKey(req: AppRequest): string | null {
  const h = req.headers.authorization;
  const token = h?.startsWith('Bearer ') ? h.slice(7) : (req as unknown as { cookies?: Record<string, string> }).cookies?.[ACCESS_COOKIE];
  if (!token) return null;
  try {
    return `user:${verifyAccessToken(token).sub}`;
  } catch {
    return null;
  }
}

export const authLimiter = new RateLimiter(Number(process.env.AUTH_RATE_LIMIT ?? 20), 60_000);
export const apiLimiter = new RateLimiter(Number(process.env.API_RATE_LIMIT ?? 1200), 60_000);

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  use(req: AppRequest, res: Response, next: NextFunction) {
    const isAuth = req.path.includes('/auth/') && req.method === 'POST';
    // Schools usually reach the API through one public IP (NAT), so authenticated traffic
    // is limited per user; anonymous traffic and login attempts stay limited per IP.
    const key = isAuth ? `auth:${req.ip}` : `api:${userKey(req) ?? `ip:${req.ip}`}`;
    const r = (isAuth ? authLimiter : apiLimiter).hit(key);
    if (!r.allowed) {
      res.setHeader('Retry-After', String(r.retryAfter));
      throw new Problem(429, 'RATE_LIMITED', 'Demasiadas solicitudes. Intente de nuevo en unos segundos.');
    }
    next();
  }
}
