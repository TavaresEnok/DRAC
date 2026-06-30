import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { type Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { RequirePermission } from '../role-permissions/require-permission.decorator';
import { GpuService } from './gpu.service';

@Controller('gpu')
@Roles(UserRole.ADMIN)
@RequirePermission('serverConfig')
export class GpuController {
  constructor(
    private readonly gpuService: GpuService,
    private readonly auditService: AuditService,
  ) {}

  @Get('status')
  getStatus() {
    return this.gpuService.getStatus();
  }

  @Get('metrics')
  getMetrics() {
    return this.gpuService.getMetrics();
  }

  @Post('verify')
  verify() {
    return this.gpuService.verify();
  }

  @Post('mode')
  async setMode(@CurrentUser() actor: AuthUser, @Body() body: { enabled?: boolean }, @Req() req: Request) {
    const enabled = body?.enabled === true;
    const status = await this.gpuService.setMode(enabled, actor.id);
    await this.auditService.log(actor.id, 'gpu.mode', 'SystemSetting', null, { enabled }, req);
    return status;
  }

  // Aceleração de IA por GPU. Pronto, mas bloqueado enquanto a IA estiver desativada.
  @Post('ai-mode')
  async setAiMode(@CurrentUser() actor: AuthUser, @Body() body: { enabled?: boolean }, @Req() req: Request) {
    const enabled = body?.enabled === true;
    const status = await this.gpuService.setAiMode(enabled, actor.id);
    await this.auditService.log(actor.id, 'gpu.aiMode', 'SystemSetting', null, { enabled }, req);
    return status;
  }
}
