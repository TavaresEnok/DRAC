import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuditModule } from '../audit/audit.module';
import { CamerasModule } from '../cameras/cameras.module';
import { PtzController } from './ptz.controller';
import { OnvifPtzService } from './onvif-ptz.service';

@Module({
  imports: [CamerasModule, AuditModule, AccessControlModule],
  controllers: [PtzController],
  providers: [OnvifPtzService],
})
export class PtzModule {}
