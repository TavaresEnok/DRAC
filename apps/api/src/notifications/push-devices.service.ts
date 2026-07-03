import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class PushDevicesService {
  private readonly logger = new Logger(PushDevicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Registra (ou revalida) um token de push para o usuário. Idempotente. */
  async register(userId: string, token: string, platform?: string, deviceName?: string) {
    const now = new Date();
    // Um token pertence a UM aparelho; se ele reaparecer para outro usuário
    // (troca de login no mesmo device), migra o token para o usuário atual.
    await this.prisma.pushDevice.upsert({
      where: { token },
      create: { userId, token, platform: platform ?? null, deviceName: deviceName ?? null, lastSeenAt: now },
      update: { userId, platform: platform ?? undefined, deviceName: deviceName ?? undefined, lastSeenAt: now },
    });
    return { ok: true };
  }

  /** Remove um token (logout / permissão revogada no aparelho). */
  async unregister(userId: string, token: string) {
    await this.prisma.pushDevice.deleteMany({ where: { token, userId } });
    return { ok: true };
  }

  /** Remove tokens que o Expo reportou como inválidos (aparelho desregistrado). */
  async pruneInvalid(tokens: string[]) {
    if (!tokens.length) return;
    await this.prisma.pushDevice.deleteMany({ where: { token: { in: tokens } } });
    this.logger.log(`Removidos ${tokens.length} token(s) de push inválidos.`);
  }

  /**
   * Tokens de push de TODOS os usuários que podem VER a câmera:
   *  - SUPER_ADMIN / ADMIN veem todas;
   *  - demais: permissão direta na câmera OU no grupo dela.
   * Espelha o AccessControlService (sentido inverso: câmera → usuários).
   */
  async getTokensForCamera(cameraId: string | null | undefined): Promise<string[]> {
    if (!cameraId) {
      // Alarme sem câmera (ex.: saúde do sistema): só privilegiados.
      return this.tokensForPrivileged();
    }
    const camera = await this.prisma.camera.findUnique({
      where: { id: cameraId },
      select: { groupId: true },
    });

    const [privileged, perms] = await Promise.all([
      this.prisma.user.findMany({
        where: { isActive: true, role: { in: [UserRole.SUPER_ADMIN, UserRole.ADMIN] } },
        select: { id: true },
      }),
      this.prisma.cameraPermission.findMany({
        where: {
          OR: [{ cameraId }, ...(camera?.groupId ? [{ groupId: camera.groupId }] : [])],
        },
        select: { userId: true },
      }),
    ]);

    const userIds = Array.from(
      new Set([...privileged.map((u) => u.id), ...perms.map((p) => p.userId)]),
    );
    return this.tokensForUsers(userIds);
  }

  private async tokensForPrivileged(): Promise<string[]> {
    const privileged = await this.prisma.user.findMany({
      where: { isActive: true, role: { in: [UserRole.SUPER_ADMIN, UserRole.ADMIN] } },
      select: { id: true },
    });
    return this.tokensForUsers(privileged.map((u) => u.id));
  }

  private async tokensForUsers(userIds: string[]): Promise<string[]> {
    if (!userIds.length) return [];
    const devices = await this.prisma.pushDevice.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    });
    return devices.map((d) => d.token);
  }
}
