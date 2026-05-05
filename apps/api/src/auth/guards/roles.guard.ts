import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { type Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthUser } from '../../common/types/auth-user.type';

const roleWeight: Record<UserRole, number> = {
  VIEWER: 1,
  OPERATOR: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user) {
      return false;
    }

    const userWeight = roleWeight[user.role];
    return requiredRoles.some((role) => userWeight >= roleWeight[role]);
  }
}
