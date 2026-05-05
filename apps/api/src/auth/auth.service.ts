import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User, UserRole } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthUser, JwtAuthPayload, PlayTokenPayload, StreamTokenPayload } from '../common/types/auth-user.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private sanitizeUser(user: User): AuthUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const payload: JwtAuthPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: this.configService.get<string>('jwtExpiresIn') ?? '8h',
    });

    return {
      accessToken,
      user: this.sanitizeUser(user),
    };
  }

  async validateAccessPayload(payload: JwtAuthPayload): Promise<AuthUser> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Token inválido.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuário inativo ou inexistente.');
    }

    return this.sanitizeUser(user);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuário inativo ou inexistente.');
    }
    return this.sanitizeUser(user);
  }

  async createStreamToken(userId: string, cameraId: string) {
    const expiresIn = this.configService.get<string>('streamTokenExpiresIn') ?? '5m';
    const payload: StreamTokenPayload = {
      sub: userId,
      cameraId,
      type: 'stream',
    };
    const streamToken = await this.jwtService.signAsync(payload, { expiresIn });
    const decoded = this.jwtService.decode(streamToken) as { exp?: number } | null;
    return {
      streamToken,
      expiresAt: decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : null,
    };
  }

  async createPlaybackToken(userId: string, recordingId: string) {
    const expiresIn = this.configService.get<string>('streamTokenExpiresIn') ?? '5m';
    const payload: PlayTokenPayload = {
      sub: userId,
      recordingId,
      type: 'play',
    };
    const playToken = await this.jwtService.signAsync(payload, { expiresIn });
    const decoded = this.jwtService.decode(playToken) as { exp?: number } | null;
    return {
      playToken,
      expiresAt: decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : null,
    };
  }

  async verifyStreamToken(token: string): Promise<StreamTokenPayload> {
    const payload = await this.jwtService.verifyAsync<StreamTokenPayload>(token);
    if (payload.type !== 'stream') {
      throw new UnauthorizedException('Token de stream inválido.');
    }
    return payload;
  }

  async verifyPlaybackToken(token: string): Promise<PlayTokenPayload> {
    const payload = await this.jwtService.verifyAsync<PlayTokenPayload>(token);
    if (payload.type !== 'play') {
      throw new UnauthorizedException('Token de playback inválido.');
    }
    return payload;
  }

  canAssignRole(actorRole: UserRole, targetRole: UserRole): boolean {
    if (actorRole === UserRole.SUPER_ADMIN) return true;
    if (actorRole === UserRole.ADMIN) return targetRole !== UserRole.SUPER_ADMIN;
    return false;
  }
}
