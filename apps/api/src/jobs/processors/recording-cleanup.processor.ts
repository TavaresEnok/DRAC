import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { rmSync, existsSync } from 'node:fs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ensureFileUnderRoot } from '../../recordings/helpers/safe-file.helper';
import { RECORDING_CLEANUP_QUEUE } from '../queues/recording-cleanup.queue';

@Processor(RECORDING_CLEANUP_QUEUE)
@Injectable()
export class RecordingCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(RecordingCleanupProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<void> {
    this.logger.log(`Iniciando limpeza de gravações antigas... (Job ID: ${job.id})`);

    const retentionDays = this.configService.get<number>('retentionDays') ?? 7;
    const recordingsToDelete = await this.prisma.recording.findMany({
      select: {
        id: true,
        filePath: true,
        startedAt: true,
        camera: {
          select: {
            retentionDays: true,
          },
        },
      },
    });

    const now = Date.now();
    const protectedClipIds = new Set<string>();
    const protectedRecordingIds = new Set<string>();

    const holdItems = await this.prisma.investigationItem.findMany({
      where: { type: 'legal_hold' },
      select: { metadata: true },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    for (const item of holdItems) {
      if (!item.metadata || typeof item.metadata !== 'object') continue;
      const m = item.metadata as Record<string, unknown>;
      if (!m.enabled) continue;
      if (Array.isArray(m.recordingIds)) {
        for (const recordingId of m.recordingIds) {
          if (typeof recordingId === 'string') protectedRecordingIds.add(recordingId);
        }
      }
      if (Array.isArray(m.clipIds)) {
        for (const clipId of m.clipIds) {
          if (typeof clipId === 'string') protectedClipIds.add(clipId);
        }
      }
    }

    const linkedClipItems = await this.prisma.investigationItem.findMany({
      where: {
        OR: [{ type: 'clip' }, { type: 'export_package' }, { type: 'evidence' }],
      },
      select: { metadata: true },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    for (const item of linkedClipItems) {
      if (!item.metadata || typeof item.metadata !== 'object') continue;
      const m = item.metadata as Record<string, unknown>;
      if (typeof m.clipId === 'string') protectedClipIds.add(m.clipId);
      if (Array.isArray(m.clipIds)) {
        for (const clipId of m.clipIds) {
          if (typeof clipId === 'string') protectedClipIds.add(clipId);
        }
      }
    }

    if (protectedClipIds.size > 0) {
      const protectedClips = await this.prisma.exportedClip.findMany({
        where: { id: { in: [...protectedClipIds] } },
        select: { sourceRecordingId: true },
      });
      for (const clip of protectedClips) {
        protectedRecordingIds.add(clip.sourceRecordingId);
      }
    }

    const filteredToDelete = recordingsToDelete.filter((recording) => {
      if (protectedRecordingIds.has(recording.id)) return false;
      const effectiveRetentionDays = recording.camera?.retentionDays ?? retentionDays;
      const thresholdDate = new Date(now - effectiveRetentionDays * 24 * 60 * 60 * 1000);
      return recording.startedAt < thresholdDate;
    });

    if (filteredToDelete.length === 0) {
      this.logger.log('Nenhuma gravação antiga para remover.');
      return;
    }

    this.logger.log(`Removendo ${filteredToDelete.length} gravações antigas conforme retenção por câmera.`);

    const storageRoot = this.configService.get<string>('recordingsRoot') ?? './storage/recordings';

    for (const recording of filteredToDelete) {
      try {
        // Remover arquivo do disco
        const fullPath = ensureFileUnderRoot(storageRoot, recording.filePath);
        if (existsSync(fullPath)) {
          rmSync(fullPath);
          this.logger.debug(`Arquivo removido: ${fullPath}`);
        }

        // Remover do banco
        await this.prisma.recording.delete({
          where: { id: recording.id },
        });
      } catch (error: any) {
        this.logger.error(`Falha ao remover gravação ${recording.id}: ${error.message}`);
      }
    }

    this.logger.log('Limpeza concluída.');
  }
}
