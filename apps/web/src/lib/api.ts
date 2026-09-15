export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public body: { errors?: { path: string; message: string }[]; referenceId?: string; [k: string]: unknown } | null,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  query?: Query;
  idempotencyKey?: string;
  raw?: boolean;
  retry?: boolean;
}

const NO_REFRESH = ['/auth/login', '/auth/refresh', '/auth/mfa/verify', '/auth/mfa/setup-challenge', '/auth/kiosk', '/auth/register-parent', '/public/'];
let refreshing: Promise<boolean> | null = null;

function refresh(): Promise<boolean> {
  refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'sgee' } })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export function qs(query?: Query) {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'sgee', Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}${qs(opts.query)}`, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'),
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Sin conexión con el servidor.', null);
  }
  if (res.status === 401 && opts.retry !== false && !NO_REFRESH.some((p) => path.startsWith(p))) {
    if (await refresh()) return api<T>(path, { ...opts, retry: false });
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
  }
  if (!res.ok) {
    let body: ApiError['body'] = null;
    try {
      body = await res.json();
    } catch {}
    if (res.status === 403 && body?.code === 'PASSWORD_CHANGE_REQUIRED' && typeof window !== 'undefined') window.location.href = '/cambiar-clave';
    throw new ApiError(res.status, (body?.code as string) ?? 'ERROR', (body?.detail as string) ?? res.statusText, body);
  }
  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  return (ct.includes('json') ? res.json() : res.text()) as Promise<T>;
}

export const idem = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const first = e.body?.errors?.[0];
    return first ? `${e.message} ${first.path ? `(${first.path}) ` : ''}${first.message}` : e.message;
  }
  return (e as Error)?.message ?? 'Error inesperado';
}

/** Opens an authenticated binary endpoint (PDF, CSV) in a new tab/download. */
export async function openFile(path: string, filename?: string) {
  const res = await api<Response>(path, { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  } else window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
