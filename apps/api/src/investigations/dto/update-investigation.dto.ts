import { IsArray, IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateInvestigationDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedCameraIds?: string[];

  @IsOptional()
  @IsDateString()
  timeStart?: string;

  @IsOptional()
  @IsDateString()
  timeEnd?: string;

  @IsOptional()
  @IsString()
  playbackSpeed?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  activeTrackTime?: number;
}
