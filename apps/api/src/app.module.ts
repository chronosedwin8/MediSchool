import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CommonModule } from './common/common.module';
import { AuthGuard, PermissionsGuard } from './common/guards';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { ProblemFilter } from './common/problem.filter';
import { RateLimitMiddleware } from './common/rate-limit';
import { RequestMetaMiddleware } from './common/request-meta.middleware';
import { AdminController } from './modules/admin/admin.controller';
import { AdminService } from './modules/admin/admin.service';
import { BackupService } from './modules/admin/backup.service';
import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { CatalogController, ClinicalController } from './modules/clinical/clinical.controller';
import { ClinicalService } from './modules/clinical/clinical.service';
import { CommsController } from './modules/comms/comms.controller';
import { CommsService } from './modules/comms/comms.service';
import { ComplianceController } from './modules/compliance/compliance.controller';
import { ComplianceService } from './modules/compliance/compliance.service';
import { EncounterAttachmentsController } from './modules/encounters/attachments.controller';
import { EncountersController } from './modules/encounters/encounters.controller';
import { EncountersService } from './modules/encounters/encounters.service';
import { FlowController } from './modules/flow/flow.controller';
import { FlowService } from './modules/flow/flow.service';
import { HealthController } from './modules/health/health.controller';
import { InventoryController } from './modules/inventory/inventory.controller';
import { InventoryService } from './modules/inventory/inventory.service';
import { MedsController } from './modules/meds/meds.controller';
import { MedsService } from './modules/meds/meds.service';
import { PeopleController } from './modules/people/people.controller';
import { PeopleService } from './modules/people/people.service';
import { PhidiasSyncService } from './modules/phidias/phidias-sync.service';
import { PhidiasClient } from './modules/phidias/phidias.client';
import { PhidiasController } from './modules/phidias/phidias.controller';
import { PortalController } from './modules/portal/portal.controller';
import { PortalService } from './modules/portal/portal.service';
import { PublicHealthController } from './modules/public-health/public-health.controller';
import { PublicHealthService } from './modules/public-health/public-health.service';
import { StatsController } from './modules/stats/stats.controller';
import { StatsService } from './modules/stats/stats.service';

@Module({
  imports: [CommonModule],
  controllers: [
    HealthController,
    AuthController,
    PeopleController,
    ClinicalController,
    CatalogController,
    FlowController,
    EncountersController,
    EncounterAttachmentsController,
    MedsController,
    InventoryController,
    CommsController,
    ComplianceController,
    PublicHealthController,
    StatsController,
    AdminController,
    PortalController,
    PhidiasController,
  ],
  providers: [
    AuthService,
    PeopleService,
    ClinicalService,
    FlowService,
    EncountersService,
    MedsService,
    InventoryService,
    CommsService,
    ComplianceService,
    PublicHealthService,
    StatsService,
    AdminService,
    BackupService,
    PortalService,
    PhidiasClient,
    PhidiasSyncService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_FILTER, useClass: ProblemFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestMetaMiddleware, RateLimitMiddleware).forRoutes('*');
  }
}
