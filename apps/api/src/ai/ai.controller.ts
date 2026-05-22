import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiManagerService } from './ai-manager.service';
import { CamerasService } from '../cameras/cameras.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { CryptoService } from '../common/crypto/crypto.service';
import { AccessControlService } from '../access-control/access-control.service';

type UpdateAiSettingsBody = {
  enabled?: boolean;
  mode?: string;
  fps?: number;
};

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiManagerService: AiManagerService,
    private readonly camerasService: CamerasService,
    private readonly accessControlService: AccessControlService,
    private readonly cryptoService: CryptoService,
  ) {}

  @Roles(UserRole.OPERATOR)
  @Get('health')
  async getHealth() {
    return this.aiService.getHealth();
  }

  @Roles(UserRole.OPERATOR)
  @Get('settings')
  async getSettings() {
    return this.aiManagerService.getSettings();
  }

  @Roles(UserRole.OPERATOR)
  @Patch('settings')
  async updateSettings(@Body() body: UpdateAiSettingsBody) {
    return this.aiManagerService.updateSettings(body);
  }

  @Roles(UserRole.OPERATOR)
  @Post('sync')
  async sync() {
    return this.aiManagerService.restartAll();
  }

  @Roles(UserRole.OPERATOR)
  @Post('start/:cameraId')
  async start(@CurrentUser() user: AuthUser, @Param('cameraId') cameraId: string) {
    await this.accessControlService.assertCanRecordCamera(user, cameraId);
    const camera = await this.camerasService.getCameraOrThrow(cameraId);
    const settings = await this.aiManagerService.getSettings();
    
    // Decrypt password to build URL
    const password = this.cryptoService.decrypt(camera.passwordEncrypted);
    const path = camera.rtspPath || `Streaming/Channels/${camera.channel}${camera.subtype.toString().padStart(2, '0')}`;
    const rtspUrl = `rtsp://${camera.username}:${password}@${camera.ip}:${camera.rtspPort}/${path.startsWith('/') ? path.slice(1) : path}`;
    
    return this.aiService.startAnalysis(cameraId, rtspUrl, settings.mode);
  }

  @Roles(UserRole.OPERATOR)
  @Post('stop/:cameraId')
  async stop(@CurrentUser() user: AuthUser, @Param('cameraId') cameraId: string) {
    await this.accessControlService.assertCanRecordCamera(user, cameraId);
    return this.aiService.stopAnalysis(cameraId);
  }
}
