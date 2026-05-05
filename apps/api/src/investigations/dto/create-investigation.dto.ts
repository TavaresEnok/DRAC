import { IsArray, IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateInvestigationDto {
  @IsString()
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsArray()
  @IsString({ each: true })
  selectedCameraIds!: string[];

  @IsDateString()
  timeStart!: string;

  @IsDateString()
  timeEnd!: string;

  @IsOptional()
  @IsString()
  playbackSpeed?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  activeTrackTime?: number;
}
