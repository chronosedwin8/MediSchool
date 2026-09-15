import { Global, Module } from '@nestjs/common';
import { NotificationDispatcher, NotifyService } from '../modules/comms/notify.service';
import { PhotoService, StorageService } from '../modules/files/storage.service';
import { JobsService } from '../modules/jobs/jobs.service';
import { LiveGateway, RealtimeService } from '../modules/realtime/live.gateway';
import { AccessService } from './access.service';
import { AuditService } from './audit.service';
import { RolePermissionsCache } from './guards';
import { PrismaService } from './prisma.service';
import { TenantSettingsService } from './tenant-settings.service';

const providers = [
  PrismaService,
  AuditService,
  RolePermissionsCache,
  TenantSettingsService,
  AccessService,
  JobsService,
  LiveGateway,
  RealtimeService,
  StorageService,
  PhotoService,
  NotifyService,
  NotificationDispatcher,
];

@Global()
@Module({ providers, exports: providers })
export class CommonModule {}
