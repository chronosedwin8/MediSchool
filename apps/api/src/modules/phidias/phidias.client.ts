import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from '../../config';
import { parsePhidiasDenied, type RawPerson } from './phidias.adapter';

export class PhidiasError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

/** The integration token lacks a Phidias permission (module) — not a transient failure. */
export class PhidiasPermissionError extends PhidiasError {
  constructor(readonly module: string) {
    super(`Phidias denegó el acceso a ${module}`, 401);
  }
}

/**
 * HTTP client for the Phidias REST API (docs/integrations/phidias.md):
 * bearer token, timeouts, exponential retries with jitter on 429/5xx,
 * minimum spacing between calls (Phidias rate-limits with 429), a simple
 * circuit breaker, a 5-minute response cache and a mock mode with fixtures.
 * Logs never include response bodies (personal data).
 */
@Injectable()
export class PhidiasClient {
  private readonly logger = new Logger('Phidias');
  private failures = 0;
  private openUntil = 0;
  private lastCall = 0;
  private readonly cache = new Map<string, { at: number; data: unknown }>();

  get mock(): boolean {
    return config().PHIDIAS_MOCK || !config().PHIDIAS_TOKEN;
  }

  async get<T>(endpoint: string, params: Record<string, string | number | undefined> = {}, opts: { cacheMs?: number; timeoutMs?: number } = {}): Promise<T> {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)] as [string, string]));
    const key = `${endpoint}?${qs}`;
    const cacheMs = opts.cacheMs ?? 5 * 60_000;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < cacheMs) return hit.data as T;

    const data = this.mock ? await this.fromFixture<T>(endpoint, params) : await this.fetchWithRetry<T>(endpoint, qs, opts.timeoutMs ?? 90_000);
    this.cache.set(key, { at: Date.now(), data });
    return data;
  }

  clearCache() {
    this.cache.clear();
  }

  /**
   * People directory (`/1/people`, paginated). Phidias includes `username` and
   * `password` in this payload: they are dropped immediately and never cached.
   */
  async listPeople(): Promise<RawPerson[]> {
    const out: RawPerson[] = [];
    for (let page = 1; page <= 20; page++) {
      const rows = await this.get<(RawPerson & { username?: unknown; password?: unknown })[]>('/1/people', { limit: 5000, page }, { cacheMs: 0 });
      if (!Array.isArray(rows) || rows.length === 0) break;
      for (const { username: _u, password: _p, ...safe } of rows) out.push(safe);
      if (rows.length < 5000) break;
    }
    this.cache.forEach((_v, k) => k.startsWith('/1/people?') && this.cache.delete(k));
    return out;
  }

  private async fetchWithRetry<T>(endpoint: string, qs: URLSearchParams, timeoutMs: number): Promise<T> {
    if (Date.now() < this.openUntil) throw new PhidiasError('Phidias no disponible (circuito abierto). Reintente en un minuto.', 503);
    const c = config();
    const url = `${c.PHIDIAS_BASE_URL}${endpoint}${qs.toString() ? `?${qs}` : ''}`;
    let lastErr: PhidiasError | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const wait = Math.max(0, this.lastCall + 400 - Date.now());
      if (wait) await sleep(wait);
      this.lastCall = Date.now();
      const started = Date.now();
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${c.PHIDIAS_TOKEN}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        });
        this.logger.log(`GET ${endpoint} → ${res.status} (${Date.now() - started} ms)`);
        if (res.ok) {
          this.failures = 0;
          return (await res.json()) as T;
        }
        if (res.status === 401 || res.status === 403) {
          // Error bodies carry no personal data: { code: "denied", arguments: { module } }.
          const denied = parsePhidiasDenied(await res.json().catch(() => null));
          if (denied) throw new PhidiasPermissionError(denied);
        }
        lastErr = new PhidiasError(`Phidias respondió ${res.status}`, res.status);
        if (res.status !== 429 && res.status < 500) break;
      } catch (e) {
        if (e instanceof PhidiasPermissionError) throw e;
        lastErr = new PhidiasError(`Error de red con Phidias: ${(e as Error).name}`);
        this.logger.warn(`GET ${endpoint} failed: ${(e as Error).name}`);
      }
      await sleep(1000 * 2 ** attempt + Math.random() * 400);
    }
    this.failures++;
    if (this.failures >= 5) {
      this.openUntil = Date.now() + 60_000;
      this.logger.error('circuit opened for 60 s');
    }
    throw lastErr ?? new PhidiasError('Error desconocido con Phidias');
  }

  private async fromFixture<T>(endpoint: string, params: Record<string, string | number | undefined>): Promise<T> {
    const dir = path.resolve(__dirname, '../../../fixtures/phidias');
    let name: string;
    if (endpoint.includes('/course/consolidate')) name = 'consolidate.json';
    else if (endpoint.includes('/poll/consolidate')) name = `poll-${params.pollId}.json`;
    else if (endpoint === config().PHIDIAS_RELATIVES_ENDPOINT) name = 'relatives.json';
    else if (endpoint === '/1/people') {
      if (Number(params.page ?? 1) > 1) return [] as unknown as T;
      name = 'people.json';
    } else name = `${endpoint.replace(/^\/1\//, '').replace(/\//g, '_')}.json`;
    try {
      const data = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
      if (name === 'relatives.json') return (data[String(params[config().PHIDIAS_RELATIVES_PARAM])] ?? []) as T;
      return data as T;
    } catch {
      return [] as unknown as T;
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
