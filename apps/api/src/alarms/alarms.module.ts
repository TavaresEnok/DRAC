import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AlarmsService } from './alarms.service';
import { AlarmsController } from './alarms.controller';
import { AlarmNotificationsService } from './alarm-notifications.service';
import { AlarmMuteService } from './alarm-mute.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../common/prisma/prisma.module';
import { ALARM_NOTIFICATION_QUEUE } from '../jobs/queues/alarm-notification.queue';

@Module({
  imports: [ConfigModule, PrismaModule, BullModule.registerQueue({ name: ALARM_NOTIFICATION_QUEUE })],
  controllers: [AlarmsController],
  providers: [AlarmsService, AlarmNotificationsService, AlarmMuteService],
  exports: [AlarmsService],
})
export class AlarmsModule {}
