import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../common/prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from '../role-permissions/permissions.guard';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuditModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const jwtSecret = (configService.get<string>('jwtSecret') ?? '').trim();
        const insecureSecrets = new Set(['change_me_jwt_secret', 'change_me_super_secret']);
        if (!jwtSecret) {
          throw new Error('JWT_SECRET é obrigatório.');
        }
        if (jwtSecret.length < 32 || insecureSecrets.has(jwtSecret)) {
          throw new Error('JWT_SECRET fraco/inseguro. Use um segredo forte (>= 32 chars).');
        }
        return {
          secret: jwtSecret,
          signOptions: {
            expiresIn: configService.get<string>('jwtExpiresIn') ?? '8h',
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
