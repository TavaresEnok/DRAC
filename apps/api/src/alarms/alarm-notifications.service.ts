import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { AlarmInstance, AlarmRule } from '@prisma/client';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { ALARM_NOTIFICATION_QUEUE } from '../jobs/queues/alarm-notification.queue';

@Injectable()
export class AlarmNotificationsService {
  private readonly logger = new Logger(AlarmNotificationsService.name);
  private readonly redis: Redis;

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue(ALARM_NOTIFICATION_QUEUE) private readonly notificationQueue: Queue,
  ) {
    const host = this.configService.get<string>('redisHost') ?? process.env.REDIS_HOST ?? 'localhost';
    const port = Number(this.configService.get<number>('redisPort') ?? process.env.REDIS_PORT ?? 6379);
    this.redis = new Redis({ host, port, maxRetriesPerRequest: 2, enableReadyCheck: true });
  }

  private buildJobId(alarm: AlarmInstance) {
    const occurredAt = alarm.lastOccurredAt ? new Date(alarm.lastOccurredAt).getTime() : Date.now();
    return `alarm-notify-${alarm.id}-${alarm.occurrenceCount}-${occurredAt}`;
  }

  private resolveChannelPlan(priority: string) {
    const policyRaw = this.configService.get<string>('alarmNotificationPolicyJson') ?? '';
    const defaultPlan: Record<string, Array<'webhook' | 'email'>> = {
      P1: ['webhook', 'email'],
      P2: ['webhook', 'email'],
      P3: ['webhook'],
      P4: ['webhook'],
    };
    if (!policyRaw.trim()) {
      return defaultPlan[priority] ?? defaultPlan.P4;
    }
    try {
      const parsed = JSON.parse(policyRaw) as Record<string, string[]>;
      const channels = parsed[priority] ?? parsed.P4 ?? defaultPlan.P4;
      const normalized = channels
        .map((c) => c.toLowerCase().trim())
        .filter((c): c is 'webhook' | 'email' => c === 'webhook' || c === 'email');
      return normalized.length ? normalized : defaultPlan.P4;
    } catch {
      return defaultPlan[priority] ?? defaultPlan.P4;
    }
  }

  private suppressionKey(alarm: AlarmInstance) {
    return `alarm:notif:suppress:${alarm.type}:${alarm.priority}:${alarm.cameraId ?? 'none'}`;
  }

  private resolveEscalationDelayMs(priority: string) {
    const raw = this.configService.get<string>('alarmNotificationEscalationDelayMsJson') ?? '';
    const defaults: Record<string, number> = {
      P1: 0,
      P2: 15_000,
      P3: 60_000,
      P4: 180_000,
    };
    if (!raw.trim()) return defaults[priority] ?? defaults.P4;
    try {
      const parsed = JSON.parse(raw) as Record<string, number>;
      const val = Number(parsed[priority] ?? parsed.P4 ?? defaults.P4);
      return Number.isFinite(val) && val >= 0 ? val : (defaults[priority] ?? defaults.P4);
    } catch {
      return defaults[priority] ?? defaults.P4;
    }
  }

  async notifyOnOpen(alarm: AlarmInstance, rule: AlarmRule | null) {
    const baseDelayMs = Number(this.configService.get<number>('alarmNotificationDelayMs') ?? 0);
    const escalationDelayMs = this.resolveEscalationDelayMs(alarm.priority);
    const delayMs = Math.max(baseDelayMs, escalationDelayMs);
    const suppressSeconds = Number(this.configService.get<number>('alarmNotificationSuppressSeconds') ?? 45);
    if (suppressSeconds > 0) {
      const key = this.suppressionKey(alarm);
      const setResult = await this.redis.set(key, '1', 'EX', suppressSeconds, 'NX');
      if (setResult !== 'OK') {
        this.logger.debug(`Notification enqueue suppressed by cooldown alarm=${alarm.id}`);
        return;
      }
    }
    try {
      await this.notificationQueue.add(
        'notify-open',
        { alarmId: alarm.id, ruleId: rule?.id ?? null, channels: this.resolveChannelPlan(alarm.priority) },
        {
          jobId: this.buildJobId(alarm),
          attempts: 4,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: 100,
          delay: delayMs > 0 ? delayMs : 0,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`Failed to enqueue alarm notification alarm=${alarm.id}: ${message}`);
    }
  }
}
