import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Request } from 'express';
import { CamerasService } from '../cameras/cameras.service';
import { buildRtspUrl } from '../cameras/helpers/rtsp-url.helper';
import { CryptoService } from '../common/crypto/crypto.service';

type DeliveryUrls = {
  enabled: boolean;
  pathName: string | null;
  sourceUrl: string | null;
  webrtcUrl: string | null;
  whepUrl: string | null;
  hlsUrl: string | null;
  rtspProxyUrl: string | null;
};

@Injectable()
export class MediamtxProxyService {
  private readonly logger = new Logger(MediamtxProxyService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly camerasService: CamerasService,
    private readonly cryptoService: CryptoService,
  ) {}

  isEnabled() {
    return this.configService.get<boolean>('mediaMtxEnabled') !== false;
  }

  private sanitizeRtspUrl(url: string) {
    return url.replace(/(rtsp:\/\/[^:]+:)([^@]+)(@)/i, '$1***$3');
  }

  private pathNameFromCameraId(cameraId: string) {
    return `cam_${cameraId.replace(/[^a-zA-Z0-9]/g, '')}`;
  }

  private async apiRequest(method: 'POST' | 'DELETE', path: string, body?: unknown) {
    const base = this.configService.get<string>('mediaMtxApiBaseUrl') ?? 'http://mediamtx:9997';
    const apiUser = this.configService.get<string>('mediaMtxApiUser') ?? 'nexusguard';
    const apiPass = this.configService.get<string>('mediaMtxApiPass') ?? 'nexusguard123';
    const basicAuth = Buffer.from(`${apiUser}:${apiPass}`).toString('base64');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${basicAuth}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`MediaMTX API ${method} ${path} failed (${response.status}): ${text.slice(0, 160)}`);
      }
      return await response.text().catch(() => '');
    } finally {
      clearTimeout(timeout);
    }
  }

  async ensurePathForCamera(cameraId: string) {
    if (!this.isEnabled()) {
      return { pathName: null as string | null, sourceUrl: null as string | null };
    }

    const camera = await this.camerasService.getCameraOrThrow(cameraId);
    const password = this.cryptoService.decrypt(camera.passwordEncrypted);
    const sourceUrl = buildRtspUrl({
      username: camera.username,
      password,
      ip: camera.ip,
      rtspPort: camera.rtspPort,
      rtspPath: camera.rtspPath,
      channel: camera.channel,
      subtype: camera.subtype,
    });

    const pathName = this.pathNameFromCameraId(cameraId);
    const encodedPath = encodeURIComponent(pathName);

    // Recria para garantir sincronismo com alterações de credencial/porta/path.
    try {
      await this.apiRequest('DELETE', `/v3/config/paths/delete/${encodedPath}`);
    } catch {
      // ignora quando ainda não existe
    }

    await this.apiRequest('POST', `/v3/config/paths/add/${encodedPath}`, {
      source: sourceUrl,
      sourceOnDemand: true,
      sourceOnDemandStartTimeout: '10s',
      sourceOnDemandCloseAfter: '20s',
      rtspTransport: this.configService.get<string>('ffmpegRtspTransport') ?? 'tcp',
    });

    this.logger.log(`Path MediaMTX pronto ${pathName} -> ${this.sanitizeRtspUrl(sourceUrl)}`);
    return { pathName, sourceUrl };
  }

  buildPublicUrls(req: Request, pathName: string | null, sourceUrl: string | null): DeliveryUrls {
    const enabled = this.isEnabled() && Boolean(pathName);
    if (!enabled || !pathName) {
      return {
        enabled: false,
        pathName: null,
        sourceUrl,
        webrtcUrl: null,
        whepUrl: null,
        hlsUrl: null,
        rtspProxyUrl: null,
      };
    }

    const hostHeader = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host ?? 'localhost';
    const requestHost = hostHeader.split(',')[0].trim().split(':')[0];
    const host = this.configService.get<string>('mediaMtxPublicHost') || requestHost || 'localhost';
    const reqProto = ((req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol ?? 'http')
      .split(',')[0]
      .trim();
    const scheme = this.configService.get<string>('mediaMtxPublicScheme') || reqProto || 'http';
    const webrtcPort = this.configService.get<number>('mediaMtxWebrtcPort') ?? 8889;
    const hlsPort = this.configService.get<number>('mediaMtxHlsPort') ?? 8888;

    return {
      enabled: true,
      pathName,
      sourceUrl,
      webrtcUrl: `${scheme}://${host}:${webrtcPort}/${pathName}/`,
      whepUrl: `${scheme}://${host}:${webrtcPort}/${pathName}/whep`,
      hlsUrl: `${scheme}://${host}:${hlsPort}/${pathName}/index.m3u8`,
      rtspProxyUrl: `rtsp://${host}:8554/${pathName}`,
    };
  }
}
