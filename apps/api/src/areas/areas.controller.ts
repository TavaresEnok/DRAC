import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { AreasService } from './areas.service';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';

@Controller('areas')
export class AreasController {
  constructor(
    private readonly areasService: AreasService,
    private readonly auditService: AuditService,
  ) {}

  @Roles(UserRole.VIEWER)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('siteId') siteId?: string) {
    return this.areasService.list(user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN, siteId);
  }

  @Roles(UserRole.VIEWER)
  @Get(':id')
  getById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.areasService.getById(id, user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateAreaDto, @Req() req: Request) {
    const area = await this.areasService.create(dto);
    await this.auditService.log(user.id, 'area.create', 'Area', area.id, { name: area.name, siteId: area.siteId }, req);
    return area;
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAreaDto, @Req() req: Request) {
    const area = await this.areasService.update(id, dto);
    await this.auditService.log(user.id, 'area.update', 'Area', area.id, { name: area.name, siteId: area.siteId, isActive: area.isActive }, req);
    return area;
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  async softDelete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    const area = await this.areasService.softDelete(id);
    await this.auditService.log(user.id, 'area.deactivate', 'Area', area.id, { name: area.name }, req);
    return area;
  }
}
