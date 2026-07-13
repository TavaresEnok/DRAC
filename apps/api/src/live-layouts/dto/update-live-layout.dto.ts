import { ArrayMaxSize, IsArray, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateLiveLayoutDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[1-8]x[1-8]$/)
  gridSize?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  cameraIds?: string[];
}
