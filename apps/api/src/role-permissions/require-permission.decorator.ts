import { SetMetadata } from '@nestjs/common';
import { type PermissionKey } from './role-permissions.constants';

export const REQUIRE_PERMISSION_KEY = 'require_permission';
export const RequirePermission = (permission: PermissionKey) => SetMetadata(REQUIRE_PERMISSION_KEY, permission);
