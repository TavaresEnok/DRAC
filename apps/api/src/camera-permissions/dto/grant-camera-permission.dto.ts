import { CameraPermissionLevel } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class GrantCameraPermissionDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  cameraId?: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsEnum(CameraPermissionLevel)
  level!: CameraPermissionLevel;
}
