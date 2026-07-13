import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateLiveLayoutDto } from './dto/create-live-layout.dto';
import { UpdateLiveLayoutDto } from './dto/update-live-layout.dto';

@Injectable()
export class LiveLayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.liveLayout.findMany({
      where: { userId },
      orderBy: [{ lastUsedAt: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  create(userId: string, dto: CreateLiveLayoutDto) {
    return this.prisma.liveLayout.create({
      data: {
        userId,
        name: this.normalizeName(dto.name),
        gridSize: dto.gridSize,
        cameraIds: this.normalizeCameraIds(dto.cameraIds) as Prisma.InputJsonValue,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateLiveLayoutDto) {
    await this.getOwned(userId, id);
    return this.prisma.liveLayout.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: this.normalizeName(dto.name) } : {}),
        ...(dto.gridSize !== undefined ? { gridSize: dto.gridSize } : {}),
        ...(dto.cameraIds !== undefined
          ? { cameraIds: this.normalizeCameraIds(dto.cameraIds) as Prisma.InputJsonValue }
          : {}),
        lastUsedAt: new Date(),
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.getOwned(userId, id);
    return this.prisma.liveLayout.delete({ where: { id } });
  }

  private async getOwned(userId: string, id: string) {
    const layout = await this.prisma.liveLayout.findFirst({ where: { id, userId } });
    if (!layout) throw new NotFoundException('Layout ao vivo não encontrado.');
    return layout;
  }

  private normalizeName(value: string) {
    const name = value.trim();
    if (!name) throw new BadRequestException('Informe um nome para o layout.');
    return name;
  }

  private normalizeCameraIds(values: string[]) {
    return values.slice(0, 64).map((value) => String(value).trim());
  }
}
