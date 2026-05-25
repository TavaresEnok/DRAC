import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecordingSource, type Camera } from '@prisma/client';
import { spawn, spawnSync, type ChildProcessByStdio } from 'child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { statfs, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { type Readable } from 'stream';
import Redis from 'ioredis';
import { CamerasService } from '../cameras/cameras.service';
import { buildRtspUrl, resolveRecordingRtspProfile } from '../cameras/helpers/rtsp-url.helper';
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
  private readonly storageBackend: string;
  private readonly storageWriteProbeEnabled: boolean;
  private readonly minFreeBytes: number;
  private readonly minFreePercent: number;
  private redisPublisher: Redis | null = null;
  private readonly motionStopTimers = new Map<string, NodeJS.Timeout>();

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
    this.storageBackend = this.configService.get<string>('storageBackend') ?? 'local';
    this.storageWriteProbeEnabled = this.configService.get<boolean>('storageWriteProbeEnabled') ?? true;
    this.minFreeBytes = Number(this.configService.get<number>('recordingMinFreeBytes') ?? 2147483648);
    this.minFreePercent = Number(this.configService.get<number>('recordingMinFreePercent') ?? 5);
  }

  private async assertMinimumStorageFree() {
    const disk = await statfs(this.recordingsRoot);
    const totalBytes = Number(disk.blocks) * Number(disk.bsize);
    const freeBytes = Number(disk.bavail) * Number(disk.bsize);
    const freePercent = totalBytes > 0 ? (freeBytes / totalBytes) * 100 : 0;
    if (freeBytes < this.minFreeBytes || freePercent < this.minFreePercent) {
      throw new ServiceUnavailableException(
        `Espaço livre insuficiente para iniciar gravação (livre=${Math.round(freeBytes / (1024 * 1024))}MB, mínimo=${Math.round(this.minFreeBytes / (1024 * 1024))}MB, livre%=${freePercent.toFixed(2)}%, mínimo%=${this.minFreePercent}%).`,
      );
    }
  }

  private async assertStorageWritable() {
    if (!this.storageWriteProbeEnabled) return;
    const now = Date.now();
    const probePath = join(this.recordingsRoot, `.write-probe-${now}-${Math.random().toString(36).slice(2)}.tmp`);
    try {
      await writeFile(probePath, `probe:${now}`);
      await unlink(probePath);
    } catch (error) {
      throw new ServiceUnavailableException(
        `Storage (${this.storageBackend}) indisponível para escrita em ${this.recordingsRoot}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private getRecordingStaleThresholdSeconds(segmentSeconds?: number | null) {
    const configuredThreshold = Number(process.env.RECORDING_STALE_THRESHOLD_SECONDS ?? 180);
    const defaultSegmentSeconds = Number(this.configService.get<number>('recordingSegmentSeconds') ?? 300);
    const effectiveSegmentSeconds = Number(segmentSeconds && segmentSeconds > 0 ? segmentSeconds : defaultSegmentSeconds);
    const graceSeconds = Math.max(60, Math.round(effectiveSegmentSeconds * 0.25));
    return Math.max(configuredThreshold, effectiveSegmentSeconds + graceSeconds);
  }

  private getMotionPostRollSeconds() {
    const configured = Number(process.env.MOTION_RECORDING_POST_ROLL_SECONDS ?? 60);
    return Number.isFinite(configured) && configured > 0 ? configured : 60;
  }

  private getMotionSegmentSeconds() {
    const configured = Number(process.env.MOTION_RECORDING_SEGMENT_SECONDS ?? 60);
    return Number.isFinite(configured) && configured > 0 ? configured : 60;
  }

  private clearMotionStopTimer(cameraId: string) {
    const timer = this.motionStopTimers.get(cameraId);
    if (timer) {
      clearTimeout(timer);
      this.motionStopTimers.delete(cameraId);
    }
  }

  private scheduleMotionStop(cameraId: string, postRollSeconds: number) {
    this.clearMotionStopTimer(cameraId);
    const timer = setTimeout(() => {
      void this.stopMotionRecordingAfterQuiet(cameraId, postRollSeconds);
    }, postRollSeconds * 1000);
    timer.unref();
    this.motionStopTimers.set(cameraId, timer);
  }

  private async stopMotionRecordingAfterQuiet(cameraId: string, postRollSeconds: number) {
    this.motionStopTimers.delete(cameraId);
    const camera = await this.prisma.camera.findUnique({
      where: { id: cameraId },
      select: { recordingMode: true, recordingEnabled: true },
    });
    if (!camera || camera.recordingMode !== 'motion' || !camera.recordingEnabled) return;

    try {
      await this.stop(cameraId);
      await this.camerasService.registerEvent(
        cameraId,
        'MOTION_RECORDING_STOPPED',
        'INFO',
        `Gravação por movimento encerrada após ${postRollSeconds}s sem novo movimento.`,
        { postRollSeconds },
      );
    } catch (error) {
      this.logger.warn(`Falha ao parar gravação por movimento camera=${cameraId}: ${(error as Error).message}`);
    }
  }

  async handleMotionDetected(cameraId: string, metadata?: Record<string, unknown>) {
    const camera = await this.prisma.camera.findUnique({
      where: { id: cameraId },
      select: { id: true, name: true, recordingMode: true, recordingEnabled: true },
    });
    if (!camera) throw new NotFoundException('Camera não encontrada.');
    if (camera.recordingMode !== 'motion') {
      return { status: 'ignored', reason: 'motion_recording_not_enabled', cameraId };
    }

    const postRollSeconds = this.getMotionPostRollSeconds();
    const segmentSeconds = this.getMotionSegmentSeconds();
    const runtimeStatus = await this.getStatus(cameraId).catch(() => ({ isRecording: false }));
    let startStatus = 'already_recording';

    if (!runtimeStatus.isRecording) {
      try {
        const result = await this.start(cameraId, segmentSeconds);
        startStatus = result.status;
        await this.camerasService.registerEvent(
          cameraId,
          'MOTION_RECORDING_STARTED',
          'INFO',
          `Gravação por movimento iniciada. Ela será mantida até ${postRollSeconds}s após o último movimento.`,
          { postRollSeconds, segmentSeconds, trigger: metadata ?? {} },
        );
      } catch (error) {
        await this.camerasService.registerEvent(
          cameraId,
          'MOTION_RECORDING_FAILED',
          'WARNING',
          'Falha ao iniciar gravação por movimento.',
          { error: error instanceof Error ? error.message : 'unknown_error', trigger: metadata ?? {} },
        );
        throw error;
      }
    }

    this.scheduleMotionStop(cameraId, postRollSeconds);
    return {
      status: startStatus,
      cameraId,
      mode: 'motion',
      postRollSeconds,
      segmentSeconds,
    };
  }

  async setMotionRecording(cameraId: string, enabled: boolean) {
    await this.camerasService.getCameraOrThrow(cameraId).catch(() => {
      throw new NotFoundException('Camera não encontrada.');
    });

    if (enabled) {
      this.clearMotionStopTimer(cameraId);
      await this.stop(cameraId).catch(() => undefined);
      await this.prisma.camera.update({
        where: { id: cameraId },
        data: { recordingMode: 'motion', recordingEnabled: false },
      });
      return { status: 'motion_recording_armed', cameraId };
    }

    this.clearMotionStopTimer(cameraId);
    await this.stop(cameraId).catch(() => undefined);
    await this.prisma.camera.update({
      where: { id: cameraId },
      data: { recordingMode: 'manual', recordingEnabled: false },
    });
    return { status: 'motion_recording_disabled', cameraId };
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
    const recordingProfile = resolveRecordingRtspProfile(camera);
    return buildRtspUrl({
      username: camera.username,
      password,
      ip: camera.ip,
      rtspPort: camera.rtspPort,
      rtspPath: camera.rtspPath ?? undefined,
      channel: recordingProfile.channel,
      subtype: recordingProfile.subtype,
    });
  }

  private getSourceCodec(camera: Camera): string {
    const recording = (camera.recordingVideoCodec ?? '').toLowerCase();
    if (recording && recording !== 'original' && recording !== 'copy') {
      return recording;
    }
    const configured = (camera.streamVideoCodec ?? '').toLowerCase();
    const detected = (camera.detectedVideoCodec ?? '').toLowerCase();
    return (!configured || configured === 'original') ? detected : configured;
  }

  private sourceIsHevc(camera: Camera): boolean {
    const codec = this.getSourceCodec(camera);
    return codec.includes('h265') || codec.includes('hevc') || codec.includes('265');
  }

  private shouldTranscodeRecording(camera: Camera): boolean {
    // Always transcode if user set explicit dimensions/fps/bitrate
    if (
      camera.recordingWidth ||
      camera.recordingHeight ||
      camera.recordingFps ||
      camera.recordingBitrateKbps ||
      (camera.recordingVideoCodec && !['copy', 'original'].includes(camera.recordingVideoCodec))
    ) {
      return true;
    }
    // H.264 cameras: transcode to H.265 for ~50% disk savings
    // H.265 cameras: copy as-is (no re-encoding needed)
    if (!this.copyCodec) return true;
    return !this.sourceIsHevc(camera);
  }

  private buildArgs(camera: Camera, rtspUrl: string, outputPattern: string, segmentSeconds: number): string[] {
    const transport = camera.preferredRtspTransport ?? this.configService.get<string>('ffmpegRtspTransport') ?? 'tcp';
    const stimeout = String(this.configService.get<number>('ffmpegStimeoutUs') ?? 8000000);
    const shouldTranscode = this.shouldTranscodeRecording(camera);

    // Determine target codec for recording:
    // - Explicit user setting takes priority
    // - H.264 source → libx265 (saves ~50% disk with same quality)
    // - H.265 source → copy (already efficient)
    // - Unknown source → libx265 (safe default for storage efficiency)
    let videoCodec: string;
    if (camera.recordingVideoCodec && !['copy', 'original'].includes(camera.recordingVideoCodec)) {
      const recordingCodec = camera.recordingVideoCodec.toLowerCase();
      videoCodec =
        ['h265', 'hevc'].includes(recordingCodec) ? 'libx265' :
        recordingCodec === 'mjpeg' ? 'mjpeg' :
        'libx264';
    } else {
      // Auto: H.264 → H.265, everything else copy
      videoCodec = this.sourceIsHevc(camera) ? 'copy' : 'libx265';
    }

    const isH265Output = videoCodec === 'libx265';

    const args = [
      '-hide_banner',
      '-loglevel',
      'warning',
      '-rtsp_transport',
      transport,
      '-timeout',
      stimeout,
      '-i',
      rtspUrl,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      ...(shouldTranscode ? ['-c:v', videoCodec] : ['-c:v', 'copy']),
      // H.265: use slower preset (medium) for better compression vs H.264 ultrafast
      ...(shouldTranscode && isH265Output ? ['-preset', 'medium', '-crf', '28'] : []),
      // H.264 (fallback if explicit): ultrafast
      ...(shouldTranscode && videoCodec === 'libx264' ? ['-preset', 'ultrafast'] : []),
      // H.265 needs tag for MP4 container compatibility
      ...(isH265Output ? ['-tag:v', 'hvc1'] : []),
      ...(shouldTranscode && camera.recordingWidth && camera.recordingHeight
        ? ['-vf', `scale=${camera.recordingWidth}:${camera.recordingHeight}`]
        : []),
      ...(shouldTranscode && camera.recordingFps ? ['-r', String(camera.recordingFps)] : []),
      ...(shouldTranscode && camera.recordingBitrateKbps
        ? ['-b:v', `${camera.recordingBitrateKbps}k`, '-maxrate', `${camera.recordingBitrateKbps}k`]
        : []),
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
          source: RecordingSource.LOCAL,
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

  async start(cameraId: string, segmentSeconds: number, options?: { recordingMode?: Camera['recordingMode'] }) {
    await this.assertStorageWritable();
    await this.assertMinimumStorageFree();

    if (this.controlMode === 'worker') {
      await this.camerasService.getCameraOrThrow(cameraId).catch(() => {
        throw new NotFoundException('Camera não encontrada.');
      });
      await this.prisma.camera.update({
        where: { id: cameraId },
        data: { recordingEnabled: true, ...(options?.recordingMode ? { recordingMode: options.recordingMode } : {}) },
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

    const camera = await this.camerasService.getCameraOrThrow(cameraId).catch(() => {
      throw new NotFoundException('Camera não encontrada.');
    });
    await this.prisma.camera.update({
      where: { id: cameraId },
      data: { recordingEnabled: true, ...(options?.recordingMode ? { recordingMode: options.recordingMode } : {}) },
    });

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

    const password = this.cryptoService.decrypt(camera.passwordEncrypted);
    const rtspUrl = this.buildRtsp(camera, password);
    const startDate = new Date();
    const outputDir = buildRecordingOutputDir(this.recordingsRoot, cameraId, startDate);
    const cameraRootDir = join(this.recordingsRoot, `camera-${cameraId}`);
    const outputPattern = buildRecordingOutputPattern(outputDir, this.recordingFormat);

    mkdirSync(outputDir, { recursive: true });

    const args = this.buildArgs(camera, rtspUrl, outputPattern, segmentSeconds);
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

  async stop(cameraId: string, options?: { recordingMode?: Camera['recordingMode'] }) {
    if (this.controlMode === 'worker') {
      await this.camerasService.getCameraOrThrow(cameraId).catch(() => {
        throw new NotFoundException('Camera não encontrada.');
      });
      await this.prisma.camera.update({
        where: { id: cameraId },
        data: { recordingEnabled: false, ...(options?.recordingMode ? { recordingMode: options.recordingMode } : {}) },
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

    await this.camerasService.getCameraOrThrow(cameraId).catch(() => {
      throw new NotFoundException('Camera não encontrada.');
    });
    await this.prisma.camera.update({
      where: { id: cameraId },
      data: { recordingEnabled: false, ...(options?.recordingMode ? { recordingMode: options.recordingMode } : {}) },
    });

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
    const nowMs = Date.now();
    const latestRecording = await this.prisma.recording.findFirst({
      where: { cameraId },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true, endedAt: true, filePath: true },
    });
    const cam = await this.prisma.camera.findUnique({ where: { id: cameraId }, select: { recordingEnabled: true } });
    const lastSegmentAtMs = latestRecording ? new Date(latestRecording.endedAt ?? latestRecording.startedAt).getTime() : null;
    const lastSegmentAgeSeconds = lastSegmentAtMs == null ? null : Math.max(0, Math.floor((nowMs - lastSegmentAtMs) / 1000));
    const inferredRecentRecording = lastSegmentAgeSeconds != null && lastSegmentAgeSeconds < 15 * 60;
    const staleThresholdSeconds = this.getRecordingStaleThresholdSeconds();
    const reconnectGraceSeconds = Math.max(staleThresholdSeconds, 180);
    const reconnectGraceAt = new Date(nowMs - reconnectGraceSeconds * 1000);
    const latestReconnectEvent = await this.prisma.cameraEvent.findFirst({
      where: {
        cameraId,
        type: {
          in: [
            'HEALTH_RECORDING_RECONNECT_REQUESTED',
            'HEALTH_RECORDING_RECONNECT_SUCCESS',
            'HEALTH_RECORDING_RECONNECT_FAILED',
          ],
        },
      },
      orderBy: { occurredAt: 'desc' },
      select: { type: true, occurredAt: true },
    });

    if (this.controlMode === 'worker') {
      const intended = Boolean(cam?.recordingEnabled);
      const isRecording = intended && inferredRecentRecording;
      const staleCandidate = intended && (lastSegmentAgeSeconds == null ? true : lastSegmentAgeSeconds > staleThresholdSeconds);
      const autoRecovering = Boolean(
        staleCandidate &&
        latestReconnectEvent &&
        latestReconnectEvent.occurredAt >= reconnectGraceAt &&
        (latestReconnectEvent.type === 'HEALTH_RECORDING_RECONNECT_REQUESTED' ||
          latestReconnectEvent.type === 'HEALTH_RECORDING_RECONNECT_SUCCESS'),
      );
      const stale = staleCandidate && !autoRecovering;
      return {
        cameraId,
        isRecording,
        intendedRecording: intended,
        startedAt: latestRecording?.startedAt?.toISOString() ?? null,
        lastSegmentAt: lastSegmentAtMs == null ? null : new Date(lastSegmentAtMs).toISOString(),
        lastSegmentAgeSeconds,
        staleThresholdSeconds,
        stale,
        statusDetail: !intended ? 'disabled' : autoRecovering ? 'auto_reconnecting' : isRecording ? 'recording_ok' : 'worker_enabled_but_no_recent_segment',
        pid: null,
        currentOutputPattern: latestRecording?.filePath ?? null,
        mode: 'worker',
      };
    }

    const state = this.active.get(cameraId);
    if (!state) {
      const intended = Boolean(cam?.recordingEnabled);
      const isRecording = intended && inferredRecentRecording;
      const staleCandidate = intended && (lastSegmentAgeSeconds == null ? true : lastSegmentAgeSeconds > staleThresholdSeconds);
      const autoRecovering = Boolean(
        staleCandidate &&
        latestReconnectEvent &&
        latestReconnectEvent.occurredAt >= reconnectGraceAt &&
        (latestReconnectEvent.type === 'HEALTH_RECORDING_RECONNECT_REQUESTED' ||
          latestReconnectEvent.type === 'HEALTH_RECORDING_RECONNECT_SUCCESS'),
      );
      const stale = staleCandidate && !autoRecovering;
      return {
        cameraId,
        isRecording,
        intendedRecording: intended,
        startedAt: latestRecording?.startedAt?.toISOString() ?? null,
        lastSegmentAt: lastSegmentAtMs == null ? null : new Date(lastSegmentAtMs).toISOString(),
        lastSegmentAgeSeconds,
        staleThresholdSeconds,
        stale,
        statusDetail: !intended ? 'disabled' : autoRecovering ? 'auto_reconnecting' : isRecording ? 'recording_ok' : 'enabled_but_idle',
        pid: null,
        currentOutputPattern: latestRecording?.filePath ?? null,
      };
    }

    return {
      cameraId,
      isRecording: true,
      intendedRecording: true,
      startedAt: state.startedAt.toISOString(),
      lastSegmentAt: lastSegmentAtMs == null ? null : new Date(lastSegmentAtMs).toISOString(),
      lastSegmentAgeSeconds,
      staleThresholdSeconds,
      stale: false,
      statusDetail: 'recording_ok_local_process',
      pid: state.pid,
      currentOutputPattern: state.outputPattern,
    };
  }

  async getStatuses(cameraIds: string[]) {
    const uniqueIds = [...new Set(cameraIds)].filter((id) => id.trim().length > 0).slice(0, 500);
    const items = await Promise.all(uniqueIds.map((cameraId) => this.getStatus(cameraId)));
    const staleCount = items.filter((item: any) => item.stale).length;
    const recordingCount = items.filter((item: any) => item.isRecording).length;
    return {
      items,
      total: items.length,
      staleCount,
      recordingCount,
      generatedAt: new Date().toISOString(),
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
    for (const timer of this.motionStopTimers.values()) {
      clearTimeout(timer);
    }
    this.motionStopTimers.clear();
    if (this.controlMode === 'local') {
      await this.stopAll();
    }
    if (this.redisPublisher) {
      await this.redisPublisher.quit();
      this.redisPublisher = null;
    }
  }
}
