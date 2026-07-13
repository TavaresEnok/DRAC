import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { existsSync, mkdirSync } from 'node:fs';
import { rename, rm, stat } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { THUMBNAIL_GENERATION_QUEUE } from '../queues/thumbnail-generation.queue';
import { ensureFileUnderRoot } from '../../recordings/helpers/safe-file.helper';

const execFileAsync = promisify(execFile);

type ThumbnailJobPayload = {
  recordingId: string;
};

@Processor(THUMBNAIL_GENERATION_QUEUE)
@Injectable()
export class ThumbnailGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ThumbnailGenerationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<ThumbnailJobPayload>): Promise<void> {
    const recordingId = job.data?.recordingId;
    if (!recordingId) return;

    const recording = await this.prisma.recording.findUnique({
      where: { id: recordingId },
      select: { id: true, filePath: true, durationSeconds: true },
    });
    if (!recording) return;

    const recordingsRoot = this.configService.get<string>('recordingsRoot') ?? './storage/recordings';
    const inputPath = ensureFileUnderRoot(recordingsRoot, recording.filePath);
    if (!existsSync(inputPath)) {
      this.logger.warn(`Arquivo não encontrado para thumbnail recording=${recordingId}`);
      throw new Error('thumbnail_source_missing');
    }

    const extension = extname(inputPath);
    const outputPath = `${extension ? inputPath.slice(0, -extension.length) : inputPath}.thumb.jpg`;
    mkdirSync(dirname(outputPath), { recursive: true });

    try {
      if ((await stat(outputPath)).size > 0) return;
    } catch {
      // Ainda não existe; gera abaixo.
    }

    const thumbSecondConfig = this.configService.get<number>('recordingThumbnailSecond') ?? 2;
    const seekSeconds = Math.max(0, Math.min(thumbSecondConfig, Math.max(0, (recording.durationSeconds ?? 10) - 0.25)));
    const timeoutMs = Math.max(5_000, Number(process.env.RECORDING_THUMBNAIL_TIMEOUT_MS ?? 20_000));
    const temporaryPath = `${outputPath}.${process.pid}.${String(job.id ?? Date.now())}.tmp.jpg`;

    let lastError: unknown = null;
    try {
      for (const second of [...new Set([seekSeconds, 0])]) {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
        try {
          await execFileAsync('ffmpeg', [
            '-hide_banner',
            '-loglevel',
            'error',
            '-ss',
            String(second),
            '-i',
            inputPath,
            '-frames:v',
            '1',
            '-vf',
            'scale=640:-2',
            '-q:v',
            '3',
            '-y',
            temporaryPath,
          ], {
            timeout: timeoutMs,
            maxBuffer: 1024 * 1024,
          });
          const result = await stat(temporaryPath);
          if (result.size <= 0) throw new Error('FFmpeg produziu imagem vazia.');
          await rename(temporaryPath, outputPath);
          return;
        } catch (error) {
          lastError = error;
        }
      }
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }

    this.logger.warn(`Falha ao gerar thumbnail recording=${recordingId}; o BullMQ fará nova tentativa.`);
    throw new Error(lastError instanceof Error ? `thumbnail_ffmpeg_failed: ${lastError.message}` : 'thumbnail_ffmpeg_failed');
  }
}
