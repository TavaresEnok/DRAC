import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { existsSync, rmSync, readdirSync, rmdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { ConfigService } from '@nestjs/config';

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
      this.logger.log('Retenção por timer local desativada (BullMQ ativo).');
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
    const days = parseInt(this.config.get('RECORDING_RETENTION_DAYS') || '7');
    this.logger.log(`Iniciando verificação de retenção (${days} dias)...`);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    // 1. Buscar gravações antigas
    const oldRecordings = await this.prisma.recording.findMany({
      where: { startedAt: { lt: cutoff } },
    });

    if (oldRecordings.length === 0) {
      this.logger.log('Nenhuma gravação antiga para remover.');
    } else {
      const root = process.env.RECORDINGS_ROOT || './storage/recordings';
      let deletedCount = 0;

      for (const rec of oldRecordings) {
        try {
          const fullPath = join(root, rec.filePath);
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
            const fullPath = join(root, rec.filePath);
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
