import { Controller, Get, Param, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { type Request, type Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { AccessControlService } from '../access-control/access-control.service';
import { AuthService } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { type AuthUser } from '../common/types/auth-user.type';
import { FfmpegMjpegService } from './ffmpeg-mjpeg.service';
import { MediamtxProxyService } from './mediamtx-proxy.service';
import { CamerasService } from '../cameras/cameras.service';

@Controller('camera-stream')
export class CameraStreamController {
  constructor(
    private readonly ffmpegMjpegService: FfmpegMjpegService,
    private readonly mediamtxProxyService: MediamtxProxyService,
    private readonly camerasService: CamerasService,
    private readonly authService: AuthService,
    private readonly accessControlService: AccessControlService,
    private readonly auditService: AuditService,
  ) {}

  private extractBearerToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (typeof authHeader !== 'string') return null;
    if (!authHeader.toLowerCase().startsWith('bearer ')) return null;
    const token = authHeader.slice(7).trim();
    return token || null;
  }

  @Roles(UserRole.VIEWER)
  @Post(':cameraId/token')
  async createStreamToken(
    @CurrentUser() user: AuthUser,
    @Param('cameraId') cameraId: string,
    @Req() req: Request,
  ) {
    await this.accessControlService.assertCanViewCamera(user, cameraId);
    const token = await this.authService.createStreamToken(user.id, cameraId);
    await this.auditService.log(user.id, 'stream.token.create', 'Camera', cameraId, null, req);
    return token;
  }

  @Roles(UserRole.ADMIN)
  @Get('stats')
  async getGlobalStats() {
    return this.ffmpegMjpegService.getStreamStats();
  }

  @Roles(UserRole.ADMIN)
  @Get(':cameraId/stats')
  async getCameraStats(@Param('cameraId') cameraId: string) {
    return this.ffmpegMjpegService.getStreamStats(cameraId);
  }

  @Roles(UserRole.VIEWER)
  @Get(':cameraId/urls')
  async getDeliveryUrls(
    @CurrentUser() user: AuthUser,
    @Param('cameraId') cameraId: string,
    @Req() req: Request,
  ) {
    await this.accessControlService.assertCanViewCamera(user, cameraId);
    const token = await this.authService.createStreamToken(user.id, cameraId);
    let camera = await this.camerasService.getCameraOrThrow(cameraId);

    // Se ainda não temos codec detectado, tenta uma sondagem rápida para persistir metadados.
    if (!camera.streamVideoCodec && !camera.detectedVideoCodec) {
      try {
        await this.camerasService.getStatus(cameraId);
        camera = await this.camerasService.getCameraOrThrow(cameraId);
      } catch {
        // Não bloqueia o live; segue com fallback de protocolo no frontend.
      }
    }

    let mediaBridge = this.mediamtxProxyService.buildPublicUrls(req, null, null);
    if (this.mediamtxProxyService.isEnabled()) {
      try {
        const ensured = await this.mediamtxProxyService.ensurePathForCamera(cameraId);
        mediaBridge = this.mediamtxProxyService.buildPublicUrls(req, ensured.pathName, ensured.sourceUrl);
      } catch {
        mediaBridge = this.mediamtxProxyService.buildPublicUrls(req, null, null);
      }
    }

    const hostHeader = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host ?? 'localhost:3000';
    const apiHost = hostHeader.split(',')[0].trim();
    const reqProto = ((req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol ?? 'http')
      .split(',')[0]
      .trim();
    const flvUrl = `${reqProto}://${apiHost}/camera-stream/${cameraId}/flv`;

    const configuredPreferred = (camera.preferredLiveProtocol ?? 'flv').toLowerCase();

    const { sourceUrl: _sourceUrl, ...safeMediaBridge } = mediaBridge;

    return {
      cameraId,
      streamToken: token.streamToken,
      preferredLiveProtocol: configuredPreferred,
      preferredRtspTransport: camera.preferredRtspTransport ?? 'tcp',
      detectedVideoCodec: camera.streamVideoCodec ?? camera.detectedVideoCodec ?? null,
      protocols: {
        flvUrl,
        ...safeMediaBridge,
      },
    };
  }

  @Public()
  @Get(':cameraId/flv')
  async getFlv(
    @Param('cameraId') cameraId: string,
    @Query('token') token: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const bearerToken = this.extractBearerToken(req);
    const tokenValue = token?.trim() || bearerToken;
    if (!tokenValue) {
      throw new UnauthorizedException('Token de stream ausente.');
    }

    const payload = await this.authService.verifyStreamToken(tokenValue);
    if (payload.cameraId !== cameraId) {
      throw new UnauthorizedException('Token inválido para esta câmera.');
    }
    const tokenUser = await this.authService.me(payload.sub);
    await this.accessControlService.assertCanViewCamera(tokenUser, cameraId);

    await this.ffmpegMjpegService.startFlvStream(cameraId, req, res);
  }
}
