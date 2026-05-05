import { ForbiddenException, Injectable } from '@nestjs/common';
import { CameraPermissionLevel, UserRole } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthUser } from '../common/types/auth-user.type';

const levelWeight: Record<CameraPermissionLevel, number> = {
  VIEW: 1,
  CONTROL: 2,
  RECORD: 3,
  ADMIN: 4,
};

@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  private isPrivileged(user: AuthUser): boolean {
    return user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;
  }

  async getAccessibleCameraIds(user: AuthUser): Promise<string[]> {
    if (this.isPrivileged(user)) {
      const all = await this.prisma.camera.findMany({ select: { id: true } });
      return all.map((item) => item.id);
    }

    const [direct, byGroup] = await Promise.all([
      this.prisma.cameraPermission.findMany({
        where: { userId: user.id, cameraId: { not: null } },
        select: { cameraId: true },
      }),
      this.prisma.cameraPermission.findMany({
        where: { userId: user.id, groupId: { not: null } },
        select: { groupId: true },
      }),
    ]);

    const groupIds = byGroup.map((item) => item.groupId).filter((id): id is string => Boolean(id));
    const groupCameras = groupIds.length
      ? await this.prisma.camera.findMany({ where: { groupId: { in: groupIds } }, select: { id: true } })
      : [];

    return Array.from(new Set([
      ...direct.map((item) => item.cameraId).filter((id): id is string => Boolean(id)),
      ...groupCameras.map((item) => item.id),
    ]));
  }

  private async getMaxPermissionLevel(userId: string, cameraId: string): Promise<CameraPermissionLevel | null> {
    const camera = await this.prisma.camera.findUnique({ where: { id: cameraId }, select: { groupId: true } });
    if (!camera) return null;

    const perms = await this.prisma.cameraPermission.findMany({
      where: {
        userId,
        OR: [
          { cameraId },
          ...(camera.groupId ? [{ groupId: camera.groupId }] : []),
        ],
      },
      select: { level: true },
    });

    if (!perms.length) {
      return null;
    }

    let max = perms[0].level;
    for (const perm of perms) {
      if (levelWeight[perm.level] > levelWeight[max]) {
        max = perm.level;
      }
    }
    return max;
  }

  private async hasLevel(user: AuthUser, cameraId: string, minLevel: CameraPermissionLevel): Promise<boolean> {
    if (this.isPrivileged(user)) {
      return true;
    }

    const max = await this.getMaxPermissionLevel(user.id, cameraId);
    if (!max) return false;
    return levelWeight[max] >= levelWeight[minLevel];
  }

  async canViewCamera(user: AuthUser, cameraId: string): Promise<boolean> {
    return this.hasLevel(user, cameraId, CameraPermissionLevel.VIEW);
  }

  async canControlCamera(user: AuthUser, cameraId: string): Promise<boolean> {
    return this.hasLevel(user, cameraId, CameraPermissionLevel.CONTROL);
  }

  async canRecordCamera(user: AuthUser, cameraId: string): Promise<boolean> {
    return this.hasLevel(user, cameraId, CameraPermissionLevel.RECORD);
  }

  async canAdminCamera(user: AuthUser, cameraId: string): Promise<boolean> {
    return this.hasLevel(user, cameraId, CameraPermissionLevel.ADMIN);
  }

  async assertCanViewCamera(user: AuthUser, cameraId: string): Promise<void> {
    if (!(await this.canViewCamera(user, cameraId))) {
      throw new ForbiddenException('Sem permissão para visualizar esta câmera.');
    }
  }

  async assertCanControlCamera(user: AuthUser, cameraId: string): Promise<void> {
    if (!(await this.canControlCamera(user, cameraId))) {
      throw new ForbiddenException('Sem permissão para controlar esta câmera.');
    }
  }

  async assertCanRecordCamera(user: AuthUser, cameraId: string): Promise<void> {
    if (!(await this.canRecordCamera(user, cameraId))) {
      throw new ForbiddenException('Sem permissão para gravação nesta câmera.');
    }
  }

  async assertCanAdminCamera(user: AuthUser, cameraId: string): Promise<void> {
    if (!(await this.canAdminCamera(user, cameraId))) {
      throw new ForbiddenException('Sem permissão administrativa nesta câmera.');
    }
  }
}
