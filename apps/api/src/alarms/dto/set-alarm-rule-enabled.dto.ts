import { IsBoolean } from 'class-validator';

export class SetAlarmRuleEnabledDto {
  @IsBoolean()
  isEnabled!: boolean;
}
