import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class BulkRecordingDiagnosticsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(120)
  @IsString({ each: true })
  recordingIds!: string[];

  @IsOptional()
  @IsBoolean()
  includeIntegrity?: boolean;
}

