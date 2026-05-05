import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Camera } from '@prisma/client';
import { type Request, type Response } from 'express';
import { spawn, spawnSync, type ChildProcessByStdio } from 'child_process';
import { type Readable } from 'stream';
import { CamerasService } from '../cameras/cameras.service';
import { buildRtspUrl } from '../cameras/helpers/rtsp-url.helper';
import { CryptoService } from '../common/crypto/crypto.service';

type FfmpegStreamConfig = {
  rtspTransport: string;
  stimeoutUs: number;
  maxDelayUs: number;
  probesize: number;
  analyzedurationUs: number;
  mjpegFps: number;
  mjpegQ: number;
};

type StreamMetrics = {
  cameraId: string;
  totalRequests: number;
  successfulStarts: number;
  failedStarts: number;
  fallbackStarts: number;
  activeStreams: number;
  lastStartAt: string | null;
  lastEndAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
};

type RtspTransport = 'tcp' | 'udp' | 'http';
type StreamAttempt = {
  url: string;
  transport: RtspTransport;
  transcodeVideo: boolean;
  label: string;
};

@Injectable()
export class FfmpegMjpegService {
  private readonly logger = new Logger(FfmpegMjpegService.name);
  private readonly config: FfmpegStreamConfig;
  private readonly metrics = new Map<string, StreamMetrics>();
  private readonly incidentCooldownMs: number;
  private readonly incidentLastByCamera = new Map<string, { code: string; at: number }>();

  constructor(
    private readonly configService: ConfigService,
    private readonly camerasService: CamerasService,
    private readonly cryptoService: CryptoService,
  ) {
    this.config = {
      rtspTransport: this.configService.get<string>('ffmpegRtspTransport') ?? 'tcp',
      stimeoutUs: Number(this.configService.get<number>('ffmpegStimeoutUs') ?? 8000000),
      maxDelayUs: Number(this.configService.get<number>('ffmpegMaxDelayUs') ?? 500000),
      probesize: Number(this.configService.get<number>('ffmpegProbesize') ?? 32768),
      analyzedurationUs: Number(this.configService.get<number>('ffmpegAnalyzedurationUs') ?? 1000000),
      mjpegFps: Number(this.configService.get<number>('mjpegFps') ?? 20),
      mjpegQ: Number(this.configService.get<number>('mjpegQ') ?? 5),
    };
    this.incidentCooldownMs = (this.configService.get<number>('streamIncidentCooldownSeconds') ?? 120) * 1000;
  }

  checkFfmpegAvailable() {
    const result = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return result.status === 0;
  }

  private getOrCreateMetrics(cameraId: string): StreamMetrics {
    const current = this.metrics.get(cameraId);
    if (current) return current;
    const created: StreamMetrics = {
      cameraId,
      totalRequests: 0,
      successfulStarts: 0,
      failedStarts: 0,
      fallbackStarts: 0,
      activeStreams: 0,
      lastStartAt: null,
      lastEndAt: null,
      lastError: null,
      lastErrorAt: null,
    };
    this.metrics.set(cameraId, created);
    return created;
  }

  getStreamStats(cameraId?: string) {
    if (cameraId) {
      const metric = this.getOrCreateMetrics(cameraId);
      return {
        ...metric,
        generatedAt: new Date().toISOString(),
      };
    }

    const items = [...this.metrics.values()];
    const totals = items.reduce(
      (acc, item) => {
        acc.totalRequests += item.totalRequests;
        acc.successfulStarts += item.successfulStarts;
        acc.failedStarts += item.failedStarts;
        acc.fallbackStarts += item.fallbackStarts;
        acc.activeStreams += item.activeStreams;
        return acc;
      },
      { totalRequests: 0, successfulStarts: 0, failedStarts: 0, fallbackStarts: 0, activeStreams: 0 },
    );

    return {
      totals,
      cameras: items.sort((a, b) => b.totalRequests - a.totalRequests),
      generatedAt: new Date().toISOString(),
    };
  }

  private async maybeRegisterStreamIncident(cameraId: string, code: string, message: string, severity = 'WARN') {
    const now = Date.now();
    const prev = this.incidentLastByCamera.get(cameraId);
    if (prev && prev.code === code && now - prev.at < this.incidentCooldownMs) {
      return;
    }

    this.incidentLastByCamera.set(cameraId, { code, at: now });
    try {
      await this.camerasService.registerEvent(cameraId, code, severity, message, {
        source: 'camera-stream',
        at: new Date(now).toISOString(),
      });
    } catch (error) {
      this.logger.warn(`Falha ao registrar incidente de stream camera=${cameraId}: ${(error as Error).message}`);
    }
  }

  sanitizeRtspUrl(url: string): string {
    return url.replace(/(rtsp:\/\/[^:]+:)([^@]+)(@)/i, '$1***$3');
  }

  private getTransportCandidates(): RtspTransport[] {
    const raw = [
      this.config.rtspTransport,
      ...(this.configService.get<string>('ffmpegRtspFallbackTransports') ?? 'tcp,udp')
        .split(',')
        .map((item) => item.trim().toLowerCase()),
    ];
    const valid = raw.filter((item): item is RtspTransport => item === 'tcp' || item === 'udp' || item === 'http');
    return Array.from(new Set(valid.length ? valid : ['tcp', 'udp', 'http']));
  }

  buildFfmpegFlvArgs(rtspUrl: string, transport: RtspTransport, transcodeVideo: boolean): string[] {
    const commonInput = [
      '-hide_banner',
      '-loglevel',
      'warning',
      '-rtsp_transport',
      transport,
      '-timeout',
      String(this.config.stimeoutUs),
      '-probesize',
      '65536',
      '-analyzeduration',
      '500000',
      '-err_detect',
      'ignore_err',
      '-i',
      rtspUrl,
    ];

    const videoArgs = transcodeVideo
      ? [
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-tune',
          'zerolatency',
          '-pix_fmt',
          'yuv420p',
          '-g',
          '30',
          '-keyint_min',
          '30',
          '-sc_threshold',
          '0',
        ]
      : [
          '-c:v',
          'copy',
        ];

    return [
      ...commonInput,
      ...videoArgs,
      ...(transcodeVideo ? [] : []),
      '-c:a',
      'aac',
      '-ar',
      '44100',
      '-ac',
      '1',
      '-af',
      'aresample=async=1',
      '-bf',
      '0',
      '-flags',
      'low_delay',
      '-fflags',
      '+genpts+discardcorrupt+nobuffer',
      '-flush_packets',
      '1',
      '-f',
      'flv',
      'pipe:1',
    ];
  }

  private buildAttempts(urls: string[]): StreamAttempt[] {
    const transports = this.getTransportCandidates();
    const copyAttempts: StreamAttempt[] = [];
    const transcodeAttempts: StreamAttempt[] = [];

    for (const transport of transports) {
      for (const [urlIndex, url] of urls.entries()) {
        copyAttempts.push({
          url,
          transport,
          transcodeVideo: false,
          label: `url${urlIndex + 1}-${transport}-copy`,
        });
      }
    }
    for (const transport of transports) {
      for (const [urlIndex, url] of urls.entries()) {
        transcodeAttempts.push({
          url,
          transport,
          transcodeVideo: true,
          label: `url${urlIndex + 1}-${transport}-x264`,
        });
      }
    }

    return [...copyAttempts, ...transcodeAttempts];
  }

  private getRtspPortCandidates(primaryPort: number): number[] {
    const enablePortFallback = this.configService.get<boolean>('ffmpegRtspEnablePortFallback') === true;
    if (!enablePortFallback) {
      return [primaryPort];
    }
    const configured = (this.configService.get<string>('ffmpegRtspFallbackPorts') ?? '')
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((v) => Number.isFinite(v) && v > 0);
    return Array.from(new Set([primaryPort, ...configured, 51488, 51489, 51490]));
  }

  private replaceRtspPort(rtspUrl: string, port: number): string {
    try {
      const parsed = new URL(rtspUrl);
      parsed.port = String(port);
      return parsed.toString();
    } catch {
      return rtspUrl;
    }
  }

  private expandUrlsWithPortFallbacks(urls: string[], primaryPort: number): string[] {
    const ports = this.getRtspPortCandidates(primaryPort);
    const expanded: string[] = [];
    for (const url of urls) {
      for (const port of ports) {
        expanded.push(this.replaceRtspPort(url, port));
      }
    }
    return Array.from(new Set(expanded));
  }

  // Deprecated overload kept internal for compatibility with existing call sites.
  private tryStartFlvProcess(rtspUrl: string, transport: RtspTransport, transcodeVideo: boolean) {
    const ffmpegArgs = this.buildFfmpegFlvArgs(rtspUrl, transport, transcodeVideo);
    return spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  }

  killProcessSafely(proc: ChildProcessByStdio<null, Readable, Readable> | null) {
    if (!proc) return;
    if (proc.killed) return;
    proc.kill('SIGTERM');
    setTimeout(() => {
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
    }, 1500).unref();
  }

  private buildCameraRtspUrl(camera: Camera, password: string, subtypeOverride?: number): string {
    const hasRtspPath = typeof camera.rtspPath === 'string' && camera.rtspPath.trim().length > 0;
    return buildRtspUrl({
      username: camera.username,
      password,
      ip: camera.ip,
      rtspPort: camera.rtspPort,
      rtspPath: hasRtspPath ? camera.rtspPath : undefined,
      channel: camera.channel,
      subtype: subtypeOverride ?? camera.subtype,
    });
  }

  private wireStreamToResponse(
    req: Request,
    res: Response,
    ffmpegProc: ChildProcessByStdio<null, Readable, Readable>,
    onFirstChunk: (chunk: Buffer) => void,
    onEarlyFail: () => void,
  ) {
    let gotFrameData = false;
    const startedAt = Date.now();

    ffmpegProc.stdout.on('data', (chunk) => {
      if (!gotFrameData) {
        gotFrameData = true;
        onFirstChunk(chunk);
        return;
      }
      if (!res.writableEnded) {
        res.write(chunk);
      }
    });

    ffmpegProc.stderr.on('data', (chunk) => {
      const message = chunk.toString().trim();
      if (!message) return;
      this.logger.debug(`FFmpeg: ${message}`);
    });

    const onClose = () => {
      this.killProcessSafely(ffmpegProc);
    };

    req.on('close', onClose);
    res.on('close', onClose);

    ffmpegProc.on('close', () => {
      req.off('close', onClose);
      res.off('close', onClose);
      if (!gotFrameData && Date.now() - startedAt < 5000) {
        onEarlyFail();
        return;
      }
      if (!res.writableEnded) {
        res.end();
      }
    });
  }

  async startFlvStream(cameraId: string, req: Request, res: Response) {
    const metric = this.getOrCreateMetrics(cameraId);
    metric.totalRequests += 1;

    const camera = await this.camerasService.getCameraOrThrow(cameraId).catch(() => {
      metric.failedStarts += 1;
      metric.lastError = 'camera_not_found';
      metric.lastErrorAt = new Date().toISOString();
      throw new NotFoundException('Camera não encontrada.');
    });

    if (!this.checkFfmpegAvailable()) {
      metric.failedStarts += 1;
      metric.lastError = 'ffmpeg_unavailable';
      metric.lastErrorAt = new Date().toISOString();
      void this.maybeRegisterStreamIncident(
        cameraId,
        'STREAM_FFMPEG_UNAVAILABLE',
        'Falha ao iniciar stream: FFmpeg indisponível no servidor.',
        'ERROR',
      );
      throw new ServiceUnavailableException('FFmpeg não está instalado no servidor.');
    }

    const password = this.cryptoService.decrypt(camera.passwordEncrypted);
    const primaryUrl = this.buildCameraRtspUrl(camera, password);
    const fallbackUrl = camera.subtype !== 0 ? this.buildCameraRtspUrl(camera, password, 0) : null;
    const urls = fallbackUrl ? [primaryUrl, fallbackUrl] : [primaryUrl];
    const expandedUrls = this.expandUrlsWithPortFallbacks(urls, camera.rtspPort);
    const attempts = this.buildAttempts(expandedUrls);

    let index = 0;
    let activeProc: ChildProcessByStdio<null, Readable, Readable> | null = null;
    let closed = false;
    let streamStarted = false;
    let streamOpenedForMetrics = false;

    const closeAll = () => {
      if (closed) return;
      closed = true;
      if (streamOpenedForMetrics) {
        metric.activeStreams = Math.max(0, metric.activeStreams - 1);
        metric.lastEndAt = new Date().toISOString();
        streamOpenedForMetrics = false;
      }
      this.killProcessSafely(activeProc);
      activeProc = null;
    };

    req.on('close', closeAll);
    res.on('close', closeAll);

    const startNext = () => {
      if (closed) return;
      if (index >= attempts.length) {
        if (!streamStarted && !res.headersSent) {
          metric.failedStarts += 1;
          metric.lastError = 'all_rtsp_attempts_failed';
          metric.lastErrorAt = new Date().toISOString();
          void this.maybeRegisterStreamIncident(
            cameraId,
            'STREAM_RTSP_START_FAILED',
            'Falha ao iniciar stream FLV após tentativas com RTSP principal/fallback, transportes e transcode.',
            'ERROR',
          );
          res.status(502).json({
            status: 'error',
            message: 'Falha ao iniciar stream FLV.',
          });
          return;
        }
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }

      const attempt = attempts[index++];
      const attemptNumber = index;
      this.logger.log(
        `Iniciando FFmpeg FLV camera=${camera.id} attempt=${attemptNumber}/${attempts.length} mode=${attempt.label} url=${this.sanitizeRtspUrl(attempt.url)}`,
      );
      const proc = this.tryStartFlvProcess(attempt.url, attempt.transport, attempt.transcodeVideo);
      activeProc = proc;

      this.wireStreamToResponse(
        req,
        res,
        proc,
        (firstChunk) => {
          if (!streamStarted && !res.headersSent) {
            streamStarted = true;
            metric.successfulStarts += 1;
            metric.lastStartAt = new Date().toISOString();
            if (attemptNumber > 1) {
              metric.fallbackStarts += 1;
            }
            if (!streamOpenedForMetrics) {
              streamOpenedForMetrics = true;
              metric.activeStreams += 1;
            }
            res.writeHead(200, {
              'Content-Type': 'video/x-flv',
              'Cache-Control': 'no-cache',
              Pragma: 'no-cache',
              Connection: 'keep-alive',
              'Access-Control-Allow-Origin': '*',
            });
          }
          if (!res.writableEnded) {
            res.write(firstChunk);
          }
        },
        () => {
          if (closed) return;
          this.killProcessSafely(proc);
          activeProc = null;
          metric.lastError = `early_stream_failure_attempt_${attemptNumber}`;
          metric.lastErrorAt = new Date().toISOString();
          void this.maybeRegisterStreamIncident(
            cameraId,
            'STREAM_EARLY_FAILURE',
            `Stream interrompido cedo na tentativa ${attemptNumber} (${attempt.label}).`,
          );
          startNext();
        },
      );
    };

    startNext();
  }
}
