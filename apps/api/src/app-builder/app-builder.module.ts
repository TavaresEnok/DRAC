import { Module } from '@nestjs/common';
import { AppBuilderController } from './app-builder.controller';
import { AppBuilderService } from './app-builder.service';

@Module({
  controllers: [AppBuilderController],
  providers: [AppBuilderService],
})
export class AppBuilderModule {}
