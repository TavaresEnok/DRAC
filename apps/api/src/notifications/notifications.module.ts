import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { PushService } from './push.service';
import { PushDevicesService } from './push-devices.service';

@Module({
  controllers: [NotificationsController],
  providers: [PushService, PushDevicesService],
  exports: [PushService, PushDevicesService],
})
export class NotificationsModule {}
