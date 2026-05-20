import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type Request } from 'express';
import { PrismaService } from '../common/prisma/prisma.service';

type AuditListFilters = {
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  query?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

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

  private buildWhere(filters: AuditListFilters): Prisma.AuditLogWhereInput {
    const from = filters.from ? new Date(filters.from) : undefined;
    const to = filters.to ? new Date(filters.to) : undefined;
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.action ? { action: { contains: filters.action, mode: 'insensitive' } } : {}),
      ...(filters.entityType ? { entityType: { contains: filters.entityType, mode: 'insensitive' } } : {}),
      ...(filters.entityId ? { entityId: { contains: filters.entityId, mode: 'insensitive' } } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };
    if (filters.query) {
      where.OR = [
        { action: { contains: filters.query, mode: 'insensitive' } },
        { entityType: { contains: filters.query, mode: 'insensitive' } },
        { entityId: { contains: filters.query, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  async list(filters: AuditListFilters) {
    const where = this.buildWhere(filters);

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

  async export(filters: Omit<AuditListFilters, 'limit' | 'offset'> & { format?: 'csv' | 'json' }) {
    const where = this.buildWhere(filters);
    const items = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    if ((filters.format ?? 'csv') === 'json') {
      return {
        contentType: 'application/json; charset=utf-8',
        ext: 'json',
        body: JSON.stringify({ total: items.length, items }),
      };
    }

    const esc = (value: unknown) => {
      const text = String(value ?? '');
      if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const header = [
      'id',
      'createdAt',
      'userId',
      'action',
      'entityType',
      'entityId',
      'ipAddress',
      'userAgent',
      'metadata',
    ];

    const rows = items.map((item) => [
      esc(item.id),
      esc(item.createdAt.toISOString()),
      esc(item.userId ?? ''),
      esc(item.action),
      esc(item.entityType),
      esc(item.entityId ?? ''),
      esc(item.ipAddress ?? ''),
      esc(item.userAgent ?? ''),
      esc(item.metadata ? JSON.stringify(item.metadata) : ''),
    ].join(','));

    return {
      contentType: 'text/csv; charset=utf-8',
      ext: 'csv',
      body: [header.join(','), ...rows].join('\n'),
    };
  }
}
