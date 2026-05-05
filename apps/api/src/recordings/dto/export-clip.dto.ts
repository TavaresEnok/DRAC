import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ExportClipDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  startSeconds!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  endSeconds!: number;

  @IsOptional()
  @IsString()
  investigationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
