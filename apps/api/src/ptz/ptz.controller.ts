import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { type Request } from 'express';
import { AccessControlService } from '../access-control/access-control.service';
import { CamerasService } from '../cameras/cameras.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { type AuthUser } from '../common/types/auth-user.type';
import { OnvifPtzService } from './onvif-ptz.service';
import { PtzCommandDto } from './dto/ptz-command.dto';

@Controller('ptz')
export class PtzController {
  constructor(
    private readonly camerasService: CamerasService,
    private readonly ptzService: OnvifPtzService,
    private readonly accessControlService: AccessControlService,
    private readonly auditService: AuditService,
  ) {}

  @Roles(UserRole.OPERATOR)
  @Post(':cameraId/move')
  async move(
    @CurrentUser() user: AuthUser,
    @Param('cameraId') cameraId: string,
    @Body() command: PtzCommandDto,
    @Req() req: Request,
  ) {
    await this.accessControlService.assertCanControlCamera(user, cameraId);
    const camera = await this.camerasService.getCameraOrThrow(cameraId);

    if (command.action === 'stop') {
      const result = await this.ptzService.stop(camera);
      await this.auditService.log(user.id, 'ptz.stop', 'Camera', cameraId, { ok: result.ok }, req);
      if (!result.ok) {
        return { status: 'error', message: result.message };
      }
      return { status: 'ok', cameraId, action: 'stop' };
    }

    if (!command.direction) {
      return { status: 'error', message: 'direction é obrigatório quando action=start' };
    }

    const result = await this.ptzService.move(camera, command.direction);
    await this.auditService.log(user.id, 'ptz.start', 'Camera', cameraId, { direction: command.direction, ok: result.ok }, req);
    if (!result.ok) {
      return { status: 'error', message: result.message };
    }

    return {
      status: 'ok',
      cameraId,
      action: 'start',
      direction: command.direction,
    };
  }
}
