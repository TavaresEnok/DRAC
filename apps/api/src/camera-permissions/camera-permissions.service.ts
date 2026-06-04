import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AccessControlService } from '../access-control/access-control.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PrismaService } from '../common/prisma/prisma.service';
import { GrantCameraPermissionDto } from './dto/grant-camera-permission.dto';
import { UpdateCameraPermissionDto } from './dto/update-camera-permission.dto';

@Injectable()
export class CameraPermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControlService: AccessControlService,
  ) {}

  private isPrivileged(user: AuthUser) {
    return user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
  }

  private async assertCanManagePermission(actor: AuthUser, permissionId: string) {
    const permission = await this.prisma.cameraPermission.findUnique({ where: { id: permissionId } });
    if (!permission) throw new NotFoundException('Permissão não encontrada.');
    if (this.isPrivileged(actor)) return permission;

    if (!permission.groupId) {
      throw new BadRequestException('Administrador de grupo só pode gerenciar permissões por grupo.');
    }
    await this.accessControlService.assertCanAdminGroup(actor, permission.groupId);
    return permission;
  }

  async list(actor: AuthUser, userId?: string) {
    const groupIds = this.isPrivileged(actor) ? null : await this.accessControlService.getAdminGroupIds(actor);
    if (groupIds && groupIds.length === 0) return [];
    return this.prisma.cameraPermission.findMany({
      where: {
        ...(userId ? { userId } : {}),
        ...(groupIds ? { groupId: { in: groupIds } } : {}),
      },
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

  async grant(actor: AuthUser, dto: GrantCameraPermissionDto) {
    await this.validateTarget(dto);
    if (!this.isPrivileged(actor)) {
      if (!dto.groupId || dto.cameraId) {
        throw new BadRequestException('Administrador de grupo só pode conceder acesso por grupo.');
      }
      await this.accessControlService.assertCanAdminGroup(actor, dto.groupId);
    }

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

  async update(actor: AuthUser, id: string, dto: UpdateCameraPermissionDto) {
    await this.assertCanManagePermission(actor, id);

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

  async remove(actor: AuthUser, id: string) {
    await this.assertCanManagePermission(actor, id);

    return this.prisma.cameraPermission.delete({ where: { id } });
  }
}
