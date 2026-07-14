import { Body, Controller, Get, Post, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { IntegrityService } from './integrity.service';

@Controller('integrity')
export class IntegrityController {
  constructor(private readonly integrity: IntegrityService) {}

  /** App pede um nonce (uso único) antes de solicitar o selo de integridade. */
  @Roles(UserRole.VIEWER)
  @Get('nonce')
  nonce(@CurrentUser() user: AuthUser | null) {
    if (!user) throw new UnauthorizedException();
    return { nonce: this.integrity.createNonce(), enabled: this.integrity.isEnabled() };
  }

  /** App envia o token do Play Integrity + o nonce; o servidor confere o selo. */
  @Roles(UserRole.VIEWER)
  @Post('verify')
  async verify(@CurrentUser() user: AuthUser | null, @Body() body: { token?: string; nonce?: string }) {
    if (!user) throw new UnauthorizedException();
    return this.integrity.verify(String(body?.token ?? ''), String(body?.nonce ?? ''));
  }
}
