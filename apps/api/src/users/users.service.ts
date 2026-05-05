import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthUser } from '../common/types/auth-user.type';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  private sanitize(user: User) {
    const { passwordHash, ...safe } = user;
    return safe;
  }

  async list() {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    return users.map((user) => this.sanitize(user));
  }

  async getById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    return this.sanitize(user);
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    if (!this.authService.canAssignRole(actor.role, dto.role)) {
      throw new ForbiddenException('Sem permissão para criar usuário com esse perfil.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email.trim().toLowerCase(),
        passwordHash,
        role: dto.role,
      },
    });

    return this.sanitize(user);
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const nextRole = dto.role ?? existing.role;
    if (!this.authService.canAssignRole(actor.role, nextRole)) {
      throw new ForbiddenException('Sem permissão para atribuir esse perfil.');
    }

    if (existing.role === UserRole.SUPER_ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Apenas SUPER_ADMIN pode alterar SUPER_ADMIN.');
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

    if (!this.authService.canAssignRole(actor.role, existing.role)) {
      throw new ForbiddenException('Sem permissão para desativar este usuário.');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return this.sanitize(user);
  }
}
