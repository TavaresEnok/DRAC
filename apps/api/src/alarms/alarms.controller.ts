import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../role-permissions/require-permission.decorator';
import { AlarmsService } from './alarms.service';
import { AlarmMuteService } from './alarm-mute.service';
import { CreateAlarmRuleDto } from './dto/create-alarm-rule.dto';
import { SetAlarmRuleEnabledDto } from './dto/set-alarm-rule-enabled.dto';
import { SimulateAlarmRuleDto } from './dto/simulate-alarm-rule.dto';
import { UpdateAlarmRuleDto } from './dto/update-alarm-rule.dto';

@Controller('alarms')
export class AlarmsController {
  constructor(
    private readonly alarmsService: AlarmsService,
    private readonly alarmMuteService: AlarmMuteService,
  ) {}

  @Roles(UserRole.ADMIN)
  @RequirePermission('serverConfig')
  @Get('rules')
  async listRules() {
    return this.alarmsService.listRules();
  }

  @Roles(UserRole.ADMIN)
  @RequirePermission('serverConfig')
  @Post('rules')
  async createRule(@Body() dto: CreateAlarmRuleDto) {
    return this.alarmsService.createRule(dto);
  }

  @Roles(UserRole.ADMIN)
  @RequirePermission('serverConfig')
  @Patch('rules/:id')
  async updateRule(@Param('id') id: string, @Body() dto: UpdateAlarmRuleDto) {
    return this.alarmsService.updateRule(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @RequirePermission('serverConfig')
  @Patch('rules/:id/enabled')
  async setRuleEnabled(@Param('id') id: string, @Body() dto: SetAlarmRuleEnabledDto) {
    return this.alarmsService.setRuleEnabled(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @RequirePermission('serverConfig')
  @Post('rules/:id/simulate')
  async simulateRule(@Param('id') id: string, @Body() dto: SimulateAlarmRuleDto) {
    return this.alarmsService.simulateRule(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @RequirePermission('alarmAck')
  @Post('rules/:id/mute')
  async muteRule(
    @Param('id') id: string,
    @Body() body: { minutes?: number; reason?: string },
  ) {
    return this.alarmMuteService.muteRule(id, body.minutes ?? 30, body.reason);
  }

  @Roles(UserRole.ADMIN)
  @RequirePermission('alarmAck')
  @Post('rules/:id/unmute')
  async unmuteRule(@Param('id') id: string) {
    await this.alarmMuteService.unmuteRule(id);
    return { ruleId: id, unmuted: true };
  }

  @Roles(UserRole.ADMIN)
  @RequirePermission('alarmAck')
  @Post('cameras/:cameraId/events/:eventType/mute')
  async muteCameraEvent(
    @Param('cameraId') cameraId: string,
    @Param('eventType') eventType: string,
    @Body() body: { minutes?: number; reason?: string },
  ) {
    return this.alarmMuteService.muteCameraEvent(cameraId, eventType, body.minutes ?? 30, body.reason);
  }

  @Roles(UserRole.ADMIN)
  @RequirePermission('alarmAck')
  @Post('cameras/:cameraId/events/:eventType/unmute')
  async unmuteCameraEvent(@Param('cameraId') cameraId: string, @Param('eventType') eventType: string) {
    await this.alarmMuteService.unmuteCameraEvent(cameraId, eventType);
    return { cameraId, eventType, unmuted: true };
  }
}
