import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class AlarmMuteService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('redisHost') ?? process.env.REDIS_HOST ?? 'localhost';
    const port = Number(this.configService.get<number>('redisPort') ?? process.env.REDIS_PORT ?? 6379);
    this.redis = new Redis({ host, port, maxRetriesPerRequest: 2, enableReadyCheck: true });
  }

  private ruleKey(ruleId: string) {
    return `alarm:mute:rule:${ruleId}`;
  }

  private cameraEventKey(cameraId: string, eventType: string) {
    return `alarm:mute:camera:${cameraId}:event:${eventType}`;
  }

  async muteRule(ruleId: string, minutes: number, reason?: string) {
    const ttl = Math.max(60, Math.min(86400, Math.floor(minutes * 60)));
    await this.redis.set(this.ruleKey(ruleId), JSON.stringify({ reason: reason?.trim() || null, setAt: new Date().toISOString() }), 'EX', ttl);
    return { ruleId, ttlSeconds: ttl };
  }

  async unmuteRule(ruleId: string) {
    await this.redis.del(this.ruleKey(ruleId));
  }

  async muteCameraEvent(cameraId: string, eventType: string, minutes: number, reason?: string) {
    const ttl = Math.max(60, Math.min(86400, Math.floor(minutes * 60)));
    await this.redis.set(
      this.cameraEventKey(cameraId, eventType),
      JSON.stringify({ reason: reason?.trim() || null, setAt: new Date().toISOString() }),
      'EX',
      ttl,
    );
    return { cameraId, eventType, ttlSeconds: ttl };
  }

  async unmuteCameraEvent(cameraId: string, eventType: string) {
    await this.redis.del(this.cameraEventKey(cameraId, eventType));
  }

  async isRuleMuted(ruleId: string | null | undefined) {
    if (!ruleId) return false;
    const value = await this.redis.get(this.ruleKey(ruleId));
    return Boolean(value);
  }

  async isCameraEventMuted(cameraId: string, eventType: string) {
    const value = await this.redis.get(this.cameraEventKey(cameraId, eventType));
    return Boolean(value);
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}

