import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../common/prisma/prisma.module';
import { CameraPermissionsController } from './camera-permissions.controller';
import { CameraPermissionsService } from './camera-permissions.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [CameraPermissionsController],
  providers: [CameraPermissionsService],
  exports: [CameraPermissionsService],
})
export class CameraPermissionsModule {}
