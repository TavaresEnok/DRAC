import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class TestCameraConnectionDto {
  @IsString()
  ip!: string;

  @IsInt()
  @Min(1)
  rtspPort!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  onvifPort?: number;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;

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
}
