import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AiService } from './ai.service';
import { AiManagerService } from './ai-manager.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { AccessControlService } from '../access-control/access-control.service';
import { CommercialPolicyService } from '../commercial-policy/commercial-policy.service';

type UpdateAiSettingsBody = {
  enabled?: boolean;
  mode?: string;
};

type LiveViewLeaseBody = {
  sessionId?: string;
  ttlSeconds?: number;
  viewMode?: 'selected' | 'grid';
};

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiManagerService: AiManagerService,
    private readonly accessControlService: AccessControlService,
    private readonly commercialPolicy: CommercialPolicyService,
  ) {}

  @Roles(UserRole.OPERATOR)
  @Get('health')
  async getHealth() {
    return this.aiService.getHealth();
  }

  @Roles(UserRole.OPERATOR)
  @Get('rollout/summary')
  async getRolloutSummary() {
    return this.aiService.getRolloutSummary();
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
    await this.commercialPolicy.assertFeature('aiAdvanced');
    return this.aiManagerService.restartAll();
  }

  @Roles(UserRole.OPERATOR)
  @Post('start/:cameraId')
  async start(@CurrentUser() user: AuthUser, @Param('cameraId') cameraId: string) {
    await this.accessControlService.assertCanRecordCamera(user, cameraId);
    await this.commercialPolicy.assertFeature('aiAdvanced', user);
    return this.aiManagerService.startCamera(cameraId);
  }

  @Roles(UserRole.OPERATOR)
  @Post('stop/:cameraId')
  async stop(@CurrentUser() user: AuthUser, @Param('cameraId') cameraId: string) {
    await this.accessControlService.assertCanRecordCamera(user, cameraId);
    return this.aiService.stopAnalysis(cameraId);
  }

  @Roles(UserRole.VIEWER)
  @Throttle({ default: { limit: 1200, ttl: 60000 } })
  @Get('detections/latest/:cameraId')
  async latestDetections(
    @CurrentUser() user: AuthUser,
    @Param('cameraId') cameraId: string,
    @Query('maxAgeMs') maxAgeMs?: string,
    @Query('limit') limit?: string,
  ) {
    await this.accessControlService.assertCanViewCamera(user, cameraId);
    const resolvedMaxAgeMs = Number.isFinite(Number(maxAgeMs)) ? Math.max(200, Math.min(30000, Number(maxAgeMs))) : 5000;
    const resolvedLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(50, Number(limit))) : 12;
    const snapshot = await this.aiService.getLatestDetections(cameraId, resolvedMaxAgeMs, resolvedLimit);
    if (snapshot?.status === 'not_running') {
      // Tenta auto-start quando a câmera participa da IA.
      const startResult = await this.aiManagerService.startCamera(cameraId).catch(() => ({ status: 'error' }));
      if (startResult?.status === 'disabled') {
        return { status: 'not_running', camera_id: cameraId, detections: [], reason: startResult.status };
      }
      return this.aiService.getLatestDetections(cameraId, resolvedMaxAgeMs, resolvedLimit);
    }
    return snapshot;
  }

  @Roles(UserRole.VIEWER)
  @Throttle({ default: { limit: 2400, ttl: 60000 } })
  @Post('live-view/start/:cameraId')
  async startLiveView(
    @CurrentUser() user: AuthUser,
    @Param('cameraId') cameraId: string,
    @Body() body: LiveViewLeaseBody,
  ) {
    await this.accessControlService.assertCanViewCamera(user, cameraId);
    const { sessionId, ttlSeconds, viewMode } = this.resolveLiveViewBody(body);
    const lease = await this.aiService.startLiveViewSession(cameraId, sessionId, ttlSeconds, viewMode);
    if (lease?.status !== 'not_running') return lease;

    const startResult = await this.aiManagerService.startCamera(cameraId).catch(() => ({ status: 'error' }));
    if (startResult?.status === 'disabled') {
      return { status: 'not_running', camera_id: cameraId, session_id: sessionId, reason: startResult.status };
    }
    return this.aiService.startLiveViewSession(cameraId, sessionId, ttlSeconds, viewMode);
  }

  @Roles(UserRole.VIEWER)
  @Throttle({ default: { limit: 3600, ttl: 60000 } })
  @Post('live-view/heartbeat/:cameraId')
  async heartbeatLiveView(
    @CurrentUser() user: AuthUser,
    @Param('cameraId') cameraId: string,
    @Body() body: LiveViewLeaseBody,
  ) {
    await this.accessControlService.assertCanViewCamera(user, cameraId);
    const { sessionId, ttlSeconds, viewMode } = this.resolveLiveViewBody(body);
    const lease = await this.aiService.heartbeatLiveViewSession(cameraId, sessionId, ttlSeconds, viewMode);
    if (lease?.status !== 'not_running') return lease;

    const startResult = await this.aiManagerService.startCamera(cameraId).catch(() => ({ status: 'error' }));
    if (startResult?.status === 'disabled') {
      return { status: 'not_running', camera_id: cameraId, session_id: sessionId, reason: startResult.status };
    }
    return this.aiService.startLiveViewSession(cameraId, sessionId, ttlSeconds, viewMode);
  }

  @Roles(UserRole.VIEWER)
  @Throttle({ default: { limit: 2400, ttl: 60000 } })
  @Post('live-view/stop/:cameraId')
  async stopLiveView(
    @CurrentUser() user: AuthUser,
    @Param('cameraId') cameraId: string,
    @Body() body: LiveViewLeaseBody,
  ) {
    await this.accessControlService.assertCanViewCamera(user, cameraId);
    const { sessionId } = this.resolveLiveViewBody(body);
    return this.aiService.stopLiveViewSession(cameraId, sessionId);
  }

  private resolveLiveViewBody(body: LiveViewLeaseBody) {
    const sessionId = String(body?.sessionId ?? '').trim();
    if (sessionId.length < 8 || sessionId.length > 128) {
      throw new BadRequestException('sessionId inválido');
    }
    const ttlInput = Number(body?.ttlSeconds);
    const ttlSeconds = Number.isFinite(ttlInput) ? Math.max(5, Math.min(120, Math.round(ttlInput))) : 20;
    const rawViewMode = String(body?.viewMode ?? '').trim().toLowerCase();
    const viewMode: 'selected' | 'grid' = rawViewMode === 'selected' ? 'selected' : 'grid';
    return { sessionId, ttlSeconds, viewMode };
  }
}
