import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CameraPermissionLevel, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { SettingsService } from '../settings/settings.service';
import { AccessControlService } from '../access-control/access-control.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthUser } from '../common/types/auth-user.type';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly settingsService: SettingsService,
    private readonly accessControlService: AccessControlService,
  ) {}

  private isPrivileged(actor: AuthUser) {
    return actor.role === UserRole.ADMIN || actor.role === UserRole.SUPER_ADMIN;
  }

  private isGroupAssignableRole(role: UserRole) {
    return role === UserRole.VIEWER || role === UserRole.OPERATOR;
  }

  private async assertPasswordStrength(password: string) {
    if (!(await this.settingsService.isStrongPasswordRequired().catch(() => false))) return;
    const strong = password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
    if (!strong) {
      throw new BadRequestException('Senha fraca: exige no mínimo 12 caracteres, com maiúscula, minúscula e número.');
    }
  }

  private sanitize(user: User) {
    const { passwordHash, ...safe } = user;
    return safe;
  }

  async list(actor?: AuthUser) {
    if (actor && !this.isPrivileged(actor)) {
      const groupIds = await this.accessControlService.getAdminGroupIds(actor);
      if (!groupIds.length) return [];
      const users = await this.prisma.user.findMany({
        where: { cameraPermissions: { some: { groupId: { in: groupIds } } } },
        orderBy: { createdAt: 'desc' },
      });
      return users.map((user) => this.sanitize(user));
    }

    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    return users.map((user) => this.sanitize(user));
  }

  async getById(id: string, actor?: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    if (actor && !this.isPrivileged(actor)) {
      await this.assertCanManageUser(actor, id);
    }
    return this.sanitize(user);
  }

  private async assertCanManageUser(actor: AuthUser, targetUserId: string) {
    const groupIds = await this.accessControlService.getAdminGroupIds(actor);
    if (!groupIds.length) {
      throw new ForbiddenException('Sem grupo administrável para gerenciar usuários.');
    }

    const targetPermission = await this.prisma.cameraPermission.findFirst({
      where: { userId: targetUserId, groupId: { in: groupIds } },
      select: { id: true },
    });
    if (!targetPermission) {
      throw new ForbiddenException('Usuário fora dos grupos administráveis.');
    }
  }

  private async resolveManagedGroupIds(actor: AuthUser, requestedGroupIds?: string[]) {
    const groupIds = [...new Set((requestedGroupIds ?? []).map((id) => id.trim()).filter(Boolean))];
    if (this.isPrivileged(actor)) return groupIds;

    const adminGroupIds = await this.accessControlService.getAdminGroupIds(actor);
    if (!adminGroupIds.length) {
      throw new ForbiddenException('Sem grupo administrável para criar usuários.');
    }

    const selected = groupIds.length ? groupIds : adminGroupIds;
    const allowed = new Set(adminGroupIds);
    if (selected.some((id) => !allowed.has(id))) {
      throw new ForbiddenException('Não é permitido vincular usuário fora dos seus grupos.');
    }
    return selected;
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    if (!this.isPrivileged(actor) && !this.isGroupAssignableRole(dto.role)) {
      throw new ForbiddenException('Administrador de grupo só pode criar VIEWER ou OPERATOR.');
    }
    if (this.isPrivileged(actor) && !this.authService.canAssignRole(actor.role, dto.role)) {
      throw new ForbiddenException('Sem permissão para criar usuário com esse perfil.');
    }

    const groupIds = await this.resolveManagedGroupIds(actor, dto.groupIds);
    await this.assertPasswordStrength(dto.password);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email.trim().toLowerCase(),
        passwordHash,
        role: dto.role,
        ...(groupIds.length
          ? {
              cameraPermissions: {
                create: groupIds.map((groupId) => ({
                  groupId,
                  level: dto.permissionLevel ?? CameraPermissionLevel.VIEW,
                })),
              },
            }
          : {}),
      },
    });

    return this.sanitize(user);
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    if (!this.isPrivileged(actor)) {
      await this.assertCanManageUser(actor, id);
      if (existing.role === UserRole.ADMIN || existing.role === UserRole.SUPER_ADMIN) {
        throw new ForbiddenException('Administrador de grupo não pode alterar administradores globais.');
      }
      if (dto.role && !this.isGroupAssignableRole(dto.role)) {
        throw new ForbiddenException('Administrador de grupo só pode atribuir VIEWER ou OPERATOR.');
      }
    }

    const nextRole = dto.role ?? existing.role;
    if (this.isPrivileged(actor) && !this.authService.canAssignRole(actor.role, nextRole)) {
      throw new ForbiddenException('Sem permissão para atribuir esse perfil.');
    }

    if (existing.role === UserRole.SUPER_ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Apenas SUPER_ADMIN pode alterar SUPER_ADMIN.');
    }

    if (dto.password) {
      await this.assertPasswordStrength(dto.password);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        email: dto.email?.trim().toLowerCase(),
        role: dto.role,
        isActive: dto.isActive,
        ...(dto.password ? { passwordHash: await bcrypt.hash(dto.password, 10) } : {}),
      },
    });

    return this.sanitize(user);
  }

  async softDelete(actor: AuthUser, id: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    if (!this.isPrivileged(actor)) {
      await this.assertCanManageUser(actor, id);
      if (existing.role === UserRole.ADMIN || existing.role === UserRole.SUPER_ADMIN) {
        throw new ForbiddenException('Administrador de grupo não pode desativar administradores globais.');
      }
    }

    if (this.isPrivileged(actor) && !this.authService.canAssignRole(actor.role, existing.role)) {
      throw new ForbiddenException('Sem permissão para desativar este usuário.');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return this.sanitize(user);
  }
}
