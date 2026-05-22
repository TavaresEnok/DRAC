import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../common/prisma/prisma.module';
import { FacesController } from './faces.controller';
import { FacesService } from './faces.service';

@Module({
  imports: [HttpModule, PrismaModule],
  controllers: [FacesController],
  providers: [FacesService],
  exports: [FacesService],
})
export class FacesModule {}
