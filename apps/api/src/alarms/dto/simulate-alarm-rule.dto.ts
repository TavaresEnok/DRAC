import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class SimulateAlarmRuleDto {
  @IsString()
  @MaxLength(120)
  cameraId!: string;

  @IsString()
  @MaxLength(120)
  eventType!: string;

  @IsString()
  @MaxLength(40)
  severity!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
