import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class DownloadBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  recordingIds!: string[];
}
