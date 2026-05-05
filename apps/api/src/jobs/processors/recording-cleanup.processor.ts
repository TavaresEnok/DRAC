import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../../common/prisma/prisma.service';
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
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - retentionDays);

    const recordingsToDelete = await this.prisma.recording.findMany({
      where: {
        startedAt: {
          lt: thresholdDate,
        },
      },
      select: {
        id: true,
        filePath: true,
      },
    });

    if (recordingsToDelete.length === 0) {
      this.logger.log('Nenhuma gravação antiga para remover.');
      return;
    }

    this.logger.log(`Removendo ${recordingsToDelete.length} gravações anteriores a ${thresholdDate.toISOString()}`);

    const storageRoot = this.configService.get<string>('recordingsRoot') ?? './storage/recordings';

    for (const recording of recordingsToDelete) {
      try {
        // Remover arquivo do disco
        const fullPath = join(storageRoot, recording.filePath);
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
