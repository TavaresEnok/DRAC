import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

  list(includeInactive: boolean) {
    return this.prisma.site.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async getById(id: string, includeInactive: boolean) {
    const site = await this.prisma.site.findUnique({ where: { id } });
    if (!site || (!includeInactive && !site.isActive)) {
      throw new NotFoundException('Unidade não encontrada.');
    }
    return site;
  }

  create(dto: CreateSiteDto) {
    return this.prisma.site.create({ data: dto });
  }

  async update(id: string, dto: UpdateSiteDto) {
    await this.getById(id, true);
    return this.prisma.site.update({ where: { id }, data: dto });
  }

  async softDelete(id: string) {
    await this.getById(id, true);
    return this.prisma.site.update({ where: { id }, data: { isActive: false } });
  }
}
