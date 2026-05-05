import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { SitesService } from '../sites/sites.service';
import { UpsertSiteMapLayoutDto } from './dto/upsert-site-map-layout.dto';

type Marker = {
  xPct: number;
  yPct: number;
  zoneId?: string;
};

@Injectable()
export class SiteMapLayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sitesService: SitesService,
  ) {}

  async list(siteId: string, includeInactiveSite: boolean) {
    await this.sitesService.getById(siteId, includeInactiveSite);
    return this.prisma.siteMapLayout.findMany({
      where: { siteId },
      orderBy: { floor: 'asc' },
    });
  }

  async getByFloor(siteId: string, floor: string, includeInactiveSite: boolean) {
    await this.sitesService.getById(siteId, includeInactiveSite);
    const normalizedFloor = this.normalizeFloor(floor);
    const layout = await this.prisma.siteMapLayout.findUnique({
      where: {
        siteId_floor: {
          siteId,
          floor: normalizedFloor,
        },
      },
    });

    if (!layout) {
      throw new NotFoundException('Layout de mapa não encontrado para este andar.');
    }

    return layout;
  }

  async upsert(siteId: string, floor: string, dto: UpsertSiteMapLayoutDto, includeInactiveSite: boolean) {
    await this.sitesService.getById(siteId, includeInactiveSite);
    const normalizedFloor = this.normalizeFloor(floor);
    const svgDataUrl = this.normalizeSvgDataUrl(dto.svgDataUrl);

    const markers = dto.markers === undefined ? undefined : this.sanitizeMarkers(dto.markers);

    return this.prisma.siteMapLayout.upsert({
      where: {
        siteId_floor: {
          siteId,
          floor: normalizedFloor,
        },
      },
      create: {
        siteId,
        floor: normalizedFloor,
        svgDataUrl: svgDataUrl ?? null,
        markers: (markers ?? {}) as Prisma.InputJsonValue,
      },
      update: {
        ...(svgDataUrl !== undefined ? { svgDataUrl: svgDataUrl ?? null } : {}),
        ...(markers !== undefined ? { markers: markers as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async deleteByFloor(siteId: string, floor: string, includeInactiveSite: boolean) {
    await this.sitesService.getById(siteId, includeInactiveSite);
    const normalizedFloor = this.normalizeFloor(floor);

    return this.prisma.siteMapLayout.delete({
      where: {
        siteId_floor: {
          siteId,
          floor: normalizedFloor,
        },
      },
    });
  }

  private normalizeFloor(floor: string) {
    const normalized = floor.trim();
    if (!normalized) {
      throw new BadRequestException('Andar inválido.');
    }
    if (normalized.length > 64) {
      throw new BadRequestException('Andar excede o tamanho máximo permitido.');
    }
    return normalized;
  }

  private normalizeSvgDataUrl(svgDataUrl: string | null | undefined) {
    if (svgDataUrl === undefined) return undefined;
    if (svgDataUrl === null) return null;

    const normalized = svgDataUrl.trim();
    if (!normalized) return null;

    if (!normalized.startsWith('data:image/svg+xml')) {
      throw new BadRequestException('Somente SVG em Data URL é permitido.');
    }

    if (normalized.length > 4_000_000) {
      throw new BadRequestException('Arquivo SVG excede o limite de tamanho.');
    }

    return normalized;
  }

  private sanitizeMarkers(markersInput: Record<string, unknown>) {
    const markers: Record<string, Marker> = {};

    for (const [cameraId, value] of Object.entries(markersInput)) {
      if (!cameraId || cameraId.length > 128) continue;
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;

      const xRaw = (value as { xPct?: unknown }).xPct;
      const yRaw = (value as { yPct?: unknown }).yPct;
      const zoneRaw = (value as { zoneId?: unknown }).zoneId;

      const x = Number(xRaw);
      const y = Number(yRaw);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      const marker: Marker = {
        xPct: this.clamp(x, 0, 100),
        yPct: this.clamp(y, 0, 70),
      };

      if (typeof zoneRaw === 'string' && zoneRaw.trim()) {
        marker.zoneId = zoneRaw.trim().slice(0, 128);
      }

      markers[cameraId] = marker;
    }

    return markers;
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }
}
