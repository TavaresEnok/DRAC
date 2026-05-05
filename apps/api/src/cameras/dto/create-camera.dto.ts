import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateCameraDto {
  @IsString()
  name!: string;

  @IsString()
  ip!: string;

  @IsInt()
  @Min(1)
  rtspPort!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  onvifPort?: number;

  @IsString()
  username!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  rtspPath?: string;

  @IsOptional()
  @IsString()
  onvifPath?: string;

  @IsOptional()
  @IsString()
  onvifProfileToken?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  channel?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  subtype?: number;

  @IsOptional()
  @IsString()
  siteId?: string;

  @IsOptional()
  @IsString()
  areaId?: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsBoolean()
  recordingEnabled?: boolean;
}

