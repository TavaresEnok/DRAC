import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../common/prisma/prisma.module';
import { CameraGroupsController } from './camera-groups.controller';
import { CameraGroupsService } from './camera-groups.service';

@Module({
  imports: [PrismaModule, AuditModule, AccessControlModule],
  controllers: [CameraGroupsController],
  providers: [CameraGroupsService],
  exports: [CameraGroupsService],
})
export class CameraGroupsModule {}
