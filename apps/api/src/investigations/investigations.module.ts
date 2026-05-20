import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuditModule } from '../audit/audit.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { EVIDENCE_EXPORT_QUEUE } from '../jobs/queues/evidence-export.queue';
import { InvestigationsController } from './investigations.controller';
import { InvestigationsService } from './investigations.service';

@Module({
  imports: [AuditModule, EvidenceModule, BullModule.registerQueue({ name: EVIDENCE_EXPORT_QUEUE })],
  controllers: [InvestigationsController],
  providers: [InvestigationsService],
  exports: [InvestigationsService],
})
export class InvestigationsModule {}
