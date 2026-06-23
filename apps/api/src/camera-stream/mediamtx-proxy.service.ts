import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { type Request } from 'express';
import { CamerasService } from '../cameras/cameras.service';
import {
  buildRtspUrl,
  isHevcCodec,
  resolveLiveRtspProfile,
} from '../cameras/helpers/rtsp-url.helper';
import { CryptoService } from '../common/crypto/crypto.service';
import {
  GRID_LIVE_MAX_HEIGHT,
  GRID_LIVE_MAX_WIDTH,
  GRID_LIVE_TARGET_FPS,
  type LiveViewMode,
} from './helpers/live-delivery-profile.helper';

type DeliveryUrls = {
  enabled: boolean;
  pathName: string | null;
  sourceUrl: string | null;
  webrtcUrl: string | null;
  whepUrl: string | null;
  hlsUrl: string | null;
  rtspProxyUrl: string | null;
};

type EnsuredCameraPath = {
  pathName: string | null;
  sourceUrl: string | null;
  sourceVideoCodec: string | null;
  transcodedForLive: boolean;
  liveProfile: { channel: number; subtype: number } | null;
  deliveryMode: LiveViewMode;
};

@Injectable()
export class MediamtxProxyService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MediamtxProxyService.name);
  private readonly liveCodecCache = new Map<string, { isHevc: boolean; at: number }>();
  private readonly pathEnsureInFlight = new Map<string, Promise<EnsuredCameraPath>>();
  private readonly pathEnsureCache = new Map<string, { value: EnsuredCameraPath; at: number }>();
  private static readonly LIVE_CODEC_TTL_MS = 30 * 60 * 1000;
  private static readonly PATH_ENSURE_TTL_MS = 30 * 1000;

  constructor(
    private readonly configService: ConfigService,
    private readonly camerasService: CamerasService,
    private readonly cryptoService: CryptoService,
  ) {}

  onApplicationBootstrap() {
    if (!this.isEnabled() || this.configService.get<boolean>('mediaMtxWarmPathsOnBoot') === false) {
      return;
    }

    void this.warmCameraPaths();
  }

  isEnabled() {
    return this.configService.get<boolean>('mediaMtxEnabled') !== false;
  }

  private sanitizeRtspUrl(url: string) {
    return url.replace(/(rtsp:\/\/[^:]+:)([^@]+)(@)/i, '$1***$3');
  }

  private buildInternalPublishRtspUrl(pathName = '$MTX_PATH') {
    const publishUser = (this.configService.get<string>('mediaMtxApiUser') ?? '').trim();
    const publishPass = (this.configService.get<string>('mediaMtxApiPass') ?? '').trim();
    if (!publishUser || !publishPass) {
      throw new Error('Credenciais de publish do MediaMTX nao configuradas (MEDIAMTX_API_USER/MEDIAMTX_API_PASS).');
    }
    return `rtsp://${encodeURIComponent(publishUser)}:${encodeURIComponent(publishPass)}@localhost:$RTSP_PORT/${pathName}`;
  }

  private shellQuote(value: string) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }

  private pathNameFromCameraId(cameraId: string, deliveryMode: LiveViewMode = 'selected') {
    const base = `cam_${cameraId.replace(/[^a-zA-Z0-9]/g, '')}`;
    return deliveryMode === 'grid' ? `${base}_grid` : base;
  }

  getPathNameForCamera(cameraId: string, deliveryMode: LiveViewMode = 'selected') {
    return this.pathNameFromCameraId(cameraId, deliveryMode);
  }

  private buildEnsureKey(cameraId: string, deliveryMode: LiveViewMode) {
    return `${cameraId}:${deliveryMode}`;
  }

  invalidateMainCodecCache(cameraId: string) {
    for (const key of this.liveCodecCache.keys()) {
      if (key.startsWith(`${cameraId}:`)) this.liveCodecCache.delete(key);
    }
    for (const key of [...this.pathEnsureCache.keys()]) {
      if (key.startsWith(`${cameraId}:`)) this.pathEnsureCache.delete(key);
    }
    for (const key of [...this.pathEnsureInFlight.keys()]) {
      if (key.startsWith(`${cameraId}:`)) this.pathEnsureInFlight.delete(key);
    }
  }

  // Sonda o codec do stream via ffprobe (assíncrono, não bloqueia o event loop).
  // Retorna null se falhar (câmera offline/instável), para o chamador decidir o fallback.
  probeStreamVideoCodec(sourceUrl: string, transport: string): Promise<string | null> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      try {
        const proc = spawn('ffprobe', [
          '-v', 'error',
          '-rtsp_transport', transport,
          '-i', sourceUrl,
          '-select_streams', 'v:0',
          '-show_entries', 'stream=codec_name',
          '-of', 'default=noprint_wrappers=1:nokey=1',
        ]);
        let stdout = '';
        proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        const killTimer = setTimeout(() => {
          try { proc.kill('SIGKILL'); } catch { /* ignore */ }
          finish(null);
        }, 12000);
        killTimer.unref();
        proc.on('error', () => { clearTimeout(killTimer); finish(null); });
        proc.on('close', (code) => {
          clearTimeout(killTimer);
          const codec = stdout.trim().split('\n')[0].trim().toLowerCase();
          if (code !== 0 || !codec) return finish(null);
          finish(codec);
        });
      } catch {
        finish(null);
      }
    });
  }

  private async probeStreamIsHevc(sourceUrl: string, transport: string): Promise<boolean | null> {
    const codec = await this.probeStreamVideoCodec(sourceUrl, transport);
    if (!codec) return null;
    return isHevcCodec(codec);
  }

  // Decide se o stream de Live é H.265 (precisa transcode). Usa cache curto para
  // não sondar a câmera a cada requisição de URLs. Em falha de probe, assume H.265
  // (transcode sempre entrega vídeo ao navegador; o pior caso é só custo de CPU).
  private async resolveLiveStreamIsHevc(cacheKey: string, sourceUrl: string, transport: string): Promise<boolean> {
    const cached = this.liveCodecCache.get(cacheKey);
    if (cached && Date.now() - cached.at < MediamtxProxyService.LIVE_CODEC_TTL_MS) {
      return cached.isHevc;
    }
    const probed = await this.probeStreamIsHevc(sourceUrl, transport);
    if (probed === null) {
      return true;
    }
    this.liveCodecCache.set(cacheKey, { isHevc: probed, at: Date.now() });
    return probed;
  }

  private async chooseLiveSource(cameraId: string, camera: any, password: string, transport: string) {
    const configuredProfile = resolveLiveRtspProfile(camera);
    const updatedAt = camera.updatedAt instanceof Date ? camera.updatedAt.toISOString() : String(camera.updatedAt ?? '');
    const sourceUrl = buildRtspUrl({
      username: camera.username,
      password,
      ip: camera.ip,
      rtspPort: camera.rtspPort,
      rtspPath: camera.rtspPath,
      channel: configuredProfile.channel,
      subtype: configuredProfile.subtype,
    });
    const cacheKey = `${cameraId}:${configuredProfile.channel}:${configuredProfile.subtype}:${updatedAt}`;
    // getStatus() detects the configured Live profile, so this value is the
    // source codec we need here. Reusing it avoids an ffprobe before every
    // first live after API restart.
    const detectedCodec = String(camera.detectedVideoCodec ?? '').trim().toLowerCase();
    const isHevc = detectedCodec
      ? isHevcCodec(detectedCodec)
      : await this.resolveLiveStreamIsHevc(cacheKey, sourceUrl, transport);

    // A fonte Live e uma escolha operacional explicita. HEVC e convertido
    // para o navegador, mas nunca trocado silenciosamente por outro subtype.
    return { profile: configuredProfile, sourceUrl, isHevc };
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

  async getPathRuntimeSummaryForCamera(cameraId: string) {
    const pathName = this.pathNameFromCameraId(cameraId);
    if (!this.isEnabled()) {
      return {
        pathName,
        available: false,
        ready: false,
        readerCount: 0,
        readers: [] as Array<{ id: string | null; protocol: string | null; remoteAddr: string | null }>,
        bytesReceived: null as number | null,
        bytesSent: null as number | null,
        error: 'MediaMTX desabilitado.',
      };
    }

    try {
      const encodedPath = encodeURIComponent(pathName);
      const text = await this.apiRequest('GET', `/v3/paths/get/${encodedPath}`);
      const data = JSON.parse(text) as Record<string, any>;
      const rawReaders = Array.isArray(data.readers)
        ? data.readers
        : data.readers && typeof data.readers === 'object'
          ? Object.values(data.readers)
          : [];

      const readers = rawReaders.map((reader: any) => ({
        id: typeof reader?.id === 'string' ? reader.id : null,
        protocol: typeof reader?.type === 'string'
          ? reader.type
          : typeof reader?.protocol === 'string'
            ? reader.protocol
            : null,
        remoteAddr: typeof reader?.remoteAddr === 'string'
          ? reader.remoteAddr.replace(/:\d+$/, ':*')
          : null,
      }));

      return {
        pathName,
        available: true,
        ready: Boolean(data.ready ?? data.sourceReady ?? data.source?.ready),
        readerCount: readers.length,
        readers,
        bytesReceived: Number.isFinite(Number(data.bytesReceived)) ? Number(data.bytesReceived) : null,
        bytesSent: Number.isFinite(Number(data.bytesSent)) ? Number(data.bytesSent) : null,
        error: null as string | null,
      };
    } catch (error) {
      return {
        pathName,
        available: false,
        ready: false,
        readerCount: 0,
        readers: [] as Array<{ id: string | null; protocol: string | null; remoteAddr: string | null }>,
        bytesReceived: null as number | null,
        bytesSent: null as number | null,
        error: error instanceof Error ? error.message : 'Falha ao consultar runtime do MediaMTX.',
      };
    }
  }

  private async warmCameraPaths() {
    try {
      const cameras = await this.camerasService.findAllInternal();
      if (!cameras.length) return;

      this.logger.log(`Aquecendo paths MediaMTX para ${cameras.length} câmera(s)...`);
      let nextIndex = 0;
      let warmed = 0;
      let failed = 0;
      const workerCount = Math.min(4, cameras.length);
      await Promise.all(Array.from({ length: workerCount }, async () => {
        while (nextIndex < cameras.length) {
          const camera = cameras[nextIndex++];
          try {
            await Promise.all([
              this.ensurePathForCamera(camera.id, 'selected'),
              this.ensurePathForCamera(camera.id, 'grid'),
            ]);
            warmed += 1;
          } catch {
            failed += 1;
          }
        }
      }));
      if (failed > 0) {
        this.logger.warn(`Aquecimento MediaMTX parcial: ${warmed}/${cameras.length} path(s) prontos.`);
        return;
      }
      this.logger.log(`Aquecimento MediaMTX concluído: ${warmed}/${cameras.length} path(s) prontos.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido';
      this.logger.warn(`Falha ao aquecer paths MediaMTX: ${message}`);
    }
  }

  ensurePathForCamera(cameraId: string, deliveryMode: LiveViewMode = 'selected'): Promise<EnsuredCameraPath> {
    const ensureKey = this.buildEnsureKey(cameraId, deliveryMode);
    const cached = this.pathEnsureCache.get(ensureKey);
    if (cached && Date.now() - cached.at < MediamtxProxyService.PATH_ENSURE_TTL_MS) {
      return Promise.resolve(cached.value);
    }

    const existing = this.pathEnsureInFlight.get(ensureKey);
    if (existing) return existing;

    const request = this.configurePathForCamera(cameraId, deliveryMode)
      .then((value) => {
        this.pathEnsureCache.set(ensureKey, { value, at: Date.now() });
        return value;
      })
      .finally(() => {
        if (this.pathEnsureInFlight.get(ensureKey) === request) {
          this.pathEnsureInFlight.delete(ensureKey);
        }
      });
    this.pathEnsureInFlight.set(ensureKey, request);
    return request;
  }

  private async configurePathForCamera(cameraId: string, deliveryMode: LiveViewMode): Promise<EnsuredCameraPath> {
    if (!this.isEnabled()) {
      return {
        pathName: null as string | null,
        sourceUrl: null as string | null,
        sourceVideoCodec: null as string | null,
        transcodedForLive: false,
        liveProfile: null as { channel: number; subtype: number } | null,
        deliveryMode,
      };
    }

    const camera = await this.camerasService.getCameraOrThrow(cameraId);
    const password = this.cryptoService.decrypt(camera.passwordEncrypted);

    const pathName = this.pathNameFromCameraId(cameraId, deliveryMode);
    const encodedPath = encodeURIComponent(pathName);
    const sourceOnDemand = this.configService.get<boolean>('mediaMtxSourceOnDemand') ?? false;
    const sourceOnDemandStartTimeout = this.configService.get<string>('mediaMtxSourceOnDemandStartTimeout') ?? '6s';
    const sourceOnDemandCloseAfter = this.configService.get<string>('mediaMtxSourceOnDemandCloseAfter') ?? '5m';
    const runOnDemandCloseAfter = this.configService.get<string>('mediaMtxRunOnDemandCloseAfter') ?? '5m';
    const rtspTransport = camera.preferredRtspTransport ?? this.configService.get<string>('ffmpegRtspTransport') ?? 'tcp';

    // A Live respeita exatamente o perfil configurado. Se ele for HEVC,
    // somente o codec de entrega ao navegador e convertido para H.264.
    const selectedLive = await this.chooseLiveSource(cameraId, camera, password, rtspTransport);
    const liveProfile = selectedLive.profile;
    const sourceUrl = selectedLive.sourceUrl;
    const isHevc = selectedLive.isHevc;
    const transcodeAudioForWebrtc = deliveryMode === 'selected' && Boolean(camera.audioEnabled);
    const needsPublisher = deliveryMode === 'grid' || isHevc || transcodeAudioForWebrtc;

    const desiredPath: any = {
      source: sourceUrl,
      sourceOnDemand,
      sourceOnDemandStartTimeout,
      sourceOnDemandCloseAfter,
      rtspTransport,
    };

    if (needsPublisher) {
      // Navegadores não reproduzem H.265 via WebRTC/HLS, e WebRTC não aceita o AAC
      // vindo dessas câmeras neste pipeline. O source vira 'publisher' e runOnDemand
      // sobe um ffmpeg que publica H.264 + Opus quando áudio estiver habilitado.
      desiredPath.source = 'publisher';
      // O publisher tambem normaliza H.264 quando ja precisa abrir FFmpeg para
      // o audio. Copiar um stream com fragmentos RTP perdidos repassa quadros
      // quebrados ao navegador e pode deixar a imagem verde ate o proximo IDR.
      const gridScaleFilter =
        `scale=w=${GRID_LIVE_MAX_WIDTH}:h=${GRID_LIVE_MAX_HEIGHT}:force_original_aspect_ratio=decrease:force_divisible_by=2,` +
        `fps=${GRID_LIVE_TARGET_FPS}`;
      const videoArgs = deliveryMode === 'grid'
        ? '-threads 4 -c:v libx264 -preset ultrafast -tune zerolatency -profile:v main ' +
          '-b:v 1800k -maxrate 1800k -bufsize 3600k -pix_fmt yuv420p ' +
          `-g 40 -keyint_min 20 -sc_threshold 0 -bf 0 -refs 1 -vf "${gridScaleFilter}"`
        : '-threads 4 -c:v libx264 -preset ultrafast -tune zerolatency -profile:v main ' +
          '-b:v 2500k -maxrate 2500k -bufsize 5000k -pix_fmt yuv420p ' +
          '-g 30 -keyint_min 15 -sc_threshold 0 -bf 0 -refs 1';
      const audioArgs = transcodeAudioForWebrtc
        ? '-c:a libopus -ar 48000 -ac 2 -application lowdelay -b:a 96k'
        : '-an';
      // MediaMTX preenche $MTX_PATH e $RTSP_PORT automaticamente para o script.
      // -threads 4: limita libx264 a 4 threads por câmera (3 câmeras × 4 = 12 threads totais).
      // Sem este limite, libx264 cria automaticamente N threads = nº de núcleos lógicos,
      // causando 3 × 14 = 42 threads encode + 3 × 15 = 45 threads decode competindo,
      // sobrecarregando C0/C1 por efeito de scheduler clustering.
      const publishUrl = this.buildInternalPublishRtspUrl(pathName);
      const ffmpegCommand =
        `ffmpeg -nostdin -hide_banner -loglevel warning -fflags +genpts+discardcorrupt+nobuffer ` +
        // -analyzeduration/-probesize: o padrão do FFmpeg analisa até 5s/5MB do input
        // antes de começar a transcodificar. Para câmeras H.264/H.265 conhecidas isso é
        // exagero e adiciona vários segundos ao COLD START (quando o runOnDemand reabre
        // após os 5 min de runOnDemandCloseAfter). 1s/1MB já identifica o stream com
        // folga e corta esse atraso, deixando o retorno à câmera bem mais rápido.
        // +nobuffer evita o buffer de entrada extra do FFmpeg (menor latência ao vivo).
        `-analyzeduration 1000000 -probesize 1000000 ` +
        // careful: validates bitstream integrity and drops malformed packets
        // instead of passing corrupted NAL units downstream (which causes
        // green frames in the browser until the next IDR keyframe arrives).
        `-flags low_delay -err_detect careful -rtsp_transport ${rtspTransport} ` +
        `-i "${sourceUrl}" -map 0:v:0 -map 0:a:0? ${videoArgs} ${audioArgs} ` +
        `-f rtsp -rtsp_transport tcp -muxdelay 0.1 -pkt_size 1200 "${publishUrl}"`;
      const lockPath = `/tmp/drac-mtx-${pathName}.lock`;
      desiredPath.runOnDemand = `flock -n ${lockPath} -c ${this.shellQuote(`exec ${ffmpegCommand}`)}`;
      desiredPath.runOnDemandRestart = false;
      desiredPath.runOnDemandStartTimeout = '15s'; // Tempo para o ffmpeg começar a republicar.
      // Mantém o restream recente aquecido. Assim, voltar para uma câmera não
      // exige iniciar FFmpeg e aguardar um novo keyframe outra vez.
      desiredPath.runOnDemandCloseAfter = runOnDemandCloseAfter;
      // Com runOnDemand como publisher, estes campos 'sourceOnDemand' são inválidos.
      delete desiredPath.sourceOnDemand;
      delete desiredPath.sourceOnDemandStartTimeout;
      delete desiredPath.sourceOnDemandCloseAfter;
    }

    try {
      const current: any = await this.getPath(pathName);
      const hasSameSource =
        current.source === desiredPath.source &&
        current.rtspTransport === desiredPath.rtspTransport;
      const hasSameCameraSourceSettings = needsPublisher
        ? true
        : current.sourceOnDemand === desiredPath.sourceOnDemand &&
          this.sameDuration(current.sourceOnDemandStartTimeout, desiredPath.sourceOnDemandStartTimeout) &&
          this.sameDuration(current.sourceOnDemandCloseAfter, desiredPath.sourceOnDemandCloseAfter);
      const hasSamePublisherSettings = needsPublisher
        ? (current.runOnDemand || '') === (desiredPath.runOnDemand || '') &&
          Boolean(current.runOnDemandRestart) === Boolean(desiredPath.runOnDemandRestart) &&
          this.sameDuration(current.runOnDemandStartTimeout, desiredPath.runOnDemandStartTimeout) &&
          this.sameDuration(current.runOnDemandCloseAfter, desiredPath.runOnDemandCloseAfter)
        : true;
      const isSamePath = hasSameSource && hasSameCameraSourceSettings && hasSamePublisherSettings;

      if (isSamePath) {
        return {
          pathName,
          sourceUrl,
          sourceVideoCodec: isHevc ? 'h265' : 'h264',
          transcodedForLive: deliveryMode === 'grid' ? true : isHevc,
          liveProfile,
          deliveryMode,
        };
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
    return {
      pathName,
      sourceUrl,
      sourceVideoCodec: isHevc ? 'h265' : 'h264',
      transcodedForLive: deliveryMode === 'grid' ? true : isHevc,
      liveProfile,
      deliveryMode,
    };
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
    const configuredWebrtcBase = (this.configService.get<string>('mediaMtxPublicWebrtcUrl') ?? '').replace(/\/+$/, '');
    const configuredHlsBase = (this.configService.get<string>('mediaMtxPublicHlsUrl') ?? '').replace(/\/+$/, '');
    const webrtcPort = this.configService.get<number>('mediaMtxWebrtcPort') ?? 8889;
    const hlsPort = this.configService.get<number>('mediaMtxHlsPort') ?? 8888;
    const webrtcBase = configuredWebrtcBase || `${scheme}://${host}:${webrtcPort}`;
    const hlsBase = configuredHlsBase || `${scheme}://${host}:${hlsPort}`;

    return {
      enabled: true,
      pathName,
      sourceUrl,
      webrtcUrl: `${webrtcBase}/${pathName}/`,
      whepUrl: `${webrtcBase}/${pathName}/whep`,
      hlsUrl: `${hlsBase}/${pathName}/index.m3u8`,
      rtspProxyUrl: `rtsp://${host}:8554/${pathName}`,
    };
  }
}
