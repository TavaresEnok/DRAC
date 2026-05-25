import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { type Request } from 'express';
import { AuthUser } from '../common/types/auth-user.type';
import { REQUIRE_PERMISSION_KEY } from './require-permission.decorator';
import { type PermissionKey } from './role-permissions.constants';
import { RolePermissionsService } from './role-permissions.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rolePermissions: RolePermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PermissionKey | undefined>(REQUIRE_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Rota sem @RequirePermission: o guard é transparente.
    if (!required) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user) return false;

    // SUPER_ADMIN nunca é bloqueado (evita auto-lockout do administrador máximo).
    if (user.role === UserRole.SUPER_ADMIN) return true;

    const allowed = await this.rolePermissions.hasPermission(user.role, required);
    if (!allowed) {
      throw new ForbiddenException(`Permissão negada: requer "${required}".`);
    }
    return true;
  }
}
