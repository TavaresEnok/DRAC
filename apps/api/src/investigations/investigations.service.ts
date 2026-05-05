import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthUser } from '../common/types/auth-user.type';
import { CreateInvestigationDto } from './dto/create-investigation.dto';
import { UpdateInvestigationDto } from './dto/update-investigation.dto';
import { CreateInvestigationItemDto } from './dto/create-investigation-item.dto';
import { UpdateInvestigationItemDto } from './dto/update-investigation-item.dto';
import { UpdateInvestigationLifecycleDto } from './dto/update-investigation-lifecycle.dto';
import { CreateBookmarkDto } from './dto/create-bookmark.dto';

@Injectable()
export class InvestigationsService {
  constructor(private readonly prisma: PrismaService) {}

  private map(investigation: any) {
    return {
      id: investigation.id,
      title: investigation.title,
      status: investigation.status,
      summary: investigation.summary,
      selectedCameraIds: Array.isArray(investigation.selectedCameraIds) ? investigation.selectedCameraIds : [],
      timeStart: investigation.timeStart,
      timeEnd: investigation.timeEnd,
      playbackSpeed: investigation.playbackSpeed,
      activeTrackTime: investigation.activeTrackTime,
      createdByUserId: investigation.createdByUserId,
      createdByUserName: investigation.createdByUserName,
      createdAt: investigation.createdAt,
      updatedAt: investigation.updatedAt,
      items: Array.isArray(investigation.items)
        ? investigation.items.map((item: any) => ({
            id: item.id,
            type: item.type,
            label: item.label,
            cameraId: item.cameraId,
            cameraName: item.cameraName,
            eventId: item.eventId,
            recordingId: item.recordingId,
            timestamp: item.timestamp,
            notes: item.notes,
            metadata: item.metadata,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          }))
        : [],
    };
  }

  private async assertAccessible(user: AuthUser, id: string) {
    const investigation = await this.prisma.investigation.findUnique({
      where: { id },
      include: { items: { orderBy: { timestamp: 'asc' } } },
    });
    if (!investigation) throw new NotFoundException('Investigation não encontrada.');
    if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) return investigation;
    if (investigation.createdByUserId !== user.id) {
      throw new NotFoundException('Investigation não encontrada.');
    }
    return investigation;
  }

  async list(user: AuthUser) {
    const where =
      user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN
        ? {}
        : { createdByUserId: user.id };

    const items = await this.prisma.investigation.findMany({
      where,
      include: { items: { orderBy: { timestamp: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    return { items: items.map((item) => this.map(item)) };
  }

  async create(user: AuthUser, dto: CreateInvestigationDto) {
    const created = await this.prisma.investigation.create({
      data: {
        title: dto.title.trim(),
        status: dto.status?.trim() || 'OPEN',
        summary: dto.summary?.trim() || null,
        selectedCameraIds: dto.selectedCameraIds as unknown as Prisma.InputJsonValue,
        timeStart: new Date(dto.timeStart),
        timeEnd: new Date(dto.timeEnd),
        playbackSpeed: dto.playbackSpeed ?? '1x',
        activeTrackTime: dto.activeTrackTime ?? 0,
        createdByUserId: user.id,
        createdByUserName: user.name,
      },
      include: { items: true },
    });
    return this.map(created);
  }

  async findOne(user: AuthUser, id: string) {
    const investigation = await this.assertAccessible(user, id);
    return this.map(investigation);
  }

  async update(user: AuthUser, id: string, dto: UpdateInvestigationDto) {
    await this.assertAccessible(user, id);
    const updated = await this.prisma.investigation.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.status !== undefined ? { status: dto.status.trim() || 'OPEN' } : {}),
        ...(dto.summary !== undefined ? { summary: dto.summary?.trim() || null } : {}),
        ...(dto.selectedCameraIds !== undefined ? { selectedCameraIds: dto.selectedCameraIds as unknown as Prisma.InputJsonValue } : {}),
        ...(dto.timeStart !== undefined ? { timeStart: new Date(dto.timeStart) } : {}),
        ...(dto.timeEnd !== undefined ? { timeEnd: new Date(dto.timeEnd) } : {}),
        ...(dto.playbackSpeed !== undefined ? { playbackSpeed: dto.playbackSpeed } : {}),
        ...(dto.activeTrackTime !== undefined ? { activeTrackTime: dto.activeTrackTime } : {}),
      },
      include: { items: { orderBy: { timestamp: 'asc' } } },
    });
    return this.map(updated);
  }

  async addItem(user: AuthUser, investigationId: string, dto: CreateInvestigationItemDto) {
    await this.assertAccessible(user, investigationId);
    const item = await this.prisma.investigationItem.create({
      data: {
        investigationId,
        type: dto.type,
        label: dto.label.trim(),
        cameraId: dto.cameraId ?? null,
        cameraName: dto.cameraName ?? null,
        eventId: dto.eventId ?? null,
        recordingId: dto.recordingId ?? null,
        timestamp: new Date(dto.timestamp),
        notes: dto.notes?.trim() || null,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
    });
    return item;
  }

  async updateItem(user: AuthUser, investigationId: string, itemId: string, dto: UpdateInvestigationItemDto) {
    await this.assertAccessible(user, investigationId);
    const existing = await this.prisma.investigationItem.findFirst({ where: { id: itemId, investigationId } });
    if (!existing) throw new NotFoundException('Item de evidência não encontrado.');
    return this.prisma.investigationItem.update({
      where: { id: itemId },
      data: {
        ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
      },
    });
  }

  async removeItem(user: AuthUser, investigationId: string, itemId: string) {
    await this.assertAccessible(user, investigationId);
    const existing = await this.prisma.investigationItem.findFirst({ where: { id: itemId, investigationId } });
    if (!existing) throw new NotFoundException('Item de evidência não encontrado.');
    await this.prisma.investigationItem.delete({ where: { id: itemId } });
    return { status: 'deleted', id: itemId };
  }

  async listBookmarks(user: AuthUser, investigationId: string) {
    await this.assertAccessible(user, investigationId);
    const items = await this.prisma.investigationItem.findMany({
      where: { investigationId, type: 'bookmark' },
      orderBy: { timestamp: 'asc' },
    });
    return { items };
  }

  async addBookmark(user: AuthUser, investigationId: string, dto: CreateBookmarkDto) {
    await this.assertAccessible(user, investigationId);
    return this.prisma.investigationItem.create({
      data: {
        investigationId,
        type: 'bookmark',
        label: dto.label.trim(),
        cameraId: dto.cameraId ?? null,
        cameraName: dto.cameraName ?? null,
        timestamp: new Date(dto.timestamp),
        notes: dto.notes?.trim() || null,
      },
    });
  }

  async transitionLifecycle(user: AuthUser, investigationId: string, dto: UpdateInvestigationLifecycleDto) {
    await this.assertAccessible(user, investigationId);
    const updated = await this.prisma.investigation.update({
      where: { id: investigationId },
      data: {
        status: dto.status,
        ...(dto.summary !== undefined ? { summary: dto.summary.trim() || null } : {}),
        ...(dto.note ? { items: { create: { type: 'lifecycle', label: `Status alterado para ${dto.status}`, timestamp: new Date(), notes: dto.note.trim() } } } : {}),
      },
      include: { items: { orderBy: { timestamp: 'asc' } } },
    });
    return this.map(updated);
  }
}
