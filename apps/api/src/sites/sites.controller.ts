import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { SitesService } from './sites.service';

@Controller('sites')
export class SitesController {
  constructor(
    private readonly sitesService: SitesService,
    private readonly auditService: AuditService,
  ) {}

  @Roles(UserRole.VIEWER)
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.sitesService.list(user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN);
  }

  @Roles(UserRole.VIEWER)
  @Get(':id')
  getById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sitesService.getById(id, user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateSiteDto, @Req() req: Request) {
    const site = await this.sitesService.create(dto);
    await this.auditService.log(user.id, 'site.create', 'Site', site.id, { name: site.name }, req);
    return site;
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSiteDto, @Req() req: Request) {
    const site = await this.sitesService.update(id, dto);
    await this.auditService.log(user.id, 'site.update', 'Site', site.id, { name: site.name, isActive: site.isActive }, req);
    return site;
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  async softDelete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    const site = await this.sitesService.softDelete(id);
    await this.auditService.log(user.id, 'site.deactivate', 'Site', site.id, { name: site.name }, req);
    return site;
  }
}
