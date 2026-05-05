import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { CreateInvestigationDto } from './dto/create-investigation.dto';
import { UpdateInvestigationDto } from './dto/update-investigation.dto';
import { CreateInvestigationItemDto } from './dto/create-investigation-item.dto';
import { UpdateInvestigationItemDto } from './dto/update-investigation-item.dto';
import { InvestigationsService } from './investigations.service';
import { UpdateInvestigationLifecycleDto } from './dto/update-investigation-lifecycle.dto';
import { CreateBookmarkDto } from './dto/create-bookmark.dto';

@Controller('investigations')
export class InvestigationsController {
  constructor(
    private readonly investigationsService: InvestigationsService,
    private readonly auditService: AuditService,
  ) {}

  @Roles(UserRole.VIEWER)
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return this.investigationsService.list(user);
  }

  @Roles(UserRole.OPERATOR)
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateInvestigationDto, @Req() req: Request) {
    const created = await this.investigationsService.create(user, dto);
    await this.auditService.log(user.id, 'investigation.create', 'Investigation', created.id, { title: created.title }, req);
    return created;
  }

  @Roles(UserRole.VIEWER)
  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.investigationsService.findOne(user, id);
  }

  @Roles(UserRole.OPERATOR)
  @Patch(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateInvestigationDto, @Req() req: Request) {
    const updated = await this.investigationsService.update(user, id, dto);
    await this.auditService.log(user.id, 'investigation.update', 'Investigation', id, null, req);
    return updated;
  }

  @Roles(UserRole.OPERATOR)
  @Post(':id/lifecycle')
  async transitionLifecycle(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateInvestigationLifecycleDto,
    @Req() req: Request,
  ) {
    const updated = await this.investigationsService.transitionLifecycle(user, id, dto);
    await this.auditService.log(user.id, 'investigation.lifecycle', 'Investigation', id, { status: dto.status }, req);
    return updated;
  }

  @Roles(UserRole.VIEWER)
  @Get(':id/bookmarks')
  async listBookmarks(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.investigationsService.listBookmarks(user, id);
  }

  @Roles(UserRole.OPERATOR)
  @Post(':id/bookmarks')
  async addBookmark(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateBookmarkDto, @Req() req: Request) {
    const item = await this.investigationsService.addBookmark(user, id, dto);
    await this.auditService.log(user.id, 'investigation.bookmark.add', 'Investigation', id, { itemId: item.id }, req);
    return item;
  }

  @Roles(UserRole.OPERATOR)
  @Post(':id/items')
  async addItem(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateInvestigationItemDto, @Req() req: Request) {
    const item = await this.investigationsService.addItem(user, id, dto);
    await this.auditService.log(user.id, 'investigation.item.add', 'Investigation', id, { itemId: item.id, type: item.type }, req);
    return item;
  }

  @Roles(UserRole.OPERATOR)
  @Patch(':id/items/:itemId')
  async updateItem(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: UpdateInvestigationItemDto, @Req() req: Request) {
    const item = await this.investigationsService.updateItem(user, id, itemId, dto);
    await this.auditService.log(user.id, 'investigation.item.update', 'InvestigationItem', itemId, { investigationId: id }, req);
    return item;
  }

  @Roles(UserRole.OPERATOR)
  @Delete(':id/items/:itemId')
  async removeItem(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('itemId') itemId: string, @Req() req: Request) {
    const result = await this.investigationsService.removeItem(user, id, itemId);
    await this.auditService.log(user.id, 'investigation.item.delete', 'InvestigationItem', itemId, { investigationId: id }, req);
    return result;
  }
}
