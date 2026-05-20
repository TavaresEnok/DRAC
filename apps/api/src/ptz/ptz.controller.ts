import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
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
      const result = await this.ptzService.stop(camera, command.direction);
      await this.auditService.log(user.id, 'ptz.stop', 'Camera', cameraId, { direction: command.direction ?? null, ok: result.ok }, req);
      if (!result.ok) {
        return { status: 'error', message: result.message };
      }
      return { status: 'ok', cameraId, action: 'stop', direction: command.direction, details: result };
    }

    if (command.action === 'home') {
      const result = await this.ptzService.goHome(camera);
      await this.auditService.log(user.id, 'ptz.home', 'Camera', cameraId, { ok: result.ok }, req);
      if (!result.ok) {
        return { status: 'error', message: result.message };
      }
      return { status: 'ok', cameraId, action: 'home', details: result };
    }

    if (command.action === 'step') {
      if (!command.direction) {
        return { status: 'error', message: 'direction é obrigatório quando action=step' };
      }
      const result = await this.ptzService.step(camera, command.direction, command.speed, command.durationMs);
      await this.auditService.log(user.id, 'ptz.step', 'Camera', cameraId, {
        direction: command.direction,
        speed: command.speed ?? null,
        durationMs: command.durationMs ?? null,
        ok: result.ok,
      }, req);
      if (!result.ok) {
        return { status: 'error', message: result.message };
      }
      return { status: 'ok', cameraId, action: 'step', direction: command.direction, details: result };
    }

    if (!command.direction) {
      return { status: 'error', message: 'direction é obrigatório quando action=start' };
    }

    const result = await this.ptzService.move(camera, command.direction, command.speed, command.durationMs);
    await this.auditService.log(user.id, 'ptz.start', 'Camera', cameraId, { direction: command.direction, speed: command.speed ?? null, ok: result.ok }, req);
    if (!result.ok) {
      return { status: 'error', message: result.message };
    }

    return {
      status: 'ok',
      cameraId,
      action: 'start',
      direction: command.direction,
      details: result,
    };
  }

  @Roles(UserRole.OPERATOR)
  @Get(':cameraId/diagnostics')
  async diagnostics(
    @CurrentUser() user: AuthUser,
    @Param('cameraId') cameraId: string,
    @Req() req: Request,
  ) {
    await this.accessControlService.assertCanControlCamera(user, cameraId);
    const camera = await this.camerasService.getCameraOrThrow(cameraId);
    const result = await this.ptzService.diagnoseCamera(camera);
    await this.auditService.log(user.id, 'ptz.diagnostics', 'Camera', cameraId, { ok: result.ptzLikelyWorking }, req);
    return result;
  }

  @Roles(UserRole.OPERATOR)
  @Get(':cameraId/relays')
  async relays(
    @CurrentUser() user: AuthUser,
    @Param('cameraId') cameraId: string,
    @Req() req: Request,
  ) {
    await this.accessControlService.assertCanControlCamera(user, cameraId);
    const camera = await this.camerasService.getCameraOrThrow(cameraId);
    const result = await this.ptzService.listRelayOutputs(camera);
    await this.auditService.log(user.id, 'camera.relays.list', 'Camera', cameraId, {
      ok: result.ok,
      relayCount: result.ok ? result.relayCount : 0,
    }, req);
    return result;
  }

  @Roles(UserRole.OPERATOR)
  @Post(':cameraId/relays/trigger')
  async triggerRelay(
    @CurrentUser() user: AuthUser,
    @Param('cameraId') cameraId: string,
    @Body() body: { token?: string; durationMs?: number },
    @Req() req: Request,
  ) {
    await this.accessControlService.assertCanControlCamera(user, cameraId);
    const camera = await this.camerasService.getCameraOrThrow(cameraId);
    const result = await this.ptzService.triggerRelayOutput(camera, body.token, body.durationMs);
    await this.auditService.log(user.id, 'camera.relay.trigger', 'Camera', cameraId, {
      ok: result.ok,
      token: body.token ?? null,
      durationMs: body.durationMs ?? null,
    }, req);
    if (!result.ok) {
      return { status: 'error', message: result.message, details: result };
    }
    return { status: 'ok', cameraId, details: result };
  }
}
