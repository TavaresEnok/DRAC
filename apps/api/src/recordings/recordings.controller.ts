import { Body, Controller, Get, Param, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { type Request, type Response } from 'express';
import { AccessControlService } from '../access-control/access-control.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { type AuthUser } from '../common/types/auth-user.type';
import { ListRecordingsQueryDto } from './dto/list-recordings-query.dto';
import { BulkThumbnailTokensDto } from './dto/bulk-thumbnail-tokens.dto';
import { RegisterRecordingDto } from './dto/register-recording.dto';
import { StartRecordingDto } from './dto/start-recording.dto';
import { StopRecordingDto } from './dto/stop-recording.dto';
import { ServiceTokenGuard } from '../auth/guards/service-token.guard';
import { UseGuards } from '@nestjs/common';
import { RecordingProcessManagerService } from './recording-process-manager.service';
import { RecordingsService } from './recordings.service';
import { ExportClipDto } from './dto/export-clip.dto';
import { InvestigationsService } from '../investigations/investigations.service';

@Controller()
export class RecordingsController {
  constructor(
    private readonly recordingManager: RecordingProcessManagerService,
    private readonly recordingsService: RecordingsService,
    private readonly investigationsService: InvestigationsService,
    private readonly authService: AuthService,
    private readonly accessControlService: AccessControlService,
    private readonly auditService: AuditService,
  ) {}

  @Roles(UserRole.OPERATOR)
  @Post('cameras/:cameraId/recording/start')
  async startRecording(
    @CurrentUser() user: AuthUser,
    @Param('cameraId') cameraId: string,
    @Body() dto: StartRecordingDto,
    @Req() req: Request,
  ) {
    await this.accessControlService.assertCanRecordCamera(user, cameraId);
    const defaultSegment = Number(process.env.RECORDING_SEGMENT_SECONDS ?? 300);
    const segmentSeconds = dto.segmentSeconds ?? defaultSegment;
    const result = await this.recordingManager.start(cameraId, segmentSeconds);
    await this.auditService.log(user.id, 'recording.start', 'Camera', cameraId, { status: result.status }, req);
    return result;
  }

  @Roles(UserRole.OPERATOR)
  @Post('cameras/:cameraId/recording/stop')
  async stopRecording(@CurrentUser() user: AuthUser, @Param('cameraId') cameraId: string, @Body() _dto: StopRecordingDto, @Req() req: Request) {
    await this.accessControlService.assertCanRecordCamera(user, cameraId);
    const result = await this.recordingManager.stop(cameraId);
    await this.auditService.log(user.id, 'recording.stop', 'Camera', cameraId, { status: result.status }, req);
    return result;
  }

  @Roles(UserRole.VIEWER)
  @Get('cameras/:cameraId/recording/status')
  async getRecordingStatus(@CurrentUser() user: AuthUser, @Param('cameraId') cameraId: string) {
    await this.accessControlService.assertCanViewCamera(user, cameraId);
    return this.recordingManager.getStatus(cameraId);
  }

  @Roles(UserRole.VIEWER)
  @Get('recordings')
  async listRecordings(@CurrentUser() user: AuthUser, @Query() query: ListRecordingsQueryDto) {
    if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
      return this.recordingsService.list(query);
    }
    const ids = await this.accessControlService.getAccessibleCameraIds(user);
    return this.recordingsService.list(query, ids);
  }

  @Roles(UserRole.VIEWER)
  @Post('recordings/:id/play-token')
  async createPlayToken(@CurrentUser() user: AuthUser, @Param('id') recordingId: string, @Req() req: Request) {
    const recording = await this.recordingsService.ensureRecordingExists(recordingId);
    await this.accessControlService.assertCanViewCamera(user, recording.cameraId);
    const token = await this.authService.createPlaybackToken(user.id, recordingId);
    await this.auditService.log(user.id, 'playback.token.create', 'Recording', recordingId, null, req);
    return token;
  }

  @Roles(UserRole.VIEWER)
  @Post('recordings/thumbnail-tokens')
  async createThumbnailTokens(@CurrentUser() user: AuthUser, @Body() dto: BulkThumbnailTokensDto) {
    return this.recordingsService.createThumbnailTokens(user, dto.recordingIds);
  }

  @Public()
  @Get('recordings/:id/play')
  async playRecording(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Query('compatible') compatible: string | undefined,
    @Res() res: Response,
  ) {
    if (!token) {
      throw new UnauthorizedException('Token de playback ausente.');
    }
    const payload = await this.authService.verifyPlaybackToken(token);
    if (payload.recordingId !== id) {
      throw new UnauthorizedException('Token inválido para esta gravação.');
    }
    const tokenUser = await this.authService.me(payload.sub);
    const recording = await this.recordingsService.ensureRecordingExists(id);
    await this.accessControlService.assertCanViewCamera(tokenUser, recording.cameraId);
    const useCompatible = ['1', 'true', 'yes'].includes(String(compatible ?? '').toLowerCase());
    if (useCompatible) {
      return this.recordingsService.streamRecordingCompatible(id, res);
    }
    return this.recordingsService.streamRecording(id, res);
  }

  @Roles(UserRole.VIEWER)
  @Get('recordings/:id/download')
  async downloadRecording(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const recording = await this.recordingsService.ensureRecordingExists(id);
    await this.accessControlService.assertCanViewCamera(user, recording.cameraId);
    return this.recordingsService.downloadRecording(id, res);
  }

  @Roles(UserRole.OPERATOR)
  @Post('recordings/:id/clips/export')
  async exportClip(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ExportClipDto,
    @Req() req: Request,
  ) {
    const recording = await this.recordingsService.ensureRecordingExists(id);
    await this.accessControlService.assertCanViewCamera(user, recording.cameraId);
    const clip = await this.recordingsService.exportClip(user, id, dto);

    let investigationItemId: string | null = null;
    if (dto.investigationId) {
      const item = await this.investigationsService.addItem(user, dto.investigationId, {
        type: 'clip',
        label: dto.label?.trim() || `Clip exportado — ${recording.camera.name}`,
        cameraId: recording.cameraId,
        cameraName: recording.camera.name,
        recordingId: recording.id,
        timestamp: clip.startedAt.toISOString(),
        notes: dto.notes,
        metadata: {
          clipId: clip.id,
          downloadUrl: clip.downloadUrl,
          startSeconds: dto.startSeconds,
          endSeconds: dto.endSeconds,
          sourceRecordingId: recording.id,
        },
      });
      investigationItemId = item.id;
    }

    await this.auditService.log(user.id, 'recording.clip.export', 'Recording', id, { clipId: clip.id, investigationId: dto.investigationId ?? null }, req);
    return { ...clip, investigationItemId };
  }

  @Roles(UserRole.VIEWER)
  @Get('recordings/clips/:clipId/download')
  async downloadExportedClip(@CurrentUser() user: AuthUser, @Param('clipId') clipId: string, @Res() res: Response) {
    const clip = await this.recordingsService.ensureExportedClipExists(clipId);
    await this.accessControlService.assertCanViewCamera(user, clip.cameraId);
    return this.recordingsService.downloadExportedClip(clipId, res);
  }

  @Public()
  @Get('recordings/:id/thumbnail')
  async getThumbnail(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    if (!token) {
      throw new UnauthorizedException('Token de thumbnail ausente.');
    }
    const payload = await this.authService.verifyPlaybackToken(token);
    if (payload.recordingId !== id) {
      throw new UnauthorizedException('Token inválido para esta gravação.');
    }
    const tokenUser = await this.authService.me(payload.sub);
    const recording = await this.recordingsService.ensureRecordingExists(id);
    await this.accessControlService.assertCanViewCamera(tokenUser, recording.cameraId);
    return this.recordingsService.streamThumbnail(id, res);
  }

  @Roles(UserRole.OPERATOR)
  @Post('recordings/:id/thumbnail/regenerate')
  async regenerateThumbnail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const recording = await this.recordingsService.ensureRecordingExists(id);
    await this.accessControlService.assertCanRecordCamera(user, recording.cameraId);
    return this.recordingsService.enqueueThumbnailGeneration(id, true);
  }

  @Public()
  @UseGuards(ServiceTokenGuard)
  @Post('recordings/internal/register')
  async registerInternal(@Body() dto: RegisterRecordingDto) {
    return this.recordingsService.registerInternal(dto);
  }
}
