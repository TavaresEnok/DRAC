import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { GrantCameraPermissionDto } from './dto/grant-camera-permission.dto';
import { UpdateCameraPermissionDto } from './dto/update-camera-permission.dto';

@Injectable()
export class CameraPermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId?: string) {
    return this.prisma.cameraPermission.findMany({
      where: userId ? { userId } : {},
      include: {
        user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
        camera: { select: { id: true, name: true, groupId: true } },
        group: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async validateTarget(dto: GrantCameraPermissionDto) {
    const hasCamera = Boolean(dto.cameraId);
    const hasGroup = Boolean(dto.groupId);
    if (hasCamera === hasGroup) {
      throw new BadRequestException('Permissão deve ser por câmera OU por grupo.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    if (dto.cameraId) {
      const camera = await this.prisma.camera.findUnique({ where: { id: dto.cameraId } });
      if (!camera) throw new NotFoundException('Câmera não encontrada.');
    }

    if (dto.groupId) {
      const group = await this.prisma.cameraGroup.findUnique({ where: { id: dto.groupId } });
      if (!group) throw new NotFoundException('Grupo não encontrado.');
    }
  }

  async grant(dto: GrantCameraPermissionDto) {
    await this.validateTarget(dto);

    const existing = await this.prisma.cameraPermission.findFirst({
      where: {
        userId: dto.userId,
        cameraId: dto.cameraId ?? null,
        groupId: dto.groupId ?? null,
      },
    });

    if (existing) {
      return this.prisma.cameraPermission.update({
        where: { id: existing.id },
        data: { level: dto.level },
        include: {
          user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
          camera: { select: { id: true, name: true, groupId: true } },
          group: { select: { id: true, name: true } },
        },
      });
    }

    return this.prisma.cameraPermission.create({
      data: dto,
      include: {
        user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
        camera: { select: { id: true, name: true, groupId: true } },
        group: { select: { id: true, name: true } },
      },
    });
  }

  async update(id: string, dto: UpdateCameraPermissionDto) {
    const existing = await this.prisma.cameraPermission.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Permissão não encontrada.');

    return this.prisma.cameraPermission.update({
      where: { id },
      data: { level: dto.level },
      include: {
        user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
        camera: { select: { id: true, name: true, groupId: true } },
        group: { select: { id: true, name: true } },
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.cameraPermission.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Permissão não encontrada.');

    return this.prisma.cameraPermission.delete({ where: { id } });
  }
}
