import { Controller, Get, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CloudConnectorService } from './cloud-connector.service';

@Controller('cloud-connector')
export class CloudConnectorController {
  constructor(private readonly cloudConnectorService: CloudConnectorService) {}

  @Roles(UserRole.ADMIN)
  @Get('status')
  status() {
    return this.cloudConnectorService.getStatus();
  }

  @Roles(UserRole.ADMIN)
  @Post('heartbeat')
  heartbeat() {
    return this.cloudConnectorService.syncHeartbeat();
  }
}
