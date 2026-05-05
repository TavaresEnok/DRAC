import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AlarmsService } from './alarms.service';
import { CreateAlarmRuleDto } from './dto/create-alarm-rule.dto';
import { UpdateAlarmRuleDto } from './dto/update-alarm-rule.dto';

@Controller('alarms')
export class AlarmsController {
  constructor(private readonly alarmsService: AlarmsService) {}

  @Roles(UserRole.ADMIN)
  @Get('rules')
  async listRules() {
    return this.alarmsService.listRules();
  }

  @Roles(UserRole.ADMIN)
  @Post('rules')
  async createRule(@Body() dto: CreateAlarmRuleDto) {
    return this.alarmsService.createRule(dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch('rules/:id')
  async updateRule(@Param('id') id: string, @Body() dto: UpdateAlarmRuleDto) {
    return this.alarmsService.updateRule(id, dto);
  }
}
