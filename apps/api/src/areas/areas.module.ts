import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../common/prisma/prisma.module';
import { AreasController } from './areas.controller';
import { AreasService } from './areas.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [AreasController],
  providers: [AreasService],
  exports: [AreasService],
})
export class AreasModule {}
