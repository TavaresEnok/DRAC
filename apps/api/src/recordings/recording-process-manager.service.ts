import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationShutdown,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { RecordingSource, type Camera } from '@prisma/client';
import { type Queue } from 'bullmq';
import { execFile, spawn, spawnSync, type ChildProcessByStdio } from 'child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { statfs, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { type Readable } from 'stream';
import { promisify } from 'node:util';
import Redis from 'ioredis';
import { CamerasService } from '../cameras/cameras.service';
import { CommercialPolicyService } from '../commercial-policy/commercial-policy.service';
import { buildRtspUrl, resolveRecordingRtspProfile } from '../cameras/helpers/rtsp-url.helper';
import { CryptoService } from '../common/crypto/crypto.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { buildRecordingOutputDir, buildRecordingOutputPattern } from './helpers/recording-path.helper';
import { THUMBNAIL_GENERATION_QUEUE } from '../jobs/queues/thumbnail-generation.queue';

const execFileAsync = promisify(execFile);

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
  scanInFlight: Promise<void> | null;
  finalizePromise: Promise<void> | null;
};

type WorkerRecordingCommand = {
  action: 'start' | 'stop';
  cameraId: string;
  segmentSeconds?: number;
  requestedAt: string;
};

@Injectable()
export class RecordingProcessManagerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RecordingProcessManagerService.name);
  private readonly active = new Map<string, RecordingProcessState>();
  private readonly recordingsRoot: string;
  private readonly recordingFormat: string;
  private readonly copyCodec: boolean;
  private readonly recordingCodecMode: 'copy' | 'h265' | 'h264';
  private readonly audioCodec: string;
  private readonly controlMode: 'local' | 'worker';
  private readonly workerCommandChannel: string;
  private readonly storageBackend: string;
  private readonly storageWriteProbeEnabled: boolean;
  private readonly minFreeBytes: number;
  private readonly minFreePercent: number;
  private redisPublisher: Redis | null = null;
  private readonly motionStopTimers = new Map<string, NodeJS.Timeout>();
  private diskGuardTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly camerasService: CamerasService,
    private readonly cryptoService: CryptoService,
    private readonly prisma: PrismaService,
    private readonly commercialPolicy: CommercialPolicyService,
    @InjectQueue(THUMBNAIL_GENERATION_QUEUE) private readonly thumbnailQueue: Queue,
  ) {
    this.recordingsRoot = this.configService.get<string>('recordingsRoot') ?? './storage/recordings';
    this.recordingFormat = this.configService.get<string>('ffmpegRecordingFormat') ?? 'mp4';
    this.copyCodec = String(this.configService.get<string>('ffmpegRecordingCopyCodec') ?? 'true') !== 'false';
    const rawCodecMode = String(this.configService.get<string>('recordingCodecMode') ?? 'copy').toLowerCase();
    this.recordingCodecMode = rawCodecMode === 'h265' || rawCodecMode === 'h264' ? rawCodecMode : 'copy';
    this.audioCodec = this.configService.get<string>('ffmpegRecordingAudioCodec') ?? 'aac';
    this.controlMode = (this.configService.get<string>('recordingControlMode') ?? 'local') === 'worker' ? 'worker' : 'local';
    this.workerCommandChannel = this.configService.get<string>('workerCommandChannel') ?? 'camera:commands';
    this.storageBackend = this.configService.get<string>('storageBackend') ?? 'local';
    this.storageWriteProbeEnabled = this.configService.get<boolean>('storageWriteProbeEnabled') ?? true;
    this.minFreeBytes = Number(this.configService.get<number>('recordingMinFreeBytes') ?? 2147483648);
    this.minFreePercent = Number(this.configService.get<number>('recordingMinFreePercent') ?? 5);
  }

  onModuleInit() {
    const diskGuardEnabled = String(process.env.RECORDING_DISK_GUARD_ENABLED ?? 'true') !== 'false';
    if (diskGuardEnabled) {
      const intervalMs = Math.max(10_000, Number(process.env.RECORDING_DISK_GUARD_INTERVAL_MS ?? 30000));
      this.diskGuardTimer = setInterval(() => void this.enforceDiskGuard(), intervalMs);
      if (typeof this.diskGuardTimer.unref === 'function') this.diskGuardTimer.unref();
    }

    const autoStart = String(process.env.RECORDING_AUTO_START_ENABLED ?? 'false') === 'true';
    if (!autoStart) {
      this.logger.log('Auto-start de gravacao continua desativado. Defina RECORDING_AUTO_START_ENABLED=true para religar no boot.');
      return;
    }

    const delayMs = Math.max(0, Number(process.env.RECORDING_AUTO_START_DELAY_MS ?? 10000));
    const timer = setTimeout(() => void this.startEnabledContinuousRecordings(), delayMs);
    if (typeof timer.unref === 'function') timer.unref();
  }

  private async startEnabledContinuousRecordings() {
    const cameras = await this.prisma.camera.findMany({
      where: {
        recordingEnabled: true,
        recordingMode: 'continuous',
      },
      select: { id: true, name: true },
      take: 500,
    });

    if (!cameras.length) {
      this.logger.log('Auto-start de gravacao continua: nenhuma camera habilitada.');
      return;
    }

    const defaultSegment = Number(process.env.RECORDING_SEGMENT_SECONDS ?? 300);
    this.logger.log(`Auto-start de gravacao continua para ${cameras.length} camera(s).`);
    for (const camera of cameras) {
      try {
        await this.start(camera.id, defaultSegment);
      } catch (error) {
        this.logger.warn(`Auto-start de gravacao falhou camera=${camera.name} (${camera.id}): ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private async assertMinimumStorageFree() {
    const { totalBytes, freeBytes, freePercent } = await this.getStorageUsage();
    if (freeBytes < this.minFreeBytes || freePercent < this.minFreePercent) {
      throw new ServiceUnavailableException(
        `Espaço livre insuficiente para iniciar gravação (livre=${Math.round(freeBytes / (1024 * 1024))}MB, mínimo=${Math.round(this.minFreeBytes / (1024 * 1024))}MB, livre%=${freePercent.toFixed(2)}%, mínimo%=${this.minFreePercent}%).`,
      );
    }
  }

  private async getStorageUsage() {
    const disk = await statfs(this.recordingsRoot);
    const totalBytes = Number(disk.blocks) * Number(disk.bsize);
    const freeBytes = Number(disk.bavail) * Number(disk.bsize);
    const freePercent = totalBytes > 0 ? (freeBytes / totalBytes) * 100 : 0;
    const usedPercent = totalBytes > 0 ? 100 - freePercent : 100;
    return { totalBytes, freeBytes, freePercent, usedPercent };
  }

  private async enforceDiskGuard() {
    if (this.active.size === 0 || this.controlMode !== 'local') return;

    try {
      const { freeBytes, freePercent, usedPercent } = await this.getStorageUsage();
      const maxUsedPercent = Number(process.env.RECORDING_DISK_GUARD_MAX_USED_PERCENT ?? 92);
      const critical =
        freeBytes < this.minFreeBytes ||
        freePercent < this.minFreePercent ||
        (Number.isFinite(maxUsedPercent) && usedPercent >= maxUsedPercent);

      if (!critical) return;

      const activeCameraIds = [...this.active.keys()];
      this.logger.error(
        `Guarda de disco parou ${activeCameraIds.length} gravacao(oes): usado=${usedPercent.toFixed(2)}%, livre=${Math.round(
          freeBytes / (1024 * 1024),
        )}MB.`,
      );

      for (const cameraId of activeCameraIds) {
        await this.stop(cameraId).catch((error) => {
          this.logger.warn(`Falha ao parar gravacao por guarda de disco camera=${cameraId}: ${(error as Error).message}`);
        });
      }
    } catch (error) {
      this.logger.warn(`Falha ao executar guarda de disco de gravacao: ${(error as Error).message}`);
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

  private async probeSourceCodec(rtspUrl: string, transport: string): Promise<string | null> {
    return await new Promise((resolve) => {
      const proc = spawn('ffprobe', [
        '-v', 'error',
        '-rtsp_transport', transport,
        '-i', rtspUrl,
        '-select_streams', 'v:0',
        '-show_entries', 'stream=codec_name',
        '-of', 'default=noprint_wrappers=1:nokey=1',
      ]);
      let stdout = '';
      let settled = false;
      const finish = (codec: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(codec);
      };
      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
        finish(null);
      }, 12000);
      timeout.unref();
      proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      proc.on('error', () => finish(null));
      proc.on('close', (code) => {
        const codec = stdout.trim().split('\n')[0]?.trim().toLowerCase() || null;
        finish(code === 0 ? codec : null);
      });
    });
  }

  private sourceIsHevcWithProbe(probedCodec: string | null): boolean {
    return Boolean(probedCodec && (probedCodec.includes('h265') || probedCodec.includes('hevc')));
  }

  private sourceIsH264WithProbe(probedCodec: string | null): boolean {
    return Boolean(probedCodec && (probedCodec.includes('h264') || probedCodec.includes('avc')));
  }

  // Decide o codec de vídeo de saída da gravação a partir do modo configurado.
  // 'copy' arquiva o bitstream original (sem reencode); 'h265'/'h264' só transcodam
  // quando a fonte difere do alvo. Retorna também se a saída final é HEVC, para
  // aplicar a tag hvc1 (obrigatória para HEVC em MP4, inclusive ao copiar).
  private resolveOutputVideoCodec(probedCodec: string | null): { videoCodec: string; transcode: boolean; outputIsHevc: boolean } {
    const sourceIsHevc = this.sourceIsHevcWithProbe(probedCodec);
    const sourceIsH264 = this.sourceIsH264WithProbe(probedCodec);

    if (this.recordingCodecMode === 'h265') {
      return sourceIsHevc
        ? { videoCodec: 'copy', transcode: false, outputIsHevc: true }
        : { videoCodec: 'libx265', transcode: true, outputIsHevc: true };
    }
    if (this.recordingCodecMode === 'h264') {
      return sourceIsH264
        ? { videoCodec: 'copy', transcode: false, outputIsHevc: false }
        : { videoCodec: 'libx264', transcode: true, outputIsHevc: false };
    }
    // 'copy' (padrão): copia a fonte quando é seguro. MAS fonte HEVC NÃO pode
    // ser copiada pro MP4 segmentado — o muxer `segment` não reinjeta VPS/SPS/PPS
    // a cada corte, o ffmpeg falha ("VPS 0 does not exist" / "No start code is
    // found"), sai com código 255 e o arquivo fica corrompido e sem registro no
    // banco. Além disso o navegador não toca HEVC no playback. Então fonte HEVC
    // é transcodada p/ H.264 (mesma decisão dos clipes). H.264 segue em copy.
    if (sourceIsHevc) {
      return { videoCodec: 'libx264', transcode: true, outputIsHevc: false };
    }
    return { videoCodec: 'copy', transcode: false, outputIsHevc: false };
  }

  private buildArgs(camera: Camera, rtspUrl: string, outputPattern: string, segmentSeconds: number, probedCodec: string | null): string[] {
    const transport = camera.preferredRtspTransport ?? this.configService.get<string>('ffmpegRtspTransport') ?? 'tcp';
    const stimeout = String(this.configService.get<number>('ffmpegStimeoutUs') ?? 8000000);
    // O codec de saída segue o modo configurado (padrão 'copy': arquiva a fonte
    // original sem reencode). HEVC em MP4 sempre recebe a tag hvc1, inclusive no
    // copy, senão o arquivo fica com tag hev1/ausente e quebra seek/compat.
    const { videoCodec, transcode: shouldTranscode, outputIsHevc: isH265Output } =
      this.resolveOutputVideoCodec(probedCodec);

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
      '-c:v',
      videoCodec,
      // H.265: use slower preset (medium) for better compression vs H.264 ultrafast
      ...(shouldTranscode && isH265Output ? ['-preset', 'medium', '-crf', '28'] : []),
      // H.264 (modo 'h264' com fonte não-H.264): preset rápido e qualidade alta.
      ...(shouldTranscode && !isH265Output ? ['-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p'] : []),
      // H.265 needs tag for MP4 container compatibility (also when copying HEVC).
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


  private async probeRecordedFileMetadata(filePath: string) {
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration,size',
        '-of',
        'json',
        filePath,
      ], {
        timeout: Math.max(5_000, Number(process.env.RECORDING_METADATA_PROBE_TIMEOUT_MS ?? 15_000)),
        maxBuffer: 1024 * 1024,
      });
      const parsed = JSON.parse(stdout || '{}') as { format?: { duration?: string; size?: string } };
      const duration = Number(parsed.format?.duration);
      const size = Number(parsed.format?.size);
      return {
        durationSecondsExact: Number.isFinite(duration) && duration > 0 ? duration : null,
        sizeBytes: Number.isFinite(size) && size >= 0 ? size : statSync(filePath).size,
      };
    } catch {
      return { durationSecondsExact: null, sizeBytes: statSync(filePath).size };
    }
  }

  private async registerSegment(cameraId: string, filePath: string, segmentSeconds: number) {
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
    const metadata = await this.probeRecordedFileMetadata(filePath);
    const durationSecondsExact = metadata.durationSecondsExact ?? segmentSeconds;
    const durationSeconds = Math.max(1, Math.round(durationSecondsExact));
    const endedAt = new Date(startedAt.getTime() + durationSecondsExact * 1000);
    const sizeBytes = BigInt(metadata.sizeBytes);

    let recording: { id: string };
    let created = false;
    try {
      const existing = await this.prisma.recording.findUnique({ where: { filePath }, select: { id: true } });
      if (existing) {
        recording = await this.prisma.recording.update({
          where: { id: existing.id },
          data: { endedAt, durationSeconds, sizeBytes },
          select: { id: true },
        });
      } else {
        recording = await this.prisma.recording.create({
          data: {
            cameraId,
            source: RecordingSource.LOCAL,
            startedAt,
            endedAt,
            durationSeconds,
            sizeBytes,
            filePath,
          },
          select: { id: true },
        });
        created = true;
      }
    } catch (error) {
      this.logger.warn(`Falha ao registrar segmento camera=${cameraId} arquivo=${fileName}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }

    if (!created) return;
    try {
      await this.thumbnailQueue.add(
        'generate-thumbnail',
        { recordingId: recording.id },
        {
          jobId: `thumb-${recording.id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: true,
          removeOnFail: 200,
        },
      );
    } catch (error) {
      // A miniatura também será recuperada sob demanda quando a gravação for listada.
      this.logger.warn(`Falha ao enfileirar thumbnail recording=${recording.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async performSegmentScan(state: RecordingProcessState, finalize: boolean) {
    const { cameraId, cameraRootDir, segmentSeconds, knownFiles } = state;
    const files: string[] = [];
    const walk = (dir: string) => {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (entry.name.endsWith(`.${this.recordingFormat}`)) files.push(fullPath);
      }
    };

    walk(cameraRootDir);
    files.sort((left, right) => left.localeCompare(right));
    // O arquivo lexicograficamente mais novo é o segmento que o FFmpeg ainda
    // pode estar escrevendo. Ele só é registrado depois da rotação, ou no close.
    const candidates = finalize ? files : files.slice(0, -1);
    for (const fullPath of candidates) {
      if (knownFiles.has(fullPath)) continue;
      if (statSync(fullPath).size <= 0) continue;
      try {
        await this.registerSegment(cameraId, fullPath, segmentSeconds);
        knownFiles.add(fullPath);
      } catch {
        // Mantém fora de knownFiles para uma nova tentativa na próxima varredura.
      }
    }
  }

  private async scanAndRegister(state: RecordingProcessState, finalize = false) {
    if (state.scanInFlight) {
      await state.scanInFlight;
      if (!finalize) return;
    }
    const operation = this.performSegmentScan(state, finalize);
    state.scanInFlight = operation;
    try {
      await operation;
    } catch (error) {
      this.logger.warn(`Falha ao varrer segmentos camera=${state.cameraId}: ${(error as Error).message}`);
    } finally {
      if (state.scanInFlight === operation) state.scanInFlight = null;
    }
  }

  private finalizeRecordingState(cameraId: string, state: RecordingProcessState, exitCode?: number | null) {
    if (state.finalizePromise) return state.finalizePromise;
    state.finalizePromise = (async () => {
      clearInterval(state.watcher);
      await this.scanAndRegister(state, true);
      if (this.active.get(cameraId) === state) this.active.delete(cameraId);
      this.logger.log(`Gravação encerrada camera=${cameraId} code=${exitCode ?? 'null'}`);
    })();
    return state.finalizePromise;
  }

  private async stopProcessAndWait(state: RecordingProcessState) {
    const proc = state.process;
    if (proc.exitCode !== null || proc.signalCode !== null) return;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(forceTimer);
        clearTimeout(giveUpTimer);
        resolve();
      };
      proc.once('close', finish);
      proc.once('error', finish);
      proc.kill('SIGTERM');
      const forceTimer = setTimeout(() => {
        if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL');
      }, 2_500);
      const giveUpTimer = setTimeout(finish, 7_500);
      forceTimer.unref();
      giveUpTimer.unref();
    });
  }

  // Resolve o que gravar em `recordingMode` num start/stop. Uma gravação MANUAL
  // ad-hoc NÃO pode desarmar uma câmera configurada para 'motion' — senão clicar
  // "Gravar" numa câmera com gravação por movimento a deixa em 'manual' para
  // sempre. Então um pedido 'manual' sobre uma câmera 'motion' é ignorado
  // (preserva o armamento). Os demais modos seguem o pedido normalmente.
  private async resolveRecordingModeUpdate(
    cameraId: string,
    requested?: Camera['recordingMode'],
  ): Promise<{ recordingMode?: Camera['recordingMode'] }> {
    if (!requested) return {};
    if (requested === 'manual') {
      const cam = await this.prisma.camera.findUnique({
        where: { id: cameraId },
        select: { recordingMode: true },
      });
      if (cam?.recordingMode === 'motion') return {};
    }
    return { recordingMode: requested };
  }

  async start(cameraId: string, segmentSeconds: number, options?: { recordingMode?: Camera['recordingMode'] }) {
    await this.commercialPolicy.assertFeature('localRecording');
    await this.assertStorageWritable();
    await this.assertMinimumStorageFree();

    if (this.controlMode === 'worker') {
      await this.camerasService.getCameraOrThrow(cameraId).catch(() => {
        throw new NotFoundException('Camera não encontrada.');
      });
      await this.prisma.camera.update({
        where: { id: cameraId },
        data: { recordingEnabled: true, ...(await this.resolveRecordingModeUpdate(cameraId, options?.recordingMode)) },
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

    if (this.active.has(cameraId)) {
      const state = this.active.get(cameraId)!;
      await this.prisma.camera.update({
        where: { id: cameraId },
        data: { recordingEnabled: true, ...(await this.resolveRecordingModeUpdate(cameraId, options?.recordingMode)) },
      });
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
    const recordingTransport = camera.preferredRtspTransport ?? this.configService.get<string>('ffmpegRtspTransport') ?? 'tcp';
    const sourceCodec = await this.probeSourceCodec(rtspUrl, recordingTransport);
    const startDate = new Date();
    const outputDir = buildRecordingOutputDir(this.recordingsRoot, cameraId, startDate);
    const cameraRootDir = join(this.recordingsRoot, `camera-${cameraId}`);
    const outputPattern = buildRecordingOutputPattern(outputDir, this.recordingFormat);

    mkdirSync(outputDir, { recursive: true });

    const args = this.buildArgs(camera, rtspUrl, outputPattern, segmentSeconds, sourceCodec);
    const resolvedOutput = this.resolveOutputVideoCodec(sourceCodec);
    const outputVideoCodec = resolvedOutput.transcode
      ? resolvedOutput.videoCodec
      : `copy-${resolvedOutput.outputIsHevc ? 'hevc' : sourceCodec ?? 'source'}`;
    this.logger.log(`Iniciando gravação camera=${cameraId} mode=${this.recordingCodecMode} sourceCodec=${sourceCodec ?? 'unknown'} output=${outputVideoCodec} rtsp=${this.sanitizeRtspUrl(rtspUrl)}`);

    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let state: RecordingProcessState | null = null;
    proc.stderr.on('data', (chunk) => {
      const msg = chunk.toString().trim();
      if (msg) this.logger.debug(`FFmpeg REC camera=${cameraId}: ${msg}`);
    });

    proc.on('close', (code) => {
      const current = state ?? this.active.get(cameraId);
      if (current) void this.finalizeRecordingState(cameraId, current, code);
    });
    proc.on('error', (error) => {
      this.logger.error(`Falha no processo FFmpeg de gravação camera=${cameraId}: ${error.message}`);
      void this.prisma.camera.update({ where: { id: cameraId }, data: { recordingEnabled: false } }).catch(() => undefined);
      const current = state ?? this.active.get(cameraId);
      if (current) void this.finalizeRecordingState(cameraId, current, proc.exitCode);
    });

    const watcher = setInterval(() => {
      const current = this.active.get(cameraId);
      if (current) {
        void this.scanAndRegister(current);
      }
    }, 5000);
    watcher.unref();

    state = {
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
      scanInFlight: null,
      finalizePromise: null,
    };

    this.active.set(cameraId, state);
    try {
      await this.prisma.camera.update({
        where: { id: cameraId },
        data: { recordingEnabled: true, ...(await this.resolveRecordingModeUpdate(cameraId, options?.recordingMode)) },
      });
    } catch (error) {
      await this.stopProcessAndWait(state);
      await this.finalizeRecordingState(cameraId, state, state.process.exitCode);
      throw error;
    }

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
        data: { recordingEnabled: false, ...(await this.resolveRecordingModeUpdate(cameraId, options?.recordingMode)) },
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
      data: { recordingEnabled: false, ...(await this.resolveRecordingModeUpdate(cameraId, options?.recordingMode)) },
    });

    const state = this.active.get(cameraId);
    if (!state) {
      return {
        status: 'not_recording',
        cameraId,
      };
    }

    clearInterval(state.watcher);
    await this.stopProcessAndWait(state);
    await this.finalizeRecordingState(cameraId, state, state.process.exitCode);

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

  getRuntimeSummary() {
    return {
      activeCount: this.active.size,
      activeCameraIds: Array.from(this.active.keys()),
      controlMode: this.controlMode,
      storageBackend: this.storageBackend,
      recordingFormat: this.recordingFormat,
      copyCodec: this.copyCodec,
      recordingCodecMode: this.recordingCodecMode,
      diskGuardEnabled: String(process.env.RECORDING_DISK_GUARD_ENABLED ?? 'true') !== 'false',
    };
  }

  async stopAll() {
    const cameraIds = [...this.active.keys()];
    for (const cameraId of cameraIds) {
      await this.stop(cameraId);
    }
  }

  killProcessSafely(proc: ChildProcessByStdio<null, null, Readable>) {
    if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
    proc.kill('SIGTERM');
    setTimeout(() => {
      if (proc.exitCode === null && proc.signalCode === null) {
        proc.kill('SIGKILL');
      }
    }, 1500).unref();
  }

  async onApplicationShutdown() {
    for (const timer of this.motionStopTimers.values()) {
      clearTimeout(timer);
    }
    this.motionStopTimers.clear();
    if (this.diskGuardTimer) {
      clearInterval(this.diskGuardTimer);
      this.diskGuardTimer = null;
    }
    if (this.controlMode === 'local') {
      await this.stopAll();
    }
    if (this.redisPublisher) {
      await this.redisPublisher.quit();
      this.redisPublisher = null;
    }
  }
}
