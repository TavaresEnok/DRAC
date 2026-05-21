import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
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
export class MediamtxProxyService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MediamtxProxyService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly camerasService: CamerasService,
    private readonly cryptoService: CryptoService,
  ) {}

  onApplicationBootstrap() {
    if (!this.isEnabled() || this.configService.get<boolean>('mediaMtxWarmPathsOnBoot') === false) {
      return;
    }

    setTimeout(() => {
      void this.warmCameraPaths();
    }, 3000);
  }

  isEnabled() {
    return this.configService.get<boolean>('mediaMtxEnabled') !== false;
  }

  private sanitizeRtspUrl(url: string) {
    return url.replace(/(rtsp:\/\/[^:]+:)([^@]+)(@)/i, '$1***$3');
  }

  private pathNameFromCameraId(cameraId: string) {
    return `cam_${cameraId.replace(/[^a-zA-Z0-9]/g, '')}`;
  }

  private durationToMilliseconds(value: string | undefined | null) {
    if (!value) return null;
    const matches = [...value.trim().matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/g)];
    if (!matches.length) return null;

    return matches.reduce((total, match) => {
      const amount = Number(match[1]);
      const unit = match[2];
      if (!Number.isFinite(amount)) return total;
      if (unit === 'ms') return total + amount;
      if (unit === 's') return total + amount * 1000;
      if (unit === 'm') return total + amount * 60 * 1000;
      if (unit === 'h') return total + amount * 60 * 60 * 1000;
      return total;
    }, 0);
  }

  private sameDuration(current: string | undefined, desired: string | undefined) {
    if (current === desired) return true;
    const currentMs = this.durationToMilliseconds(current);
    const desiredMs = this.durationToMilliseconds(desired);
    if (currentMs === null || desiredMs === null) return false;
    return currentMs === desiredMs;
  }

  private async apiRequest(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown) {
    const base = this.configService.get<string>('mediaMtxApiBaseUrl') ?? 'http://mediamtx:9997';
    const apiUser = (this.configService.get<string>('mediaMtxApiUser') ?? '').trim();
    const apiPass = (this.configService.get<string>('mediaMtxApiPass') ?? '').trim();
    if (!apiUser || !apiPass) {
      throw new Error('Credenciais da API do MediaMTX não configuradas (MEDIAMTX_API_USER/MEDIAMTX_API_PASS).');
    }
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

  private async getPath(pathName: string) {
    const encodedPath = encodeURIComponent(pathName);
    const text = await this.apiRequest('GET', `/v3/config/paths/get/${encodedPath}`);
    return JSON.parse(text) as {
      source?: string;
      sourceOnDemand?: boolean;
      sourceOnDemandStartTimeout?: string;
      sourceOnDemandCloseAfter?: string;
      rtspTransport?: string;
    };
  }

  private async warmCameraPaths() {
    try {
      const cameras = await this.camerasService.findAllInternal();
      if (!cameras.length) return;

      this.logger.log(`Aquecendo paths MediaMTX para ${cameras.length} câmera(s)...`);
      const results = await Promise.allSettled(
        cameras.map((camera) => this.ensurePathForCamera(camera.id)),
      );
      const warmed = results.filter((result) => result.status === 'fulfilled').length;
      const failed = results.length - warmed;
      if (failed > 0) {
        this.logger.warn(`Aquecimento MediaMTX parcial: ${warmed}/${results.length} path(s) prontos.`);
        return;
      }
      this.logger.log(`Aquecimento MediaMTX concluído: ${warmed}/${results.length} path(s) prontos.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido';
      this.logger.warn(`Falha ao aquecer paths MediaMTX: ${message}`);
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
    const sourceOnDemand = this.configService.get<boolean>('mediaMtxSourceOnDemand') ?? false;
    const sourceOnDemandStartTimeout = this.configService.get<string>('mediaMtxSourceOnDemandStartTimeout') ?? '6s';
    const sourceOnDemandCloseAfter = this.configService.get<string>('mediaMtxSourceOnDemandCloseAfter') ?? '5m';
    const desiredPath = {
      source: sourceUrl,
      sourceOnDemand,
      sourceOnDemandStartTimeout,
      sourceOnDemandCloseAfter,
      rtspTransport: camera.preferredRtspTransport ?? this.configService.get<string>('ffmpegRtspTransport') ?? 'tcp',
    };

    try {
      const current = await this.getPath(pathName);
      const isSamePath =
        current.source === desiredPath.source &&
        current.sourceOnDemand === desiredPath.sourceOnDemand &&
        this.sameDuration(current.sourceOnDemandStartTimeout, desiredPath.sourceOnDemandStartTimeout) &&
        this.sameDuration(current.sourceOnDemandCloseAfter, desiredPath.sourceOnDemandCloseAfter) &&
        current.rtspTransport === desiredPath.rtspTransport;

      if (isSamePath) {
        return { pathName, sourceUrl };
      }
    } catch {
      // Se não existe, cria abaixo. Se a API falhar temporariamente, a criação vai expor o erro real.
    }

    // Só recria quando a configuração mudou; recriar em toda leitura derruba muxers HLS/WebRTC ativos.
    try {
      await this.apiRequest('DELETE', `/v3/config/paths/delete/${encodedPath}`);
    } catch {
      // ignora quando ainda não existe
    }

    await this.apiRequest('POST', `/v3/config/paths/add/${encodedPath}`, desiredPath);

    this.logger.log(`Path MediaMTX pronto ${pathName} -> ${this.sanitizeRtspUrl(sourceUrl)}`);
    return { pathName, sourceUrl };
  }

  buildInternalRtspUrl(pathName: string | null) {
    if (!pathName) return null;
    const base = (this.configService.get<string>('mediaMtxRtspInternalUrl') ?? 'rtsp://mediamtx:8554').replace(/\/+$/, '');
    return `${base}/${pathName}`;
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
