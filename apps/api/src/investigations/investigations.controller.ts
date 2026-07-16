import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { createReadStream } from 'node:fs';
import { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../role-permissions/require-permission.decorator';
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
  async list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('classification') classification?: string,
    @Query('ownerUserId') ownerUserId?: string,
  ) {
    return this.investigationsService.list(user, { q, status, priority, classification, ownerUserId });
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
    if (String(dto.status).toUpperCase() === 'CLOSED' && !(dto.note?.trim())) {
      throw new BadRequestException('Motivo é obrigatório para fechar o caso.');
    }
    const updated = await this.investigationsService.transitionLifecycle(user, id, dto);
    await this.auditService.log(
      user.id,
      'investigation.lifecycle',
      'Investigation',
      id,
      { status: dto.status, note: dto.note?.trim() || null },
      req,
    );
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

  @Roles(UserRole.VIEWER)
  @Get(':id/notes')
  async listNotes(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.investigationsService.listNotes(user, id);
  }

  @Roles(UserRole.OPERATOR)
  @Post(':id/notes')
  async addNote(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { note: string }, @Req() req: Request) {
    const item = await this.investigationsService.addNote(user, id, body.note ?? '');
    await this.auditService.log(user.id, 'investigation.note.add', 'Investigation', id, { itemId: item.id }, req);
    return item;
  }

  @Roles(UserRole.VIEWER)
  @Get(':id/activity')
  async listActivity(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.investigationsService.listActivity(user, id);
  }

  @Roles(UserRole.VIEWER)
  @Get(':id/custody')
  async custody(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.investigationsService.getCustodyChain(user, id);
  }

  @Roles(UserRole.VIEWER)
  @Get(':id/closure-trace')
  async closureTrace(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.investigationsService.getClosureTrace(user, id);
  }

  @Roles(UserRole.OPERATOR)
  // reportGenerate existia na matriz de permissões (e no painel "Perfis e Permissões")
  // mas NÃO era exigido em rota nenhuma — desmarcar não surtia efeito. OPERATOR e ADMIN
  // já o têm por padrão, então exigir aqui não muda o comportamento atual: apenas faz o
  // controle passar a valer de verdade.
  @RequirePermission('reportGenerate')
  @Get(':id/report')
  async report(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('reason') reason: string | undefined,
    @Req() req: Request,
  ) {
    const cleanReason = reason?.trim() ?? '';
    if (!cleanReason) throw new BadRequestException('Motivo é obrigatório para gerar relatório.');
    const report = await this.investigationsService.buildInvestigationReport(user, id);
    await this.auditService.log(
      user.id,
      'investigation.report.generate',
      'Investigation',
      id,
      { generatedAt: report.generatedAt, reason: cleanReason },
      req,
    );
    return report;
  }

  @Roles(UserRole.VIEWER)
  @Get(':id/legal-hold')
  async getLegalHold(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.investigationsService.getLegalHold(user, id);
  }

  @Roles(UserRole.OPERATOR)
  @Post(':id/legal-hold')
  async setLegalHold(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { enabled: boolean; reason?: string; recordingIds?: string[]; clipIds?: string[]; itemIds?: string[] },
    @Req() req: Request,
  ) {
    const result = await this.investigationsService.setLegalHold(user, id, body);
    await this.auditService.log(user.id, 'investigation.legal_hold.set', 'Investigation', id, body as any, req);
    return result;
  }

  @Roles(UserRole.OPERATOR)
  @Post(':id/meta')
  async upsertCaseMeta(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
      classification?: string;
      ownerUserId?: string | null;
      ownerUserName?: string | null;
      participants?: Array<{ userId: string; userName: string }>;
    },
    @Req() req: Request,
  ) {
    const updated = await this.investigationsService.upsertCaseMeta(user, id, body);
    await this.auditService.log(user.id, 'investigation.meta.update', 'Investigation', id, body as any, req);
    return updated;
  }

  @Roles(UserRole.VIEWER)
  @Get(':id/exports')
  async listExports(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.investigationsService.listExportRequests(user, id);
  }

  @Roles(UserRole.OPERATOR)
  @Post(':id/exports/request')
  async requestExport(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { reason: string; format?: 'MP4' | 'AVI' | 'NATIVE'; itemIds?: string[]; recordingIds?: string[]; clipIds?: string[] },
    @Req() req: Request,
  ) {
    const created = await this.investigationsService.createExportRequest(user, id, body);
    await this.auditService.log(user.id, 'investigation.export.request', 'Investigation', id, { requestId: created.id }, req);
    return created;
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/exports/:requestId/review')
  async reviewExport(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Body() body: { decision: 'APPROVED' | 'REJECTED'; reason: string },
    @Req() req: Request,
  ) {
    const updated = await this.investigationsService.reviewExportRequest(user, id, requestId, body);
    await this.auditService.log(user.id, 'investigation.export.review', 'Investigation', id, { requestId, decision: body.decision }, req);
    return updated;
  }

  @Roles(UserRole.OPERATOR)
  @Post(':id/exports/:requestId/execute')
  async executeExport(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Body() body: { reason: string },
    @Req() req: Request,
  ) {
    const pkg = await this.investigationsService.executeExportRequest(user, id, requestId, body.reason);
    await this.auditService.log(user.id, 'investigation.export.execute', 'Investigation', id, { requestId, packageId: pkg.id }, req);
    return pkg;
  }

  @Roles(UserRole.OPERATOR)
  @Post(':id/exports/retry-signatures')
  async retryPendingSignatures(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const result = await this.investigationsService.enqueueRetryPendingSignatures(user, id);
    await this.auditService.log(user.id, 'investigation.export.retry_signatures', 'Investigation', id, result as any, req);
    return result;
  }

  @Roles(UserRole.OPERATOR)
  @Get(':id/exports/:packageItemId/download')
  async downloadExportPackage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('packageItemId') packageItemId: string,
    @Query('reason') reason: string | undefined,
    @Req() req: Request,
    @Res() res: import('express').Response,
  ) {
    const cleanReason = reason?.trim() ?? '';
    if (!cleanReason) throw new BadRequestException('Motivo é obrigatório para download do pacote.');
    const pkg = await this.investigationsService.getExportPackageDownload(user, id, packageItemId);
    await this.auditService.log(user.id, 'investigation.export.download', 'Investigation', id, { packageItemId, reason: cleanReason, status: pkg.status }, req);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=\"${pkg.fileName}\"`);
    createReadStream(pkg.filePath).pipe(res);
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
