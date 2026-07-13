import { Module } from '@nestjs/common';
import { LiveLayoutsController } from './live-layouts.controller';
import { LiveLayoutsService } from './live-layouts.service';

@Module({
  controllers: [LiveLayoutsController],
  providers: [LiveLayoutsService],
})
export class LiveLayoutsModule {}
