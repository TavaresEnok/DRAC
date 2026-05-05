import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Camera } from '@prisma/client';
import { spawn, spawnSync, type ChildProcessByStdio } from 'child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { type Readable } from 'stream';
import Redis from 'ioredis';
import { CamerasService } from '../cameras/cameras.service';
import { buildRtspUrl } from '../cameras/helpers/rtsp-url.helper';
import { CryptoService } from '../common/crypto/crypto.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { buildRecordingOutputDir, buildRecordingOutputPattern } from './helpers/recording-path.helper';

export type RecordingProcessState = {
  cameraId: string;
  process: ChildProcessByStdio<null, null, Readable>;
  startedAt: Date;
  outputDir: string;
  cameraRootDir: string;
  outputPattern: string;
  segmentSeconds: number;
  pid: number;
  watcher: NodeJS.Timeout;
  knownFiles: Set<string>;
  pendingSizes: Map<string, number>;
};

type WorkerRecordingCommand = {
  action: 'start' | 'stop';
  cameraId: string;
  segmentSeconds?: number;
  requestedAt: string;
};

@Injectable()
export class RecordingProcessManagerService implements OnApplicationShutdown {
  private readonly logger = new Logger(RecordingProcessManagerService.name);
  private readonly active = new Map<string, RecordingProcessState>();
  private readonly recordingsRoot: string;
  private readonly recordingFormat: string;
  private readonly copyCodec: boolean;
  private readonly audioCodec: string;
  private readonly controlMode: 'local' | 'worker';
  private readonly workerCommandChannel: string;
  private redisPublisher: Redis | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly camerasService: CamerasService,
    private readonly cryptoService: CryptoService,
    private readonly prisma: PrismaService,
  ) {
    this.recordingsRoot = this.configService.get<string>('recordingsRoot') ?? './storage/recordings';
    this.recordingFormat = this.configService.get<string>('ffmpegRecordingFormat') ?? 'mp4';
    this.copyCodec = String(this.configService.get<string>('ffmpegRecordingCopyCodec') ?? 'true') !== 'false';
    this.audioCodec = this.configService.get<string>('ffmpegRecordingAudioCodec') ?? 'aac';
    this.controlMode = (this.configService.get<string>('recordingControlMode') ?? 'local') === 'worker' ? 'worker' : 'local';
    this.workerCommandChannel = this.configService.get<string>('workerCommandChannel') ?? 'camera:commands';
  }

  private async getRedisPublisher() {
    if (this.redisPublisher) return this.redisPublisher;
    const host = this.configService.get<string>('redisHost') ?? 'localhost';
    const port = Number(this.configService.get<number>('redisPort') ?? 6379);
    this.redisPublisher = new Redis({ host, port, lazyConnect: true, maxRetriesPerRequest: 2 });
    await this.redisPublisher.connect();
    return this.redisPublisher;
  }

  private async publishWorkerCommand(command: WorkerRecordingCommand) {
    const redis = await this.getRedisPublisher();
    await redis.publish(this.workerCommandChannel, JSON.stringify(command));
  }

  checkFfmpegAvailable(): boolean {
    const result = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return result.status === 0;
  }

  sanitizeRtspUrl(url: string): string {
    return url.replace(/(rtsp:\/\/[^:]+:)([^@]+)(@)/i, '$1***$3');
  }

  private buildRtsp(camera: Camera, password: string): string {
    return buildRtspUrl({
      username: camera.username,
      password,
      ip: camera.ip,
      rtspPort: camera.rtspPort,
      rtspPath: camera.rtspPath ?? undefined,
      channel: camera.channel,
      subtype: camera.subtype,
    });
  }

  private buildArgs(rtspUrl: string, outputPattern: string, segmentSeconds: number): string[] {
    const transport = this.configService.get<string>('ffmpegRtspTransport') ?? 'tcp';
    const stimeout = String(this.configService.get<number>('ffmpegStimeoutUs') ?? 8000000);
    const args = [
      '-hide_banner',
      '-loglevel',
      'warning',
      '-rtsp_transport',
      transport,
      '-stimeout',
      stimeout,
      '-i',
      rtspUrl,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      ...(this.copyCodec ? ['-c:v', 'copy'] : []),
      '-c:a',
      this.audioCodec,
      '-ar',
      '44100',
      '-ac',
      '1',
      '-f',
      'segment',
      '-segment_time',
      String(segmentSeconds),
      '-reset_timestamps',
      '1',
      '-strftime',
      '1',
      outputPattern,
    ];
    return args;
  }

  private async registerSegment(cameraId: string, filePath: string, segmentSeconds: number, sizeBytesNumber?: number) {
    const fileName = basename(filePath);
    const match = fileName.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\./);
    if (!match) return;

    const startedAt = new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6]),
      ),
    );
    const endedAt = new Date(startedAt.getTime() + segmentSeconds * 1000);
    const sizeBytes = BigInt(sizeBytesNumber ?? statSync(filePath).size);

    try {
      await this.prisma.recording.create({
        data: {
          cameraId,
          startedAt,
          endedAt,
          durationSeconds: segmentSeconds,
          sizeBytes,
          filePath,
        },
      });
    } catch {
      // Duplicidade protegida por unique(filePath)
    }
  }

  private scanAndRegister(state: RecordingProcessState) {
    const { cameraId, cameraRootDir, segmentSeconds, knownFiles, pendingSizes } = state;
    const walk = (dir: string) => {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (!entry.name.endsWith(`.${this.recordingFormat}`) || knownFiles.has(fullPath)) continue;
        const stats = statSync(fullPath);
        if (stats.size <= 0) continue;
        const lastSeenSize = pendingSizes.get(fullPath);
        if (lastSeenSize == null || lastSeenSize !== stats.size) {
          pendingSizes.set(fullPath, stats.size);
          continue;
        }
        pendingSizes.delete(fullPath);
        knownFiles.add(fullPath);
        void this.registerSegment(cameraId, fullPath, segmentSeconds, stats.size);
      }
    };

    try {
      walk(cameraRootDir);
    } catch (error) {
      this.logger.warn(`Falha ao varrer segmentos camera=${cameraId}: ${(error as Error).message}`);
    }
  }

  async start(cameraId: string, segmentSeconds: number) {
    if (this.controlMode === 'worker') {
      await this.camerasService.getCameraOrThrow(cameraId).catch(() => {
        throw new NotFoundException('Camera não encontrada.');
      });
      await this.prisma.camera.update({
        where: { id: cameraId },
        data: { recordingEnabled: true },
      });
      await this.publishWorkerCommand({
        action: 'start',
        cameraId,
        segmentSeconds,
        requestedAt: new Date().toISOString(),
      });
      return {
        status: 'recording_start_requested',
        cameraId,
        segmentSeconds,
        mode: 'worker',
      };
    }

    if (this.active.has(cameraId)) {
      const state = this.active.get(cameraId)!;
      return {
        status: 'already_recording',
        cameraId,
        segmentSeconds: state.segmentSeconds,
      };
    }

    if (!this.checkFfmpegAvailable()) {
      throw new ServiceUnavailableException('FFmpeg não está instalado no servidor.');
    }

    const camera = await this.camerasService.getCameraOrThrow(cameraId).catch(() => {
      throw new NotFoundException('Camera não encontrada.');
    });

    const password = this.cryptoService.decrypt(camera.passwordEncrypted);
    const rtspUrl = this.buildRtsp(camera, password);
    const startDate = new Date();
    const outputDir = buildRecordingOutputDir(this.recordingsRoot, cameraId, startDate);
    const cameraRootDir = join(this.recordingsRoot, `camera-${cameraId}`);
    const outputPattern = buildRecordingOutputPattern(outputDir, this.recordingFormat);

    mkdirSync(outputDir, { recursive: true });

    const args = this.buildArgs(rtspUrl, outputPattern, segmentSeconds);
    this.logger.log(`Iniciando gravação camera=${cameraId} rtsp=${this.sanitizeRtspUrl(rtspUrl)}`);

    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    proc.stderr.on('data', (chunk) => {
      const msg = chunk.toString().trim();
      if (msg) this.logger.debug(`FFmpeg REC camera=${cameraId}: ${msg}`);
    });

    proc.on('close', (code) => {
      this.logger.log(`Gravação encerrada camera=${cameraId} code=${code ?? 'null'}`);
      const state = this.active.get(cameraId);
      if (state) {
        clearInterval(state.watcher);
        this.scanAndRegister(state);
        this.active.delete(cameraId);
      }
    });

    const watcher = setInterval(() => {
      const current = this.active.get(cameraId);
      if (current) {
        this.scanAndRegister(current);
      }
    }, 5000);
    watcher.unref();

    const state: RecordingProcessState = {
      cameraId,
      process: proc,
      startedAt: startDate,
      outputDir,
      cameraRootDir,
      outputPattern,
      segmentSeconds,
      pid: proc.pid ?? -1,
      watcher,
      knownFiles: new Set<string>(),
      pendingSizes: new Map<string, number>(),
    };

    this.active.set(cameraId, state);

    return {
      status: 'recording_started',
      cameraId,
      segmentSeconds,
    };
  }

  async stop(cameraId: string) {
    if (this.controlMode === 'worker') {
      await this.camerasService.getCameraOrThrow(cameraId).catch(() => {
        throw new NotFoundException('Camera não encontrada.');
      });
      await this.prisma.camera.update({
        where: { id: cameraId },
        data: { recordingEnabled: false },
      });
      await this.publishWorkerCommand({
        action: 'stop',
        cameraId,
        requestedAt: new Date().toISOString(),
      });
      return {
        status: 'recording_stop_requested',
        cameraId,
        mode: 'worker',
      };
    }

    const state = this.active.get(cameraId);
    if (!state) {
      return {
        status: 'not_recording',
        cameraId,
      };
    }

    clearInterval(state.watcher);
    this.killProcessSafely(state.process);
    this.scanAndRegister(state);
    this.active.delete(cameraId);

    return {
      status: 'recording_stopped',
      cameraId,
    };
  }

  async getStatus(cameraId: string) {
    const latestRecording = await this.prisma.recording.findFirst({
      where: { cameraId },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true, endedAt: true, filePath: true },
    });
    const inferredRecentRecording = latestRecording
      ? Date.now() - new Date(latestRecording.endedAt ?? latestRecording.startedAt).getTime() < 15 * 60 * 1000
      : false;

    if (this.controlMode === 'worker') {
      const cam = await this.prisma.camera.findUnique({ where: { id: cameraId }, select: { recordingEnabled: true } });
      return {
        cameraId,
        isRecording: Boolean(cam?.recordingEnabled) || inferredRecentRecording,
        startedAt: latestRecording?.startedAt?.toISOString() ?? null,
        pid: null,
        currentOutputPattern: latestRecording?.filePath ?? null,
        mode: 'worker',
      };
    }

    const state = this.active.get(cameraId);
    if (!state) {
      return {
        cameraId,
        isRecording: inferredRecentRecording,
        startedAt: latestRecording?.startedAt?.toISOString() ?? null,
        pid: null,
        currentOutputPattern: latestRecording?.filePath ?? null,
      };
    }

    return {
      cameraId,
      isRecording: true,
      startedAt: state.startedAt.toISOString(),
      pid: state.pid,
      currentOutputPattern: state.outputPattern,
    };
  }

  async stopAll() {
    const cameraIds = [...this.active.keys()];
    for (const cameraId of cameraIds) {
      await this.stop(cameraId);
    }
  }

  killProcessSafely(proc: ChildProcessByStdio<null, null, Readable>) {
    if (!proc || proc.killed) return;
    proc.kill('SIGTERM');
    setTimeout(() => {
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
    }, 1500).unref();
  }

  async onApplicationShutdown() {
    if (this.controlMode === 'local') {
      await this.stopAll();
    }
    if (this.redisPublisher) {
      await this.redisPublisher.quit();
      this.redisPublisher = null;
    }
  }
}
