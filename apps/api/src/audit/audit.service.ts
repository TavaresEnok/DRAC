import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type Request } from 'express';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    userId: string | null,
    action: string,
    entityType: string,
    entityId?: string | null,
    metadata?: Prisma.JsonValue,
    request?: Request,
  ) {
    return this.prisma.auditLog.create({
      data: {
        userId: userId ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        ipAddress: request?.ip ?? null,
        userAgent: request?.headers['user-agent'] ?? null,
        metadata: metadata ?? undefined,
      },
    });
  }

  async list(filters: {
    userId?: string;
    action?: string;
    entityType?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) {
    const from = filters.from ? new Date(filters.from) : undefined;
    const to = filters.to ? new Date(filters.to) : undefined;

    const where = {
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total };
  }
}
