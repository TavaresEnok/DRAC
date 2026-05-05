import { Body, Controller, Delete, Get, Param, Put, Req } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { UpsertSiteMapLayoutDto } from './dto/upsert-site-map-layout.dto';
import { SiteMapLayoutsService } from './site-map-layouts.service';

@Controller('sites/:siteId/map-layouts')
export class SiteMapLayoutsController {
  constructor(
    private readonly siteMapLayoutsService: SiteMapLayoutsService,
    private readonly auditService: AuditService,
  ) {}

  @Roles(UserRole.VIEWER)
  @Get()
  list(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.siteMapLayoutsService.list(siteId, user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN);
  }

  @Roles(UserRole.VIEWER)
  @Get(':floor')
  getByFloor(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Param('floor') floor: string) {
    return this.siteMapLayoutsService.getByFloor(
      siteId,
      floor,
      user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN,
    );
  }

  @Roles(UserRole.ADMIN)
  @Put(':floor')
  async upsert(
    @CurrentUser() user: AuthUser,
    @Param('siteId') siteId: string,
    @Param('floor') floor: string,
    @Body() dto: UpsertSiteMapLayoutDto,
    @Req() req: Request,
  ) {
    const layout = await this.siteMapLayoutsService.upsert(siteId, floor, dto, true);
    const markerCount = layout.markers && typeof layout.markers === 'object' ? Object.keys(layout.markers as Record<string, unknown>).length : 0;

    await this.auditService.log(
      user.id,
      'site_map_layout.upsert',
      'SiteMapLayout',
      layout.id,
      {
        siteId: layout.siteId,
        floor: layout.floor,
        hasSvg: Boolean(layout.svgDataUrl),
        markerCount,
      },
      req,
    );

    return layout;
  }

  @Roles(UserRole.ADMIN)
  @Delete(':floor')
  async deleteByFloor(
    @CurrentUser() user: AuthUser,
    @Param('siteId') siteId: string,
    @Param('floor') floor: string,
    @Req() req: Request,
  ) {
    const layout = await this.siteMapLayoutsService.deleteByFloor(siteId, floor, true);

    await this.auditService.log(
      user.id,
      'site_map_layout.delete',
      'SiteMapLayout',
      layout.id,
      {
        siteId: layout.siteId,
        floor: layout.floor,
      },
      req,
    );

    return layout;
  }
}
