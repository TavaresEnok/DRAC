import { IsDateString, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateInvestigationItemDto {
  @IsString()
  @MaxLength(32)
  type!: string;

  @IsString()
  @MaxLength(240)
  label!: string;

  @IsOptional()
  @IsString()
  cameraId?: string;

  @IsOptional()
  @IsString()
  cameraName?: string;

  @IsOptional()
  @IsString()
  eventId?: string;

  @IsOptional()
  @IsString()
  recordingId?: string;

  @IsDateString()
  timestamp!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
