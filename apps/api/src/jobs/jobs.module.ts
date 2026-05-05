import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { CAMERA_HEALTH_CHECK_QUEUE } from './queues/camera-health-check.queue';
import { RECORDING_CLEANUP_QUEUE } from './queues/recording-cleanup.queue';
import { THUMBNAIL_GENERATION_QUEUE } from './queues/thumbnail-generation.queue';
import { CameraHealthCheckProcessor } from './processors/camera-health-check.processor';
import { RecordingCleanupProcessor } from './processors/recording-cleanup.processor';
import { ThumbnailGenerationProcessor } from './processors/thumbnail-generation.processor';
import { OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CamerasModule } from '../cameras/cameras.module';

@Module({
  imports: [
    CamerasModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redisHost') ?? process.env.REDIS_HOST ?? 'localhost',
          port: Number(configService.get<string | number>('redisPort') ?? process.env.REDIS_PORT ?? 6379),
        },
      }),
    }),
    BullModule.registerQueue(
      { name: CAMERA_HEALTH_CHECK_QUEUE },
      { name: RECORDING_CLEANUP_QUEUE },
      { name: THUMBNAIL_GENERATION_QUEUE },
    ),
  ],
  providers: [CameraHealthCheckProcessor, RecordingCleanupProcessor, ThumbnailGenerationProcessor],
})
export class JobsModule implements OnModuleInit {
  constructor(
    @InjectQueue(CAMERA_HEALTH_CHECK_QUEUE) private readonly healthCheckQueue: Queue,
    @InjectQueue(RECORDING_CLEANUP_QUEUE) private readonly cleanupQueue: Queue,
  ) {}

  async onModuleInit() {
    // Agendar verificação de saúde a cada 1 minuto
    await this.healthCheckQueue.add(
      'check',
      {},
      {
        jobId: 'health-check-cron',
        repeat: { pattern: '*/1 * * * *' },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );

    // Agendar limpeza a cada dia à meia-noite (se habilitada via BullMQ)
    if (String(process.env.RETENTION_USE_BULLMQ ?? 'true') !== 'false') {
      await this.cleanupQueue.add(
        'cleanup',
        {},
        {
          jobId: 'recording-cleanup-cron',
          repeat: { pattern: '0 0 * * *' },
          removeOnComplete: true,
          removeOnFail: 50,
        },
      );
    }
  }
}
