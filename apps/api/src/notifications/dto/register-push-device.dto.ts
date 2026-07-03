import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterPushDeviceDto {
  @IsString()
  @MaxLength(255)
  token!: string;

  @IsOptional()
  @IsIn(['ios', 'android'])
  platform?: 'ios' | 'android';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;
}

export class UnregisterPushDeviceDto {
  @IsString()
  @MaxLength(255)
  token!: string;
}
