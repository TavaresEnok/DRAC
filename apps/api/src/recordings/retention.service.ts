import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { existsSync, rmSync, readdirSync, rmdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { ConfigService } from '@nestjs/config';
import { ensureFileUnderRoot } from './helpers/safe-file.helper';

@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.logger.log('Retention Service inicializado.');
    const useBullmq = this.config.get<boolean>('retentionUseBullmq');
    if (useBullmq) {
      this.logger.log('Retenção por idade via timer local desativada (BullMQ ativo). Guardião de disco permanece ativo.');
      void this.checkDiskUsage();
      this.interval = setInterval(() => {
        void this.checkDiskUsage();
      }, 60 * 60 * 1000);
      this.interval.unref();
      return;
    }
    // Executa uma vez no início para limpar caso tenha ficado desligado
    void this.handleRetention();
    this.interval = setInterval(() => {
      void this.handleRetention();
    }, 60 * 60 * 1000);
    this.interval.unref();
  }

  onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async handleRetention() {
    const globalDays = parseInt(this.config.get('RECORDING_RETENTION_DAYS') || '7');
    this.logger.log(`Iniciando verificação de retenção (global=${globalDays} dias, com override por câmera)...`);

    // Ler legal holds ativos para proteger evidências
    const holds = await this.prisma.investigationItem.findMany({
      where: { type: 'legal_hold' },
      orderBy: { createdAt: 'desc' },
      select: { investigationId: true, metadata: true },
    });
    const holdByInvestigation = new Map<string, any>();
    for (const hold of holds) {
      if (!holdByInvestigation.has(hold.investigationId)) {
        holdByInvestigation.set(hold.investigationId, hold.metadata);
      }
    }
    const heldRecordingIds = new Set<string>();
    const heldClipIds = new Set<string>();
    for (const metadata of holdByInvestigation.values()) {
      if (!metadata || typeof metadata !== 'object') continue;
      const m = metadata as Record<string, unknown>;
      if (!m.enabled) continue;
      const rids = Array.isArray(m.recordingIds) ? m.recordingIds.filter((x): x is string => typeof x === 'string') : [];
      const cids = Array.isArray(m.clipIds) ? m.clipIds.filter((x): x is string => typeof x === 'string') : [];
      rids.forEach((id) => heldRecordingIds.add(id));
      cids.forEach((id) => heldClipIds.add(id));
    }

    const linkedClipItems = await this.prisma.investigationItem.findMany({
      where: {
        OR: [
          { type: 'clip' },
          { type: 'export_package' },
          { type: 'evidence' },
        ],
      },
      select: { metadata: true },
      take: 5000,
      orderBy: { createdAt: 'desc' },
    });
    for (const item of linkedClipItems) {
      if (!item.metadata || typeof item.metadata !== 'object') continue;
      const m = item.metadata as Record<string, unknown>;
      if (typeof m.clipId === 'string') heldClipIds.add(m.clipId);
      if (Array.isArray(m.clipIds)) {
        for (const clipId of m.clipIds) {
          if (typeof clipId === 'string') heldClipIds.add(clipId);
        }
      }
    }

    const heldClipRows = heldClipIds.size
      ? await this.prisma.exportedClip.findMany({
          where: { id: { in: [...heldClipIds] } },
          select: { id: true, sourceRecordingId: true },
        })
      : [];
    for (const clip of heldClipRows) {
      heldRecordingIds.add(clip.sourceRecordingId);
    }

    // 1. Buscar gravações antigas
    const allRecordings = await this.prisma.recording.findMany({
      include: {
        camera: {
          select: {
            retentionDays: true,
          },
        },
      },
    });

    const now = Date.now();
    const oldRecordings = allRecordings.filter((record) => {
      const retentionDays = record.camera?.retentionDays ?? globalDays;
      const thresholdMs = now - retentionDays * 24 * 60 * 60 * 1000;
      return record.startedAt.getTime() < thresholdMs;
    });

    if (oldRecordings.length === 0) {
      this.logger.log('Nenhuma gravação antiga para remover.');
    } else {
      const root = process.env.RECORDINGS_ROOT || './storage/recordings';
      let deletedCount = 0;

      for (const rec of oldRecordings) {
        try {
          if (heldRecordingIds.has(rec.id)) continue;
          const fullPath = ensureFileUnderRoot(root, rec.filePath);
          if (existsSync(fullPath)) {
            rmSync(fullPath);
          }
          await this.prisma.recording.delete({ where: { id: rec.id } });
          deletedCount++;
        } catch (err: any) {
          this.logger.error(`Falha ao remover gravação ${rec.id}: ${err.message}`);
        }
      }
      this.logger.log(`Removidas ${deletedCount} gravações antigas.`);
      
      // Limpar diretórios vazios
      this.cleanEmptyDirs(root);
    }

    // 1.1 Limpar clips exportados antigos que nao estao em legal hold
    const allClips = await this.prisma.exportedClip.findMany({
      include: {
        sourceRecording: {
          include: {
            camera: {
              select: {
                retentionDays: true,
              },
            },
          },
        },
      },
    });
    const oldClips = allClips.filter((clip) => {
      const retentionDays = clip.sourceRecording?.camera?.retentionDays ?? globalDays;
      const thresholdMs = now - retentionDays * 24 * 60 * 60 * 1000;
      return clip.startedAt.getTime() < thresholdMs;
    });
    if (oldClips.length > 0) {
      const root = process.env.RECORDINGS_ROOT || './storage/recordings';
      for (const clip of oldClips) {
        try {
          if (heldClipIds.has(clip.id)) continue;
          const fullPath = ensureFileUnderRoot(root, clip.filePath);
          if (existsSync(fullPath)) rmSync(fullPath);
          await this.prisma.exportedClip.delete({ where: { id: clip.id } });
        } catch (err: any) {
          this.logger.error(`Falha ao remover clip ${clip.id}: ${err.message}`);
        }
      }
    }

    // 2. Limpar eventos antigos (30 dias padrão)
    const eventCutoff = new Date();
    eventCutoff.setDate(eventCutoff.getDate() - 30);
    const { count } = await this.prisma.cameraEvent.deleteMany({
      where: { occurredAt: { lt: eventCutoff } },
    });
    if (count > 0) {
      this.logger.log(`Removidos ${count} eventos antigos do banco.`);
    }

    // 3. Verificar espaço em disco
    await this.checkDiskUsage();
  }

  private async checkDiskUsage() {
    const root = process.env.RECORDINGS_ROOT || './storage/recordings';
    try {
      // df -k /path | tail -1 | awk '{print $5}'
      const output = execSync(`df -k "${root}" | tail -1`).toString();
      const parts = output.split(/\s+/);
      const percentStr = parts[4].replace('%', '');
      const percent = parseInt(percentStr);

      if (percent > 90) {
        this.logger.warn(`Espaço em disco CRÍTICO: ${percent}%. Iniciando limpeza agressiva...`);
        
        // Deletar os 100 registros mais antigos
        const oldest = await this.prisma.recording.findMany({
          orderBy: { startedAt: 'asc' },
          take: 100,
        });

        for (const rec of oldest) {
          try {
            const fullPath = ensureFileUnderRoot(root, rec.filePath);
            if (existsSync(fullPath)) rmSync(fullPath);
            await this.prisma.recording.delete({ where: { id: rec.id } });
          } catch {}
        }
        this.logger.log('Limpeza agressiva concluída.');
      }
    } catch (err: any) {
      this.logger.error(`Erro ao verificar espaço em disco: ${err.message}`);
    }
  }

  private cleanEmptyDirs(dir: string) {
    if (!existsSync(dir)) return;
    const stats = statSync(dir);
    if (!stats.isDirectory()) return;

    let files = readdirSync(dir);
    if (files.length > 0) {
      for (const file of files) {
        this.cleanEmptyDirs(join(dir, file));
      }
      // Re-ler após limpar filhos
      files = readdirSync(dir);
    }

    if (files.length === 0 && dir !== (process.env.RECORDINGS_ROOT || './storage/recordings')) {
      try {
        rmdirSync(dir);
      } catch {}
    }
  }
}
