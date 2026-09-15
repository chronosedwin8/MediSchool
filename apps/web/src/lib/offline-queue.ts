'use client';

/**
 * Offline queue for teachers and the gate (PLAN §2.5): writes made without
 * connectivity are stored in IndexedDB with their Idempotency-Key and replayed
 * when the browser is back online. The server deduplicates retries.
 */
import { api, ApiError } from './api';

const DB = 'sgee-offline';
const STORE = 'queue';

export interface QueuedRequest {
  id: string;
  path: string;
  body: unknown;
  idempotencyKey: string;
  label: string;
  createdAt: number;
  attempts: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const offlineQueue = {
  async add(item: Omit<QueuedRequest, 'id' | 'createdAt' | 'attempts'>) {
    const entry: QueuedRequest = { ...item, id: item.idempotencyKey, createdAt: Date.now(), attempts: 0 };
    await tx('readwrite', (s) => s.put(entry));
    window.dispatchEvent(new CustomEvent('sgee:queue'));
    return entry;
  },
  list: () => tx<QueuedRequest[]>('readonly', (s) => s.getAll() as IDBRequest<QueuedRequest[]>),
  remove: async (id: string) => {
    await tx('readwrite', (s) => s.delete(id));
    window.dispatchEvent(new CustomEvent('sgee:queue'));
  },
  async flush(): Promise<{ sent: number; failed: number }> {
    if (!navigator.onLine) return { sent: 0, failed: 0 };
    let sent = 0;
    let failed = 0;
    for (const item of await offlineQueue.list()) {
      try {
        await api(item.path, { method: 'POST', body: item.body, idempotencyKey: item.idempotencyKey });
        await offlineQueue.remove(item.id);
        sent++;
      } catch (e) {
        // Business rejections (4xx) are dropped so the queue does not block; network errors stay.
        if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
          await offlineQueue.remove(item.id);
          window.dispatchEvent(new CustomEvent('sgee:queue-rejected', { detail: { label: item.label, message: e.message } }));
        } else {
          failed++;
          await tx('readwrite', (s) => s.put({ ...item, attempts: item.attempts + 1 }));
        }
      }
    }
    return { sent, failed };
  },
};

export async function postOrQueue<T>(path: string, body: unknown, label: string, idempotencyKey: string): Promise<{ queued: true } | { queued: false; data: T }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await offlineQueue.add({ path, body, label, idempotencyKey });
    return { queued: true };
  }
  try {
    return { queued: false, data: await api<T>(path, { method: 'POST', body, idempotencyKey }) };
  } catch (e) {
    if (e instanceof ApiError && e.status === 0) {
      await offlineQueue.add({ path, body, label, idempotencyKey });
      return { queued: true };
    }
    throw e;
  }
}
