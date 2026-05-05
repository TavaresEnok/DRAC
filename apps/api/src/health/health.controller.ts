import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
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
  @Get('system')
  system() {
    return this.healthService.getSystemSummary();
  }
}
