import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import * as os from 'node:os';
import { statfs } from 'node:fs/promises';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async getSystemSummary() {
    const recordingsRoot = process.env.RECORDINGS_ROOT ?? '/storage';

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

    return {
      status: 'ok',
      service: 'api',
      recordingsRoot,
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
