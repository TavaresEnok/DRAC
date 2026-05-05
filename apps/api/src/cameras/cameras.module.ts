import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { AlarmsModule } from '../alarms/alarms.module';
import { AuditModule } from '../audit/audit.module';
import { CamerasController } from './cameras.controller';
import { CamerasService } from './cameras.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { PortCheckerService } from '../common/network/port-checker.service';

@Module({
  imports: [AuditModule, AccessControlModule, AlarmsModule],
  controllers: [CamerasController],
  providers: [CamerasService, CryptoService, PortCheckerService],
  exports: [CamerasService, CryptoService, PortCheckerService],
})
export class CamerasModule {}
