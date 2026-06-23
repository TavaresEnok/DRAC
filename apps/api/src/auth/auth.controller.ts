import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { type Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthService } from './auth.service';
import { type AuthUser } from '../common/types/auth-user.type';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    try {
      const result = await this.authService.login(dto.email, dto.password);
      await this.auditService.log(result.user.id, 'auth.login.success', 'User', result.user.id, undefined, req);
      return result;
    } catch (error) {
      await this.auditService.log(
        null,
        'auth.login.failed',
        'User',
        null,
        { email: dto.email.trim().toLowerCase() },
        req,
      );
      throw error;
    }
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    await this.authService.forgotPassword(dto.email);
    await this.auditService.log(null, 'auth.password.forgot_requested', 'User', null, { email: dto.email.trim().toLowerCase() }, req);
    return { success: true };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    await this.auditService.log(null, 'auth.password.reset_completed', 'User', null, undefined, req);
    return { success: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.id);
  }

  @Post('logout')
  async logout(@CurrentUser() user: AuthUser, @Req() req: Request) {
    await this.auditService.log(user.id, 'auth.logout', 'User', user.id, undefined, req);
    return { success: true };
  }
}
