import { Injectable, NotFoundException } from '@nestjs/common';
import { AlarmPriority, AlarmSource, AlarmStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AlarmNotificationsService } from './alarm-notifications.service';
import { CreateAlarmRuleDto } from './dto/create-alarm-rule.dto';
import { UpdateAlarmRuleDto } from './dto/update-alarm-rule.dto';

function inferSource(type: string): AlarmSource | null {
  if (type.startsWith('STREAM_')) return AlarmSource.STREAM;
  if (type.startsWith('HEALTH_')) return AlarmSource.HEALTH;
  if (type === 'MOTION_DETECTED') return AlarmSource.MOTION;
  if (type.startsWith('MOTION_')) return AlarmSource.MOTION;
  if (type.startsWith('AI_') || type.startsWith('ANALYTICS_')) return AlarmSource.ANALYTICS;
  return null;
}

function defaultPriorityFor(type: string, severity: string): AlarmPriority {
  if (type === 'MOTION_DETECTED') return AlarmPriority.P3;
  if (severity === 'CRITICAL' || severity === 'ERROR') return AlarmPriority.P1;
  if (severity === 'WARNING' || severity === 'WARN') return AlarmPriority.P2;
  if (severity === 'INFO') return AlarmPriority.P3;
  return AlarmPriority.P4;
}

function defaultDedupWindow(source: AlarmSource): number {
  if (source === AlarmSource.MOTION) return 30;
  if (source === AlarmSource.STREAM || source === AlarmSource.HEALTH) return 120;
  return 60;
}

function isRecoveryEvent(type: string): boolean {
  return type === 'HEALTH_AUTO_RECOVERED' || type === 'STREAM_RESUMED' || type === 'STREAM_RECOVERED';
}

@Injectable()
export class AlarmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: AlarmNotificationsService,
  ) {}

  private async getRule(source: AlarmSource, eventType: string) {
    return this.prisma.alarmRule.findUnique({
      where: {
        source_eventType: {
          source,
          eventType,
        },
      },
    });
  }

  async processEvent(input: {
    eventId: string;
    cameraId: string;
    type: string;
    severity: string;
    message: string;
    metadata?: unknown;
    occurredAt: Date;
  }) {
    const source = inferSource(input.type);
    if (!source) return null;

    if (isRecoveryEvent(input.type)) {
      return this.autoResolveForCamera(input.cameraId, source, input.eventId, input.occurredAt, input.message);
    }

    const rule = await this.getRule(source, input.type);
    if (rule && !rule.isEnabled) return null;

    const dedupWindowSeconds = rule?.dedupWindowSeconds ?? defaultDedupWindow(source);
    const priority = rule?.priority ?? defaultPriorityFor(input.type, input.severity);
    const dedupThreshold = new Date(input.occurredAt.getTime() - dedupWindowSeconds * 1000);

    const existing = await this.prisma.alarmInstance.findFirst({
      where: {
        cameraId: input.cameraId,
        source,
        type: input.type,
        status: { in: [AlarmStatus.OPEN, AlarmStatus.ACKED] },
        lastOccurredAt: { gte: dedupThreshold },
      },
      orderBy: { lastOccurredAt: 'desc' },
    });

    const metadata =
      typeof input.metadata === 'object' && input.metadata
        ? (input.metadata as Prisma.InputJsonValue)
        : ({} as Prisma.InputJsonValue);

    if (existing) {
      const updated = await this.prisma.alarmInstance.update({
        where: { id: existing.id },
        data: {
          eventId: input.eventId,
          message: input.message,
          severity: input.severity,
          priority,
          metadata,
          lastOccurredAt: input.occurredAt,
          occurrenceCount: { increment: 1 },
          ...(existing.status === AlarmStatus.RESOLVED ? { status: AlarmStatus.OPEN, resolvedAt: null, resolvedByUserId: null, resolvedByUserName: null } : {}),
        },
      });
      if (rule?.notifyOnOpen && existing.status === AlarmStatus.RESOLVED) {
        void this.notifications.notifyOnOpen(updated, rule).catch(() => undefined);
      }
      return updated;
    }

    const created = await this.prisma.alarmInstance.create({
      data: {
        cameraId: input.cameraId,
        eventId: input.eventId,
        source,
        type: input.type,
        title: input.type.replace(/_/g, ' '),
        message: input.message,
        severity: input.severity,
        priority,
        metadata,
        firstOccurredAt: input.occurredAt,
        lastOccurredAt: input.occurredAt,
      },
    });
    if (rule?.notifyOnOpen ?? true) {
      void this.notifications.notifyOnOpen(created, rule).catch(() => undefined);
    }
    return created;
  }

  private async autoResolveForCamera(cameraId: string, source: AlarmSource, eventId: string, occurredAt: Date, message: string) {
    const targets = await this.prisma.alarmInstance.findMany({
      where: {
        cameraId,
        status: { in: [AlarmStatus.OPEN, AlarmStatus.ACKED] },
        source: source === AlarmSource.HEALTH ? { in: [AlarmSource.HEALTH, AlarmSource.STREAM] } : source,
      },
      select: { id: true, occurrenceCount: true },
    });

    if (!targets.length) return null;

    await this.prisma.alarmInstance.updateMany({
      where: { id: { in: targets.map((item) => item.id) } },
      data: {
        status: AlarmStatus.RESOLVED,
        resolvedAt: occurredAt,
        resolvedByUserName: 'SYSTEM_AUTO_RECOVERY',
        note: message,
        eventId,
      },
    });

    return { resolved: targets.length };
  }

  async list(params: {
    accessibleCameraIds: string[];
    cameraId?: string;
    from?: string;
    to?: string;
    status?: AlarmStatus;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.max(1, Math.min(200, params.limit ?? 100));
    const offset = Math.max(0, params.offset ?? 0);
    const from = params.from ? new Date(params.from) : undefined;
    const to = params.to ? new Date(params.to) : undefined;
    const cameraIds = params.cameraId ? [params.cameraId] : params.accessibleCameraIds;

    const where = {
      ...(cameraIds.length ? { cameraId: { in: cameraIds } } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(from || to
        ? {
            lastOccurredAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.alarmInstance.findMany({
        where,
        include: { camera: { select: { name: true } } },
        orderBy: [{ status: 'asc' }, { priority: 'asc' }, { lastOccurredAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.alarmInstance.count({ where }),
    ]);

    return {
      items: items.map((alarm) => ({
        id: alarm.id,
        cameraId: alarm.cameraId,
        cameraName: alarm.camera?.name ?? null,
        eventId: alarm.eventId,
        source: alarm.source,
        type: alarm.type,
        title: alarm.title,
        message: alarm.message,
        severity: alarm.severity,
        priority: alarm.priority,
        status: alarm.status,
        metadata: alarm.metadata,
        note: alarm.note,
        occurrenceCount: alarm.occurrenceCount,
        firstOccurredAt: alarm.firstOccurredAt,
        occurredAt: alarm.lastOccurredAt,
        acknowledgedAt: alarm.acknowledgedAt,
        acknowledgedByUserId: alarm.acknowledgedByUserId,
        acknowledgedByUserName: alarm.acknowledgedByUserName,
        resolvedAt: alarm.resolvedAt,
        resolvedByUserId: alarm.resolvedByUserId,
        resolvedByUserName: alarm.resolvedByUserName,
      })),
      total,
      limit,
      offset,
    };
  }

  async ensureExists(id: string) {
    const alarm = await this.prisma.alarmInstance.findUnique({ where: { id } });
    if (!alarm) throw new NotFoundException('Alarme não encontrado.');
    return alarm;
  }

  async acknowledge(id: string, user: { id: string; name: string }, note?: string) {
    await this.ensureExists(id);
    return this.prisma.alarmInstance.update({
      where: { id },
      data: {
        status: AlarmStatus.ACKED,
        acknowledgedAt: new Date(),
        acknowledgedByUserId: user.id,
        acknowledgedByUserName: user.name,
        note: note?.trim() || undefined,
      },
      include: { camera: { select: { name: true } } },
    });
  }

  async resolve(id: string, user: { id: string; name: string }, note?: string) {
    await this.ensureExists(id);
    return this.prisma.alarmInstance.update({
      where: { id },
      data: {
        status: AlarmStatus.RESOLVED,
        resolvedAt: new Date(),
        resolvedByUserId: user.id,
        resolvedByUserName: user.name,
        ...(note?.trim() ? { note: note.trim() } : {}),
      },
      include: { camera: { select: { name: true } } },
    });
  }

  async listRules() {
    const items = await this.prisma.alarmRule.findMany({
      orderBy: [{ source: 'asc' }, { eventType: 'asc' }],
    });
    return { items };
  }

  async createRule(dto: CreateAlarmRuleDto) {
    return this.prisma.alarmRule.upsert({
      where: {
        source_eventType: {
          source: dto.source,
          eventType: dto.eventType,
        },
      },
      create: {
        name: dto.name.trim(),
        source: dto.source,
        eventType: dto.eventType.trim(),
        priority: dto.priority ?? AlarmPriority.P3,
        isEnabled: dto.isEnabled ?? true,
        dedupWindowSeconds: dto.dedupWindowSeconds ?? 60,
        autoResolveOnRecovery: dto.autoResolveOnRecovery ?? false,
        notifyOnOpen: dto.notifyOnOpen ?? true,
        webhookUrl: dto.webhookUrl?.trim() || null,
        emailTo: dto.emailTo?.trim() || null,
      },
      update: {
        name: dto.name.trim(),
        priority: dto.priority ?? AlarmPriority.P3,
        isEnabled: dto.isEnabled ?? true,
        dedupWindowSeconds: dto.dedupWindowSeconds ?? 60,
        autoResolveOnRecovery: dto.autoResolveOnRecovery ?? false,
        notifyOnOpen: dto.notifyOnOpen ?? true,
        webhookUrl: dto.webhookUrl?.trim() || null,
        emailTo: dto.emailTo?.trim() || null,
      },
    });
  }

  async updateRule(id: string, dto: UpdateAlarmRuleDto) {
    const existing = await this.prisma.alarmRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Regra de alarme não encontrada.');
    return this.prisma.alarmRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
        ...(dto.dedupWindowSeconds !== undefined ? { dedupWindowSeconds: dto.dedupWindowSeconds } : {}),
        ...(dto.autoResolveOnRecovery !== undefined ? { autoResolveOnRecovery: dto.autoResolveOnRecovery } : {}),
        ...(dto.notifyOnOpen !== undefined ? { notifyOnOpen: dto.notifyOnOpen } : {}),
        ...(dto.webhookUrl !== undefined ? { webhookUrl: dto.webhookUrl.trim() || null } : {}),
        ...(dto.emailTo !== undefined ? { emailTo: dto.emailTo.trim() || null } : {}),
      },
    });
  }
}
