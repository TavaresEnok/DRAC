import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  DEFAULT_PERMISSIONS,
  normalizeMatrix,
  PERMISSION_KEYS,
  type PermissionKey,
  type PermissionMatrix,
} from './role-permissions.constants';

@Injectable()
export class RolePermissionsService implements OnModuleInit {
  private readonly logger = new Logger(RolePermissionsService.name);
  private cache: Record<string, PermissionMatrix> | null = null;
  private cacheAt = 0;
  private static readonly CACHE_TTL_MS = 15_000;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Semeia os defaults para papéis ainda sem matriz persistida.
    for (const role of Object.values(UserRole)) {
      const existing = await this.prisma.rolePermission.findUnique({ where: { role } }).catch(() => null);
      if (!existing) {
        await this.prisma.rolePermission
          .create({ data: { role, permissions: DEFAULT_PERMISSIONS[role] as object } })
          .catch(() => undefined);
      }
    }
  }

  private async loadAll(): Promise<Record<string, PermissionMatrix>> {
    if (this.cache && Date.now() - this.cacheAt < RolePermissionsService.CACHE_TTL_MS) {
      return this.cache;
    }
    const rows = await this.prisma.rolePermission.findMany();
    const byRole = new Map(rows.map((r) => [r.role, r.permissions] as const));
    const result: Record<string, PermissionMatrix> = {};
    for (const role of Object.values(UserRole)) {
      const stored = byRole.get(role);
      result[role] = stored ? normalizeMatrix(stored, DEFAULT_PERMISSIONS[role]) : DEFAULT_PERMISSIONS[role];
    }
    this.cache = result;
    this.cacheAt = Date.now();
    return result;
  }

  async getMatrix(): Promise<Record<string, PermissionMatrix>> {
    return { ...(await this.loadAll()) };
  }

  async getForRole(role: UserRole): Promise<PermissionMatrix> {
    return (await this.loadAll())[role] ?? DEFAULT_PERMISSIONS[role];
  }

  async hasPermission(role: UserRole, permission: PermissionKey): Promise<boolean> {
    const matrix = await this.getForRole(role);
    return Boolean(matrix[permission]);
  }

  async updateRole(role: UserRole, permissions: unknown): Promise<PermissionMatrix> {
    const normalized = normalizeMatrix(permissions);
    await this.prisma.rolePermission.upsert({
      where: { role },
      create: { role, permissions: normalized as object },
      update: { permissions: normalized as object },
    });
    this.cache = null;
    this.logger.log(`Permissões do papel ${role} atualizadas.`);
    return normalized;
  }

  permissionKeys(): readonly PermissionKey[] {
    return PERMISSION_KEYS;
  }
}
