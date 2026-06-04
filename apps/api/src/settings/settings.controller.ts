import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { type Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { RequirePermission } from '../role-permissions/require-permission.decorator';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  getAll() {
    return this.settingsService.getAll();
  }

  @Roles(UserRole.ADMIN)
  @RequirePermission('serverConfig')
  @Patch()
  async update(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>, @Req() req: Request) {
    const updated = await this.settingsService.patch(body, actor.id);
    await this.auditService.log(actor.id, 'settings.update', 'SystemSetting', null, updated, req);
    return updated;
  }
}
