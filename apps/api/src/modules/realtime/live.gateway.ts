import { Injectable, Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { verifyAccessToken } from '../../common/guards';

/**
 * WebSocket namespace `/live` (PLAN §8): rooms per tenant and role.
 * Payloads carry identifiers and states only — clients refetch via REST,
 * so no clinical data travels over the socket.
 */
@WebSocketGateway({
  namespace: '/live',
  cors: { origin: (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(','), credentials: true },
  transports: ['websocket', 'polling'],
})
export class LiveGateway implements OnGatewayConnection {
  private readonly logger = new Logger('Live');
  @WebSocketServer() server: Namespace;

  handleConnection(socket: Socket) {
    try {
      const token = (socket.handshake.auth?.token as string | undefined) ?? parseCookie(socket.handshake.headers.cookie)?.sgee_at;
      if (!token) throw new Error('no token');
      const c = verifyAccessToken(token);
      socket.data.user = { id: c.sub, tenantId: c.tid, roles: c.roles };
      void socket.join(`t:${c.tid}`);
      void socket.join(`u:${c.sub}`);
      if (c.roles.some((r) => ['NURSE', 'DOCTOR', 'HEALTH_COORDINATOR', 'SUPERADMIN'].includes(r))) void socket.join(`t:${c.tid}:nursing`);
      if (c.roles.includes('GATE') || c.roles.includes('NURSE')) void socket.join(`t:${c.tid}:gate`);
      if (c.roles.some((r) => ['DIRECTOR', 'ADMIN', 'HEALTH_COORDINATOR'].includes(r))) void socket.join(`t:${c.tid}:management`);
    } catch {
      socket.emit('error', { code: 'UNAUTHORIZED' });
      socket.disconnect(true);
    }
  }
}

function parseCookie(header?: string): Record<string, string> | null {
  if (!header) return null;
  return Object.fromEntries(
    header.split(';').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), decodeURIComponent(p.slice(i + 1).trim())];
    }),
  );
}

@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: LiveGateway) {}

  private emit(room: string, event: string, payload: Record<string, unknown>) {
    this.gateway.server?.to(room).emit(event, { ...payload, at: new Date().toISOString() });
  }

  nursing(tenantId: string, event: string, payload: Record<string, unknown>) {
    this.emit(`t:${tenantId}:nursing`, event, payload);
  }

  gate(tenantId: string, event: string, payload: Record<string, unknown>) {
    this.emit(`t:${tenantId}:gate`, event, payload);
  }

  management(tenantId: string, event: string, payload: Record<string, unknown>) {
    this.emit(`t:${tenantId}:management`, event, payload);
  }

  user(userId: string, event: string, payload: Record<string, unknown>) {
    this.emit(`u:${userId}`, event, payload);
  }
}
