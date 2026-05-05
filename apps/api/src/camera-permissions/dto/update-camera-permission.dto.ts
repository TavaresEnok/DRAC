import { CameraPermissionLevel } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateCameraPermissionDto {
  @IsEnum(CameraPermissionLevel)
  level!: CameraPermissionLevel;
}
