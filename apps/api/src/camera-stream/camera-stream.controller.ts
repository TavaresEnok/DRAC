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

@Controller('camera-stream')
export class CameraStreamController {
  constructor(
    private readonly ffmpegMjpegService: FfmpegMjpegService,
    private readonly mediamtxProxyService: MediamtxProxyService,
    private readonly authService: AuthService,
    private readonly accessControlService: AccessControlService,
    private readonly auditService: AuditService,
  ) {}

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
    const flvUrl = `${reqProto}://${apiHost}/camera-stream/${cameraId}/flv?token=${encodeURIComponent(token.streamToken)}`;

    return {
      cameraId,
      streamToken: token.streamToken,
      protocols: {
        flvUrl,
        ...mediaBridge,
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
    if (!token) {
      throw new UnauthorizedException('Token de stream ausente.');
    }

    const payload = await this.authService.verifyStreamToken(token);
    if (payload.cameraId !== cameraId) {
      throw new UnauthorizedException('Token inválido para esta câmera.');
    }
    const tokenUser = await this.authService.me(payload.sub);
    await this.accessControlService.assertCanViewCamera(tokenUser, cameraId);

    await this.ffmpegMjpegService.startFlvStream(cameraId, req, res);
  }
}
