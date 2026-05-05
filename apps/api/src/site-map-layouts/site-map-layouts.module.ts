import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../common/prisma/prisma.module';
import { SitesModule } from '../sites/sites.module';
import { SiteMapLayoutsController } from './site-map-layouts.controller';
import { SiteMapLayoutsService } from './site-map-layouts.service';

@Module({
  imports: [PrismaModule, SitesModule, AuditModule],
  controllers: [SiteMapLayoutsController],
  providers: [SiteMapLayoutsService],
  exports: [SiteMapLayoutsService],
})
export class SiteMapLayoutsModule {}
