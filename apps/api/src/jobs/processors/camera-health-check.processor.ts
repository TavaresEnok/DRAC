import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { CameraStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CAMERA_HEALTH_CHECK_QUEUE } from '../queues/camera-health-check.queue';
import { CamerasService } from '../../cameras/cameras.service';

@Processor(CAMERA_HEALTH_CHECK_QUEUE)
@Injectable()
export class CameraHealthCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(CameraHealthCheckProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly camerasService: CamerasService,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<void> {
    this.logger.log(`Iniciando verificação de saúde das câmeras...`);

    // Câmeras que não reportaram dentro da janela configurada são marcadas como OFFLINE
    const offlineMinutes = this.configService.get<number>('healthCheckOfflineMinutes') ?? 5;
    const staleThreshold = new Date();
    staleThreshold.setMinutes(staleThreshold.getMinutes() - offlineMinutes);

    const staleCameras = await this.prisma.camera.findMany({
      where: {
        status: CameraStatus.ONLINE,
        lastSeenAt: {
          lt: staleThreshold,
        },
      },
    });

    if (staleCameras.length > 0) {
      this.logger.warn(`${staleCameras.length} câmeras parecem estar offline (sem reports recentes).`);
      
      for (const cam of staleCameras) {
        await this.prisma.camera.update({
          where: { id: cam.id },
          data: { status: CameraStatus.OFFLINE },
        });
        this.logger.debug(`Status atualizado para OFFLINE: ${cam.name} (${cam.id})`);
      }
    } else {
      this.logger.log('Todas as câmeras online estão reportando normalmente.');
    }

    const autoRemediationEnabled = this.configService.get<boolean>('healthAutoRemediationEnabled') ?? true;
    if (!autoRemediationEnabled) {
      return;
    }

    const maxPerRun = Math.max(1, this.configService.get<number>('healthAutoRemediationMaxPerRun') ?? 5);
    const degraded = await this.prisma.camera.findMany({
      where: {
        status: {
          in: [CameraStatus.OFFLINE, CameraStatus.ERROR, CameraStatus.UNKNOWN],
        },
      },
      orderBy: { updatedAt: 'asc' },
      take: maxPerRun,
      select: { id: true, name: true },
    });

    if (degraded.length === 0) return;

    this.logger.log(`Auto-remediação: executando reteste ativo em ${degraded.length} câmeras degradadas.`);
    for (const cam of degraded) {
      try {
        const result = await this.camerasService.getStatus(cam.id);
        if (result.status === CameraStatus.ONLINE) {
          await this.camerasService.registerEvent(
            cam.id,
            'HEALTH_AUTO_RECOVERED',
            'INFO',
            'Câmera recuperada por reteste automático de saúde.',
            { checkedAt: result.checkedAt },
          );
        }
      } catch (error) {
        this.logger.warn(`Auto-remediação falhou camera=${cam.id}: ${(error as Error).message}`);
      }
    }
  }
}
