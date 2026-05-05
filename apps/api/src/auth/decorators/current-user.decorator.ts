import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { type Request } from 'express';
import { AuthUser } from '../../common/types/auth-user.type';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser | null => {
  const request = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
  return request.user ?? null;
});
