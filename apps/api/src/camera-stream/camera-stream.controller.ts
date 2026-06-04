import { Body, Controller, Get, Param, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { type Request, type Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { AccessControlService } from '../access-control/access-control.service';
import { AuthService } from '../auth/auth.service';
import { CommercialPolicyService } from '../commercial-policy/commercial-policy.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { type AuthUser } from '../common/types/auth-user.type';
import { RequirePermission } from '../role-permissions/require-permission.decorator';
import { FfmpegMjpegService } from './ffmpeg-mjpeg.service';
import { MediamtxProxyService } from './mediamtx-proxy.service';
import { CamerasService } from '../cameras/cameras.service';
import {
  isHevcCodec,
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
    private readonly commercialPolicy: CommercialPolicyService,
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
  @RequirePermission('liveView')
  @Post(':cameraId/token')
  async createStreamToken(
    @CurrentUser() user: AuthUser,
    @Param('cameraId') cameraId: string,
    @Req() req: Request,
  ) {
    await this.accessControlService.assertCanViewCamera(user, cameraId);
    await this.commercialPolicy.assertFeature('localLive', user);
    const token = await this.authService.createStreamToken(user.id, cameraId);
    await this.auditService.log(user.id, 'stream.token.create', 'Camera', cameraId, null, req);
    return token;
  }

  @Roles(UserRole.ADMIN)
  @RequirePermission('serverConfig')
  @Get('stats')
  async getGlobalStats() {
    return this.ffmpegMjpegService.getStreamStats();
  }

  @Roles(UserRole.ADMIN)
  @RequirePermission('serverConfig')
  @Get(':cameraId/stats')
  async getCameraStats(@Param('cameraId') cameraId: string) {
    return this.ffmpegMjpegService.getStreamStats(cameraId);
  }

  @Roles(UserRole.VIEWER)
  @RequirePermission('liveView')
  @Post(':cameraId/live-failure')
  async recordLiveFailure(
    @CurrentUser() user: AuthUser,
    @Param('cameraId') cameraId: string,
    @Body() body: { protocol?: string; reason?: string; stage?: string; state?: string },
    @Req() req: Request,
  ) {
    await this.accessControlService.assertCanViewCamera(user, cameraId);
    const protocol = String(body?.protocol || 'unknown').slice(0, 32);
    const stage = String(body?.stage || 'startup').slice(0, 64);
    const reason = String(body?.reason || 'Falha de live sem detalhe informado.').slice(0, 500);
    const state = String(body?.state || '').slice(0, 64) || null;
    await this.auditService.log(user.id, 'stream.live.failure', 'Camera', cameraId, {
      protocol,
      stage,
      reason,
      state,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 240),
    }, req);
    return { accepted: true, cameraId, protocol, stage };
  }

  @Roles(UserRole.VIEWER)
  @RequirePermission('liveView')
  @Get(':cameraId/urls')
  async getDeliveryUrls(
    @CurrentUser() user: AuthUser,
    @Param('cameraId') cameraId: string,
    @Req() req: Request,
  ) {
    await this.accessControlService.assertCanViewCamera(user, cameraId);
    await this.commercialPolicy.assertFeature('localLive', user);
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
    let measuredLiveCodec: string | null = null;
    let liveTranscodedForBrowser = false;
    let effectiveDeliveryProfile = resolveDeliveryRtspProfile(camera);
    if (this.mediamtxProxyService.isEnabled()) {
      try {
        const ensured = await this.mediamtxProxyService.ensurePathForCamera(cameraId);
        mediaBridge = this.mediamtxProxyService.buildPublicUrls(req, ensured.pathName, ensured.sourceUrl);
        measuredLiveCodec = ensured.sourceVideoCodec;
        liveTranscodedForBrowser = ensured.transcodedForLive;
        effectiveDeliveryProfile = ensured.liveProfile ?? effectiveDeliveryProfile;
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

    const configuredPreferred = (camera.preferredLiveProtocol ?? 'webrtc').toLowerCase();
    const configuredCodec = camera.streamVideoCodec ?? null;
    const originalCodec = resolveOriginalVideoCodec(camera);
    const sourceCodec = measuredLiveCodec ?? resolveDeliveryVideoCodec(camera);
    const liveProfile = resolveLiveRtspProfile(camera);
    const originalProfile = resolveOriginalRtspProfile(camera);
    const deliveryProfile = effectiveDeliveryProfile;
    const smartOriginalEnabled = liveTranscodedForBrowser || isHevcCodec(sourceCodec);
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
      streamTokenExpiresAt: token.expiresAt,
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
        recommendedProtocol: protocolOrder[0],
        protocolOrder,
        reason: smartOriginalEnabled
          ? 'Perfil Live recebido em HEVC; navegador recebe H.264, enquanto gravação permanece no perfil H.265 dedicado.'
          : configuredPreferred === 'webrtc'
            ? 'WebRTC configurado como protocolo principal; LL-HLS/HLS ficam apenas como contingência técnica.'
            : 'Ordem de fallback baseada no protocolo configurado.',
      },
      liveDiagnostics: {
        generatedAt: new Date().toISOString(),
        publicAppUrl: process.env.PUBLIC_APP_URL || null,
        apiPublicUrl: process.env.API_PUBLIC_URL || null,
        mediaMtxPublicHost: process.env.MEDIAMTX_PUBLIC_HOST || null,
        mediaMtxPublicScheme: process.env.MEDIAMTX_PUBLIC_SCHEME || null,
        mediaMtxPublicWebrtcUrl: process.env.MEDIAMTX_PUBLIC_WEBRTC_URL || null,
        mediaMtxPublicHlsUrl: process.env.MEDIAMTX_PUBLIC_HLS_URL || null,
        mediaMtxWebrtcAllowOrigin: process.env.MEDIAMTX_WEBRTC_ALLOW_ORIGIN || null,
        mediaMtxHlsAllowOrigin: process.env.MEDIAMTX_HLS_ALLOW_ORIGIN || null,
        mediamtxEnabled: this.mediamtxProxyService.isEnabled(),
        pathReady: Boolean(safeMediaBridge.enabled && safeMediaBridge.pathName),
        pathName: safeMediaBridge.pathName ?? null,
        sourceVideoCodec: sourceCodec,
        originalVideoCodec: originalCodec,
        liveTranscodedForBrowser,
        liveProfile,
        deliveryProfile,
        preferredProtocol: configuredPreferred,
        protocolOrder,
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
