import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { envConfig } from './config/env.config';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { CamerasModule } from './cameras/cameras.module';
import { CameraStreamModule } from './camera-stream/camera-stream.module';
import { PtzModule } from './ptz/ptz.module';
import { JobsModule } from './jobs/jobs.module';
import { RecordingsModule } from './recordings/recordings.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AuditModule } from './audit/audit.module';
import { SitesModule } from './sites/sites.module';
import { AreasModule } from './areas/areas.module';
import { CameraGroupsModule } from './camera-groups/camera-groups.module';
import { CameraPermissionsModule } from './camera-permissions/camera-permissions.module';
import { AiModule } from './ai/ai.module';
import { SiteMapLayoutsModule } from './site-map-layouts/site-map-layouts.module';
import { EvidenceModule } from './evidence/evidence.module';
import { AlarmsModule } from './alarms/alarms.module';
import { InvestigationsModule } from './investigations/investigations.module';
import { SettingsModule } from './settings/settings.module';
import { RolePermissionsModule } from './role-permissions/role-permissions.module';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [envConfig],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    SettingsModule,
    RolePermissionsModule,
    HealthModule,
    AuthModule,
    UsersModule,
    AuditModule,
    SitesModule,
    AreasModule,
    SiteMapLayoutsModule,
    EvidenceModule,
    AlarmsModule,
    InvestigationsModule,
    CameraGroupsModule,
    CameraPermissionsModule,
    CamerasModule,
    CameraStreamModule,
    PtzModule,
    RecordingsModule,
    JobsModule,
    AiModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
