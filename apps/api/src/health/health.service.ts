import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import * as os from 'node:os';
import { statfs, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async getSystemSummary() {
    const recordingsRoot = process.env.RECORDINGS_ROOT ?? '/storage';
    const storageBackend = process.env.STORAGE_BACKEND ?? 'local';
    const writeProbeEnabled = String(process.env.STORAGE_WRITE_PROBE_ENABLED ?? 'true') !== 'false';

    const [disk, recordings] = await Promise.all([
      statfs(recordingsRoot),
      this.prisma.recording.aggregate({
        _count: { id: true },
        _sum: { sizeBytes: true },
        _max: { startedAt: true },
      }),
    ]);

    const totalBytes = Number(disk.blocks) * Number(disk.bsize);
    const freeBytes = Number(disk.bavail) * Number(disk.bsize);
    const usedBytes = Math.max(totalBytes - freeBytes, 0);
    let writable = null as null | boolean;
    let writeProbeError: string | null = null;
    if (writeProbeEnabled) {
      const probePath = join(recordingsRoot, `.health-write-probe-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
      try {
        await writeFile(probePath, 'health_probe');
        await unlink(probePath);
        writable = true;
      } catch (error) {
        writable = false;
        writeProbeError = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      status: 'ok',
      service: 'api',
      recordingsRoot,
      storage: {
        backend: storageBackend,
        writeProbeEnabled,
        writable,
        writeProbeError,
      },
      server: {
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        uptimeSeconds: os.uptime(),
        totalMemoryBytes: os.totalmem(),
        freeMemoryBytes: os.freemem(),
        cpuCount: os.cpus().length,
        loadAverage: os.loadavg(),
      },
      disk: {
        totalBytes,
        usedBytes,
        freeBytes,
        usagePercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0,
      },
      recordings: {
        count: recordings._count.id,
        totalBytes: Number(recordings._sum.sizeBytes ?? 0),
        lastStartedAt: recordings._max.startedAt,
      },
      time: new Date().toISOString(),
    };
  }
}
