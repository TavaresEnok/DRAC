import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBookmarkDto {
  @IsString()
  @MaxLength(240)
  label!: string;

  @IsDateString()
  timestamp!: string;

  @IsOptional()
  @IsString()
  cameraId?: string;

  @IsOptional()
  @IsString()
  cameraName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
