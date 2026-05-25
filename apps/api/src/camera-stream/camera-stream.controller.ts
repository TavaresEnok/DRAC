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
import {
  isHevcCodec,
  isOriginalLiveProfileRequested,
  resolveDeliveryRtspProfile,
  resolveDeliveryVideoCodec,
  resolveLiveRtspProfile,
  resolveOriginalRtspProfile,
  resolveOriginalVideoCodec,
} from '../cameras/helpers/rtsp-url.helper';

type LiveProtocol = 'auto' | 'flv' | 'hls' | 'llhls' | 'webrtc' | 'mjpeg';

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

  private supportsHevcWebPlayback(req: Request) {
    const ua = String(req.headers['user-agent'] ?? '').toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod|macintosh|mac os x/.test(ua);
    const isSafariFamily =
      ua.includes('safari') &&
      !ua.includes('chrome') &&
      !ua.includes('chromium') &&
      !ua.includes('crios') &&
      !ua.includes('fxios') &&
      !ua.includes('edgios') &&
      !ua.includes('opr') &&
      !ua.includes('opera');
    return isAppleDevice && isSafariFamily;
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

    // Se ainda não temos metadados detectados, tenta uma sondagem rápida do perfil live.
    if (!camera.detectedVideoCodec || !camera.detectedWidth || !camera.detectedHeight) {
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
    const posterUrl = `${reqProto}://${apiHost}/camera-stream/${cameraId}/poster`;

    const configuredPreferred = (camera.preferredLiveProtocol ?? 'auto').toLowerCase();
    const configuredCodec = camera.streamVideoCodec ?? null;
    const originalCodec = resolveOriginalVideoCodec(camera);
    const sourceCodec = resolveDeliveryVideoCodec(camera);
    const liveProfile = resolveLiveRtspProfile(camera);
    const originalProfile = resolveOriginalRtspProfile(camera);
    const deliveryProfile = resolveDeliveryRtspProfile(camera);
    const originalProfileRequested = isOriginalLiveProfileRequested(camera);
    const smartOriginalEnabled = originalProfileRequested && isHevcCodec(originalCodec);
    const supportsOriginalOnClient = this.supportsHevcWebPlayback(req);

    const { sourceUrl: _sourceUrl, ...safeMediaBridge } = mediaBridge;
    const fallbackManualOrder: LiveProtocol[] = (() => {
      switch (configuredPreferred as LiveProtocol) {
        case 'webrtc':
          return ['webrtc', 'llhls', 'hls'];
        case 'llhls':
          return ['llhls', 'hls', 'webrtc'];
        case 'hls':
          return ['hls', 'llhls', 'webrtc'];
        case 'flv':
          // FLV legado: mantém compatibilidade de leitura, mas força rota HTTP estável.
          return ['llhls', 'hls', 'webrtc'];
        case 'auto':
          return ['webrtc', 'llhls', 'hls'];
        default:
          return ['webrtc', 'llhls', 'hls'];
      }
    })();

    const protocolOrder: LiveProtocol[] = smartOriginalEnabled
      ? ['webrtc', 'llhls', 'hls']
      : fallbackManualOrder;

    return {
      cameraId,
      streamToken: token.streamToken,
      preferredLiveProtocol: configuredPreferred,
      preferredRtspTransport: camera.preferredRtspTransport ?? 'tcp',
      configuredVideoCodec: configuredCodec,
      sourceVideoCodec: sourceCodec,
      detectedVideoCodec: sourceCodec, // retrocompatibilidade no frontend
      originalVideoCodec: originalCodec,
      liveProfile,
      originalProfile,
      deliveryProfile,
      smartLive: {
        enabled: smartOriginalEnabled,
        supportsOriginalOnClient,
        recommendedProtocol: smartOriginalEnabled
          ? 'webrtc'
          : fallbackManualOrder[0],
        protocolOrder,
        reason: smartOriginalEnabled
          ? 'Original da câmera é HEVC; live web usa perfil H.264 compatível e mantém HEVC para gravação.'
          : configuredPreferred === 'auto'
            ? 'Modo automático: valida vídeo renderizado e faz fallback WebRTC -> LL-HLS -> HLS.'
            : 'Ordem de fallback baseada no protocolo configurado.',
      },
      protocols: {
        flvUrl,
        posterUrl,
        ...safeMediaBridge,
      },
    };
  }

  @Public()
  @Get(':cameraId/poster')
  async getPoster(
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

    const poster = await this.ffmpegMjpegService.getLivePosterFrame(cameraId);
    res.status(200);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', String(poster.buffer.length));
    res.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=20');
    res.setHeader('X-Poster-Generated-At', new Date(poster.generatedAt).toISOString());
    res.end(poster.buffer);
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
