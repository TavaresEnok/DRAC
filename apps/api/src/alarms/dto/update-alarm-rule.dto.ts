import { AlarmPriority } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';

export class UpdateAlarmRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(AlarmPriority)
  priority?: AlarmPriority;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(3600)
  dedupWindowSeconds?: number;

  @IsOptional()
  @IsBoolean()
  autoResolveOnRecovery?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnOpen?: boolean;

  @IsOptional()
  @IsString()
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  emailTo?: string;
}
