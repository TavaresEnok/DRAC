import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class RegisterRecordingDto {
  @IsString()
  @IsNotEmpty()
  cameraId!: string;

  @IsString()
  @IsNotEmpty()
  filePath!: string;

  @IsString()
  @IsNotEmpty()
  startedAt!: string;

  @IsString()
  @IsNotEmpty()
  endedAt!: string;

  @IsNumber()
  @IsNotEmpty()
  durationSeconds!: number;

  @IsNumber()
  @IsOptional()
  sizeBytes?: number;
}
