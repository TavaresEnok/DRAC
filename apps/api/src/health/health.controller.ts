import { Controller, Get, Res } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  health() {
    return {
      status: 'ok',
      service: 'api',
      time: new Date().toISOString(),
    };
  }

  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response) {
    const readiness = await this.healthService.getReadiness();
    if (!readiness.ready) response.status(503);
    return readiness;
  }

  @Roles(UserRole.ADMIN)
  @Get('system')
  system() {
    return this.healthService.getSystemSummary();
  }

  @Roles(UserRole.ADMIN)
  @Get('operational-readiness')
  operationalReadiness() {
    return this.healthService.getOperationalReadiness();
  }
}
