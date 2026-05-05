import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { type Response } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Queue } from 'bullmq';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { AuthService } from '../auth/auth.service';
import { type AuthUser } from '../common/types/auth-user.type';
import { THUMBNAIL_GENERATION_QUEUE } from '../jobs/queues/thumbnail-generation.queue';
import { ListRecordingsQueryDto } from './dto/list-recordings-query.dto';
import { RegisterRecordingDto } from './dto/register-recording.dto';
import { ExportClipDto } from './dto/export-clip.dto';
import { ensureFileUnderRoot } from './helpers/safe-file.helper';

const execFileAsync = promisify(execFile);

@Injectable()
export class RecordingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly accessControlService: AccessControlService,
    @InjectQueue(THUMBNAIL_GENERATION_QUEUE) private readonly thumbnailQueue: Queue,
  ) {}

  async ensureRecordingExists(recordingId: string) {
    const recording = await this.prisma.recording.findUnique({ where: { id: recordingId }, include: { camera: true } });
    if (!recording) {
      throw new NotFoundException('Gravação não encontrada.');
    }
    return recording;
  }

  async list(query: ListRecordingsQueryDto, accessibleCameraIds?: string[]) {
    let from = query.from ? new Date(query.from) : undefined;
    let to = query.to ? new Date(query.to) : undefined;

    if (query.date && !from && !to) {
      from = new Date(query.date);
      from.setHours(0, 0, 0, 0);
      to = new Date(query.date);
      to.setHours(23, 59, 59, 999);
    }
    const where = {
      ...(query.cameraId ? { cameraId: query.cameraId } : {}),
      ...(accessibleCameraIds ? { cameraId: { in: accessibleCameraIds } } : {}),
      ...(from || to
        ? {
            startedAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const order = query.sort === 'asc' ? 'asc' : 'desc';

    const [items, total] = await Promise.all([
      this.prisma.recording.findMany({ where, orderBy: { startedAt: order }, take: limit, skip: offset }),
      this.prisma.recording.count({ where }),
    ]);

    return {
      items: items.map((item: any) => ({
        id: item.id,
        cameraId: item.cameraId,
        startedAt: item.startedAt,
        endedAt: item.endedAt,
        durationSeconds: item.durationSeconds,
        sizeBytes: item.sizeBytes ? item.sizeBytes.toString() : null,
        playUrl: `/recordings/${item.id}/play`,
        thumbnailUrl: `/recordings/${item.id}/thumbnail`,
      })),
      total,
    };
  }

  async streamRecording(recordingId: string, res: Response) {
    const recording = await this.ensureRecordingExists(recordingId);

    const recordingsRoot = process.env.RECORDINGS_ROOT ?? './storage/recordings';
    const filePath = ensureFileUnderRoot(recordingsRoot, recording.filePath);
    if (!existsSync(filePath)) {
      throw new NotFoundException('Arquivo de gravação não encontrado no disco.');
    }

    const stats = statSync(filePath);
    const fileSize = stats.size;
    const range = res.req.headers.range;

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');

    if (!range) {
      res.setHeader('Content-Length', fileSize);
      createReadStream(filePath).pipe(res);
      return;
    }

    const [startText, endText] = range.replace(/bytes=/, '').split('-');
    const start = Number(startText);
    const end = endText ? Number(endText) : fileSize - 1;
    const validStart = Number.isNaN(start) ? 0 : Math.max(0, start);
    const validEnd = Number.isNaN(end) ? fileSize - 1 : Math.min(end, fileSize - 1);

    if (validStart >= fileSize || validStart > validEnd) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }

    res.status(206);
    res.setHeader('Content-Range', `bytes ${validStart}-${validEnd}/${fileSize}`);
    res.setHeader('Content-Length', validEnd - validStart + 1);
    createReadStream(filePath, { start: validStart, end: validEnd }).pipe(res);
  }

  private async ensureCompatibleFile(recordingId: string) {
    const recording = await this.ensureRecordingExists(recordingId);
    const recordingsRoot = process.env.RECORDINGS_ROOT ?? './storage/recordings';
    const inputPath = ensureFileUnderRoot(recordingsRoot, recording.filePath);
    if (!existsSync(inputPath)) {
      throw new NotFoundException('Arquivo de gravação não encontrado no disco.');
    }

    const cacheDir = join(recordingsRoot, '.playback-compatible', recording.cameraId);
    mkdirSync(cacheDir, { recursive: true });
    const outputPath = join(cacheDir, `${recording.id}.mp4`);
    if (existsSync(outputPath) && statSync(outputPath).size > 0) {
      return outputPath;
    }

    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-i',
        inputPath,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-profile:v',
        'baseline',
        '-level',
        '3.1',
        '-pix_fmt',
        'yuv420p',
        '-vf',
        'scale=min(1280\\,iw):-2',
        '-c:a',
        'aac',
        '-ar',
        '44100',
        '-ac',
        '1',
        '-movflags',
        '+faststart',
        outputPath,
      ]);
    } catch (error) {
      throw new InternalServerErrorException(error instanceof Error ? error.message : 'Falha ao gerar playback compatível.');
    }

    if (!existsSync(outputPath)) {
      throw new InternalServerErrorException('Falha ao gerar arquivo compatível para playback.');
    }
    return outputPath;
  }

  async streamRecordingCompatible(recordingId: string, res: Response) {
    const filePath = await this.ensureCompatibleFile(recordingId);
    const stats = statSync(filePath);
    const fileSize = stats.size;
    const range = res.req.headers.range;

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');

    if (!range) {
      res.setHeader('Content-Length', fileSize);
      createReadStream(filePath).pipe(res);
      return;
    }

    const [startText, endText] = range.replace(/bytes=/, '').split('-');
    const start = Number(startText);
    const end = endText ? Number(endText) : fileSize - 1;
    const validStart = Number.isNaN(start) ? 0 : Math.max(0, start);
    const validEnd = Number.isNaN(end) ? fileSize - 1 : Math.min(end, fileSize - 1);

    if (validStart >= fileSize || validStart > validEnd) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }

    res.status(206);
    res.setHeader('Content-Range', `bytes ${validStart}-${validEnd}/${fileSize}`);
    res.setHeader('Content-Length', validEnd - validStart + 1);
    createReadStream(filePath, { start: validStart, end: validEnd }).pipe(res);
  }

  async downloadRecording(recordingId: string, res: Response) {
    const recording = await this.ensureRecordingExists(recordingId);

    const recordingsRoot = process.env.RECORDINGS_ROOT ?? './storage/recordings';
    const filePath = ensureFileUnderRoot(recordingsRoot, recording.filePath);
    if (!existsSync(filePath)) {
      throw new NotFoundException('Arquivo de gravação não encontrado no disco.');
    }

    res.setHeader('Content-Disposition', `attachment; filename="recording-${recording.id}.mp4"`);
    createReadStream(filePath).pipe(res);
  }
  
  async registerInternal(dto: RegisterRecordingDto) {
    const recording = await this.prisma.recording.create({
      data: {
        cameraId: dto.cameraId,
        filePath: dto.filePath,
        startedAt: new Date(dto.startedAt),
        endedAt: new Date(dto.endedAt),
        durationSeconds: dto.durationSeconds,
        sizeBytes: dto.sizeBytes,
      },
    });
    await this.enqueueThumbnailGeneration(recording.id, false);
    return recording;
  }

  async enqueueThumbnailGeneration(recordingId: string, force: boolean) {
    await this.thumbnailQueue.add(
      'generate-thumbnail',
      { recordingId },
      {
        jobId: force ? `thumb-${recordingId}-${Date.now()}` : `thumb-${recordingId}`,
        attempts: 2,
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    return { status: 'thumbnail_generation_queued', recordingId };
  }

  async streamThumbnail(recordingId: string, res: Response) {
    const recording = await this.ensureRecordingExists(recordingId);
    const recordingsRoot = process.env.RECORDINGS_ROOT ?? './storage/recordings';
    const filePath = ensureFileUnderRoot(recordingsRoot, recording.filePath);
    const thumbPath = `${filePath.replace(new RegExp(`${extname(filePath)}$`), '')}.thumb.jpg`;
    if (!existsSync(thumbPath)) {
      throw new NotFoundException('Thumbnail ainda não foi gerada para esta gravação.');
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=60');
    createReadStream(thumbPath).pipe(res);
  }

  async ensureExportedClipExists(clipId: string) {
    const clip = await this.prisma.exportedClip.findUnique({
      where: { id: clipId },
      include: { camera: true, sourceRecording: true },
    });
    if (!clip) {
      throw new NotFoundException('Clip exportado não encontrado.');
    }
    return clip;
  }

  private async runClipExport(inputPath: string, outputPath: string, startSeconds: number, durationSeconds: number) {
    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-ss',
        String(startSeconds),
        '-i',
        inputPath,
        '-t',
        String(durationSeconds),
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        outputPath,
      ]);
      return;
    } catch {
      try {
        await execFileAsync('ffmpeg', [
          '-y',
          '-ss',
          String(startSeconds),
          '-i',
          inputPath,
          '-t',
          String(durationSeconds),
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '23',
          '-c:a',
          'aac',
          '-movflags',
          '+faststart',
          outputPath,
        ]);
        return;
      } catch (error) {
        throw new InternalServerErrorException(error instanceof Error ? error.message : 'Falha ao exportar clip.');
      }
    }
  }

  async exportClip(user: AuthUser, recordingId: string, dto: ExportClipDto) {
    const recording = await this.ensureRecordingExists(recordingId);
    const recordingsRoot = process.env.RECORDINGS_ROOT ?? './storage/recordings';
    const inputPath = ensureFileUnderRoot(recordingsRoot, recording.filePath);
    if (!existsSync(inputPath)) {
      throw new NotFoundException('Arquivo de gravação não encontrado no disco.');
    }

    const sourceDuration = Math.max(
      1,
      recording.durationSeconds ??
        (recording.endedAt ? Math.max(1, Math.floor((recording.endedAt.getTime() - recording.startedAt.getTime()) / 1000)) : 1),
    );

    if (dto.endSeconds <= dto.startSeconds) {
      throw new BadRequestException('endSeconds deve ser maior que startSeconds.');
    }
    if (dto.startSeconds >= sourceDuration) {
      throw new BadRequestException('startSeconds está fora da gravação.');
    }

    const clippedEnd = Math.min(dto.endSeconds, sourceDuration);
    const durationSeconds = clippedEnd - dto.startSeconds;
    if (durationSeconds <= 0) {
      throw new BadRequestException('Intervalo do clip inválido.');
    }

    const clipStartedAt = new Date(recording.startedAt.getTime() + dto.startSeconds * 1000);
    const clipEndedAt = new Date(recording.startedAt.getTime() + clippedEnd * 1000);
    const dir = join(
      recordingsRoot,
      'clips',
      recording.cameraId,
      `${clipStartedAt.getUTCFullYear()}`,
      `${String(clipStartedAt.getUTCMonth() + 1).padStart(2, '0')}`,
      `${String(clipStartedAt.getUTCDate()).padStart(2, '0')}`,
    );
    mkdirSync(dir, { recursive: true });

    const fileName = `clip-${recording.id}-${dto.startSeconds}-${clippedEnd}.mp4`;
    const outputPath = join(dir, fileName);

    await this.runClipExport(inputPath, outputPath, dto.startSeconds, durationSeconds);
    if (!existsSync(outputPath)) {
      throw new InternalServerErrorException('FFmpeg não gerou o arquivo de clip.');
    }

    const stats = statSync(outputPath);
    const clip = await this.prisma.exportedClip.create({
      data: {
        cameraId: recording.cameraId,
        sourceRecordingId: recording.id,
        filePath: outputPath,
        startedAt: clipStartedAt,
        endedAt: clipEndedAt,
        durationSeconds,
        sizeBytes: BigInt(stats.size),
        createdByUserId: user.id,
        createdByUserName: user.name,
      },
    });

    return {
      id: clip.id,
      cameraId: clip.cameraId,
      sourceRecordingId: clip.sourceRecordingId,
      startedAt: clip.startedAt,
      endedAt: clip.endedAt,
      durationSeconds: clip.durationSeconds,
      sizeBytes: clip.sizeBytes?.toString() ?? null,
      downloadUrl: `/recordings/clips/${clip.id}/download`,
    };
  }

  async downloadExportedClip(clipId: string, res: Response) {
    const clip = await this.ensureExportedClipExists(clipId);
    const recordingsRoot = process.env.RECORDINGS_ROOT ?? './storage/recordings';
    const filePath = ensureFileUnderRoot(recordingsRoot, clip.filePath);
    if (!existsSync(filePath)) {
      throw new NotFoundException('Arquivo do clip não encontrado no disco.');
    }
    res.setHeader('Content-Disposition', `attachment; filename="clip-${clip.id}.mp4"`);
    createReadStream(filePath).pipe(res);
  }

  async createThumbnailTokens(user: AuthUser, recordingIds: string[]) {
    const uniqueIds = [...new Set(recordingIds)];
    const recordings = await this.prisma.recording.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, cameraId: true },
    });

    const tokenMap: Record<string, string> = {};
    for (const rec of recordings) {
      if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
        const token = await this.authService.createPlaybackToken(user.id, rec.id);
        tokenMap[rec.id] = token.playToken;
        continue;
      }
      const canView = await this.accessControlService.canViewCamera(user, rec.cameraId);
      if (!canView) continue;
      const token = await this.authService.createPlaybackToken(user.id, rec.id);
      tokenMap[rec.id] = token.playToken;
    }

    return tokenMap;
  }
}
