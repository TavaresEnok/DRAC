import { ArrayMaxSize, IsArray, IsString, Matches, MaxLength } from 'class-validator';

export class CreateLiveLayoutDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsString()
  @Matches(/^[1-8]x[1-8]$/)
  gridSize!: string;

  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  cameraIds!: string[];
}
