import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';

@Injectable()
export class AreasService {
  constructor(private readonly prisma: PrismaService) {}

  list(includeInactive: boolean, siteId?: string) {
    return this.prisma.area.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(siteId ? { siteId } : {}),
      },
      include: { site: true },
      orderBy: { name: 'asc' },
    });
  }

  async getById(id: string, includeInactive: boolean) {
    const area = await this.prisma.area.findUnique({ where: { id }, include: { site: true } });
    if (!area || (!includeInactive && !area.isActive)) {
      throw new NotFoundException('Área não encontrada.');
    }
    return area;
  }

  create(dto: CreateAreaDto) {
    return this.prisma.area.create({ data: dto, include: { site: true } });
  }

  async update(id: string, dto: UpdateAreaDto) {
    await this.getById(id, true);
    return this.prisma.area.update({ where: { id }, data: dto, include: { site: true } });
  }

  async softDelete(id: string) {
    await this.getById(id, true);
    return this.prisma.area.update({ where: { id }, data: { isActive: false }, include: { site: true } });
  }
}
