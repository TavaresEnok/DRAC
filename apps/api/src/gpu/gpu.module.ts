import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { GpuController } from './gpu.controller';
import { GpuService } from './gpu.service';

// SettingsService é @Global (SettingsModule), então não precisa ser importado aqui.
@Module({
  imports: [AuditModule],
  controllers: [GpuController],
  providers: [GpuService],
  exports: [GpuService],
})
export class GpuModule {}
