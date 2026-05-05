import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class StartRecordingDto {
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(3600)
  segmentSeconds?: number;
}
