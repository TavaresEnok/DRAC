import { Body, Controller, Delete, Post, UnauthorizedException } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { PushDevicesService } from './push-devices.service';
import { RegisterPushDeviceDto, UnregisterPushDeviceDto } from './dto/register-push-device.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly pushDevices: PushDevicesService) {}

  /** App registra seu token de push (após conceder permissão). Idempotente. */
  @Post('devices')
  async registerDevice(@CurrentUser() user: AuthUser | null, @Body() dto: RegisterPushDeviceDto) {
    if (!user) throw new UnauthorizedException();
    return this.pushDevices.register(user.id, dto.token, dto.platform, dto.deviceName);
  }

  /** App remove o token (logout). */
  @Delete('devices')
  async unregisterDevice(@CurrentUser() user: AuthUser | null, @Body() dto: UnregisterPushDeviceDto) {
    if (!user) throw new UnauthorizedException();
    return this.pushDevices.unregister(user.id, dto.token);
  }
}
