import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InvestigationsController } from './investigations.controller';
import { InvestigationsService } from './investigations.service';

@Module({
  imports: [AuditModule],
  controllers: [InvestigationsController],
  providers: [InvestigationsService],
  exports: [InvestigationsService],
})
export class InvestigationsModule {}
