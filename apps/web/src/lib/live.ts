'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api } from './api';

let socket: Socket | null = null;
let connecting: Promise<Socket> | null = null;

async function getSocket(): Promise<Socket> {
  if (socket?.connected) return socket;
  connecting ??= (async () => {
    const { token } = await api<{ token: string }>('/auth/ws-token');
    const url = process.env.NEXT_PUBLIC_API_WS_URL ?? 'http://localhost:4000';
    socket = io(`${url}/live`, {
      auth: async (cb) => {
        try {
          const r = await api<{ token: string }>('/auth/ws-token');
          cb({ token: r.token });
        } catch {
          cb({ token });
        }
      },
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 10_000,
    });
    return socket;
  })().finally(() => (connecting = null));
  return connecting;
}

/** Subscribes to live events and invalidates the given query keys (payloads carry ids only). */
export function useLive(events: string[], invalidate: (string | readonly unknown[])[], onEvent?: (event: string, payload: Record<string, unknown>) => void) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const cb = useRef(onEvent);
  cb.current = onEvent;
  const key = events.join('|');

  useEffect(() => {
    let active = true;
    let s: Socket | null = null;
    const handlers = events.map((ev) => {
      const h = (payload: Record<string, unknown>) => {
        for (const k of invalidate) qc.invalidateQueries({ queryKey: Array.isArray(k) ? k : [k] });
        cb.current?.(ev, payload);
      };
      return [ev, h] as const;
    });
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    getSocket()
      .then((sock) => {
        if (!active) return;
        s = sock;
        setConnected(sock.connected);
        sock.on('connect', onConnect);
        sock.on('disconnect', onDisconnect);
        handlers.forEach(([ev, h]) => sock.on(ev, h));
      })
      .catch(() => setConnected(false));
    return () => {
      active = false;
      if (s) {
        s.off('connect', onConnect);
        s.off('disconnect', onDisconnect);
        handlers.forEach(([ev, h]) => s!.off(ev, h));
      }
    };
    // Dependencies intentionally limited (subscription set up once).
  }, [key]);

  return connected;
}

export function disconnectLive() {
  socket?.disconnect();
  socket = null;
}
