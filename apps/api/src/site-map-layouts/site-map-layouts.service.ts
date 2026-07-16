import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { AuthUser } from '../common/types/auth-user.type';
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
    private readonly accessControlService: AccessControlService,
  ) {}

  /**
   * O site é dado de tenant: a planta baixa (SVG) e a posição das câmeras revelam o
   * layout físico do cliente. Não havia escopo nenhum — o `user` só decidia se sites
   * inativos entravam, e qualquer VIEWER lia o mapa de QUALQUER site (recon de outro
   * tenant). Um site é acessível se o usuário enxerga ao menos uma câmera dele.
   */
  async assertCanViewSite(user: AuthUser, siteId: string) {
    if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) return;
    const accessibleCameraIds = await this.accessControlService.getAccessibleCameraIds(user);
    if (!accessibleCameraIds.length) throw new NotFoundException('Site não encontrado.');
    const camera = await this.prisma.camera.findFirst({
      where: { siteId, id: { in: accessibleCameraIds } },
      select: { id: true },
    });
    // NotFound (e não Forbidden) para não confirmar a existência do site a quem não o vê.
    if (!camera) throw new NotFoundException('Site não encontrado.');
  }

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
