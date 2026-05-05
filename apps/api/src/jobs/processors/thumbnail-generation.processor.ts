import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, extname } from 'node:path';
import { spawnSync } from 'child_process';
import { PrismaService } from '../../common/prisma/prisma.service';
import { THUMBNAIL_GENERATION_QUEUE } from '../queues/thumbnail-generation.queue';
import { ensureFileUnderRoot } from '../../recordings/helpers/safe-file.helper';

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
      return;
    }

    const outputPath = `${inputPath.replace(new RegExp(`${extname(inputPath)}$`), '')}.thumb.jpg`;
    mkdirSync(dirname(outputPath), { recursive: true });

    const thumbSecondConfig = this.configService.get<number>('recordingThumbnailSecond') ?? 2;
    const seekSeconds = Math.max(0, Math.min(thumbSecondConfig, (recording.durationSeconds ?? 10) - 1));

    const ffmpeg = spawnSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-ss',
        String(seekSeconds),
        '-i',
        inputPath,
        '-frames:v',
        '1',
        '-vf',
        'scale=640:-1',
        '-q:v',
        '3',
        '-y',
        outputPath,
      ],
      { stdio: 'pipe' },
    );

    if (ffmpeg.status !== 0) {
      this.logger.warn(`Falha ao gerar thumbnail recording=${recordingId}`);
    }
  }
}
