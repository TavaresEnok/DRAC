import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { CamerasModule } from '../cameras/cameras.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { AiManagerService } from './ai-manager.service';

@Module({
  imports: [
    HttpModule,
    CamerasModule,
    AccessControlModule,
  ],
  controllers: [AiController],
  providers: [AiService, AiManagerService],
  exports: [AiService, AiManagerService],
})
export class AiModule {}
