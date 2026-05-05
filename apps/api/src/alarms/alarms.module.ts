import { Module } from '@nestjs/common';
import { AlarmsService } from './alarms.service';
import { AlarmsController } from './alarms.controller';
import { AlarmNotificationsService } from './alarm-notifications.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../common/prisma/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [AlarmsController],
  providers: [AlarmsService, AlarmNotificationsService],
  exports: [AlarmsService],
})
export class AlarmsModule {}
