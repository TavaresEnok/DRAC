import { Controller, Get, Query, Res } from '@nestjs/common';
import { type Response } from 'express';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../role-permissions/require-permission.decorator';
import { AuditService } from './audit.service';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Roles(UserRole.ADMIN)
  @RequirePermission('auditLogs')
  @Get()
  list(
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('query') query?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.auditService.list({
      userId,
      action,
      entityType,
      entityId,
      query,
      from,
      to,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Roles(UserRole.ADMIN)
  @RequirePermission('auditLogs')
  @Get('export')
  async export(
    @Res() res: Response,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('query') query?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('format') format?: 'csv' | 'json',
    @Query('download') download?: string,
  ) {
    const result = await this.auditService.export({
      userId,
      action,
      entityType,
      entityId,
      query,
      from,
      to,
      format: format === 'json' ? 'json' : 'csv',
    });

    if (download !== '0') {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${stamp}.${result.ext}"`);
    }
    res.setHeader('Content-Type', result.contentType);
    res.send(result.body);
  }
}
